/* Public proof proposals run only in pinned, protected PCS main on free standard
   public GitHub runners. Hosted CI is a trust dependency, not PCS scientific
   authority. No artifact storage, model API, arbitrary ref or executable input. */
export const CORE_SHA = "e0c4f7b3af37f1ae42eb5f4cbee8937f9dc93604";
const REPO = "Tommaso-R-Marena/proof-carrying-science";
const WORKFLOW = "pcs-lean-public.yml";
const DOMAIN = "PCS_PUBLIC_LEAN_TICKET_V1:";
const encoder = new TextEncoder();
const hex = bytes => [...new Uint8Array(bytes)].map(b=>b.toString(16).padStart(2,'0')).join('');
const exact = (o,keys) => o && typeof o==='object' && !Array.isArray(o) && Object.keys(o).sort().join(',')===keys.slice().sort().join(',');
function fail(message){throw new Error(message);}
async function key(env){if(!env.RATE_LIMIT_SALT)fail('Public checker tickets are unavailable');return crypto.subtle.importKey('raw',encoder.encode(env.RATE_LIMIT_SALT),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
function encode(bytes){let s='';for(const n of bytes)s+=String.fromCharCode(n);return btoa(s).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');}
function decode(s){if(!/^[A-Za-z0-9_-]{1,1200}$/.test(s))fail('Invalid ticket encoding');const raw=atob(s.replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function ticket(env,payload){const bytes=encoder.encode(JSON.stringify(payload));const mac=await crypto.subtle.sign('HMAC',await key(env),encoder.encode(DOMAIN+new TextDecoder().decode(bytes)));return encode(bytes)+'.'+hex(mac);}
export async function verifyTicket(env,value,now=Date.now()){
  if(typeof value!=='string'||value.length>1800)fail('Invalid checker ticket');const parts=value.split('.');if(parts.length!==2||!/^[0-9a-f]{64}$/.test(parts[1]))fail('Invalid checker ticket');
  const bytes=decode(parts[0]);const signature=Uint8Array.from(parts[1].match(/../g),x=>parseInt(x,16));const data=new TextDecoder('utf-8',{fatal:true}).decode(bytes);
  if(!await crypto.subtle.verify('HMAC',await key(env),signature,encoder.encode(DOMAIN+data)))fail('Forged checker ticket');
  const p=JSON.parse(data);
  if(!exact(p,['format','request_id','core_sha','source_sha256','interpretation','issued','expires'])||p.format!=='pcs-public-lean-ticket-v1'||p.core_sha!==CORE_SHA||!/^[0-9a-f]{32}$/.test(p.request_id)||!/^[0-9a-f]{64}$/.test(p.source_sha256)||!Number.isSafeInteger(p.issued)||!Number.isSafeInteger(p.expires)||p.expires!==p.issued+3600000||now<p.issued-60000||now>p.expires)fail('Expired or mismatched checker ticket');
  return p;
}
async function github(env,path,options={},transport=fetch){
  if(!env.PCS_GITHUB_TOKEN||(path!==''&&!/^\/[A-Za-z0-9_./?=&%-]+$/.test(path)))fail('GitHub proof dispatch is unavailable');
  const response=await transport('https://api.github.com/repos/'+REPO+path,{...options,redirect:'manual',headers:{'Authorization':'Bearer '+env.PCS_GITHUB_TOKEN,'Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'PCS-Lean-Research/1.0',...(options.body?{'Content-Type':'application/json'}:{})}});
  return response;
}
async function object(response){if(!response.ok)fail('GitHub checker operation unavailable ('+response.status+')');return response.json();}
export function validatePublicStatement(body){
  if(!exact(body,['statement','interpretation','public_consent','license'])||typeof body.statement!=='string'||!body.statement.trim()||body.statement.length>3000||body.public_consent!==true||body.license!=='CC0-1.0'||!(body.interpretation===null||(Number.isInteger(body.interpretation)&&body.interpretation>=0&&body.interpretation<=15)))fail('Explicit authorized public CC0 statement and valid interpretation required');
  if(!/^(For (all|every|any) (propositions?|natural numbers?|integers?|functions from natural numbers to natural numbers|predicates on natural numbers)|There exists (a|an) (natural number|integer|proposition)) /i.test(body.statement)||!/^[A-Za-z0-9_(), .:+*=≤¬∧∨→↔∀∃-]+$/.test(body.statement)||/\b[0-9]{5,}\b/.test(body.statement))fail('Use a supported public mathematical statement; personal data and credentials are not accepted');
  if(/\b(?:bearer|password|api_key|access_token|private_key|authorization)\b/i.test(body.statement)||/\b(?:ghp|github_pat|sk)-?[A-Za-z0-9_]{12,}\b/.test(body.statement))fail('Credential-like text is not eligible for public submission');
}
export async function dispatch(env,body,transport=fetch,now=Date.now()){
  if(!/^[0-9a-f]{40}$/.test(CORE_SHA))fail('A protected checker revision has not been approved');
  validatePublicStatement(body);
  const repository=await object(await github(env,'',{},transport));if(repository.private!==false||repository.full_name!==REPO)fail('Only standard public-repository compute is permitted');
  const current=await object(await github(env,'/commits/main',{},transport));if(current.sha!==CORE_SHA)fail('Default branch differs from the approved checker revision');
  const request_id=crypto.randomUUID().replace(/-/g,'');
  const source_sha256=hex(await crypto.subtle.digest('SHA-256',encoder.encode(JSON.stringify(body.statement))));
  const response=await github(env,'/actions/workflows/'+WORKFLOW+'/dispatches',{method:'POST',body:JSON.stringify({ref:'main',inputs:{request_id,statement:body.statement,interpretation:body.interpretation===null?'':String(body.interpretation)}})},transport);
  if(response.status!==204)fail('GitHub proof dispatch unavailable ('+response.status+')');
  const payload={format:'pcs-public-lean-ticket-v1',request_id,core_sha:CORE_SHA,source_sha256,interpretation:body.interpretation,issued:now,expires:now+3600000};
  return {status:'queued',ticket:await ticket(env,payload),request_id,core_sha:CORE_SHA,public_source:true,pcs_authority:false};
}
async function boundedText(response,max){if(!response.ok)fail('Checker log download failed');if(Number(response.headers.get('content-length')||0)>max)fail('Checker logs exceed bound');const reader=response.body.getReader();let size=0;const chunks=[];for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();fail('Checker logs exceed bound');}chunks.push(value);}const all=new Uint8Array(size);let offset=0;for(const chunk of chunks){all.set(chunk,offset);offset+=chunk.length;}return new TextDecoder().decode(all);}
export function parseResult(log,payload){
  const markers=[...log.matchAll(/(?:^|\n)[^\n]*?PCS_LEAN_RESULT_V1:([A-Za-z0-9+/=]+)\s*(?=\n|$)/g)];
  if(markers.length!==1)fail('Missing or duplicate independent checker result');
  const binary=atob(markers[0][1]);if(binary.length>1000000)fail('Checker result exceeds bound');
  const result=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(binary,c=>c.charCodeAt(0))));
  if(result.format!=='pcs-public-lean-result-v1'||result.request_id!==payload.request_id||result.core_sha!==payload.core_sha||result.source_sha256!==payload.source_sha256||result.result?.pcs_authority!==false)fail('Checker result binding mismatch');
  for(const observation of [result.result,result.baseline].filter(Boolean)){
    if(observation.pcs_authority!==false||!['verified','unknown','resource_exhaustion','unsupported_formalization','ambiguous_interpretation'].includes(observation.status))fail('Unapproved checker outcome or authority assertion');
    if(observation.status!=='verified')continue;
    const r=observation.search?.receipt;if(!r||r.format!=='pcs-prover-proof-v1'||r.kernel?.format!=='pcs-lean-kernel-v1'||!Array.isArray(r.kernel.axioms)||r.kernel.axioms.some(a=>!['propext','Classical.choice','Quot.sound'].includes(a))||typeof r.proof!=='string'||!r.proof.trim()||typeof r.lean!=='string'||!r.lean.includes('version 4.28.0,')||r.pcs_scientific_authority!==false)fail('Invalid scoped kernel receipt');
  }
  return result;
}
export async function poll(env,value,transport=fetch,now=Date.now()){
  const payload=await verifyTicket(env,value,now);
  const runs=await object(await github(env,'/actions/workflows/'+WORKFLOW+'/runs?event=workflow_dispatch&per_page=30',{},transport));
  const matches=runs.workflow_runs.filter(r=>r.display_title==='PCS public Lean '+payload.request_id);
  if(!matches.length)return {status:'queued',pcs_authority:false};if(matches.length!==1)fail('Ambiguous workflow run');
  const run=matches[0];if(!Number.isSafeInteger(run.id)||run.id<1||run.head_sha!==CORE_SHA||run.head_branch!=='main'||run.event!=='workflow_dispatch'||run.path!=='.github/workflows/'+WORKFLOW||run.repository?.full_name!==REPO)fail('Unapproved checker execution');
  const url='https://github.com/'+REPO+'/actions/runs/'+run.id;
  if(run.status!=='completed')return {status:'running',run_url:url,pcs_authority:false};if(run.conclusion!=='success')return {status:'failed',run_url:url,reason:'The real checker job did not complete successfully.',pcs_authority:false};
  const jobs=await object(await github(env,'/actions/runs/'+run.id+'/jobs',{},transport));
  if(jobs.jobs.length!==1||!Number.isSafeInteger(jobs.jobs[0].id)||jobs.jobs[0].id<1||jobs.jobs[0].name!=='public-lean'||jobs.jobs[0].conclusion!=='success')fail('Unexpected checker job provenance');
  const download=await github(env,'/actions/jobs/'+jobs.jobs[0].id+'/logs',{},transport);
  let logs;
  if(download.status===302){const location=download.headers.get('location');const target=new URL(location);if(target.protocol!=='https:'||target.port||target.username||target.password||!(target.hostname.endsWith('.blob.core.windows.net')||target.hostname.endsWith('.actions.githubusercontent.com')))fail('Unapproved log download destination');logs=await boundedText(await transport(target.href,{redirect:'error',credentials:'omit'}),4000000);}else logs=await boundedText(download,4000000);
  return {status:'completed',run_url:url,evidence:parseResult(logs,payload),pcs_authority:false};
}
