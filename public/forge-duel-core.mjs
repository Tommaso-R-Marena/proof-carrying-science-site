// Forge Duel: human pre-reveal policy ranking with independently reproducible
// finite-state labels. This is NOT Lean proof search, alignment, or an authenticity
// guarantee: the browser source exposes the deterministic checker by design.
import {GUARDS,SAFETY_LAB_VERSION,scenarioForSeed,verifyShield} from "./safety-forge-core.mjs";
export const DUEL_VERSION="pcs-forge-duel-v1";
export const DUEL_ROUNDS=8;
export const DUEL_CHOICES=Object.freeze(["A","B","neither"]);
export const DUEL_REASONS=Object.freeze([
  {id:"authorization",label:"Human authorization"},
  {id:"inspection",label:"Inspections matter"},
  {id:"privacy",label:"Privacy and consent"},
  {id:"risk",label:"Risk budget"},
  {id:"mission",label:"Keep the mission possible"},
  {id:"cost",label:"Use the fewest safeguards"},
  {id:"uncertain",label:"I am not sure"}
]);
// Curated policy archetypes are independently checked in every round, but no
// full-pool search executes on the 10ms Workers Free request CPU allowance.
const VALID=Object.freeze([
  ["joint_review","redact","risk"],
  ["approval","inspection","consent","risk"],
  ["approval","inspection","redact","risk"],
  ["joint_review","consent","risk"],
  ["joint_review","redact","consent","risk"],
  ["approval","inspection","consent","risk","redact"]
]);
const UNSAFE=Object.freeze([
  [],["inspection","redact","risk"],["approval","redact","risk"],["consent","risk"]
]);
const OVERBLOCK=Object.freeze([
  ["joint_review","redact","risk","freeze_routes"],
  ["joint_review","redact","risk","freeze_deploy"],
  ["joint_review","redact","risk","freeze_report"]
]);
function randomFor(seed,round){
  let s=(Math.imul(seed,2654435761) ^ Math.imul(round+1,2246822519))>>>0;
  return ()=>{s^=s<<13;s^=s>>>17;s^=s<<5;return(s>>>0)/4294967296;};
}
function assertInputs(seed,round){
  if(!Number.isSafeInteger(seed)||seed<1||seed>9999999)throw Error("Invalid mission seed.");
  if(!Number.isSafeInteger(round)||round<0||round>=DUEL_ROUNDS)throw Error("Invalid duel round.");
}
export function duelCaseType(seed,round){
  assertInputs(seed,round);
  const draw=randomFor(seed,0x31415926);
  const schedule=[0,0,1,1,2,2,3,3];
  for(let i=schedule.length-1;i>0;i--){
    const j=Math.floor(draw()*(i+1));
    [schedule[i],schedule[j]]=[schedule[j],schedule[i]];
  }
  return schedule[round];
}
function policyResult(seed,ids){return {guards:[...ids],result:verifyShield(seed,ids)};}
function compare(a,b){
  if(a.result.passed!==b.result.passed)return a.result.passed?"A":"B";
  if(a.result.passed&&b.result.passed){
    if(a.result.guard_cost!==b.result.guard_cost)return a.result.guard_cost<b.result.guard_cost?"A":"B";
    return "tie";
  }
  return "neither"; // Both are invalid; never train a false-positive as a winner.
}
export function duelFor(seed,round){
  assertInputs(seed,round);
  const draw=randomFor(seed,round),scenario=scenarioForSeed(seed);
  const pick=arr=>arr[Math.floor(draw()*arr.length)];
  const type=duelCaseType(seed,round);
  let left,right;
  if(type===0){left=pick(VALID);right=pick(UNSAFE);}
  else if(type===1){left=pick(VALID);right=pick(OVERBLOCK);}
  else if(type===2){
    left=pick(VALID);
    const cost=x=>x.reduce((sum,id)=>sum+GUARDS.find(g=>g.id===id).cost,0);
    right=pick(VALID.filter(p=>cost(p)!==cost(left)));
  }else{
    left=pick(UNSAFE);
    right=pick(UNSAFE.filter(p=>p!==left));
  }
  if(!left||!right||left===right)throw Error("Empty or repeated policy duel.");
  const flip=draw()>.5;
  const [A,B]=flip?[policyResult(seed,right),policyResult(seed,left)]:[policyResult(seed,left),policyResult(seed,right)];
  const winner=compare(A,B)==="tie"?"either":compare(A,B);
  return {id:"duel-"+seed+"-"+round,version:DUEL_VERSION,scenario_seed:seed,round,
    scenario:{id:scenario.id,name:scenario.name,icon:scenario.icon,mission:scenario.mission,
      risk_budget:scenario.risk_budget,shortcut_risk:scenario.shortcut_risk,report_sensitive:scenario.report_sensitive},
    A:{guards:A.guards,cost:A.result.guard_cost},
    B:{guards:B.guards,cost:B.result.guard_cost},
    oracle:{winner,A:A.result,B:B.result},
    challenge_type:type,category:scenario.name+" · Shield engineering decision"};
}
export function evaluateDuelVote(input){
  if(!input||typeof input!=="object"||Array.isArray(input)||
    Object.keys(input).sort().join(",")!=="choice,confidence,reason,round,seed,version")
    throw Error("Invalid duel ballot shape.");
  const {seed,round,version,choice,reason,confidence}=input;
  if(version!==DUEL_VERSION||!DUEL_CHOICES.includes(choice)||
     !DUEL_REASONS.some(r=>r.id===reason)||!Number.isInteger(confidence)||confidence<1||confidence>3)
    throw Error("Invalid duel ballot values.");
  const duel=duelFor(seed,round),winner=duel.oracle.winner;
  const correct=winner==="either"?(choice==="A"||choice==="B"):choice===winner;
  return {seed,round,version,scenario_family:duel.scenario.id,category:duel.category,
    policy_A:duel.A.guards,policy_B:duel.B.guards,choice,reason,confidence,
    correct,oracle_winner:winner,challenge_type:duel.challenge_type,
    oracle:{A:{safe:duel.oracle.A.safe,live:duel.oracle.A.live,passed:duel.oracle.A.passed,
       score:duel.oracle.A.score,cost:duel.oracle.A.guard_cost,checked_states:duel.oracle.A.checked_states,
       violations:duel.oracle.A.counterexample?.violations||[]},
      B:{safe:duel.oracle.B.safe,live:duel.oracle.B.live,passed:duel.oracle.B.passed,
       score:duel.oracle.B.score,cost:duel.oracle.B.guard_cost,checked_states:duel.oracle.B.checked_states,
       violations:duel.oracle.B.counterexample?.violations||[]}},
    provenance:"User-reported blind choice; authenticity, age and pre-reveal timing cannot be established from client JSON."};
}
export function evaluateDuelSession(input){
  if(!input||typeof input!=="object"||Array.isArray(input)||
     Object.keys(input).sort().join(",")!=="ballots,session_version")
    throw Error("Invalid duel submission.");
  if(input.session_version!==DUEL_VERSION||!Array.isArray(input.ballots)||
     input.ballots.length<2||input.ballots.length>3)throw Error("Contribute 2 to 3 unique duels per bounded batch.");
  const seen=new Set(),labels=input.ballots.map(b=>{
    const out=evaluateDuelVote(b),key=out.seed+"/"+out.round;
    if(seen.has(key))throw Error("Duplicate duel rounds are not valid training evidence.");
    seen.add(key);return out;
  });
  return {version:DUEL_VERSION,ballots:labels,correct:labels.filter(b=>b.correct).length,
    uncertain:labels.filter(b=>b.reason==="uncertain").length,
    limitations:["Synthetic oracle; ground truth is the finite-state simulator, not human preference.",
      "Client-reported choices cannot prove the timing of choice relative to reveal.",
      "Filter by scenario family; do not mix duplicate rounds across train and evaluation.",
      "No Lean tactic, real agent observation or external safety guarantee is provided."]};
}
