// Typed connection from a reproduced model proposal to an independently checked
// mathematical claim. Finite-world testing and the Nat interpretation stay distinct.
import {getGauntletTask} from './semantic-gauntlet-core.mjs';
import {replayModelExample} from './model-walkthrough-core.mjs';
import {canonical,sha256,utf8} from './file-check-core.mjs';
import {validateCatalog,validateReport,shareHtml} from './proof-workbench-core.mjs';

export const MODEL_HANDOFF_KEY='pcs-model-lean-handoff-v1';
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&Object.keys(v).sort().join('|')===keys.slice().sort().join('|');
function expression(f,names,bound=new Set()){
 if(!f||typeof f!=='object')throw Error('Missing model formula');
 switch(f.op){
 case 'pred':if(!exact(f,['op','name','x'])||!names.includes(f.name)||!bound.has(f.x))break;
  return {ir:{op:'apply',fn:{op:'var',name:f.name},arg:{op:'var',name:f.x}},lean:'('+f.name+' '+f.x+')'};
 case 'not':{if(!exact(f,['op','f']))break;const a=expression(f.f,names,bound);return {ir:{op:'not',arg:a.ir},lean:'(¬ '+a.lean+')'};}
 case 'and':case 'or':case 'imp':{if(!exact(f,['op','a','b']))break;const a=expression(f.a,names,bound),b=expression(f.b,names,bound);return {ir:{op:f.op==='imp'?'implies':f.op,left:a.ir,right:b.ir},lean:'('+a.lean+' '+{and:'∧',or:'∨',imp:'→'}[f.op]+' '+b.lean+')'};}
 case 'forall':case 'exists':{if(!exact(f,['op','x','f'])||!['x','y','z'].includes(f.x)||bound.has(f.x))break;const a=expression(f.f,names,new Set([...bound,f.x]));return {ir:{op:f.op,name:f.x,type:'Nat',body:a.ir},lean:'('+{forall:'∀',exists:'∃'}[f.op]+' ('+f.x+' : Nat), '+a.lean+')'};}
 }
 throw Error('This proposal has no reviewed unary-predicate Lean translation');
}
export async function modelProofHandoff(bytes,model){
 const run=await replayModelExample(bytes,model);
 const accepted=run.attempts.find(a=>a.checked.equivalent_within_bound);
 if(!accepted)throw Error('No successful model suggestion to submit');
 // These two registered examples use exactly Q and T. No arbitrary symbol,
 // relation, source declaration, proof command or user code is accepted here.
 const names=getGauntletTask(run.task_id).symbols.unary;
 if(!names.length||names.some(n=>!['Q','T'].includes(n)))throw Error('Unreviewed model signature');
 const left=expression(run.source,names),right=expression(accepted.proposal,names);
 const ir={format:'pcs-math-ir-v1',binders:names.map(name=>({name,type:'NatPred'})),body:{op:'iff',left:left.ir,right:right.ir}};
 const lean='∀ '+names.map(n=>'('+n+' : Nat → Prop)').join(' ')+', ('+left.lean+' ↔ '+right.lean+')';
 const statement='For all predicates on natural numbers '+names.join(' and ')+', ('+left.lean+' ↔ '+right.lean+')';
 const proposal_sha256=await sha256(utf8(canonical(accepted.proposal)));
 const entry={title:'Check this exact repair',id:'model-repair-'+run.task_id+'-'+proposal_sha256.slice(0,16),category:'Model proposal',statement,lean,goal_sha256:await sha256(utf8(canonical(ir))),recommended_family:'prospective-hybrid-v2',meaning:'Compare the intended rule with this exact reproduced repair. Proposal method: '+(run.strategy==='learned'?'trained ranker':'deterministic edit order')+'. Interpret individuals as natural-number labels. The earlier finite check is separate. A proof concerns this mathematical interpretation, not a real assistant or AI safety.'};
 const payload={format:MODEL_HANDOFF_KEY,model_replay:run,proposal_sha256,entry,pcs_authority:false,physical_neural_execution_independently_attested:false};
 return {...payload,handoff_sha256:await sha256(utf8(canonical(payload)))};
}
export async function validateModelHandoff(value,model){
 if(!exact(value,['format','model_replay','proposal_sha256','entry','pcs_authority','physical_neural_execution_independently_attested','handoff_sha256']))throw Error('Unrecognized model handoff');
 const fresh=await modelProofHandoff(utf8(canonical(value.model_replay)+'\n'),model);
 if(canonical(fresh)!==canonical(value))throw Error('Model suggestion or proof meaning changed');
 return fresh;
}
export async function withModelEntry(catalog,handoff){
 const {catalog_sha256,core_revision,...payload}=catalog;
 const entries=payload.entries.filter(e=>e.id!==handoff.entry.id);
 const next={...payload,entries:[...entries,handoff.entry]};
 return validateCatalog({...next,core_revision,catalog_sha256:await sha256(utf8(canonical(next)))});
}
export async function modelLeanChain(handoff,report){
 if(report.entry_id!==handoff.entry.id||report.goal_sha256!==handoff.entry.goal_sha256||report.statement!==handoff.entry.statement||report.formal_statement!==handoff.entry.lean)throw Error('Proof is for a different model suggestion');
 const payload={format:'pcs-model-lean-chain-v1',handoff,proof_report:report,pcs_authority:false,physical_neural_execution_independently_attested:false};
 return {...payload,chain_sha256:await sha256(utf8(canonical(payload)))};
}
export async function validateModelChain(value,catalog,model){
 if(!exact(value,['format','handoff','proof_report','pcs_authority','physical_neural_execution_independently_attested','chain_sha256'])||value.format!=='pcs-model-lean-chain-v1')throw Error('Unrecognized model-to-Lean evidence');
 const handoff=await validateModelHandoff(value.handoff,model),extended=await withModelEntry(catalog,handoff);
 await validateReport(value.proof_report,extended);
 if(canonical(await modelLeanChain(handoff,value.proof_report))!==canonical(value))throw Error('Model-to-Lean chain changed');
 return {handoff,catalog:extended,report:value.proof_report};
}

export async function shareModelChainHtml(handoff,report){
 const chain=await modelLeanChain(handoff,report),html=await shareHtml(report);
 const original='id="evidence">'+JSON.stringify(report).replace(/</g,'\\u003c');
 if(!html.includes(original))throw Error('Readable evidence template changed');
 return html.replace(original,'id="evidence">'+JSON.stringify(chain).replace(/</g,'\\u003c'))
  .replace('scripts/replay_proof_workbench.py','scripts/replay_model_lean_chain.py')
  .replace('<h2>Exact question</h2>','<h2>Model suggestion</h2><p>This proof target was reconstructed from the pinned model replay. Model generation, the earlier finite check and this mathematical proof are separate steps. Physical neural execution and real-world safety are not established.</p><h2>Exact question</h2>');
}

export const LOCAL_MEMORY_CHECKPOINT='869732df6ef29bac30c9878b57e5d8c7e0f1fba41231d0d10c5f1112309aee57';
export async function localModelChain(handoff,observation,coreRevision){
 if(coreRevision!=='f20f3cab2938f2e085f137185e88f4700d5da2ed'||observation?.model!=='verified-memory-v1'||observation.pcs_authority!==false||observation.checkpoint_sha256!==LOCAL_MEMORY_CHECKPOINT)throw Error('Local model or source differs from the approved runtime');
 const candidate=observation.formalization?.candidates?.[0],receipt=observation.search?.receipt;
 if(observation.status!=='verified'||candidate?.lean!==handoff.entry.lean||candidate.interpretation_sha256!==handoff.entry.goal_sha256||receipt?.statement!==handoff.entry.lean||receipt.goal_sha256!==handoff.entry.goal_sha256||receipt.pcs_scientific_authority!==false||receipt.kernel?.format!=='pcs-lean-kernel-v1'||!Array.isArray(receipt.kernel.axioms)||receipt.kernel.axioms.some(a=>!['propext','Classical.choice','Quot.sound'].includes(a))||!receipt.lean?.includes('version 4.28.0,'))throw Error('Local Lean did not verify this exact model proposal');
 const kept=['format','model','mode','status','checkpoint_sha256','memory_sha256','library_sha256','primitive_catalog_sha256','formalization','pcs_authority'];
 const projected=Object.fromEntries(kept.filter(k=>observation[k]!==undefined).map(k=>[k,structuredClone(observation[k])]));
 projected.projection='pcs-local-model-proof-projection-v1';projected.search={status:observation.search.status,expansions:observation.search.expansions,receipt:structuredClone(receipt)};
 const payload={format:'pcs-model-local-lean-chain-v1',handoff,core_revision:coreRevision,observation:projected,pcs_authority:false,physical_neural_execution_independently_attested:false};
 return {...payload,chain_sha256:await sha256(utf8(canonical(payload)))};
}
export async function validateLocalModelChain(value,model){
 if(!exact(value,['format','handoff','core_revision','observation','pcs_authority','physical_neural_execution_independently_attested','chain_sha256'])||value.format!=='pcs-model-local-lean-chain-v1')throw Error('Unrecognized local model/Lean evidence');
 const h=await validateModelHandoff(value.handoff,model),fresh=await localModelChain(h,value.observation,value.core_revision);
 if(canonical(fresh)!==canonical(value))throw Error('Local model/proof evidence changed');
 return fresh;
}
