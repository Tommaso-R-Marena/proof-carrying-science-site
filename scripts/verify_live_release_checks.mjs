// Production release gate: fetch exact check-run evidence from GitHub's authenticated API.
// Never accept a caller-supplied JSON snapshot as a trusted attestation.
import {fileURLToPath} from 'node:url';
import {verifyReviewGate,REQUIRED} from './verify_website_review_gate.mjs';

const shaPattern=/^[0-9a-f]{40}$/;
const repoPattern=/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
export async function verifyLiveChecks({repository,sha,token,request=fetch,required=REQUIRED}){
 if(!repoPattern.test(repository||'')||!shaPattern.test(sha||'')||
    typeof token!=='string'||!token.trim())throw Error('Trusted GitHub repo, exact SHA and token required');
 const runs=[];
 for(let page=1;page<=10;page++){
  const url='https://api.github.com/repos/'+repository+'/commits/'+sha+'/check-runs?per_page=100&page='+page;
  const res=await request(url,{headers:{
   'Accept':'application/vnd.github+json','Authorization':'Bearer '+token,
   'X-GitHub-Api-Version':'2022-11-28','User-Agent':'pcs-independent-release-gate-v1'}});
  if(!res.ok)throw Error('Authenticated GitHub checks unavailable ('+res.status+')');
  const data=await res.json();
  if(!Array.isArray(data.check_runs))throw Error('Malformed authenticated GitHub response');
  for(const row of data.check_runs){
   if(row.head_sha!==sha)throw Error('Check result applies to another commit');
   if(required.includes(row.name)&&(row.app?.id!==15368||row.app?.slug!=='github-actions'))throw Error('Required result is not from the trusted GitHub Actions app');
   runs.push(row);
  }
  if(data.check_runs.length<100)break;
  if(page===10)throw Error('Check-run pagination truncated');
 }
 const result=verifyReviewGate({head_sha:sha,check_runs:runs},sha,required);
 return {...result,source:'GITHUB_AUTHENTICATED_CHECK_RUNS_API',
   fetched_check_runs:runs.length,not_a_proof_of_formal_checker_correctness:true};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const repository=process.env.GITHUB_REPOSITORY;
 const sha=process.env.PCS_RELEASE_SHA;
 const token=process.env.GITHUB_TOKEN;
 try{const result=await verifyLiveChecks({repository,sha,token});console.log(JSON.stringify(result));}
 catch(error){console.error('PCS_RELEASE_BLOCKED:',error.message);process.exitCode=2;}
}
