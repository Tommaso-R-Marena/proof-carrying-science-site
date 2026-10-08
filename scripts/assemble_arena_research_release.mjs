// Privacy-safe, deterministic replay and release packaging for consented PCS Arena exports.
// An export from the owner is REQUIRED; local fixtures are not real human data.
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {prepareCountermodelDataset} from './prepare_countermodel_dataset.mjs';
import {prepareSafetyForgeDataset} from './prepare_safety_forge_dataset.mjs';
import {prepareDataset as prepareProofQuestDataset} from './prepare_proof_quest_dataset.mjs';
import {prepareProofLabDataset} from './prepare_prooflab_dataset.mjs';
import {prepareForgeDuelDataset} from './prepare_forge_duel_dataset.mjs';

export const ARENA_RELEASE_FORMAT='pcs-arena-deidentified-release-v1';
const preparers=Object.freeze({
 countermodel:prepareCountermodelDataset,
 safety_forge:prepareSafetyForgeDataset,
 proof_quest:prepareProofQuestDataset,
 prooflab:prepareProofLabDataset,
 forge_duel:prepareForgeDuelDataset
});
const badKey=/^(user_id|account_id|email|username|full_name|ip|ip_address|created_at|collected_day|collected_at|session_digest|leaderboard_alias)$/i;
const email=/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/;
const digest=data=>createHash('sha256').update(JSON.stringify(data)).digest('hex');
function privacy(value,at='root'){
 if(typeof value==='string'&&email.test(value))throw Error('Identity-bearing free text at '+at);
 if(Array.isArray(value)){value.forEach((v,i)=>privacy(v,at+'['+i+']'));return;}
 if(value!==null&&typeof value==='object'){
  for(const [k,v] of Object.entries(value)){
   if(badKey.test(k))throw Error('Identity-bearing field: '+at+'.'+k);
   privacy(v,at+'.'+k);
  }
 }
}
export function buildArenaRelease(sources){
 if(!sources||typeof sources!=='object'||Array.isArray(sources)||!Object.keys(sources).length)
  throw Error('At least one owner-exported Arena dataset required');
 const datasets={},artifacts=[];
 for(const [game,doc] of Object.entries(sources)){
  if(!Object.hasOwn(preparers,game))throw Error('Unknown or unsupported data collection '+game);
  const processed=preparers[game](doc); // independently recomputes/verifies supplied outcomes
  privacy(processed);
  const records=Array.isArray(processed.episodes)?processed.episodes.length:
                Array.isArray(processed.rows)?processed.rows.length:NaN;
  if(!Number.isInteger(records)||records<0)throw Error('Invalid prepared dataset records');
  const trainCount=(processed.episodes||processed.rows||[]).filter(x=>x.split==='training').length;
  const evalCount=(processed.episodes||processed.rows||[]).filter(x=>x.split==='evaluation').length;
  const formatted={...processed,
    provenance:{source_kind:'verified_email_adult_self_attested_optin_export',
      external_human_provenance_verified:false,
      downstream_lean_proof_validity:'NOT_ESTABLISHED',
      deterministic_replay_only:true}};
  // Match the EXACT bytes written to disk, including pretty formatting and final newline.
  const sha=createHash('sha256').update(JSON.stringify(formatted,null,2)+'\n').digest('hex');
  datasets[game]=formatted;
  artifacts.push({game,filename:game+'.deidentified.json',sha256:sha,records,training_rows:trainCount,
    evaluation_rows:evalCount,checker_scope:processed.label_semantics||processed.labels||
      processed.training_contract?.ground_truth||processed.dataset_scope||'bounded deterministic simulation'});
 }
 artifacts.sort((a,b)=>a.game.localeCompare(b.game));
 return {manifest:{format:ARENA_RELEASE_FORMAT,authority:'NONE',source:'owner-exported consented research events',
  includes_real_human_data:'POSSIBLE_AFTER_OWNER_EXPORT_AND_REVIEW',
  privacy_status:'AUTOMATED_SCREENING_ONLY_MANUAL_PRIVACY_REVIEW_REQUIRED',
  consent_status:'SELF_ATTESTED_18_PLUS_NOT_IDENTITY_VERIFIED',
  quality_gates:['independent server/offline deterministic replay','limited PII key/value screening',
    'per-game semantic version commitments','game-specific heldout splits'],
  NOT_PROVED:['independent human identity','Lean/kernel proof correctness','general real-world safety',
    'no prior train/test contamination','offline export withdrawal'],
  artifacts},datasets};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 const args=process.argv.slice(2);
 if(args.length<4||args.length%2!==0||args[0]!=='--out-dir')
  throw Error('Usage: node assemble_arena_research_release.mjs --out-dir DIR --countermodel OWNER_EXPORT.json [--safety_forge ...]');
 const outdir=args[1],sources={};
 for(let i=2;i<args.length;i+=2){
  const game=args[i].replace(/^--/,'');
  if(!Object.hasOwn(preparers,game)||Object.hasOwn(sources,game))throw Error('Unknown/duplicate source');
  const raw=readFileSync(args[i+1]);
  if(raw.length>10_000_000)throw Error('Oversized owner export');
  sources[game]=JSON.parse(raw.toString('utf8'));
 }
 const result=buildArenaRelease(sources);
 mkdirSync(outdir,{recursive:true});
 for(const [name,data] of Object.entries(result.datasets)){
  writeFileSync(join(outdir,name+'.deidentified.json'),JSON.stringify(data,null,2)+'\n',{flag:'wx',mode:0o600});
 }
 writeFileSync(join(outdir,'manifest.json'),JSON.stringify(result.manifest,null,2)+'\n',{flag:'wx',mode:0o600});
 console.log(JSON.stringify({format:ARENA_RELEASE_FORMAT,artifacts:result.manifest.artifacts,record_count:result.manifest.artifacts.reduce((x,y)=>x+y.records,0)}));
}
