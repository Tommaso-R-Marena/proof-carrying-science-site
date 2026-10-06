// Offline, deidentified preparation: synthetic agent-safety search and repair trajectories.
// Deliberately not actual Lean 4 proof steps or a production RL trainer.
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {
  SAFETY_LAB_VERSION,ACTIONS,GUARDS,evaluateResearchSession,scenarioForSeed
} from "../public/safety-forge-core.mjs";

export const SAFETY_FORGE_DATASET="pcs-safety-forge-learning-dataset-v1";
export function prepareSafetyForgeDataset(document){
  if(!document||typeof document!=="object"||Array.isArray(document)||
    document.format!=="pcs-safety-forge-optin-dataset-v1"||!Array.isArray(document.entries)||
    document.entries.length>500)throw Error("Owner-exported Safety Forge dataset required, at most 500 rows.");
  const episodes=[],rejected=[],seeds=new Set();
  for(const [index,entry] of document.entries.entries()){
    if(!entry||typeof entry!=="object"||Array.isArray(entry)||
      Object.keys(entry).some(k=>!["replay","collected_day"].includes(k))){
      throw Error("Unexpected research export fields; reject potential personal identifiers.");
    }
    const replay=entry.replay;
    if(!replay||typeof replay!=="object"||replay.format!=="pcs-safety-forge-replay-v1"||
       !Array.isArray(replay.attacks)||!Array.isArray(replay.repairs))throw Error("Missing verified replay.");
    const input={
      scenario_seed:replay.seed,scenario_version:replay.scenario_version,
      attack_trials:replay.attacks.map(a=>({actions:a.actions})),
      repair_trials:replay.repairs.map(r=>({guards:r.guards}))
    };
    const independentlyReplayed=evaluateResearchSession(input);
    if(JSON.stringify(independentlyReplayed)!==JSON.stringify(replay)){
      throw Error("Replay mismatch: exported labels or state transitions have changed.");
    }
    const scenario=scenarioForSeed(replay.seed);
    const split=replay.seed%7===0?"evaluation":"training";
    // A data point is a search *attempt*, not a claim the participant found a novel proof.
    const attackEpisodes=independentlyReplayed.attacks.map((attempt,trial)=>{
      const steps=attempt.events.map((event,step)=>{
        const actionReward=event.violations.length?5:event.blocked?-1:0;
        return {
          t:step,observation:event.state_before,
          action:event.action,available_actions:ACTIONS.map(a=>a.id),
          next_state:event.state_after,blocked:event.blocked,
          violations:event.violations,
          reward:actionReward,done:event.violations.length>0||step===attempt.events.length-1
        };
      });
      return {trial,task:"find_policy_counterexample",found_failure:attempt.detected_unsafe,
        failure_labels:attempt.violations,terminated_early:attempt.early_stop,steps};
    });
    const repairEpisodes=independentlyReplayed.repairs.map((r,trial)=>({
      trial,task:"choose_minimal_safe_shield",selected_guards:r.guards,
      available_guards:GUARDS.map(g=>({id:g.id,cost:g.cost})),
      reward:r.passed?r.score:r.safe?-25:-50,
      safe:r.safe,mission_reachable:r.live,verified_within_bound:r.passed,
      guard_cost:r.guard_cost,states_explored:r.checked_states,
      found_counterexample:r.counterexample,
      witnessed_safe_mission:r.safe_mission
    }));
    episodes.push({
      scenario_seed:replay.seed,scenario_version:SAFETY_LAB_VERSION,
      split,scenario:{world:scenario.id,risk_budget:scenario.risk_budget,
        shortcut_risk:scenario.shortcut_risk,initial_guards:[...scenario.initial_guards]},
      data_origin:"opt_in_adult_contributor_synthetic_gameplay_unverified_human_origin",
      verification:"independent_local_replay_of_server_validated_finite_state_simulator",
      attack_episodes:attackEpisodes,repair_episodes:repairEpisodes
    });
    seeds.add(replay.seed);
  }
  return {
    format:SAFETY_FORGE_DATASET,version:SAFETY_LAB_VERSION,authority:"NONE",
    real_lean_tactic_traces:false,proof_kernel_verdict:"NOT_EVALUATED",
    collection:"Self-attested 18+ voluntary submissions with verified PCS account email.",
    privacy:"All account IDs, names, emails, network addresses and timestamps are discarded.",
    split_rule:"scenario_seed % 7 == 0 is evaluation; never split one seed across training and evaluation.",
    label_semantics:"Finite synthetic state/action transition, bounded counterexample and policy-repair reward.",
    caution:[
      "These are simulated lab decisions, not real-world AI or Lean proofs.",
      "The simulator's policy spec is an explicit assumption and may not match any deployed system.",
      "Human authenticity, expertise, independent discovery, and consent-age assertion are not cryptographically proved.",
      "Use deduplication, source sampling audits and holdouts; reward gaming and train/test transfer remain open questions.",
      "Real proof-search RL needs proof-state observations and kernel-checked results on independent Lean 4 benchmarks."
    ],
    stats:{sessions:episodes.length,distinct_seeds:seeds.size,
      train:episodes.filter(x=>x.split==="training").length,
      evaluation:episodes.filter(x=>x.split==="evaluation").length,
      attack_trajectories:episodes.reduce((n,x)=>n+x.attack_episodes.length,0),
      repair_proposals:episodes.reduce((n,x)=>n+x.repair_episodes.length,0),
      verified_counterexamples:episodes.reduce((n,x)=>n+x.attack_episodes.filter(y=>y.found_failure).length,0),
      verified_repairs:episodes.reduce((n,x)=>n+x.repair_episodes.filter(y=>y.verified_within_bound).length,0)},
    episodes
  };
}
const main=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(main){
  const [input,output]=process.argv.slice(2);
  if(!input||!output){
    console.error("Usage: node scripts/prepare_safety_forge_dataset.mjs OWNER_EXPORT.json DEIDENTIFIED_OUTPUT.json");
    process.exitCode=2;
  }else{
    try{
      const source=JSON.parse(readFileSync(input,"utf8"));
      const checked=prepareSafetyForgeDataset(source);
      writeFileSync(output,JSON.stringify(checked,null,2)+"\n",{flag:"wx",mode:0o600});
      console.log("Prepared "+checked.stats.sessions+" synthetically verified sessions; zero Lean proof authority.");
    }catch(error){
      console.error("Rejected dataset:",error.message);process.exitCode=1;
    }
  }
}
