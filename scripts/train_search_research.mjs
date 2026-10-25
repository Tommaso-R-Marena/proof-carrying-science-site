// Version-2 intake. Failed searches are analyzed, never relabeled as successful demonstrations.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {validateSearchResearch,readSearchResearch} from '../public/search-research-core.mjs';
import {fitSearchSessions,searchModelEnvelope,evaluateSearchSessions} from '../public/countermodel-learning.mjs';
import {verifyRuleset} from '../public/world-builder-core.mjs';
import {analyzeResearch} from './analyze_search_research.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
export async function trainSearchResearch(doc){
 await verifyRuleset();const entries=validateSearchResearch(doc),eligible=entries.filter(e=>e.replay.final_verified).map(e=>e.session),fitted=fitSearchSessions(eligible);
 const body=searchModelEnvelope(fitted,{trainer_sha256:sha(readFileSync(new URL(import.meta.url))),
  fitter_sha256:sha(readFileSync(new URL('../public/countermodel-learning.mjs',import.meta.url))),
  features_sha256:sha(readFileSync(new URL('../public/countermodel-search-policy.mjs',import.meta.url))),
  training_rows_sha256:sha(JSON.stringify(fitted.rows)),data_origin:'supplied v2 owner export; human authorship, age and consent cannot be authenticated offline',
  evaluation_examples_used_for_training:0,hint_assisted_episodes_used_for_training:0});
 const model={...body,model_digest_sha256:sha(JSON.stringify(body))};
 return {model,evaluation:evaluateSearchSessions(model,eligible),quality:await analyzeResearch(doc),
  intake:{version:'pcs-countermodel-search-optin-v2',tested_rounds:entries.length,unfinished_excluded_from_behavior_cloning:entries.length-eligible.length,
   note:'Unfinished searches remain in the quality report; all assisted episodes and evaluation families are excluded from fitting by the original fitter.'}};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output,report]=process.argv.slice(2);if(!input||!output||!report)throw Error('Usage: node scripts/train_search_research.mjs V2_EXPORT.json MODEL.json REPORT.json');
 const doc=readSearchResearch(new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(input))),result=await trainSearchResearch(doc);
 writeFileSync(output,JSON.stringify(result.model,null,2)+'\n');const {model,...evidence}=result;writeFileSync(report,JSON.stringify(evidence,null,2)+'\n');
 console.log(JSON.stringify({model_digest_sha256:model.model_digest_sha256,training:model.training,evaluation:result.evaluation,intake:result.intake}));
}
