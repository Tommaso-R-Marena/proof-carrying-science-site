// Deliberately small, CPU-only *baseline*, not an alignment model.
// Learns guarded-policy ranking from independently verified toy labels;
// held-out SPACE scenario family is NEVER used for gradient updates.
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {GUARDS,scenarioForSeed} from "../public/safety-forge-core.mjs";
import {LEARNING_FORMAT} from "./prepare_forge_duel_dataset.mjs";
import {DUEL_VERSION,evaluateDuelVote} from "../public/forge-duel-core.mjs";
export const RANKER_FORMAT="pcs-forge-duel-linear-ranker-baseline-v1";
const CLASSES=["A","B","neither"];
const guardIds=GUARDS.map(g=>g.id);
const cost=new Map(GUARDS.map(g=>[g.id,g.cost]));
function guardFeatures(ids,world){
  const selected=new Set(ids);
  return [...guardIds.map(id=>selected.has(id)?1:0),
    (selected.has("approval")||selected.has("joint_review"))?1:0,
    (selected.has("inspection")||selected.has("joint_review"))?1:0,
    (selected.has("consent")||selected.has("redact")||!world.report_sensitive)?1:0,
    selected.has("risk")?1:0,
    ["freeze_routes","freeze_deploy","freeze_report"].some(id=>selected.has(id))?1:0,
    ids.reduce((n,id)=>n+cost.get(id),0)/15
  ];
}
export function featuresFor(row){
  const scenario=scenarioForSeed(row.seed),a=guardFeatures(row.policy_A,scenario),
    b=guardFeatures(row.policy_B,scenario);
  const features=[1,...a,...b,...a.map((v,i)=>v-b[i]),
    scenario.risk_budget/4,scenario.shortcut_risk/8,scenario.report_sensitive?1:0];
  if(features.some(x=>!Number.isFinite(x)))throw Error("Nonfinite policy input features.");
  return features;
}
function logits(weights,x){
  return weights.map(w=>w.reduce((sum,p,i)=>sum+p*x[i],0));
}
function softmax(v){
  const peak=Math.max(...v),exps=v.map(z=>Math.exp(z-peak)),sum=exps.reduce((a,b)=>a+b,0);
  return exps.map(n=>n/sum);
}
function predict(weights,x){
  const scores=softmax(logits(weights,x)),index=scores.indexOf(Math.max(...scores));
  return {choice:CLASSES[index],confidence:scores[index]};
}
function accuracy(weights,data){
  if(!data.length)return null;
  const score=data.filter(r=>predict(weights,featuresFor(r)).choice===r.oracle_winner).length;
  return score/data.length;
}
export function fitBaseline(document,{epochs=60,rate=0.035}={}){
  if(!document||document.format!==LEARNING_FORMAT||!Array.isArray(document.rows)||
    document.rows.length===0||document.rows.length>100000)
    throw Error("Provide an independently prepared Forge Duel learning dataset with rows.");
  if(!Number.isInteger(epochs)||epochs<1||epochs>500||!Number.isFinite(rate)||rate<=0||rate>1)
    throw Error("Invalid bounded training hyperparameters.");
  // Trust no caller-supplied split: recompute the holdout family from the
  // independent immutable scenario generator before a gradient update.
  for(const row of document.rows){
    const world=scenarioForSeed(row.seed).id,expected=world==="space"?"evaluation":"training";
    if(row.world!==world||row.split!==expected)
      throw Error("Scenario-family holdout was altered or mislabeled.");
    // Recheck the exact scenario and BOTH policy outcomes at the final fit
    // boundary. An arbitrary JSON file must never inject fake oracle labels.
    let truth;
    try {
      truth=evaluateDuelVote({seed:row.seed,round:row.round,version:DUEL_VERSION,
        choice:row.human_choice,reason:row.reason,confidence:row.confidence});
    }catch(error){throw Error("Invalid learning row: "+error.message);}
    const expectedEligibility=expected==="training"&&truth.correct&&
      truth.reason!=="uncertain"&&truth.confidence>=2;
    if(row.group!==row.seed+"/"+row.round||
       JSON.stringify(row.policy_A)!==JSON.stringify(truth.policy_A)||
       JSON.stringify(row.policy_B)!==JSON.stringify(truth.policy_B)||
       JSON.stringify(row.oracle)!==JSON.stringify(truth.oracle)||
       row.oracle_winner!==truth.oracle_winner||
       row.human_agreed_with_oracle!==truth.correct||
       row.eligible_for_synthetic_preference_training!==expectedEligibility)
      throw Error("Learning row disagrees with the independent finite-state oracle.");
  }
  // Duplicate human votes remain meaningful for human-agreement metrics,
  // but must not upweight the same deterministic toy oracle training case.
  const unique=records=>[...new Map(records.map(row=>[row.group,row])).values()];
  const train=unique(document.rows.filter(r=>r.split==="training")),
    evaluation=unique(document.rows.filter(r=>r.split==="evaluation"));
  if(!train.length||!evaluation.length)throw Error("Need separate train and full-world-held-out evaluation rows.");
  const width=featuresFor(train[0]).length;
  const weights=CLASSES.map(()=>Array(width).fill(0));
  // Coordinate-free deterministic SGD baseline, zero packages, zero GPU.
  for(let epoch=0;epoch<epochs;epoch++){
    for(const row of train){
      const x=featuresFor(row),y=CLASSES.indexOf(row.oracle_winner);
      if(y<0)throw Error("Unrecognized verifier target label.");
      const p=softmax(logits(weights,x));
      for(let k=0;k<CLASSES.length;k++){
        const delta=rate*((k===y?1:0)-p[k]);
        for(let j=0;j<width;j++)weights[k][j]+=delta*x[j];
      }
    }
  }
  const originalTrain=document.rows.filter(x=>x.split==="training");
  const originalEval=document.rows.filter(x=>x.split==="evaluation");
  const humanTrain=originalTrain.filter(x=>x.human_agreed_with_oracle).length/originalTrain.length;
  const humanEval=originalEval.filter(x=>x.human_agreed_with_oracle).length/originalEval.length;
  return {format:RANKER_FORMAT,epochs,training_cases:train.length,evaluation_cases:evaluation.length,
    feature_count:width,classes:CLASSES,weights,
    metrics:{model_train_accuracy:accuracy(weights,train),model_heldout_world_accuracy:accuracy(weights,evaluation),
      human_train_oracle_agreement:humanTrain,human_heldout_oracle_agreement:humanEval,
      exact_simulator_baseline_accuracy:1,
      random_choice_three_way_accuracy:1/3},
    note:"The exact finite-state verifier defines these toy labels and wins by construction. No outcome says anything about Lean proof search or deployed AI safety."};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  if(process.argv.length!==4)throw Error("Usage: node scripts/fit_forge_duel_ranker.mjs DEIDENTIFIED_PAIRS.json OUTPUT_MODEL.json");
  const data=JSON.parse(readFileSync(process.argv[2],"utf8"));
  const result=fitBaseline(data);
  writeFileSync(process.argv[3],JSON.stringify(result,null,2)+"\n");
  console.log(JSON.stringify({metrics:result.metrics,evaluation_cases:result.evaluation_cases},null,2));
}
