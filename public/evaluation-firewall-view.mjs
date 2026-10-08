// Read-only browser presentation validator; does NOT independently re-score a model.
export const REPORT_FORMAT='pcs-semantic-evaluation-report-v1';
const ratio=x=>x===null||(typeof x==='number'&&Number.isFinite(x)&&x>=0&&x<=1);
const integer=x=>Number.isInteger(x)&&x>=0&&x<=1000000;
const hex=x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x);
const fail=msg=>{throw Error('Invalid evaluation report: '+msg);};
function group(m){
 if(!m||typeof m!=='object'||Array.isArray(m))fail('missing metrics');
 for(const k of ['cases','attempted','correct','false_equivalence_claims','verified_countermodels',
     'minimum_domain_witnesses','confidence_samples'])if(!integer(m[k]))fail('invalid '+k);
 if(m.correct>m.cases||m.attempted>m.cases||m.confidence_samples>m.attempted)fail('inconsistent metric counts');
 for(const k of ['coverage','accuracy_all','accuracy_answered','brier_score','expected_calibration_error'])
  if(!ratio(m[k]))fail('invalid '+k);
}
export function validateFirewallReport(data){
 if(!data||typeof data!=='object'||Array.isArray(data)||data.format!==REPORT_FORMAT)fail('unsupported format');
 if(!hex(data.pack_sha256)||!hex(data.predictions_sha256)||!hex(data.firewall_source_sha256)||!hex(data.finite_engine_source_sha256))fail('missing exact commitments');
 if(data.authority!=='BOUNDED_FINITE_MODEL_REPLAY_ONLY'||data.lean_kernel_checked!==false||
    data.blind_evaluation!==false||data.source_data_type!=='public_source_derived_synthetic')
    fail('unsupported assurance scope');
 group(data.overall);group(data.development);group(data.evaluation);
 if(data.overall.cases!==data.development.cases+data.evaluation.cases)fail('split count mismatch');
 if(!data.invariance||!integer(data.invariance.origins)||!ratio(data.invariance.consistency_rate))fail('invalid invariance');
 if(!data.by_family||typeof data.by_family!=='object'||Array.isArray(data.by_family))fail('invalid families');
 const families=Object.entries(data.by_family);
 if(families.length>50)fail('too many families');
 for(const [key,m] of families){if(key.length>100)fail('invalid family');group(m);}
 return data;
}
export function summaryForDisplay(data){
 validateFirewallReport(data);
 const pct=v=>v===null?'not measured':(100*v).toFixed(1)+'%';
 return {pack:data.pack_sha256,revision:data.predictions_sha256,
   cases:data.evaluation.cases,accuracy:pct(data.evaluation.accuracy_all),
   coverage:pct(data.evaluation.coverage),accuracy_answered:pct(data.evaluation.accuracy_answered),
   false_equivalence:data.evaluation.false_equivalence_claims,
   witnesses:data.evaluation.verified_countermodels,
   consistency:pct(data.invariance.consistency_rate),
   brier:data.evaluation.brier_score===null?'not measured':data.evaluation.brier_score.toFixed(4),
   families:Object.entries(data.by_family).map(([name,m])=>({name,cases:m.cases,
      accuracy:pct(m.accuracy_all),coverage:pct(m.coverage)})).sort((a,b)=>a.name.localeCompare(b.name))};
}
export function compareDisplaySummaries(a,b){
 const x=summaryForDisplay(a),y=summaryForDisplay(b);
 if(x.pack!==y.pack)fail('different benchmark versions');
 return {first:x,second:y,same_benchmark:true,
   warning:'These are locally loaded report claims. Recompute with the official CLI to authenticate scores.'};
}
