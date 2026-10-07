// Local-only dataset preparation for synthetic proof-dependency ordering.
// Not a Lean replay corpus, not an RL model trainer, and not assurance evidence.
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {PUZZLES,PUZZLE_VERSION,gradeOrder,getPuzzleById,puzzleVersionFor} from "../public/proof-order-core.mjs";

export const DATASET_FORMAT = "pcs-proof-order-trajectory-dataset-v1";
const SRC = "pcs-proof-order-optin-research-dataset-v1";
const HELD_OUT = new Set(["archive","optimize","invalidation"]);
const HELD_OUT_FAMILIES = new Set(["package-integrity"]);
const familyFor = p => p.family || "fixed:"+p.id;
const FIELDS = new Set(["puzzle_id","puzzle_version","order","hints_used","score","constraints_satisfied","total_constraints","valid_order","collected_day","collected_at"]);
export function prepareDataset(input){
  if(!input || typeof input!=="object" || input.format!==SRC || !Array.isArray(input.examples)){
    throw Error("An Owner-exported opt-in Proof Quest dataset is required.");
  }
  if(input.examples.length>50000)throw Error("Use one bounded export of at most 50,000 rows.");
  const episodes=[];
  let accepted=0,rejected=0;
  for(const raw of input.examples){
    if(!raw || typeof raw!=="object" || Array.isArray(raw)||Object.keys(raw).some(k=>!FIELDS.has(k))){
      throw Error("Unexpected columns or possible personal identifiers in exported attempt.");
    }
    const p=getPuzzleById(raw.puzzle_id);
    if(!p || raw.puzzle_version!==puzzleVersionFor(raw.puzzle_id))throw Error("Unknown puzzle or version: "+raw.puzzle_id);
    const grade=gradeOrder(p.id,raw.order,raw.hints_used);
    if(grade.score!==raw.score || grade.valid!==raw.valid_order ||
       grade.correct!==raw.constraints_satisfied || grade.total!==raw.total_constraints){
      throw Error("Dataset row conflicts with independently recomputed puzzle grade.");
    }
    let completed=[],transitions=[];
    for(const [index,step] of raw.order.entries()){
      const node=p.nodes.find(n=>n.id===step);
      const unselected=p.nodes.filter(n=>!completed.includes(n.id));
      const ready=node.needs.every(dep=>completed.includes(dep));
      transitions.push({
        index,
        state:{completed_step_ids:[...completed],remaining_step_ids:unselected.map(x=>x.id)},
        action:step,
        immediate_reward:ready?1:-1,
        required_before_action:[...node.needs],
        completed_prerequisites:node.needs.filter(n=>completed.includes(n)),
        accepted_prerequisite_order:ready,
        terminal:index===raw.order.length-1
      });
      completed.push(step);
    }
    episodes.push({
      puzzle_id:p.id,puzzle_version:puzzleVersionFor(p.id),puzzle_family:familyFor(p),
      split:HELD_OUT.has(p.id)||HELD_OUT_FAMILIES.has(p.family)?"evaluation":"training",
      source:"consenting_adult_human_ordering_on_synthetic_puzzle",
      score:grade.score,hints_used:raw.hints_used,
      full_order_valid:grade.valid,
      transitions
    });
    if(grade.valid)accepted++;else rejected++;
  }
  return {
    format:DATASET_FORMAT,
    authority:"NONE",
    lean_tactic_trajectory:false,
    source_format:SRC,
    privacy:"does not include account IDs, timestamps, IP addresses, user names or emails",
    evaluation_holdouts:[...HELD_OUT],
    procedural_family_holdouts:[...HELD_OUT_FAMILIES],
    label_semantics:"local prerequisite edge consistency, not correctness of a Lean proof term",
    limitations:[
      "Human ordering is susceptible to random and adversarial submissions.",
      "Synthetic fixed and procedurally generated puzzles are not Lean proof terms.",
      "Generated cases share curated semantic graph families; model gains require fresh held-out and out-of-distribution tests.",
      "The generated package-integrity family is held out together so no derived variant appears in both splits.",
      "Reward measures syntactic prerequisite satisfaction only, not theorem validity."
    ],
    stats:{episodes:episodes.length,valid_orders:accepted,invalid_orders:rejected,train:episodes.filter(e=>e.split==="training").length,evaluation:episodes.filter(e=>e.split==="evaluation").length},
    episodes
  };
}
const main = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if(main){
  const [input,output]=process.argv.slice(2);
  if(!input||!output){
    console.error("Usage: node scripts/prepare_proof_quest_dataset.mjs OWNER_EXPORT.json DEIDENTIFIED_TRAJECTORIES.json");
    process.exitCode=2;
  }else{
    try{
      const parsed=JSON.parse(readFileSync(input,"utf8"));
      const result=prepareDataset(parsed);
      writeFileSync(output,JSON.stringify(result,null,2)+"\n",{flag:"wx",mode:0o600});
      console.log("Wrote "+result.stats.episodes+" synthetic episodes; no Lean authority or user identifiers.");
    }catch(error){console.error("Dataset preparation rejected:",error.message);process.exitCode=1;}
  }
}
