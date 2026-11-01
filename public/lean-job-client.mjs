// Per-tab recovery metadata. A saved request never establishes a checked proof.
import {canonical} from './research-governance-core.mjs';
const STORAGE_KEY='pcs-public-lean-pending-v1';
export class PendingLeanJob {
  constructor(storage){this.storage=storage;this.memory=null;this.persistent=Boolean(storage);}
  read(){
    let value=this.memory;
    try{const raw=this.storage?.getItem(STORAGE_KEY);if(raw&&raw.length<=16000)value=JSON.parse(raw);}catch{this.persistent=false;}
    if(!value)return null;
    if(value.format!=='pcs-public-lean-pending-v1'||!/^[0-9a-f]{32}$/.test(value.key)||typeof value.body_json!=='string'||value.body_json.length>10000||!Number.isSafeInteger(value.created)||typeof value.request!=='object')return null;
    try{const body=JSON.parse(value.body_json);if(body.public_consent!==true||body.license!=='CC0-1.0'||typeof body.statement!=='string')return null;}
    catch{return null;}
    return value;
  }
  write(value){this.memory=value;try{this.storage?.setItem(STORAGE_KEY,JSON.stringify(value));}catch{this.persistent=false;}return value;}
  begin(body,now=Date.now()){
    const body_json=canonical(body),previous=this.read();
    if(body_json.length>10000)throw Error('Pending request exceeds its storage bound');
    if(previous){if(previous.body_json!==body_json)throw Error('A different request is saved. Resume or cancel it before starting another.');return previous;}
    return this.write({format:'pcs-public-lean-pending-v1',key:crypto.randomUUID().replace(/-/g,''),body_json,created:now,request:null});
  }
  bind(response){
    const saved=this.read();
    if(!saved||typeof response.ticket!=='string'||response.ticket.length>1800||!/^[0-9a-f]{32}$/.test(response.request_id)||!/^[0-9a-f]{40}$/.test(response.core_sha))throw Error('Invalid public request acknowledgement');
    return this.write({...saved,request:{ticket:response.ticket,request_id:response.request_id,core_sha:response.core_sha,expires:response.expires??saved.created+3600000}});
  }
  clear(){this.memory=null;try{this.storage?.removeItem(STORAGE_KEY);}catch{this.persistent=false;}}
}
export function tabJobStore(){let storage;try{storage=globalThis.sessionStorage;}catch{}return new PendingLeanJob(storage);}

export function executionSummary(evidence){
 const r=evidence?.result||{}, search=r.search||{};
 if(evidence?.actions_sha256)return 'Your exact typed actions were checked. This is not model-generated proof search.';
 const winner=search.winning_component||search.portfolio?.selected_stage;
 const checkpoint=r.checkpoint_sha256;
 return ['Family: '+(evidence?.model_family||'checked-reuse-v2'),'Executor: '+(r.model||evidence?.model_family||'identity unavailable'),
   winner?'Winning component: '+winner:null,
   checkpoint?'Reported checkpoint: '+checkpoint:null,
   evidence?.core_sha?'Source: '+evidence.core_sha:null,
   'Inspect the full evidence for attempts, scope and kernel assumptions. Hosted execution remains a trust dependency.'].filter(Boolean).join('. ');
}
