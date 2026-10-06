// Reproducible benchmark of toy-guard proposals learned from *deidentified*
// consenting-adult simulation sessions. Does NOT train Lean 4 theorem provers.
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {GUARDS,scenarioForSeed,verifyShield} from "../public/safety-forge-core.mjs";
import {SAFETY_FORGE_DATASET} from "./prepare_safety_forge_dataset.mjs";

const SAFE_HAND_BASELINE=["joint_review","redact","risk"];
function context(s){
  return (s.report_sensitive?"sensitive":"public")+"|"+(s.shortcut_risk>s.risk_budget?"risky":"low-risk");
}
function guardKey(ids){return [...ids].sort().join(",");}
function metrics(rows){
  const passing=rows.filter(x=>x.passed);
  const mean=key=>passing.length?Math.round(100*passing.reduce((n,x)=>n+x[key],0)/passing.length)/100:null;
  return {n:rows.length,passes:passing.length,
    pass_rate:rows.length?Number((passing.length/rows.length).toFixed(3)):null,
    mean_cost_on_success:mean("cost"),
    mean_cost_regret_on_success:mean("regret")};
}
const CANDIDATES=GUARDS.filter(g=>!g.id.startsWith("freeze"));
function independentBestCost(seed){
  let best=Infinity;
  // Brute force six narrow, mission-preserving guard controls.
  for(let mask=0;mask<(1<<CANDIDATES.length);mask++){
    const guards=CANDIDATES.filter((g,i)=>mask&(1<<i)).map(g=>g.id);
    const result=verifyShield(seed,guards);
    if(result.passed)best=Math.min(best,result.guard_cost);
  }
  return best;
}
export function benchmarkSafetyForgePolicy(dataset){
  if(!dataset||dataset.format!==SAFETY_FORGE_DATASET||!Array.isArray(dataset.episodes))
    throw Error("Prepare a deidentified Safety Forge trajectory dataset first.");
  const train=dataset.episodes.filter(x=>x.split==="training");
  const evaluation=dataset.episodes.filter(x=>x.split==="evaluation");
  const trainSeeds=new Set(train.map(x=>x.scenario_seed));
  if(evaluation.some(x=>trainSeeds.has(x.scenario_seed)))throw Error("Training/evaluation seed leakage detected.");
  if(train.length<5||evaluation.length<3){
    return {ready:false,reason:"Insufficient consenting-adult data: require at least 5 training sessions and 3 held-out evaluation sessions.",
      train_sessions:train.length,evaluation_sessions:evaluation.length,
      interpretation:"No machine-learning generalization or RL result can be inferred yet."};
  }

  const byContext=new Map(),global=[];
  for(const episode of train){
    const scenario=scenarioForSeed(episode.scenario_seed);
    if(!Array.isArray(episode.repair_episodes))throw Error("Missing repair candidates.");
    for(const proposal of episode.repair_episodes){
      if(!proposal.verified_within_bound)continue;
      // All source labels are revalidated even after dataset preparation.
      const checked=verifyShield(episode.scenario_seed,proposal.selected_guards);
      if(!checked.passed||checked.guard_cost!==proposal.guard_cost)
        throw Error("Training proposal verification mismatch.");
      const item={key:guardKey(proposal.selected_guards),guards:[...proposal.selected_guards],cost:checked.guard_cost};
      const group=context(scenario);
      if(!byContext.has(group))byContext.set(group,[]);
      byContext.get(group).push(item);global.push(item);
    }
  }
  if(global.length<3){
    return {ready:false,reason:"Insufficient verified human shield proposals: need at least three training-session successful repairs.",
      train_sessions:train.length,evaluation_sessions:evaluation.length,
      interpretation:"Recorded traces are not evidence that a learned policy improves on baselines."};
  }
  const choose=items=>{
    const scores=new Map();
    for(const x of items){
      const old=scores.get(x.key)||{...x,count:0};
      old.count++;scores.set(x.key,old);
    }
    return [...scores.values()].sort((a,b)=>(b.count*4-b.cost)-(a.count*4-a.cost)||a.key.localeCompare(b.key))[0];
  };
  const globalChoice=choose(global);
  const heldout=[];
  for(const episode of evaluation){
    const sc=scenarioForSeed(episode.scenario_seed);
    const candidate=choose(byContext.get(context(sc))||[])||globalChoice;
    const trained=verifyShield(sc.seed,candidate.guards);
    const hand=verifyShield(sc.seed,SAFE_HAND_BASELINE);
    const original=verifyShield(sc.seed,sc.initial_guards);
    const bestCost=independentBestCost(sc.seed);
    if(!Number.isFinite(bestCost))throw Error("No safe bounded repair for evaluation scenario.");
    heldout.push({seed:sc.seed,context:context(sc),split:"evaluation",
      learned:{guards:candidate.guards,passed:trained.passed,cost:trained.guard_cost,
        regret:trained.passed?trained.guard_cost-bestCost:null},
      hand_baseline:{guards:SAFE_HAND_BASELINE,passed:hand.passed,cost:hand.guard_cost,
        regret:hand.passed?hand.guard_cost-bestCost:null},
      original:{guards:sc.initial_guards,passed:original.passed,cost:original.guard_cost,regret:null},
      oracle_minimum_cost:bestCost});
  }
  const summarize=key=>metrics(heldout.map(x=>x[key]));
  return {ready:true,format:"pcs-safety-forge-policy-benchmark-v1",
    source:"self-declared adult consented synthetic gameplay; trained policy is a frequency-ranked candidate selector",
    method:"Context-conditioned ranking of server-verified human repair proposals, held-out seed evaluation",
    not_claimed:["reinforcement learning training","real AI alignment","Lean kernel proof search","novel scientific generalization"],
    train_sessions:train.length,evaluation_sessions:evaluation.length,
    trained_repair_examples:global.length,
    learned:summarize("learned"),hand_baseline:summarize("hand_baseline"),
    original:summarize("original"),examples:heldout};
}
const main=process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1];
if(main){
  const [source,dest]=process.argv.slice(2);
  if(!source||!dest){
    console.error("Usage: node scripts/benchmark_safety_forge.mjs PREPARED_DATA.json BENCHMARK_REPORT.json");
    process.exitCode=2;
  }else{
    try{
      const report=benchmarkSafetyForgePolicy(JSON.parse(readFileSync(source,"utf8")));
      writeFileSync(dest,JSON.stringify(report,null,2)+"\n",{flag:"wx",mode:0o600});
      console.log(report.ready?"Held-out synthetic benchmark complete.":"Not enough opt-in data to make a learning claim.");
    }catch(e){console.error("Benchmark rejected:",e.message);process.exitCode=1;}
  }
}
