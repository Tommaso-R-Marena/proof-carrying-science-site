import {AuditJournal,TERMINAL,requestKey} from './lean-job-journal.js';
import {preparePublicRequest,signPreparedTicket,verifyTicket,dispatch,poll,requestCancellation} from './lean-research.js';
import {canonical,sha256} from '../public/research-governance-core.mjs';

// Provider uncertainty is never retried by dispatching another workflow. Polling
// reconciles the one immutable request; expiration claims no proof.
function journal(env,archive){return new AuditJournal(env.COMMONS_DB,{archive});}
async function reply(env,row,{reused=false}={}){
  return {status:TERMINAL.has(row.state)?row.state==='complete'?'completed_metadata':row.state:'queued',job_state:row.state,
    ticket:await signPreparedTicket(env,row.payload),request_id:row.payload.request_id,core_sha:row.payload.core_sha,
    issued:row.payload.issued,expires:row.payload.expires,reused,public_source:true,pcs_authority:false};
}
export async function submitJob(env,body,{ip='unknown',idempotencyKey=crypto.randomUUID().replace(/-/g,''),admit,archive=null,transport=fetch,now=Date.now()}={}){
  if(typeof admit!=='function')throw Error('Trusted admission is required');
  const binding=await sha256(canonical(body));
  const scoped=await requestKey(env,ip,idempotencyKey);
  const requestId=scoped.slice(0,32),store=journal(env,archive);
  let existing=await store.current(requestId);
  let payload=existing?.payload||await preparePublicRequest(body,now,requestId);
  // Existing meaning is never reused for an altered statement, mode or actions.
  if(existing&&existing.binding_sha256!==binding)throw Error('Idempotency key is already bound to a different request');
  if(existing){
    const expected=await preparePublicRequest(body,payload.issued,requestId);
    if(canonical(expected)!==canonical(payload))throw Error('Immutable request mismatch');
  }
  let row=existing||await store.create(payload,binding,now);
  // Concurrent first writers may have different clocks. Every caller must use
  // the winner's persisted issue time, not its own provisional ticket payload.
  payload=row.payload;
  if(now>payload.expires&&!TERMINAL.has(row.state))row=(await store.advance(row,'expired','ticket_expired',{now})).current;
  if(TERMINAL.has(row.state))return reply(env,row,{reused:true});
  if(row.state==='created'){
    const claim=await store.advance(row,'authorizing','admission_started',{now});row=claim.current;
    if(!claim.won)return reply(env,row,{reused:true});
    try{await admit();row=(await store.advance(row,'authorized','admission_passed',{now})).current;}
    catch(error){await store.advance(row,'failed',error.code==='rate_limited'?'rate_limited':'admission_failed',{now});throw error;}
  }
  if(row.state==='authorized')row=(await store.advance(row,'queued','queued',{now})).current;
  if(row.state==='queued'){
    const claim=await store.advance(row,'dispatching','dispatch_started',{now});row=claim.current;
    if(claim.won){
      try{
        const result=await dispatch(env,body,transport,now,payload);
        row=(await store.advance(row,'dispatched','dispatch_confirmed',{now})).current;
        return {...result,job_state:row.state,issued:payload.issued,expires:payload.expires,reused:Boolean(existing)};
      }catch(error){
        // No retransmission after a timeout, network error, or ambiguous 5xx.
        // A single accepted provider run can still be recovered by its identity.
        row=(await store.advance(row,'dispatch_uncertain','dispatch_uncertain',{now})).current;
        return {...await reply(env,row),reason:'Dispatch confirmation unavailable. Poll this request; do not submit it again with a new key.'};
      }
    }
  }
  return reply(env,row,{reused:true});
}
export async function pollJob(env,value,{archive=null,transport=fetch,now=Date.now()}={}){
  const payload=await verifyTicket(env,value,now,true),store=journal(env,archive);
  let row=await store.current(payload.request_id);
  if(!row)return poll(env,value,transport,now); // Existing v1 tickets stay supported.
  if(canonical(row.payload)!==canonical(payload))throw Error('Journal ticket binding mismatch');
  if(now>payload.expires){
    if(!TERMINAL.has(row.state))row=(await store.advance(row,'expired','ticket_expired',{now})).current;
    return {status:'expired',job_state:row.state,request_id:payload.request_id,reason:'Ticket expired. No new proof result is accepted.',pcs_authority:false};
  }
  if(TERMINAL.has(row.state)&&row.state!=='complete')return {status:row.state,job_state:row.state,request_id:payload.request_id,reason:'Recorded terminal request outcome.',pcs_authority:false};
  const progress=async(state,runId)=>{
    row=await store.current(payload.request_id);
    if(row.run_id!==null&&row.run_id!==runId)throw Error('Provider run identity changed');
    if(TERMINAL.has(row.state)||row.state===state)return;
    // If another caller is already checking the receipt, a late running update
    // must not move it backwards or invalidate the winning terminal outcome.
    if(row.state==='verifying'&&state==='running'||row.state==='cancelling'&&state==='running')return;
    row=(await store.advance(row,state,state==='running'?'provider_running':'provider_verifying',{run_id:runId,now})).current;
  };
  let result;
  try{result=await poll(env,value,transport,now,progress);}
  catch(error){
    const invalid=error.code==='invalid_checker_evidence';
    row=await store.current(payload.request_id);
    if(invalid&&!TERMINAL.has(row.state))row=(await store.advance(row,'failed','evidence_rejected',{now})).current;
    else if(!TERMINAL.has(row.state)){
      const history=await store.history(payload.request_id);
      if(history.filter(r=>r.code==='provider_unavailable').length<4)row=(await store.advance(row,row.state,'provider_unavailable',{now})).current;
    }
    // Diagnostics never store source inputs, tokens or arbitrary provider text.
    return {status:invalid?'failed':'unavailable',job_state:row.state,request_id:payload.request_id,
      reason:invalid?'Independent result validation rejected the evidence.':'Provider evidence is temporarily unavailable. Retry polling this same ticket.',pcs_authority:false};
  }
  row=await store.current(payload.request_id);
  if(result.status==='queued')return {...result,job_state:row.state,request_id:payload.request_id};
  if(result.status==='running')return {...result,job_state:row.state,request_id:payload.request_id};
  if(result.status==='completed'){
    const digest=await sha256(canonical(result.evidence));
    if(row.state==='complete'){
      if(row.result_sha256!==digest)throw Error('Terminal result cannot be replaced');
      return {...result,job_state:'complete',request_id:payload.request_id,result_sha256:digest};
    }
    if(TERMINAL.has(row.state))return {status:row.state,job_state:row.state,pcs_authority:false};
    if(row.state!=='verifying')throw Error('Independent verification stage missing');
    const completed=await store.advance(row,'complete','provider_completed',{result_sha256:digest,now});
    if(completed.current.state!=='complete'||completed.current.result_sha256!==digest)throw Error('Conflicting terminal outcome');
    return {...result,job_state:'complete',request_id:payload.request_id,result_sha256:digest};
  }
  const state=result.status==='resource_exhaustion'?'resource_exhausted':result.status;
  if(!['failed','cancelled','resource_exhausted'].includes(state))throw Error('Unsupported provider outcome');
  if(!TERMINAL.has(row.state))row=(await store.advance(row,state,state==='cancelled'?'provider_cancelled':state==='resource_exhausted'?'provider_timed_out':'provider_failed',{run_id:result.run_id??row.run_id,now})).current;
  return {...result,job_state:row.state,request_id:payload.request_id};
}
export async function cancelJob(env,value,{archive=null,transport=fetch,now=Date.now()}={}){
  const payload=await verifyTicket(env,value,now),store=journal(env,archive);
  let row=await store.current(payload.request_id);
  if(!row||canonical(row.payload)!==canonical(payload))throw Error('A journaled request is required for cancellation');
  if(TERMINAL.has(row.state))return {status:row.state,job_state:row.state,pcs_authority:false};
  if(row.state==='cancelling')return {status:'cancellation_requested',job_state:row.state,pcs_authority:false};
  let claimed=false;
  let result;
  try{result=await requestCancellation(env,value,transport,now,async runId=>{
    row=await store.current(payload.request_id);
    if(TERMINAL.has(row.state)||row.state==='cancelling')throw Object.assign(new Error('Cancellation already recorded'),{code:'cancellation_already_recorded'});
    const claim=await store.advance(row,'cancelling','cancellation_requested',{run_id:runId,now});
    row=claim.current;claimed=claim.won;
    if(!claimed)throw Object.assign(new Error('Cancellation already recorded'),{code:'cancellation_already_recorded'});
  });}catch(error){
    if(error.code==='cancellation_already_recorded')return {status:TERMINAL.has(row.state)?row.state:'cancellation_requested',job_state:row.state,pcs_authority:false};
    if(claimed)return {status:'cancellation_requested',job_state:row.state,reason:'Provider confirmation unavailable. Poll the same ticket; cancellation is not yet confirmed.',pcs_authority:false};
    throw error;
  }
  if(result.status==='already_terminal')return pollJob(env,value,{archive,transport,now});
  row=await store.current(payload.request_id);
  if(TERMINAL.has(row.state))return {status:row.state,job_state:row.state,pcs_authority:false};
  return {...result,job_state:row.state};
}
