// Actual fitting on replay-checked adult opt-in exports. No invented human data.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {prepareCountermodelDataset,COUNTERMODEL_RULESET_SHA256} from './prepare_countermodel_dataset.mjs';
import {fitSearchSessions,searchModelEnvelope,evaluateSearchSessions} from '../public/countermodel-learning.mjs';
const sha=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const TRAINER_SHA=createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex');
const FEATURE_SHA=createHash('sha256').update(readFileSync(fileURLToPath(new URL('../public/countermodel-search-policy.mjs',import.meta.url)))).digest('hex');
const FITTER_SHA=createHash('sha256').update(readFileSync(fileURLToPath(new URL('../public/countermodel-learning.mjs',import.meta.url)))).digest('hex');
export function trainCountermodelSearchPolicy(ownerExport){
 // Verify raw server exports before using the same real fitter as the browser.
 prepareCountermodelDataset(ownerExport);
 const fitted=fitSearchSessions(ownerExport.entries.map(e=>e.session));
 const artifact=searchModelEnvelope(fitted,{trainer_sha256:TRAINER_SHA,fitter_sha256:FITTER_SHA,
  features_sha256:FEATURE_SHA,training_rows_sha256:sha(fitted.rows),
  data_origin:'supplied owner export; consent and human authenticity cannot be authenticated offline',
  evaluation_examples_used_for_training:0,hint_assisted_episodes_used_for_training:0});
 if(artifact.ruleset_sha256!==COUNTERMODEL_RULESET_SHA256)throw Error('Shared fitter ruleset mismatch');
 return {...artifact,model_digest_sha256:sha(artifact)};
}
export function evaluateCountermodelSearchPolicy(model,ownerExport){
 prepareCountermodelDataset(ownerExport);
 return evaluateSearchSessions(model,ownerExport.entries.map(e=>e.session));
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [input,output,report]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/train_countermodel_search_policy.mjs owner-export.json model.json [evaluation.json]');
 const doc=JSON.parse(readFileSync(input,'utf8')),model=trainCountermodelSearchPolicy(doc);
 writeFileSync(output,JSON.stringify(model,null,2)+'\n');
 const evaluation=evaluateCountermodelSearchPolicy(model,doc);
 if(report)writeFileSync(report,JSON.stringify(evaluation,null,2)+'\n');
 console.log(JSON.stringify({training:model.training,evaluation,model_digest_sha256:model.model_digest_sha256}));
}
