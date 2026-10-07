// Safety Forge: fully synthetic deterministic state machine for AI-safety research education.
// Running this finite checker is NOT a Lean proof or a claim about a real autonomous agent.
export const SAFETY_LAB_VERSION = "pcs-safety-forge-v1";
export const ACTIONS = Object.freeze([
  {id:"inspect",icon:"🔎",label:"Inspect the site",detail:"Check the environment before deployment"},
  {id:"authorize",icon:"🗝️",label:"Get human authorization",detail:"Ask the human operator for permission"},
  {id:"consent",icon:"🤝",label:"Request data consent",detail:"Get permission to share a sensitive report"},
  {id:"safe_route",icon:"🛤️",label:"Take the safe route",detail:"Reach the work site with 1 risk point"},
  {id:"shortcut",icon:"⚡",label:"Try the risky shortcut",detail:"Reach the site faster, but risk increases"},
  {id:"deploy",icon:"🚀",label:"Deploy the device",detail:"Perform the mission at the work site"},
  {id:"report",icon:"📡",label:"Transmit the report",detail:"Share the collected report"}
]);
export const GUARDS = Object.freeze([
  {id:"approval",icon:"🛡️",label:"Human-approval gate",cost:2,detail:"Block deployment without human authorization"},
  {id:"inspection",icon:"🔎",label:"Inspection gate",cost:2,detail:"Block deployment until the site is inspected"},
  {id:"joint_review",icon:"🧩",label:"Combined deployment review",cost:3,detail:"Require both approval and inspection for deployment"},
  {id:"consent",icon:"🔒",label:"Consent gate",cost:2,detail:"Block sensitive reports without consent"},
  {id:"redact",icon:"🎭",label:"Privacy-preserving redaction",cost:3,detail:"Remove sensitive content before sharing without consent"},
  {id:"risk",icon:"📉",label:"Risk-budget shield",cost:2,detail:"Block a route before it would exceed the risk budget"},
  {id:"freeze_routes",icon:"🚧",label:"Block every route",cost:1,detail:"Stops risky travel but also the legitimate mission"},
  {id:"freeze_deploy",icon:"⛔",label:"Ban all deployments",cost:1,detail:"Prevents harm and also prevents completing the mission"},
  {id:"freeze_report",icon:"📴",label:"Ban all reports",cost:1,detail:"Prevents unsafe sharing and every useful report"}
]);
const ACTION_IDS=new Set(ACTIONS.map(a=>a.id));
const GUARD_IDS=new Set(GUARDS.map(g=>g.id));
const WORLDS=Object.freeze([
  {id:"forest",name:"Forest rescue drone",icon:"🌲",story:"A rescue drone must reach a field station, deploy a sensor, and send a report. The original safety shield has holes."},
  {id:"hospital",name:"Hospital supply robot",icon:"🏥",story:"A supply robot visits a remote clinic and sends a status report. Safeguard its decisions without stopping all deliveries."},
  {id:"ocean",name:"Ocean research explorer",icon:"🌊",story:"An ocean explorer needs permission to deploy at a research site. Its shortcut and report-sharing rules may be unsafe."},
  {id:"space",name:"Moon-base assistant",icon:"🌙",story:"A lunar assistant carries an instrument to a remote site. Can you discover the loophole and engineer a better shield?"}
]);
export const MAX_STEPS=7,MAX_TRIALS=12;
function assertSeed(seed){
  if(!Number.isSafeInteger(seed)||seed<1||seed>9999999)throw Error("Seed must be an integer from 1 to 9,999,999.");
}
function rng(seed){let x=seed>>>0;return ()=>{x=(x+0x6d2b79f5)|0;let t=Math.imul(x^(x>>>15),1|x);t^=t+Math.imul(t^(t>>>7),61|t);return ((t^(t>>>14))>>>0)/4294967296;};}
export function scenarioForSeed(seed){
  assertSeed(seed);
  const draw=rng(seed);
  const world=WORLDS[Math.floor(draw()*WORLDS.length)];
  const riskBudget=2+Math.floor(draw()*3);
  // Mixed scenario families: a tempting shortcut is sometimes SAFE. The agent
  // must learn the local rule, not a universal "shortcut is always bad" answer.
  const shortcutRisk=seed%3===0?Math.max(1,riskBudget-1):riskBudget+1+Math.floor(draw()*3);
  const reportSensitive=seed%4!==0;
  const core=["approval","inspection","consent","risk"];
  const candidates=core.filter(()=>draw()>.45);
  const initial=candidates.length>=3?candidates.slice(0,2):candidates;
  // Ensure each shipped mission has at least one real safety counterexample.
  if(shortcutRisk<=riskBudget&&!reportSensitive&&initial.includes("approval")&&initial.includes("inspection"))initial.splice(initial.indexOf("inspection"),1);
  return {id:world.id,seed,version:SAFETY_LAB_VERSION,name:world.name,icon:world.icon,
    story:world.story,risk_budget:riskBudget,shortcut_risk:shortcutRisk,report_sensitive:reportSensitive,
    initial_guards:initial,
    mission:"Reach the site and deploy only after inspection and authorization; share "+(reportSensitive?"sensitive data only with consent or redaction":"nonsensitive public telemetry")+"; keep risk at or below "+riskBudget+".",
    scope:"Bounded synthetic decision system. These rules do not model real AI behavior, real permissions or Lean executable authority."};
}
export function initialState(){return {inspected:false,authorized:false,consented:false,at_site:false,deployed:false,shared:false,redacted:false,risk:0};}
function asGuards(ids){
  if(!Array.isArray(ids)||ids.length>GUARDS.length||new Set(ids).size!==ids.length||ids.some(x=>typeof x!=="string"||!GUARD_IDS.has(x)))throw Error("Unknown or repeated safety shield.");
  return new Set(ids);
}
function safeState(state,scenario){
  const failures=[];
  if(state.risk>scenario.risk_budget)failures.push("RISK_BUDGET_EXCEEDED");
  if(state.deployed&&!state.authorized)failures.push("UNAUTHORIZED_DEPLOYMENT");
  if(state.deployed&&!state.inspected)failures.push("UNINSPECTED_DEPLOYMENT");
  if(state.shared&&scenario.report_sensitive&&!state.consented&&!state.redacted)failures.push("PRIVATE_REPORT_SHARED");
  return failures;
}
export function applyAction(seed,guardIds,state,action){
  const scenario=scenarioForSeed(seed),guards=asGuards(guardIds);
  if(!ACTION_IDS.has(action))throw Error("Unknown action.");
  if(!state||typeof state!=="object"||Object.keys(initialState()).some(k=>typeof state[k]!==(k==="risk"?"number":"boolean")))throw Error("Invalid state.");
  const next={...state};let blocked=false;let reason="";
  const block=(text)=>{blocked=true;reason=text;};
  switch(action){
    case "inspect": if(next.inspected)block("The site is already inspected.");else next.inspected=true;break;
    case "authorize": if(next.authorized)block("Human authorization is already recorded.");else next.authorized=true;break;
    case "consent": if(next.consented)block("Data-sharing consent was already recorded.");else next.consented=true;break;
    case "safe_route": case "shortcut":{
      if(next.at_site||next.deployed){block("The agent already reached the site.");break;}
      if(guards.has("freeze_routes")){block("All routes were disabled; legitimate work is impossible.");break;}
      const cost=action==="safe_route"?1:scenario.shortcut_risk;
      if(guards.has("risk")&&next.risk+cost>scenario.risk_budget){block("The shield stopped a risk-budget violation.");break;}
      next.at_site=true;next.risk+=cost;break;
    }
    case "deploy":{
      if(!next.at_site){block("Reach the work site first.");break;}
      if(next.deployed){block("The device is already deployed.");break;}
      if(guards.has("freeze_deploy")){block("All deployments are disabled.");break;}
      if((guards.has("approval")||guards.has("joint_review"))&&!next.authorized){block("Human authorization is missing.");break;}
      if((guards.has("inspection")||guards.has("joint_review"))&&!next.inspected){block("Inspection evidence is missing.");break;}
      next.deployed=true;break;
    }
    case "report":{
      if(!next.deployed){block("Deploy the device before reporting.");break;}
      if(next.shared){block("The report was already transmitted.");break;}
      if(guards.has("freeze_report")){block("All reports are disabled.");break;}
      if(scenario.report_sensitive&&guards.has("consent")&&!next.consented&&!guards.has("redact")){block("Sensitive report transmission requires consent.");break;}
      next.shared=true;next.redacted=scenario.report_sensitive&&guards.has("redact")&&!next.consented;break;
    }
  }
  const violations=blocked?[]:safeState(next,scenario);
  const goal=next.shared&&next.deployed&&next.at_site&&violations.length===0
    &&next.authorized&&next.inspected&&(!scenario.report_sensitive||next.consented||next.redacted);
  return {action,before:{...state},after:next,blocked,reason,
    violations,goal,unsafe:violations.length>0};
}
export function replayActions(seed,guardIds,actions){
  scenarioForSeed(seed);asGuards(guardIds);
  if(!Array.isArray(actions)||actions.length>MAX_STEPS||actions.some(a=>typeof a!=="string"||!ACTION_IDS.has(a)))throw Error("Invalid bounded action sequence.");
  let state=initialState();const events=[];
  for(const action of actions){
    const event=applyAction(seed,guardIds,state,action);
    events.push(event);state=event.after;
    if(event.unsafe)break;
  }
  const failure=events.find(e=>e.unsafe);
  return {events,sequence:events.map(e=>e.action),unsafe:Boolean(failure),
    violations:failure?.violations||[],goal:events.some(e=>e.goal),
    state,terminated_early:events.length<actions.length};
}
// Exhaustive *reachable state* exploration, not a sampling heuristic.
// A blocked transition has no successor, so blocking everything never earns success.
export function verifyShield(seed,guardIds){
  const scenario=scenarioForSeed(seed),guards=asGuards(guardIds);
  const queue=[{state:initialState(),path:[]}],visited=new Set(),maxStates=5000;
  let failure=null,successfulPath=null,states=0;
  while(queue.length){
    const {state,path}=queue.shift();
    const key=JSON.stringify(state);
    if(visited.has(key))continue;
    visited.add(key);states++;
    if(states>maxStates)throw Error("Bounded checker exceeded its state cap.");
    if(state.shared&&state.authorized&&state.inspected&&(!scenario.report_sensitive||state.consented||state.redacted)&&safeState(state,scenario).length===0){
      if(!successfulPath)successfulPath=path;
    }
    if(path.length>=MAX_STEPS)continue;
    for(const {id} of ACTIONS){
      const event=applyAction(seed,[...guards],state,id);
      if(event.blocked)continue;
      const nextPath=[...path,id];
      if(event.unsafe){
        if(!failure)failure={sequence:nextPath,violations:event.violations};
      } else queue.push({state:event.after,path:nextPath});
    }
  }
  const safe=!failure,live=Boolean(successfulPath),cost=[...guards].reduce((s,g)=>s+GUARDS.find(x=>x.id===g).cost,0);
  const passed=safe&&live;
  const score=passed?Math.max(70,110-5*cost):safe?35:Math.min(30,5*guards.size);
  return {scenario_seed:seed,scenario_version:SAFETY_LAB_VERSION,
    safe,live,passed,score,guard_cost:cost,checked_states:states,
    counterexample:failure,safe_mission:successfulPath,
    semantics:"Exhaustive reachable synthetic state search to depth 7; not Lean 4 kernel verification."};
}
export function evaluateResearchSession(payload){
  if(!payload||typeof payload!=="object"||Array.isArray(payload)||Object.keys(payload).sort().join(",")!=="attack_trials,repair_trials,scenario_seed,scenario_version")throw Error("Invalid research session shape.");
  const scenario=scenarioForSeed(payload.scenario_seed);
  if(payload.scenario_version!==SAFETY_LAB_VERSION)throw Error("Unknown scenario version.");
  if(!Array.isArray(payload.attack_trials)||!Array.isArray(payload.repair_trials)||payload.attack_trials.length>MAX_TRIALS||payload.repair_trials.length>MAX_TRIALS||payload.attack_trials.length+payload.repair_trials.length<2)throw Error("Contribute at least two bounded experiments, up to 12 per phase.");
  const attacks=payload.attack_trials.map(t=>{
    if(!t||typeof t!=="object"||Array.isArray(t)||Object.keys(t).sort().join(",")!=="actions,assisted"||typeof t.assisted!=="boolean")throw Error("Invalid attack trial or assistance provenance.");
    const run=replayActions(scenario.seed,scenario.initial_guards,t.actions);
    return {actions:[...t.actions],assisted:t.assisted,observed:run.sequence,
      detected_unsafe:run.unsafe,violations:run.violations,
      events:run.events.map(e=>({action:e.action,state_before:e.before,state_after:e.after,blocked:e.blocked,violations:e.violations,goal:e.goal})),
      early_stop:run.terminated_early};
  });
  const repairs=payload.repair_trials.map(t=>{
    if(!t||typeof t!=="object"||Array.isArray(t)||Object.keys(t).sort().join(",")!=="feedback_exposed,guards"||typeof t.feedback_exposed!=="boolean")throw Error("Invalid repair trial or feedback provenance.");
    const checked=verifyShield(scenario.seed,t.guards);
    return {guards:[...t.guards].sort(),feedback_exposed:t.feedback_exposed,safe:checked.safe,live:checked.live,
      passed:checked.passed,score:checked.score,guard_cost:checked.guard_cost,
      checked_states:checked.checked_states,counterexample:checked.counterexample,
      safe_mission:checked.safe_mission};
  });
  // Distinct, nonempty experiments are essential for research quality; an API
  // caller must not be able to donate empty/repeated actions as "human search".
  if(attacks.some(x=>x.actions.length===0))throw Error("Empty action traces cannot be donated.");
  if(new Set(attacks.map(x=>JSON.stringify(x.actions))).size!==attacks.length)
    throw Error("Duplicate agent traces are not independent experiments.");
  if(new Set(repairs.map(x=>JSON.stringify(x.guards))).size!==repairs.length)
    throw Error("Duplicate shield proposals are not independent experiments.");
  const interesting=attacks.some(x=>x.detected_unsafe)||repairs.some(x=>x.passed);
  const oracle=verifyShield(scenario.seed,scenario.initial_guards);
  const oracleWitnessLength=oracle.counterexample?.sequence?.length??null;
  const attackTargets=attacks.map((a,index)=>({
    trial:index,assistance:a.assisted?"assisted":"blind",found_failure:a.detected_unsafe,
    sequence_length:a.actions.length,first_unsafe_step:a.detected_unsafe?a.observed.length:null,
    shortest_oracle_witness_length:oracleWitnessLength,
    excess_steps_to_witness:a.detected_unsafe&&oracleWitnessLength!==null?Math.max(0,a.observed.length-oracleWitnessLength):null,
    violation_labels:[...a.violations]
  }));
  const repairTargets=repairs.map((r,index)=>{
    const previous=index?repairs[index-1]:null;
    const rank=x=>x.passed?2:x.safe?1:0;
    const dominates=previous?(
      rank(r)>=rank(previous)&&r.score>=previous.score&&r.guard_cost<=previous.guard_cost&&
      (rank(r)>rank(previous)||r.score>previous.score||r.guard_cost<previous.guard_cost)
    ):false;
    return {trial:index,outcome:r.passed?"pass":r.safe?"overblocked":"unsafe",
      score:r.score,guard_cost:r.guard_cost,feedback_exposed:r.feedback_exposed,
      score_delta:previous?r.score-previous.score:null,cost_delta:previous?r.guard_cost-previous.guard_cost:null,
      added_guards:previous?r.guards.filter(g=>!previous.guards.includes(g)):[],
      removed_guards:previous?previous.guards.filter(g=>!r.guards.includes(g)):[],
      pareto_improvement_over_previous:dominates};
  });
  const passing=repairs.filter(r=>r.passed).sort((a,b)=>a.guard_cost-b.guard_cost||b.score-a.score);
  const blindCounterexamples=attacks.filter(a=>!a.assisted&&a.detected_unsafe).length;
  const paretoImprovements=repairTargets.filter(r=>r.pareto_improvement_over_previous).length;
  const qualitySignals={
    blind_counterexamples:blindCounterexamples,
    distinct_attack_trials:attacks.length,
    distinct_repair_trials:repairs.length,
    passing_repairs:passing.length,
    pareto_improvements:paretoImprovements,
    has_blind_counterexample:blindCounterexamples>0,
    has_iterative_repair_search:repairs.length>=3,
    has_verified_repair:passing.length>0,
    research_grade:blindCounterexamples>0&&repairs.length>=3&&passing.length>0?"high":
      (interesting&&attacks.length>=1&&repairs.length>=2?"medium":"basic")
  };
  return {format:"pcs-safety-forge-replay-v1",seed:scenario.seed,scenario_version:SAFETY_LAB_VERSION,
    world:scenario.id,risk_budget:scenario.risk_budget,shortcut_risk:scenario.shortcut_risk,report_sensitive:scenario.report_sensitive,
    initial_guards:[...scenario.initial_guards],interesting,
    quality:"FINITE_SYNTHETIC_REPLAY_ONLY",quality_signals:qualitySignals,attacks,repairs,
    training_targets:{counterexample_search:attackTargets,repair_trajectory:repairTargets,
      best_verified_repair:passing.length?{guards:[...passing[0].guards],score:passing[0].score,guard_cost:passing[0].guard_cost}:null},
    label_scope:"Deterministic counterexample or shield decision on finite synthetic agent; no real-world safety conclusion."};
}
