/* Durable metadata only. Uses existing immutable audit rows, not a new schema.
 * A journal state never establishes mathematical or scientific correctness. */
import {canonical,sha256} from '../public/research-governance-core.mjs';

export const FORMAT='pcs-public-lean-lifecycle-v1';
export const SUBJECT='public_lean_job_v1';
export const TERMINAL=new Set(['complete','failed','cancelled','expired','resource_exhausted']);
const NEXT={
  created:['authorizing','failed','expired'],
  authorizing:['authorized','failed','expired'],
  authorized:['queued','failed','expired'],
  queued:['dispatching','failed','expired'],
  dispatching:['dispatched','dispatch_uncertain','running','verifying','failed','cancelled','expired','resource_exhausted','cancelling'],
  dispatch_uncertain:['running','verifying','failed','cancelled','expired','resource_exhausted','cancelling'],
  dispatched:['running','verifying','failed','cancelled','expired','resource_exhausted','cancelling'],
  running:['verifying','failed','cancelled','expired','resource_exhausted','cancelling'],
  cancelling:['verifying','failed','cancelled','expired','resource_exhausted'],
  verifying:['complete','failed','cancelled','expired','resource_exhausted'],
};
const HASH=/^[0-9a-f]{64}$/;
const REQUEST=/^[0-9a-f]{32}$/;
const CODES=new Set(['created','admission_started','admission_passed','rate_limited','admission_failed','queued','dispatch_started','dispatch_confirmed','dispatch_uncertain','provider_running','provider_verifying','provider_completed','provider_cancelled','provider_failed','provider_timed_out','ticket_expired','provider_unavailable','cancellation_requested','evidence_rejected']);
function check(ok,message){if(!ok)throw Error(message);}
export function eventId(requestId,version){check(REQUEST.test(requestId)&&Number.isSafeInteger(version)&&version>=0&&version<64,'Journal identity bound');return `pcs-lean-v1:${requestId}:${String(version).padStart(2,'0')}`;}
export function canTransition(from,to,code=null){return from===to&&code==='provider_unavailable'&&!TERMINAL.has(from)||Boolean(NEXT[from]?.includes(to));}
export async function requestKey(env,ip,key){
  check(typeof key==='string'&&/^[0-9a-f]{32,64}$/.test(key),'Use a 32–64 hex-character idempotency key');
  check(typeof env.RATE_LIMIT_SALT==='string'&&env.RATE_LIMIT_SALT.length>0,'Checker journal signing is unavailable');
  const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.RATE_LIMIT_SALT),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const bytes=await crypto.subtle.sign('HMAC',material,new TextEncoder().encode(`PCS_PUBLIC_LEAN_IDEMPOTENCY_V1:${ip}:${key}`));
  return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,'0')).join('');
}
function validateRecord(row){
  check(row&&row.format===FORMAT&&REQUEST.test(row.payload?.request_id)&&HASH.test(row.binding_sha256)&&HASH.test(row.event_sha256),'Malformed journal record');
  check(Number.isSafeInteger(row.version)&&row.version>=0&&row.version<64,'Journal version bound');
  check(CODES.has(row.code)&&(['created',...Object.keys(NEXT),...TERMINAL].includes(row.state)),'Unknown journal state or diagnostic');
  check(Number.isSafeInteger(row.at)&&row.at>=row.payload.issued,'Journal time bound');
  check(row.run_id===null||Number.isSafeInteger(row.run_id)&&row.run_id>0,'Journal provider identity');
  check(row.result_sha256===null||HASH.test(row.result_sha256),'Journal result identity');
  check(row.prev_sha256===null||HASH.test(row.prev_sha256),'Journal predecessor identity');
  const p=row.payload,keys=['format','request_id','core_sha','source_sha256','interpretation','issued','expires'];
  if(p.actions_sha256!==undefined)keys.push('actions_sha256');if(p.model_family!==undefined)keys.push('model_family');
  check(p.format==='pcs-public-lean-ticket-v1'&&/^[0-9a-f]{40}$/.test(p.core_sha)&&HASH.test(p.source_sha256)&&Number.isSafeInteger(p.issued)&&p.issued>=0&&p.expires===p.issued+3600000,'Immutable payload domain');
  check(p.interpretation===null||Number.isInteger(p.interpretation)&&p.interpretation>=0&&p.interpretation<=15,'Interpretation bound');
  check(p.actions_sha256===undefined||HASH.test(p.actions_sha256),'Proof-action binding');
  check(p.model_family===undefined||['induction-abstraction-v2','verified-memory-v1','prospective-hybrid-v2'].includes(p.model_family),'Model-family binding');
  check(Object.keys(p).sort().join(',')===keys.sort().join(','),'Unexpected immutable payload fields');
  check(Object.keys(row).sort().join(',')===['format','payload','binding_sha256','version','state','code','at','run_id','result_sha256','prev_sha256','event_sha256'].sort().join(','),'Unexpected journal fields');
}
export class AuditJournal {
  constructor(db,{archive=null}={}){check(db?.prepare,'Persistent checker journal is unavailable');this.db=db;this.archive=archive;}
  async history(requestId){
    check(REQUEST.test(requestId),'Invalid request identity');
    const query=await this.db.prepare('SELECT id,action,subject_id,detail_json,created_at FROM audit_log WHERE subject_type=? AND subject_id=? ORDER BY id LIMIT 65').bind(SUBJECT,requestId).all();
    const rows=query.results||[];check(rows.length<=64,'Journal event budget exhausted');let prior=null;const history=[];
    for(const stored of rows){
      const row=JSON.parse(stored.detail_json);validateRecord(row);
      const {event_sha256,...unsigned}=row;
      check(await sha256(canonical(unsigned))===event_sha256,'Journal event digest mismatch');
      check(stored.id===eventId(requestId,row.version)&&stored.subject_id===requestId&&stored.action==='public_lean_'+row.code&&stored.created_at===new Date(row.at).toISOString(),'Journal storage binding mismatch');
      check(row.version===history.length&&row.prev_sha256===(prior?.event_sha256??null),'Journal history gap');
      if(prior){
        check(canonical(row.payload)===canonical(prior.payload)&&row.binding_sha256===prior.binding_sha256,'Immutable request changed');
        check(row.at>=prior.at&&canTransition(prior.state,row.state,row.code),'Invalid journal transition');
        check(prior.run_id===null||row.run_id===prior.run_id,'Provider run changed');
      }else check(row.state==='created'&&row.code==='created'&&row.version===0,'Missing initial request');
      if(this.archive)await this.archive({eventId:stored.id,legacyAuditId:stored.id,actorUserId:null,action:stored.action,subjectType:SUBJECT,subjectId:requestId,detailJson:stored.detail_json,createdAt:stored.created_at});
      prior=row;history.push(row);
    }
    return history;
  }
  async current(requestId){const rows=await this.history(requestId);return rows.at(-1)||null;}
  async create(payload,binding,now=Date.now()){
    check(REQUEST.test(payload?.request_id)&&HASH.test(binding),'Invalid immutable request');
    const row={format:FORMAT,payload,binding_sha256:binding,version:0,state:'created',code:'created',at:now,run_id:null,result_sha256:null,prev_sha256:null};
    row.event_sha256=await sha256(canonical(row));
    await this.db.prepare('INSERT OR IGNORE INTO audit_log(id,actor_user_id,action,subject_type,subject_id,detail_json,created_at) VALUES(?,NULL,?,?,?,?,?)')
      .bind(eventId(payload.request_id,0),'public_lean_created',SUBJECT,payload.request_id,JSON.stringify(row),new Date(now).toISOString()).run();
    const actual=await this.current(payload.request_id);
    check(actual?.binding_sha256===binding,'Idempotency key is already bound to a different request');
    return actual;
  }
  async advance(previous,state,code,{run_id=previous.run_id,result_sha256=previous.result_sha256,now=Date.now()}={}){
    validateRecord(previous);check(canTransition(previous.state,state,code),'Terminal or invalid journal transition');check(CODES.has(code),'Unapproved journal diagnostic');
    check(previous.run_id===null||run_id===previous.run_id,'Provider identity cannot change');
    const row={format:FORMAT,payload:previous.payload,binding_sha256:previous.binding_sha256,version:previous.version+1,state,code,at:Math.max(now,previous.at),run_id,result_sha256,prev_sha256:previous.event_sha256};
    row.event_sha256=await sha256(canonical(row));validateRecord(row);
    const inserted=await this.db.prepare(`INSERT OR IGNORE INTO audit_log(id,actor_user_id,action,subject_type,subject_id,detail_json,created_at)
      SELECT ?,NULL,?,?,?,?,? WHERE EXISTS (SELECT 1 FROM audit_log WHERE id=? AND detail_json=?)`)
      .bind(eventId(row.payload.request_id,row.version),'public_lean_'+code,SUBJECT,row.payload.request_id,JSON.stringify(row),new Date(row.at).toISOString(),eventId(previous.payload.request_id,previous.version),JSON.stringify(previous)).run();
    const current=await this.current(row.payload.request_id);
    return {won:Number(inserted.meta?.changes||0)===1,current};
  }
  async diagnostics(limit=20){
    check(Number.isInteger(limit)&&limit>=1&&limit<=20,'Diagnostic page bound');
    const rows=await this.db.prepare('SELECT subject_id FROM audit_log WHERE subject_type=? GROUP BY subject_id ORDER BY MAX(created_at) DESC LIMIT ?').bind(SUBJECT,limit).all();
    const result=[];
    for(const {subject_id} of rows.results||[]){const history=await this.history(subject_id);const r=history.at(-1);result.push({request_id:subject_id,state:r.state,code:r.code,version:r.version,core_sha:r.payload.core_sha,source_sha256:r.payload.source_sha256,model_family:r.payload.model_family??'lean-learning-v2',run_id:r.run_id,issued:r.payload.issued,expires:r.payload.expires,last_event_at:r.at,result_sha256:r.result_sha256,events:history.map(({version,state,code,at})=>({version,state,code,at})),pcs_authority:false});}
    return result;
  }
}
