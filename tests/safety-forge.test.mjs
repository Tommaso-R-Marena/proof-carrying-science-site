import test from "node:test";
import assert from "node:assert/strict";
import {
  SAFETY_LAB_VERSION,ACTIONS,GUARDS,MAX_STEPS,MAX_TRIALS,
  scenarioForSeed,initialState,applyAction,replayActions,verifyShield,evaluateResearchSession
} from "../public/safety-forge-core.mjs";

const repaired=["joint_review","redact","risk"];
const session=(seed=197)=>({
  scenario_seed:seed,scenario_version:SAFETY_LAB_VERSION,
  attack_trials:[{actions:["shortcut"]},{actions:["safe_route","deploy"]}],
  repair_trials:[{guards:[]},{guards:repaired}]
});

test("seeds generate reproducible, varied missions with strong bounds",()=>{
  assert.deepEqual(scenarioForSeed(111),scenarioForSeed(111));
  const worlds=new Set(Array.from({length:60},(_,i)=>scenarioForSeed(i+1).id));
  assert.equal(worlds.size,4);
  const scenarios=Array.from({length:50},(_,i)=>scenarioForSeed(i+100));
  assert.ok(scenarios.some(s=>s.shortcut_risk>s.risk_budget));
  assert.ok(scenarios.some(s=>s.shortcut_risk<=s.risk_budget));
  assert.ok(scenarios.some(s=>s.report_sensitive));
  assert.ok(scenarios.some(s=>!s.report_sensitive));
  assert.ok(scenarios.every(s=>s.initial_guards.length<4));
  for(const bad of [0,-1,1.5,10000000,Infinity,"3",null])
    assert.throws(()=>scenarioForSeed(bad),/Seed must/);
});
test("unsafe shortcut is a checked budget counterexample",()=>{
  const r=replayActions(197,[],["shortcut"]);
  assert.equal(r.unsafe,true);
  assert.deepEqual(r.violations,["RISK_BUDGET_EXCEEDED"]);
  assert.ok(r.events[0].after.risk>scenarioForSeed(197).risk_budget);
});
test("deploying without human authorization or inspection fails after reaching site",()=>{
  const r=replayActions(197,[],["safe_route","deploy"]);
  assert.equal(r.unsafe,true);
  assert.ok(r.violations.includes("UNAUTHORIZED_DEPLOYMENT"));
  assert.ok(r.violations.includes("UNINSPECTED_DEPLOYMENT"));
});
test("report without consent fails; independent redaction makes report safe",()=>{
  const trace=["safe_route","inspect","authorize","deploy","report"];
  assert.deepEqual(replayActions(197,[],trace).violations,["PRIVATE_REPORT_SHARED"]);
  const redacted=replayActions(197,["redact","joint_review","risk"],trace);
  assert.equal(redacted.unsafe,false);
  assert.equal(redacted.goal,true);
  assert.equal(redacted.state.redacted,true);
});
test("complete mission with permission, inspection and consent remains available",()=>{
  const r=replayActions(197,["approval","inspection","consent","risk"],[
    "inspect","authorize","consent","safe_route","deploy","report"
  ]);
  assert.equal(r.unsafe,false);assert.equal(r.goal,true);
  assert.equal(r.state.risk,1);
});
test("shield blocks dangerous action before it can count as safe evidence",()=>{
  const p=applyAction(197,["risk"],initialState(),"shortcut");
  assert.equal(p.blocked,true);assert.equal(p.unsafe,false);
  assert.equal(p.after.at_site,false);
  const d=replayActions(197,["joint_review"],["safe_route","deploy"]);
  assert.equal(d.events.at(-1).blocked,true);
  assert.equal(d.events.at(-1).unsafe,false);
});
test("exhaustive checker rejects incomplete guard and returns exact counterexample",()=>{
  for(const guards of [[],["approval"],["inspection"],["consent"],["risk"],["joint_review"]]){
    const report=verifyShield(197,guards);
    assert.equal(report.passed,false,guards.join(","));
    assert.equal(report.safe,false,guards.join(","));
    assert.ok(report.counterexample?.sequence.length>=1);
    const r=replayActions(197,guards,report.counterexample.sequence);
    assert.equal(r.unsafe,true);
    assert.deepEqual(r.violations,report.counterexample.violations);
  }
});
test("at least two different good repair systems pass the finite search",()=>{
  for(const guards of [repaired,["approval","inspection","consent","risk"],["joint_review","consent","risk"]]){
    const report=verifyShield(197,guards);
    assert.equal(report.safe,true,guards.join(","));
    assert.equal(report.live,true,guards.join(","));
    assert.equal(report.passed,true);
    assert.ok(report.safe_mission?.length>=5);
    assert.equal(replayActions(197,guards,report.safe_mission).goal,true);
  }
});
test("blocking all actions cannot win by hiding counterexamples",()=>{
  const report=verifyShield(197,["freeze_routes","freeze_deploy","freeze_report","risk","joint_review","consent"]);
  assert.equal(report.safe,true);
  assert.equal(report.live,false);
  assert.equal(report.passed,false);
  assert.ok(report.score<70);
});
test("different seeds produce rechecked policies with explicit bounded scope",()=>{
  for(let seed=1;seed<=25;seed++){
    const fixed=verifyShield(seed,repaired);
    assert.equal(fixed.safe,true,"seed="+seed);
    assert.equal(fixed.live,true,"seed="+seed);
    assert.ok(fixed.checked_states>1);
    const base=verifyShield(seed,scenarioForSeed(seed).initial_guards);
    assert.equal(base.safe,false,"insecure baseline seed="+seed);
  }
});
test("replay stops at the first unsafe event, never relabels a later approval as safety",()=>{
  const r=replayActions(197,[],["shortcut","inspect","authorize"]);
  assert.equal(r.terminated_early,true);
  assert.deepEqual(r.sequence,["shortcut"]);
  assert.equal(r.state.authorized,false);
});
test("rejects unknown action, shield, duplicates and oversized traces",()=>{
  for(const guards of [["unregistered"],["approval","approval"]])
    assert.throws(()=>replayActions(197,guards,["inspect"]),/safety shield/);
  assert.throws(()=>replayActions(197,[],["inject-shell"]),/Invalid bounded/);
  assert.throws(()=>replayActions(197,[],Array(8).fill("inspect")) ,/Invalid bounded/);
  assert.throws(()=>applyAction(197,[],initialState(),"unregistered"),/Unknown action/);
});
test("research replay recomputes independent state/action labels and returns no authority",()=>{
  const replay=evaluateResearchSession(session());
  assert.equal(replay.attacks.length,2);assert.equal(replay.repairs.length,2);
  assert.equal(replay.attacks[0].detected_unsafe,true);
  assert.equal(replay.attacks[1].detected_unsafe,true);
  assert.equal(replay.repairs[1].passed,true);
  assert.equal(replay.quality,"FINITE_SYNTHETIC_REPLAY_ONLY");
  assert.ok(replay.attacks[1].events[1].state_after.deployed);
  assert.equal(replay.format,"pcs-safety-forge-replay-v1");
  assert.doesNotMatch(JSON.stringify(replay),/Lean_kernel_passed|PCS_ACCEPT/);
});
test("rejects client-provided fake model rewards or altered verifier claims",()=>{
  const payload=session();payload.pcs_accepted=true;
  assert.throws(()=>evaluateResearchSession(payload),/Invalid research session shape/);
  const other=session();other.repair_trials[0].score=100;
  assert.throws(()=>evaluateResearchSession(other),/Invalid repair trial/);
  const bad=session();bad.attack_trials[0].fake_verdict="ACCEPT";
  assert.throws(()=>evaluateResearchSession(bad),/Invalid attack trial/);
});
test("wrong versions, empty or excessive experiments fail closed",()=>{
  const changed=session();changed.scenario_version="future";
  assert.throws(()=>evaluateResearchSession(changed),/Unknown scenario version/);
  const short=session();short.attack_trials=[];short.repair_trials=[];
  assert.throws(()=>evaluateResearchSession(short),/at least two/);
  const huge=session();huge.attack_trials=Array(MAX_TRIALS+1).fill({actions:["shortcut"]});
  assert.throws(()=>evaluateResearchSession(huge),/at least two/);
});
test("client cannot fabricate scenario parameters, risk budget or signature",()=>{
  const bad=session();bad.risk_budget=999999;
  assert.throws(()=>evaluateResearchSession(bad),/Invalid research session shape/);
  const wrong=session();wrong.scenario_seed={role:"admin"};
  assert.throws(()=>evaluateResearchSession(wrong),/Seed must/);
});

test("a shortcut and a public report can be safe in another scenario",()=>{
  const seed=12,scenario=scenarioForSeed(seed);
  assert.equal(scenario.report_sensitive,false);
  assert.ok(scenario.shortcut_risk<=scenario.risk_budget);
  const quick=replayActions(seed,[],["shortcut"]);
  assert.equal(quick.unsafe,false);
  const publicReport=replayActions(seed,["joint_review","risk"],[
    "inspect","authorize","shortcut","deploy","report"
  ]);
  assert.equal(publicReport.unsafe,false);
  assert.equal(publicReport.goal,true);
  assert.equal(publicReport.state.consented,false);
});
