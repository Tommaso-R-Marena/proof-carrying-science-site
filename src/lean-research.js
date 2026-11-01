/* Public proof proposals run only in pinned, protected PCS main on free standard
   public GitHub runners. Hosted CI is a trust dependency, not PCS scientific
   authority. No artifact storage, model API, arbitrary ref or executable input. */
export const CORE_SHA = "f20f3cab2938f2e085f137185e88f4700d5da2ed";
// One previously protected revision remains eligible for already signed tickets
// during their original one-hour lifetime. New dispatch always requires CORE_SHA.
export const PREVIOUS_CORE_SHA = "fabc704efdbda4c8822881366e4db3d3e31f066a";
const APPROVED_TICKET_REVISIONS = new Set([CORE_SHA, PREVIOUS_CORE_SHA]);
export const approvedTicketRevision = value => APPROVED_TICKET_REVISIONS.has(value);
const REPO = "Tommaso-R-Marena/proof-carrying-science";
const WORKFLOW = "pcs-lean-public.yml";
const DOMAIN = "PCS_PUBLIC_LEAN_TICKET_V1:";
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const exact = (o,keys) => o && typeof o==='object' && !Array.isArray(o) && Object.keys(o).sort().join(',')===keys.slice().sort().join(',');
function fail(message,code='invalid_checker_evidence'){throw Object.assign(new Error(message),{code});}
async function key(env){if(!env.RATE_LIMIT_SALT)fail('Public checker tickets are unavailable');return crypto.subtle.importKey('raw',encoder.encode(env.RATE_LIMIT_SALT),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function encode(bytes){let s='';for(const n of bytes)s+=String.fromCharCode(n);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decode(s){if(!/^[A-Za-z0-9_-]{1,1200}$/.test(s))fail('Invalid ticket encoding');const raw=atob(s.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function ticket(env,payload){const bytes=encoder.encode(JSON.stringify(payload));const mac=await crypto.subtle.sign('HMAC',await key(env),encoder.encode(DOMAIN+new TextDecoder().decode(bytes)));return encode(bytes)+'.'+hex(mac);}
export async function verifyTicket(env,value,now=Date.now(),allowExpired=false){
  if(typeof value!=='string'||value.length>1800)fail('Invalid checker ticket');const parts=value.split('.');if(parts.length!==2||!/^[0-9a-f]{64}$/.test(parts[1]))fail('Invalid checker ticket');
  const bytes=decode(parts[0]);const signature=Uint8Array.from(parts[1].match(/../g),x=>parseInt(x,16));const data=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(!await crypto.subtle.verify('HMAC',await key(env),signature,encoder.encode(DOMAIN+data)))fail('Forged checker ticket');
  const p=JSON.parse(data);
  const keys=['format','request_id','core_sha','source_sha256','interpretation','issued','expires'];
  if(p.actions_sha256!==undefined)keys.push('actions_sha256');if(p.model_family!==undefined)keys.push('model_family');
  if(!exact(p,keys)||(p.actions_sha256!==undefined&&!/^[0-9a-f]{64}$/.test(p.actions_sha256))||(p.model_family!==undefined&&!['induction-abstraction-v2','verified-memory-v1','prospective-hybrid-v2'].includes(p.model_family))||(p.actions_sha256!==undefined&&['induction-abstraction-v2','prospective-hybrid-v2'].includes(p.model_family))||p.format!=='pcs-public-lean-ticket-v1'||!APPROVED_TICKET_REVISIONS.has(p.core_sha)||!/^[0-9a-f]{32}$/.test(p.request_id)||!/^[0-9a-f]{64}$/.test(p.source_sha256)||!(p.interpretation===null||Number.isInteger(p.interpretation)&&p.interpretation>=0&&p.interpretation<=15)||!Number.isSafeInteger(p.issued)||p.issued<0||!Number.isSafeInteger(p.expires)||p.expires!==p.issued+3600000||now<p.issued-60000||(!allowExpired&&now>p.expires))fail('Expired or mismatched checker ticket');
  return p;
}
async function github(env,path,options={},transport=fetch){
  const credential=env.PCS_LEAN_GITHUB_TOKEN||env.PCS_GITHUB_TOKEN;
  if(!credential||(path!==''&&!/^\/[A-Za-z0-9_./?=&%-]+$/.test(path)))fail('GitHub proof dispatch is unavailable','provider_unavailable');
  const response=await transport('https://api.github.com/repos/'+REPO+path,{...options,redirect:'manual',headers:{'Authorization':'Bearer '+credential,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'PCS-Lean-Research/1.0',...(options.body?{'Content-Type':'application/json'}:{})}});
  return response;
}
async function object(response){if(!response.ok)fail('GitHub checker operation unavailable ('+response.status+')','provider_unavailable');return response.json();}
export function validatePublicStatement(body){
  const keys=['statement','interpretation','public_consent','license'];
  if(body?.proof_actions!==undefined)keys.push('proof_actions');if(body?.model_family!==undefined)keys.push('model_family');
  if(!exact(body,keys)||(body.model_family!==undefined&&!['induction-abstraction-v2','verified-memory-v1','prospective-hybrid-v2'].includes(body.model_family))||(body.proof_actions!==undefined&&['induction-abstraction-v2','prospective-hybrid-v2'].includes(body.model_family))||typeof body.statement!=='string'||!body.statement.trim()||body.statement.length>3000||body.public_consent!==true||body.license!=='CC0-1.0'||!(body.interpretation===null||(Number.isInteger(body.interpretation)&&body.interpretation>=0&&body.interpretation<=15)))fail('Explicit authorized public CC0 statement and valid interpretation required');
  if(body.proof_actions!==undefined)validateProofActions(body.proof_actions);
  if(!/^(For (all|every|any) (propositions?|natural numbers?|integers?|functions from natural numbers to natural numbers|predicates on natural numbers|lists of natural numbers)|There exists (a|an) (natural number|integer|proposition)) /i.test(body.statement)||!/^[A-Za-z0-9_(), .:+*=≤¬∧∨→↔∀∃-]+$/.test(body.statement)||/\b[0-9]{5,}\b/.test(body.statement))fail('Use a supported public mathematical statement; personal data and credentials are not accepted');
  if(/\b(?:bearer|password|api_key|access_token|private_key|authorization)\b/i.test(body.statement)||/\b(?:ghp|github_pat|sk)-?[A-Za-z0-9_]{12,}\b/.test(body.statement))fail('Credential-like text is not eligible for public submission');
}
export function validateProofActions(actions){
  if(!Array.isArray(actions)||actions.length<1||actions.length>24)fail('Use 1–24 typed proof actions');
  const reference=/^[A-Za-z][A-Za-z0-9_]{0,23}(?:\.[12]){0,3}$/;
  const blocked=/^(sorry|admit|axiom|unsafe|native_decide)(?:\.|$)/;
  for(const {kind,argument,...extra} of actions){
    if(Object.keys(extra).length)fail('Unexpected proof-action fields');
    const simple=['constructor','assumption','rfl','left','right','contradiction','simp'].includes(kind)&&argument===null;
    const intro=kind==='intro'&&typeof argument==='string'&&/^h[0-9]{1,2}$/.test(argument);
    const ref=['exact','apply','rewrite','rewrite_back'].includes(kind)&&typeof argument==='string'&&reference.test(argument)&&!blocked.test(argument);
    const norm=kind==='normalize'&&['nat','list'].includes(argument);
    const names=typeof argument==='string'?argument.split(' '):[];
    const induction=['induct_nat','induct_list'].includes(kind)&&names.length===(kind==='induct_nat'?3:4)&&new Set(names).size===names.length&&names.every(n=>/^h[0-9]{1,2}$/.test(n));
    const witness=kind==='witness'&&((Number.isInteger(argument)&&argument>=0&&argument<=8)||(typeof argument==='string'&&reference.test(argument)&&!blocked.test(argument)));
    const lemma=kind==='lemma'&&typeof argument==='string'&&/^(Nat\.(add_zero|zero_add|add_comm|add_assoc|mul_zero|zero_mul|mul_comm|mul_one|one_mul|le_refl|le_trans|le_antisymm)|Int\.(le_refl|le_trans|le_antisymm))$/.test(argument);
    if(!(simple||intro||ref||norm||induction||witness||lemma))fail('Unsupported typed proof action');
  }
}
export async function preparePublicRequest(body,issued=Date.now(),request_id=crypto.randomUUID().replace(/-/g,'')){
  validatePublicStatement(body);
  if(!Number.isSafeInteger(issued)||issued<0||!/^[0-9a-f]{32}$/.test(request_id))fail('Invalid checker request identity');
  const source_sha256=hex(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(body.statement))));
  const payload={format:'pcs-public-lean-ticket-v1',request_id,core_sha:CORE_SHA,source_sha256,interpretation:body.interpretation,issued,expires:issued+3600000};
  if(body.proof_actions!==undefined)payload.actions_sha256=hex(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(body.proof_actions.map(a=>({argument:a.argument,kind:a.kind}))))));
  if(body.model_family!==undefined)payload.model_family=body.model_family;
  return payload;
}
export async function signPreparedTicket(env,payload){const value=await ticket(env,payload);await verifyTicket(env,value,payload.issued);return value;}
// Readiness is a bounded observation, never authority or a reservation. Repeat
// it immediately before POST; the final receipt still pins the execution SHA.
const READINESS_TIMEOUT_MS=6000;
const DECLINED_DISPATCH_STATUSES=new Set([400,401,403,404,405,409,410,422,429]);
function unavailable(reason,attempted=false,uncertain=attempted){
  return Object.assign(new Error('Public Lean provider unavailable ('+reason+'); retry the same request key.'),
    {code:'provider_unavailable',readiness_code:reason,dispatch_attempted:attempted,dispatch_may_have_been_accepted:uncertain});
}
export async function preflightDispatch(env,transport=fetch){
  let stage='repository';
  try{
    if(!/^[0-9a-f]{40}$/.test(CORE_SHA))throw unavailable('unapproved_revision');
    const read=async path=>{
      const response=await github(env,path,{signal:AbortSignal.timeout(READINESS_TIMEOUT_MS)},transport);
      if(!response.ok)throw unavailable(stage+'_unavailable');
      // GitHub metadata has fixed small fields; do not retain provider text.
      return JSON.parse(await boundedText(response,32768));
    };
    const repository=await read('');
    if(repository.private!==false||repository.full_name!==REPO||repository.default_branch!=='main')throw unavailable('repository_not_public_main');
    stage='revision';
    const current=await read('/git/ref/heads/main');
    if(current.object?.sha!==CORE_SHA)throw unavailable('revision_not_approved');
    stage='workflow';
    const workflow=await read('/actions/workflows/'+WORKFLOW);
    if(workflow.state!=='active'||workflow.path!=='.github/workflows/'+WORKFLOW)throw unavailable('workflow_not_active');
    return {format:'pcs-lean-provider-readiness-v1',status:'ready',core_sha:CORE_SHA,
      public_repository:true,workflow_active:true,pcs_authority:false};
  }catch(error){
    // Only fixed diagnostics escape this boundary, never arbitrary exception text.
    const allowed=new Set(['unapproved_revision','repository_unavailable','repository_not_public_main','revision_unavailable','revision_not_approved','workflow_unavailable','workflow_not_active']);
    throw unavailable(allowed.has(error.readiness_code)?error.readiness_code:stage+'_unavailable');
  }
}
export async function dispatch(env,body,transport=fetch,now=Date.now(),prepared=null){
  let payload,acknowledgement,inputs;
  try{
    validatePublicStatement(body);
    payload=await preparePublicRequest(body,prepared?.issued??now,prepared?.request_id);
    if(prepared&&JSON.stringify(payload)!==JSON.stringify(prepared))fail('Immutable checker request mismatch');
    if(now>payload.expires)fail('Expired checker request cannot dispatch');
    await preflightDispatch(env,transport);
    // Complete local work which might throw before the external effect.
    acknowledgement=await ticket(env,payload);
    inputs={request_id:payload.request_id,statement:body.statement,interpretation:body.interpretation===null?'':String(body.interpretation)};
    if(body.proof_actions!==undefined)inputs.proof_actions=JSON.stringify(body.proof_actions);
    if(body.model_family!==undefined)inputs.model_family=body.model_family;
  }catch(error){
    if(error.code==='provider_unavailable')throw error;
    throw Object.assign(new Error('Checker request cannot dispatch'),{code:'invalid_checker_evidence',dispatch_attempted:false,dispatch_may_have_been_accepted:false});
  }
  let response;
  try{
    response=await github(env,'/actions/workflows/'+WORKFLOW+'/dispatches',{
      method:'POST',body:JSON.stringify({ref:'main',inputs}),signal:AbortSignal.timeout(READINESS_TIMEOUT_MS)},transport);
  }catch{throw unavailable('dispatch_confirmation_unavailable',true);}
  if(response.status!==204)throw unavailable(DECLINED_DISPATCH_STATUSES.has(response.status)?'dispatch_declined':'dispatch_confirmation_unavailable',true,!DECLINED_DISPATCH_STATUSES.has(response.status));
  return {status:'queued',ticket:acknowledgement,request_id:payload.request_id,core_sha:CORE_SHA,public_source:true,pcs_authority:false};
}
async function boundedText(response,max){if(!response.ok)fail('Checker log download failed','provider_unavailable');if(Number(response.headers.get('content-length')||0)>max)fail('Checker logs exceed bound');const reader=response.body.getReader();let size=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail('Checker logs exceed bound');}chunks.push(value);}const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(all);}
function resultMarker(log){
  const markers=[...log.matchAll(/(?:^|\n)[^\n]*?PCS_LEAN_RESULT_(GZIP_V1|V1):([A-Za-z0-9+/=]+)\s*(?=\n|$)/g)];
  const declarations=[...log.matchAll(/PCS_LEAN_RESULT_(?:GZIP_V1|V1):/g)];
  if(markers.length!==1||declarations.length!==1)fail('Missing or duplicate independent checker result');
  return {encoding:markers[0][1],value:markers[0][2]};
}
function resultJSON(raw){
  if(raw.length>1000000)fail('Checker result exceeds bound');
  return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
}
const JOB_STAGES=new Set(['checked_reuse','previous_policy','symbolic','grounded_induction','previous_policy_extended_actions','symbolic_induction','memory_policy','same_memory_structural','no_memory_structural','ordinary_Std','exact_human_actions','serialization','hybrid_portfolio']);
function validateOperationalEvidence(result,payload){
  if(result.source_license!==undefined&&result.source_license!=='CC0-1.0')fail('Unapproved public source license');
  if(result.automatic_training_authorization!==undefined&&result.automatic_training_authorization!==false)fail('Checker output cannot authorize training');
  if(result.job_events===undefined)return;
  if(!Array.isArray(result.job_events)||result.job_events.length>32)fail('Operational event bound');
  let elapsed=0;const active=new Set();
  for(const [sequence,event] of result.job_events.entries()){
    const required=['format','request_id','core_sha','source_sha256','sequence','stage','status','elapsed_seconds','pcs_authority'];
    const optional=['wall_seconds','cpu_seconds','recorded_Lean_execution_attempts'];
    if(!event||Object.keys(event).some(k=>!required.includes(k)&&!optional.includes(k))||required.some(k=>!(k in event))||event.format!=='pcs-lean-job-event-v1'||event.request_id!==payload.request_id||event.core_sha!==payload.core_sha||event.source_sha256!==payload.source_sha256||event.sequence!==sequence||!JOB_STAGES.has(event.stage)||!['started','finished','failed'].includes(event.status)||event.pcs_authority!==false)fail('Operational event binding mismatch');
    if(typeof event.elapsed_seconds!=='number'||!Number.isFinite(event.elapsed_seconds)||event.elapsed_seconds<elapsed)fail('Invalid operational elapsed duration');
    elapsed=event.elapsed_seconds;
    for(const field of ['wall_seconds','cpu_seconds'])if(event[field]!==undefined&&(typeof event[field]!=='number'||!Number.isFinite(event[field])||event[field]<0))fail('Invalid measured operational duration');
    if(event.recorded_Lean_execution_attempts!==undefined&&(!Number.isSafeInteger(event.recorded_Lean_execution_attempts)||event.recorded_Lean_execution_attempts<0))fail('Invalid operational checker accounting');
    if(event.status==='started'){if(active.has(event.stage)||optional.some(k=>event[k]!==undefined))fail('Invalid operational stage start');active.add(event.stage);}
    else{if(!active.delete(event.stage))fail('Unmatched operational stage completion');}
  }
  // A serialization start can remain open: its marker is inside the encoded result.
  if([...active].some(stage=>stage!=='serialization'))fail('Unfinished operational proof stage');
}
async function validateActualActions(result,payload){
  if(payload.actions_sha256&&result.result?.status==='verified'){
    const actions=result.result.search?.receipt?.actions;validateProofActions(actions);
    const digest=hex(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(actions.map(a=>({argument:a.argument,kind:a.kind}))))));
    if(digest!==payload.actions_sha256)fail('Actual checked human actions differ from the ticket');
  }
  return result;
}
function validateResult(result,payload){
  validateOperationalEvidence(result,payload);
  if(result.format!=='pcs-public-lean-result-v1'||result.request_id!==payload.request_id||result.core_sha!==payload.core_sha||result.source_sha256!==payload.source_sha256||result.result?.pcs_authority!==false)fail('Checker result binding mismatch');
  if((payload.actions_sha256??null)!==(result.actions_sha256??null))fail('Exact human proof-action binding mismatch');
  if((payload.model_family??null)!==(result.model_family??null))fail('Reasoning model-family binding mismatch');
  for(const observation of [result.result,result.baseline,result.previous,result.strong_baseline].filter(Boolean)){
    if(observation.pcs_authority!==false||!['verified','verified_counterexample','unknown','resource_exhaustion','unsupported_formalization','ambiguous_interpretation'].includes(observation.status))fail('Unapproved checker outcome or authority assertion');
    if(observation.status==='verified_counterexample'){
      if(payload.model_family!=='verified-memory-v1')fail('Unapproved counterexample family');
      const c=observation.counterexample?.receipt,meaning=result.result.formalization?.candidates?.[payload.interpretation??0];
      if(!c||c.format!=='pcs-memory-counterexample-v1'||c.original_goal_sha256!==meaning?.interpretation_sha256||c.statement!==meaning?.lean||c.pcs_authority!==false||c.kernel?.format!=='pcs-lean-kernel-v1'||!Array.isArray(c.kernel.axioms)||c.kernel.axioms.some(a=>!['propext','Classical.choice','Quot.sound'].includes(a))||typeof c.proof!=='string'||!c.proof.trim()||!c.lean?.includes('version 4.28.0,'))fail('Invalid original-goal counterexample receipt');
    }
    if(observation.status!=='verified')continue;
    const r=observation.search?.receipt;if(!r||!(r.format==='pcs-prover-proof-v1'||((observation===result.strong_baseline&&payload.model_family==='verified-memory-v1')||(observation===result.result&&payload.model_family==='prospective-hybrid-v2'))&&r.format==='pcs-std-baseline-proof-v1')||r.kernel?.format!=='pcs-lean-kernel-v1'||!Array.isArray(r.kernel.axioms)||r.kernel.axioms.some(a=>!['propext','Classical.choice','Quot.sound'].includes(a))||typeof r.proof!=='string'||!r.proof.trim()||typeof r.lean!=='string'||!r.lean.includes('version 4.28.0,')||r.pcs_scientific_authority!==false)fail('Invalid scoped kernel receipt');
  }
  if(payload.model_family==='prospective-hybrid-v2'&&result.result.status==='verified'){
    const search=result.result.search,replay=search?.independent_replay;
    if(search?.format!=='pcs-attributed-hybrid-v1'||!['ordinary_Std','memory_structural','frozen_neural'].includes(search.winning_component)||replay?.status!=='verified'||replay.goal_sha256!==search.receipt.goal_sha256||replay.kernel?.format!=='pcs-lean-kernel-v1'||!Array.isArray(replay.kernel.axioms)||replay.kernel.axioms.some(a=>!['propext','Classical.choice','Quot.sound'].includes(a)))fail('Hybrid proof lacks bound independent replay');
    const components=['ordinary_Std','memory_structural','frozen_neural'];
    if(search.status!=='verified'||search.goal_sha256!==search.receipt.goal_sha256||!Number.isSafeInteger(search.budget)||search.budget<6||search.budget>96||!Number.isSafeInteger(search.expansions)||search.expansions<1||search.expansions>search.budget||!Array.isArray(search.stages)||search.stages.length<1||search.stages.length>3||search.stages.some((stage,i)=>stage.component!==components[i]||!['verified','unknown'].includes(stage.status)||!Number.isSafeInteger(stage.expansions)||stage.expansions<0)||search.stages.reduce((n,stage)=>n+stage.expansions,0)!==search.expansions||search.stages.at(-1).component!==search.winning_component||search.stages.at(-1).status!=='verified')fail('Invalid attributed hybrid search accounting');
    if(!Number.isSafeInteger(search.cost?.measured_lean_calls_excluding_legacy_memory_replay)||search.cost.measured_lean_calls_excluding_legacy_memory_replay<0||typeof search.cost.cold_wall_seconds!=='number'||!Number.isFinite(search.cost.cold_wall_seconds)||search.cost.cold_wall_seconds<0)fail('Invalid hybrid resource accounting');
    if(!/^[0-9a-f]{64}$/.test(result.result.checkpoint_sha256)||!/^[0-9a-f]{64}$/.test(result.result.library_sha256)||result.result.production_authority!==false||result.result.automatic_training!==false||result.result.automatic_promotion!==false)fail('Invalid hybrid model provenance or authority');
  }
  const observations=[result.result,result.baseline,result.previous,result.strong_baseline].filter(Boolean);
  if(observations.some(o=>o.status==='verified')){
    const meaning=result.result.formalization?.candidates?.[payload.interpretation??0];
    if(!meaning||!/^[0-9a-f]{64}$/.test(meaning.interpretation_sha256)||typeof meaning.lean!=='string')fail('Missing selected formal interpretation');
    for(const observation of observations.filter(o=>o.status==='verified')){
      const r=observation.search.receipt;
      if(r.goal_sha256===meaning.interpretation_sha256&&r.statement===meaning.lean)continue;
      if(observation===result.result)fail('Kernel proof differs from the selected interpretation');
      // Keep the actual alternative proof inspectable; it cannot certify the
      // selected meaning or count as a comparable solve.
      observation.checker_status=observation.status;
      observation.status='different_interpretation';
      observation.certifies_selected_interpretation=false;
      observation.reason='This checked comparison proof concerns a different formal interpretation.';
    }
  }
  return result;
}
export function parseResult(log,payload){
  const marker=resultMarker(log);if(marker.encoding!=='V1')fail('Compressed result requires the streaming decoder');
  const binary=atob(marker.value);if(binary.length>1000000)fail('Checker result exceeds bound');
  return validateResult(resultJSON(Uint8Array.from(binary,c=>c.charCodeAt(0))),payload);
}
async function expandCatalogPacket(packet,payload){
  if(payload.model_family!=='verified-memory-v1'||!exact(packet,['format','payload','catalogs','expanded_limit_bytes'])||packet.expanded_limit_bytes!==4000000)fail('Unapproved interned packet');
  if(!packet.catalogs||typeof packet.catalogs!=='object'||Array.isArray(packet.catalogs)||Object.keys(packet.catalogs).length>8)fail('Catalog bound');
  const canonical=v=>Array.isArray(v)?'['+v.map(canonical).join(',')+']':v&&typeof v==='object'?'{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonical(v[k])).join(',')+'}':JSON.stringify(v);
  const depthCheck=(v,d=0)=>{if(d>64)fail('Packet nesting bound');if(v&&typeof v==='object'){if('pcs_catalog_ref' in v)fail('Nested catalog reference');for(const x of Object.values(v))depthCheck(x,d+1);}};
  const sizes=new Map();
  for(const [id,value] of Object.entries(packet.catalogs)){
    if(!/^[0-9a-f]{64}$/.test(id)||!Array.isArray(value))fail('Invalid catalog');depthCheck(value);
    const bytes=encoder.encode(canonical(value));if(hex(await crypto.subtle.digest('SHA-256',bytes))!==id)fail('Catalog digest mismatch');sizes.set(id,bytes.length);
  }
  let remaining=4000000;
  const charge=n=>{remaining-=n;if(remaining<0)fail('Expanded packet bound');};
  const visit=(v,d=0)=>{
    if(d>64)fail('Packet nesting bound');
    if(Array.isArray(v)){charge(2+Math.max(0,v.length-1));return v.map(x=>visit(x,d+1));}
    if(!v||typeof v!=='object'){charge(encoder.encode(JSON.stringify(v)).length);return v;}
    if(exact(v,['pcs_catalog_ref'])){const id=v.pcs_catalog_ref;if(typeof id!=='string'||!sizes.has(id))fail('Missing catalog reference');charge(sizes.get(id));return packet.catalogs[id];}
    charge(2+Math.max(0,Object.keys(v).length-1)+Object.keys(v).reduce((n,k)=>n+encoder.encode(JSON.stringify(k)).length+1,0));
    return Object.fromEntries(Object.entries(v).map(([k,x])=>[k,visit(x,d+1)]));
  };
  return visit(packet.payload);
}
export async function parseResultLog(log,payload){
  const marker=resultMarker(log);
  if(marker.encoding==='V1')return validateActualActions(parseResult(log,payload),payload);
  if(marker.value.length>64000)fail('Compressed checker result exceeds bound');
  const binary=atob(marker.value);if(binary.length>48000)fail('Compressed checker result exceeds bound');
  const compressed=Uint8Array.from(binary,c=>c.charCodeAt(0));
  const reader=new Blob([compressed]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
  const chunks=[];let size=0;
  try{
    for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;
      if(size>1000000){await reader.cancel();fail('Checker result exceeds bound');}chunks.push(value);}
  }catch(error){throw new Error(error.message||'Invalid compressed checker result');}
  const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
  const parsed=resultJSON(raw);return validateActualActions(validateResult(parsed.format==='pcs-interned-public-lean-v1'?await expandCatalogPacket(parsed,payload):parsed,payload),payload);
}
export async function poll(env,value,transport=fetch,now=Date.now(),onProgress=null){
  const payload=await verifyTicket(env,value,now);
  const runs=await object(await github(env,'/actions/workflows/'+WORKFLOW+'/runs?event=workflow_dispatch&per_page=30',{},transport));
  const matches=runs.workflow_runs.filter(r=>r.display_title==='PCS public Lean '+payload.request_id);
  if(!matches.length)return {status:'queued',pcs_authority:false};if(matches.length!==1)fail('Ambiguous workflow run');
  const run=matches[0];if(!Number.isSafeInteger(run.id)||run.id<1||run.head_sha!==payload.core_sha||run.head_branch!=='main'||run.event!=='workflow_dispatch'||run.path!=='.github/workflows/'+WORKFLOW||run.repository?.full_name!==REPO)fail('Unapproved checker execution');
  const url='https://github.com/'+REPO+'/actions/runs/'+run.id;
  if(run.status!=='completed'){if(onProgress)await onProgress('running',run.id);return {status:'running',run_url:url,pcs_authority:false};}
  if(run.conclusion!=='success')return {status:run.conclusion==='cancelled'?'cancelled':run.conclusion==='timed_out'?'resource_exhaustion':'failed',run_id:run.id,run_url:url,reason:'The real checker job did not complete successfully.',pcs_authority:false};
  if(onProgress)await onProgress('verifying',run.id);
  const jobs=await object(await github(env,'/actions/runs/'+run.id+'/jobs',{},transport));
  if(jobs.jobs.length!==1||!Number.isSafeInteger(jobs.jobs[0].id)||jobs.jobs[0].id<1||jobs.jobs[0].name!=='public-lean'||jobs.jobs[0].conclusion!=='success')fail('Unexpected checker job provenance');
  const download=await github(env,'/actions/jobs/'+jobs.jobs[0].id+'/logs',{},transport);
  let logs;
  // Workers supports manual redirects. boundedText rejects every non-2xx reply,
  // so a second redirect cannot be followed or carry GitHub authorization.
  if(download.status===302){const location=download.headers.get('location');const target=new URL(location);if(target.protocol!=='https:'||target.port||target.username||target.password||!(target.hostname.endsWith('.blob.core.windows.net')||target.hostname.endsWith('.actions.githubusercontent.com')))fail('Unapproved log download destination');logs=await boundedText(await transport(target.href,{redirect:'manual',credentials:'omit'}),4000000);}else logs=await boundedText(download,4000000);
  let evidence;try{evidence=await parseResultLog(logs,payload);}catch(error){throw Object.assign(new Error('Independent checker evidence rejected'),{code:'invalid_checker_evidence'});}
  return {status:'completed',run_url:url,evidence,pcs_authority:false};
}
export async function requestCancellation(env,value,transport=fetch,now=Date.now(),onAuthorized=null){
  const payload=await verifyTicket(env,value,now);
  const runs=await object(await github(env,'/actions/workflows/'+WORKFLOW+'/runs?event=workflow_dispatch&per_page=30',{},transport));
  const matches=runs.workflow_runs.filter(r=>r.display_title==='PCS public Lean '+payload.request_id);
  if(matches.length!==1)fail('A unique dispatched checker run is required for cancellation');
  const run=matches[0];
  if(!Number.isSafeInteger(run.id)||run.id<1||run.head_sha!==payload.core_sha||run.head_branch!=='main'||run.event!=='workflow_dispatch'||run.path!=='.github/workflows/'+WORKFLOW||run.repository?.full_name!==REPO)fail('Unapproved checker execution');
  if(run.status==='completed')return {status:'already_terminal',run_id:run.id,pcs_authority:false};
  if(onAuthorized)await onAuthorized(run.id);
  const response=await github(env,'/actions/runs/'+run.id+'/cancel',{method:'POST'},transport);
  if(response.status!==202)fail('Provider cancellation unavailable');
  return {status:'cancellation_requested',run_id:run.id,pcs_authority:false};
}
