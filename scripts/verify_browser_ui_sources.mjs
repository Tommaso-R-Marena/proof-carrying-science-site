// Qualify a new reading interface without rewriting an earlier experiment.
// The historical report, its HTML snapshot, every mathematical/data source and
// all executed test outcomes must remain identical; only reviewed HTML changes.
import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const load=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const normalized=p=>p.startsWith('public/')||p.startsWith('scripts/')?p:'public/'+p;
export function verifyBrowserUISources(historicalPath){
 const manifest=load('docs/evidence/site-clarity-v1/browser-qualifications.json');
 assert.equal(manifest.format,'pcs-browser-ui-requalification-v1');assert.equal(manifest.scientific_acceptance,false);
 const records=historicalPath?manifest.records.filter(r=>r.historical===historicalPath):manifest.records;
 assert.equal(records.length,historicalPath?1:3,'Every scientific viewer needs an explicit qualification');
 for(const r of records){
  const historicalRaw=fs.readFileSync(path.join(root,r.historical));assert.equal(sha(historicalRaw),r.historical_sha256,'Historical evidence changed');
  const old=JSON.parse(historicalRaw),fresh=load(r.current);
  assert.deepEqual(Object.keys(fresh.source_sha256).sort(),Object.keys(old.source_sha256).sort(),'Source coverage changed');
  const {source_sha256:oldSources,...oldOutcomes}=old,{source_sha256:freshSources,...freshOutcomes}=fresh;
  assert.deepEqual(freshOutcomes,oldOutcomes,'Executed checks or trust flags changed');
  const htmlKeys=Object.keys(oldSources).filter(n=>n.endsWith('.html'));assert.equal(htmlKeys.length,1);
  assert.equal(sha(fs.readFileSync(path.join(root,r.previous_html))),oldSources[htmlKeys[0]],'Historical HTML snapshot changed');
  for(const [name,digest] of Object.entries(freshSources)){
   assert.equal(sha(fs.readFileSync(path.join(root,normalized(name)))),digest,'Current source differs from fresh browser run: '+name);
   if(!name.endsWith('.html'))assert.equal(digest,oldSources[name],'Mathematical, data or test source changed: '+name);
  }
 }
 for(const [name,digest] of Object.entries(manifest.reading_help_sources))assert.equal(sha(fs.readFileSync(path.join(root,name))),digest,'Reading help source drift');
 return {format:manifest.format,viewers:records.length,historical_evidence_preserved:true,math_data_and_test_sources_unchanged:true,executed_checks_unchanged:true,scientific_acceptance:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))try{console.log(JSON.stringify(verifyBrowserUISources()));}catch(e){console.error(e.message);process.exitCode=1;}
