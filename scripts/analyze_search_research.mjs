// Offline only. No uploads, identities or claims of general model improvement.
import {readFileSync,writeFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {validateSearchResearch,readSearchResearch} from '../public/search-research-core.mjs';
import {analyzeSearchQuality} from '../public/search-route-core.mjs';
import {verifyRuleset} from '../public/world-builder-core.mjs';
export async function analyzeResearch(doc){
 await verifyRuleset();const entries=validateSearchResearch(doc),episodes=[];
 for(const {session}of entries)episodes.push(await analyzeSearchQuality(session));
 return {format:'pcs-search-research-quality-v1',episodes,summary:{
  tested_rounds:episodes.length,final_checked_counterexamples:episodes.filter(e=>e.final_checked_counterexample).length,
  unfinished_rounds:episodes.filter(e=>!e.final_checked_counterexample).length,
  assisted_excluded:episodes.filter(e=>e.split==='assisted_excluded').length,
  evaluation_rounds:episodes.filter(e=>e.split==='evaluation').length,
  unsuccessful_checks:episodes.reduce((n,e)=>n+e.rows.filter(r=>r.derived_labels.response_seen&&!r.derived_labels.counterexample).length,0),
  edits:episodes.reduce((n,e)=>n+e.edits,0),edit_surplus:episodes.reduce((n,e)=>n+e.edit_surplus,0)},
  limitations:['User consent and human authorship cannot be established by an offline file.','Oracle labels are post-action targets; never use them as pre-action features.','Assisted episodes excluded; three public held-out missions are evaluation only.','Distance measures fully informed world edits, not optimal human learning or general intelligence.','No blind evaluation, human study or demonstrated model improvement.'],kernel_checked:false,pcs_authoritative:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const [input,output]=process.argv.slice(2);if(!input||!output)throw Error('Usage: node scripts/analyze_search_research.mjs OWNER_EXPORT.json REPORT.json');
 const raw=readFileSync(input);if(raw.length>8*1024*1024)throw Error('Export exceeds 8 MiB; request a smaller batch');
 const report=await analyzeResearch(readSearchResearch(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
 report.input_sha256=createHash('sha256').update(raw).digest('hex');
 report.analyzer_source_sha256=createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');
 writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report.summary));
}
