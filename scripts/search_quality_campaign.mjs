// Reproducible finite-game certificates and synthetic counterexamples. No human data.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {MISSIONS} from '../public/world-builder-core.mjs';
import {COUNTERMODEL_VERSION,initialWorld} from '../public/countermodel-core.mjs';
import {routeCertificate,verifyRouteCertificate,analyzeSearchQuality} from '../public/search-route-core.mjs';
const output=process.argv[2];if(!output)throw Error('Usage: node scripts/search_quality_campaign.mjs OUTPUT_DIRECTORY');
mkdirSync(output,{recursive:true});const files=[],routes=[];
for(const id of MISSIONS){const c=await routeCertificate(id,initialWorld()),file=resolve(output,id+'.route.json');writeFileSync(file,JSON.stringify(c,null,2)+'\n');files.push(file);routes.push({mission_id:id,...await verifyRouteCertificate(c)});}
const python=spawnSync('python3',['scripts/verify_search_route.py',...files],{encoding:'utf8',timeout:60000});if(python.status!==0)throw Error('Independent Python replay failed: '+python.stderr);
const check={type:'check'},toggle={type:'toggle',p:'P',i:0};
const counterexamples=[];
for(const [name,actions]of [['edit_detour',[check,toggle,toggle,check,toggle,check]],['computed_counterexample_without_requested_test',[check,toggle]],['success_invalidated_by_edit',[toggle,check,toggle]]]){
 const session={version:COUNTERMODEL_VERSION,mission_id:'implication-flip',actions};counterexamples.push({name,session,analysis:await analyzeSearchQuality(session)});
}
const sources=['public/search-route-core.mjs','public/search-research-core.mjs','scripts/verify_search_route.py','research/search-quality-v1/DistanceCertificate.lean'];
const report={format:'pcs-search-quality-campaign-v1',data_origin:'exhaustive finite puzzle graphs and scripted synthetic choices; not human evidence',
 sources:sources.map(path=>({path,sha256:createHash('sha256').update(readFileSync(path)).digest('hex')})),routes,independent_python:JSON.parse(python.stdout),counterexamples,
 limitations:['Lean proves the abstract potential criterion, not concrete JS/Python correspondence.','All seven missions are public; no blind model or human evaluation.','Fully informed edit distance excludes tests and clues; it is not a measure of human intelligence.'],kernel_checked:false,pcs_authoritative:false};
writeFileSync(join(output,'campaign.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({states:routes.reduce((n,r)=>n+r.states_checked,0),edges:routes.reduce((n,r)=>n+r.edges_checked,0),routes:routes.map(r=>({mission_id:r.mission_id,minimum_edits:r.minimum_edits})),counterexamples:counterexamples.map(c=>({name:c.name,edit_surplus:c.analysis.edit_surplus,final_checked_counterexample:c.analysis.final_checked_counterexample}))}));
