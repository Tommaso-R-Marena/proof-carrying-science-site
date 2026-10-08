// Offline evidence policy only; a JSON file is not an independently authenticated GitHub attestation.
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
export const REQUIRED=['site-check','site-contract','countermodel-lean-kernel'];
export function verifyReviewGate(checks,commitSha,required=REQUIRED){
 if(typeof commitSha!=='string'||!/^[a-f0-9]{40}$/.test(commitSha))
  throw Error('Explicit full Git commit SHA is required');
 if(!checks||!Array.isArray(checks.check_runs)||checks.head_sha!==commitSha)
  throw Error('Check records missing or bound to a different exact commit');
 const records=checks.check_runs;
 for(const name of required){
  const results=records.filter(c=>c.name===name);
  if(results.length!==1)throw Error('Required check missing or ambiguous: '+name);
  const c=results[0];
  if(c.head_sha&&c.head_sha!==commitSha)throw Error('Required check wrong SHA: '+name);
  if(c.status!=='completed'||c.conclusion!=='success')
   throw Error('Required check was not a completed PASS: '+name+' ('+c.conclusion+')');
 }
 return {format:'pcs-review-check-evidence-v1',commit_sha:commitSha,required_checks:required,
   policy_met:true,important:'Offline local evidence precheck; production requires authenticated GitHub API + manual review'};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const [file,sha]=process.argv.slice(2);
 if(!file||!sha)throw Error('Usage: node verify_website_review_gate.mjs CHECK_RUNS.json EXACT_SHA');
 const data=JSON.parse(readFileSync(file,'utf8'));
 console.log(JSON.stringify(verifyReviewGate(data,sha)));
}
