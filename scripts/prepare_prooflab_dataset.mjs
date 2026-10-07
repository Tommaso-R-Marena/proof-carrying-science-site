// Exact, bounded, consented ProofLab event dataset preparation.
// No browser-reported grade, private IDs or implied Lean proofs are accepted.
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {CORE_SOURCE_COMMIT,PROOFLAB_VERSION,evaluateSession,findTask,proofPlan} from "../public/prooflab-core.mjs";
export const PROOFLAB_DATASET_VERSION="pcs-prooflab-training-experiment-v1";
function inputFromReplay(row){
 if(!row||typeof row!=="object"||Array.isArray(row)||!Array.isArray(row.attempted_actions))throw Error("Unrecognized source-backed session.");
 const actions=row.attempted_actions.map(x=>{
  if(x.kind==="place")return{kind:"place",node:x.node};
  if(x.kind==="undo"||x.kind==="hint")return{kind:x.kind};
  if(x.kind==="repair")return{kind:"repair",choice:x.choice};
  if(x.kind==="scope")return{kind:"scope",choice:x.choice,confidence:x.confidence};
  throw Error("Unexpected replay event type.");
 });
 return {version:PROOFLAB_VERSION,task_id:row.task_id,actions};
}
export function prepareProofLabDataset(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||
  input.format!=="pcs-prooflab-optin-learning-sessions-v1"||
  input.core_revision!==CORE_SOURCE_COMMIT||
  !Array.isArray(input.records)||input.records.length>2500)
  throw Error("Expected bounded owner export from the pinned ProofLab release.");
 const rows=[],caseCounts=new Map();let incomplete=0,assisted=0;
 for(const raw of input.records){
  // Whitelist exact replay fields before copying; reject extra identity-bearing data.
  const expected=[
    "format","version","task_id","source_revision","module","public_split","task_source",
    "attempted_actions","placed","planned_stages","complete","invalid_moves","hints",
    "repair","interpretation","score","game_scaffold_passed","kernel_proof_verified",
    "authentic_human_choice_verified","limitations"
  ];
  if(!raw||typeof raw!=="object"||Array.isArray(raw)||
     Object.keys(raw).sort().join(",")!==expected.sort().join(","))throw Error("Unexpected personal or unsupported research fields.");
  const task=findTask(raw.task_id);
  if(!task||task.split==="evaluation")throw Error("Private evaluation leakage or unsupported theorem.");
  const replay=evaluateSession(inputFromReplay(raw));
  if(JSON.stringify(raw)!==JSON.stringify(replay))
    throw Error("Recomputed source/scaffold replay differs from exported result.");
  if(replay.kernel_proof_verified!==false||replay.authentic_human_choice_verified!==false)
    throw Error("False Lean or human-authenticity claim.");
  const family=task.module;
  const split=task.split==="train"?"train":"public_challenge_only";
  const eligible=split==="train"&&replay.game_scaffold_passed&&replay.hints===0&&
    replay.interpretation.confidence>=2&&replay.invalid_moves<3;
  const group=task.id;
  caseCounts.set(group,(caseCounts.get(group)||0)+1);
  if(!replay.game_scaffold_passed)incomplete++;
  if(replay.hints)assisted++;
  rows.push({
    task_id:task.id,module:family,split,
    source_path:task.source.path,source_line:task.source.line,
    source_blob_sha:task.source.blob_sha,public_statement:task.statement,
    scaffold_graph:proofPlan(task.id).nodes.map(n=>({id:n.id,requires:n.needs})),
    actions:inputFromReplay(raw).actions,replay_score:replay.score,
    recorded_correct_scaffold:replay.game_scaffold_passed,
    rejected_moves:replay.invalid_moves,assistance_hints:replay.hints,
    repair:replay.repair,interpretation:replay.interpretation,
    eligible_for_narrow_educational_imitation:eligible,
    real_lean_proof_verified:false
  });
 }
 return{format:PROOFLAB_DATASET_VERSION,pinned_core_revision:CORE_SOURCE_COMMIT,
  evaluation_policy:{
    public_challenge_is_not_private_holdout:true,
    private_modules_absent:["PKPDCheck","Workflow"],
    requested_future_evaluation:"Independent Lean-checked project and tactic proof-search benchmarks, not this website game."
  },
  metrics:{donated_sessions:rows.length,distinct_public_theorems:caseCounts.size,
    completed_oracle_scaffolds:rows.length-incomplete,assisted_sessions:assisted,
    eligible_narrow_training:rows.filter(x=>x.eligible_for_narrow_educational_imitation).length},
  warnings:[
    "All results concern educational prerequisite graphs, NOT actual kernel-verified Lean proof search.",
    "Public theorem names/solutions are visible; public challenge cases cannot serve as blind model holdout.",
    "Source module holdout is weaker than independent project evaluation.",
    "Human authenticity/age and pre-reveal choices are self-reported and not proven by browser data.",
    "Do not publish donor-reidentifying records or claim real-world AI alignment improvement."
  ],rows};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
 if(process.argv.length!==4)throw Error("Usage: node scripts/prepare_prooflab_dataset.mjs OWNER_EXPORT.json OUTPUT.json");
 const data=JSON.parse(readFileSync(process.argv[2],"utf8"));
 writeFileSync(process.argv[3],JSON.stringify(prepareProofLabDataset(data),null,2)+"\n");
}
