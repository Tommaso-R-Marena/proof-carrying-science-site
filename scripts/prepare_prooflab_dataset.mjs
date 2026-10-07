// Explicitly donated source-pinned educational planning traces → guarded next-step
// training examples. This is NOT a theorem-proving dataset or Lean tactic corpus.
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {PROOFLAB_VERSION,allProofLabCases,evaluateProofLabSession,availablePlanMoves}
  from "../public/prooflab-core.mjs";
import {PROOFLAB_SOURCE_COMMIT,PROOFLAB_WITHHELD} from "../public/prooflab-source-data.mjs";

export const PROOFLAB_LEARNING_FORMAT="pcs-prooflab-obligation-trajectory-dataset-v1";
export function prepareProofLabDataset(exported){
  if(!exported||typeof exported!=="object"||Array.isArray(exported)||
     exported.format!=="pcs-prooflab-optin-source-grounded-dataset-v1"||
     exported.source_commit!==PROOFLAB_SOURCE_COMMIT||
     !Array.isArray(exported.entries)||exported.entries.length>500)
    throw Error("Expected bounded owner-exported source-pinned ProofLab dataset.");
  if(Object.keys(exported).some(key=>/^(user_id|email|ip|username|session_digest)$/i.test(key)))
    throw Error("Owner export cannot include personal identifiers.");
  const rows=[],cases=new Set(),duplicateCounts=new Map();
  let blocked=0,feasible=0;
  for(const record of exported.entries){
    if(!record||typeof record!=="object"||Array.isArray(record)||
       Object.keys(record).sort().join("|")!==
        ["format","case_id","source_commit","campaign","split","case_theorem","actions",
         "hints_used","challenge","graph_replay","training_labels","privacy"].sort().join("|"))
      throw Error("Invalid full verified educational replay record.");
    const submitted={
      case_id:record.case_id,version:PROOFLAB_VERSION,
      actions:record.actions,hints_used:record.hints_used,
      threat:record.challenge?.threat,
      threat_confidence:record.challenge?.confidence,
    };
    let reread;
    try{reread=evaluateProofLabSession(submitted);}catch(e){
      throw Error("Independent ProofLab replay rejected stored record: "+e.message);
    }
    if(JSON.stringify(reread)!==JSON.stringify(record))
      throw Error("Stored graph verdict disagrees with the independent source-pinned replay.");
    if(record.split!=="training")throw Error("Nontraining theorem leaked into public research data.");
    const group=record.case_id+"/"+PROOFLAB_SOURCE_COMMIT;
    cases.add(record.case_id);
    const seqKey=JSON.stringify(record.actions)+"|"+group;
    duplicateCounts.set(seqKey,(duplicateCounts.get(seqKey)||0)+1);
    let completed=[];
    for(const step of record.graph_replay.checked_steps){
      // Next-action feasibility is a MULTI-LABEL problem: a graph often has
      // several valid next steps. Never treat one human ordering as uniquely correct.
      const available=availablePlanMoves(record.case_id,completed);
      const candidate=step.node;
      const eligible=available.includes(candidate);
      if(eligible!==step.accepted)throw Error("Stored action feasibility inconsistent with prerequisites.");
      if(step.accepted){completed.push(step.node);feasible++;}else blocked++;
      rows.push({
        case_id:record.case_id,source_commit:PROOFLAB_SOURCE_COMMIT,
        source_module:record.campaign,
        problem_group:group,split:"training",index:step.index,
        completed_before:completed.slice(0,step.accepted?-1:completed.length),
        candidate_action:candidate,all_eligible_actions:available,
        prerequisite_feasible:step.accepted,
        missing_prerequisites:step.missing_prerequisites,
        action_kind:step.kind,
        self_reported_reason:step.reason,
        self_reported_confidence:step.confidence,
        assisted_hint_count:record.hints_used,
        human_threat_hypothesis:record.challenge.threat,
        human_threat_status:"unverified hypothesis",
        session_completed:record.graph_replay.completed,
      });
    }
  }
  return{
    format:PROOFLAB_LEARNING_FORMAT,
    source_commit:PROOFLAB_SOURCE_COMMIT,
    sample_count:rows.length,case_count:cases.size,
    private_holdout_counts:{...PROOFLAB_WITHHELD},
    quality:{eligible_actions:feasible,blocked_actions:blocked,
      duplicate_human_trajectories:[...duplicateCounts.values()].filter(n=>n>1).length},
    training_contract:{
      label:"Verified pedagogical DAG prerequisite feasibility, not Lean kernel semantics.",
      ground_truth:"Independent deterministic plan replay by fixed source-indexed game engine.",
      human_reason:"Self-reported only; not independently true or demonstrably made before hints.",
      split:"Only 22 public training problems; the 18 private heldout tasks are in the core benchmark.",
      generalization_warning:"All 40 theorem targets derive from ONE PCS codebase. Cross-project evidence is absent.",
      duplicate_policy:"Each duplicated trajectory is identified, not automatically multiplied into independent evidence."
    },
    rows
  };
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  if(process.argv.length!==4)throw Error(
    "Usage: node scripts/prepare_prooflab_dataset.mjs OWNER_EXPORT.json DEIDENTIFIED_DATASET.json");
  const data=JSON.parse(readFileSync(process.argv[2],"utf8"));
  writeFileSync(process.argv[3],JSON.stringify(prepareProofLabDataset(data),null,2)+"\n");
}
