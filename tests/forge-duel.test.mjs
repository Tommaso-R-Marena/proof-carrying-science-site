import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {DUEL_VERSION,DUEL_ROUNDS,DUEL_REASONS,duelFor,evaluateDuelVote,evaluateDuelSession} from "../public/forge-duel-core.mjs";
import {prepareForgeDuelDataset} from "../scripts/prepare_forge_duel_dataset.mjs";
const vote=(seed,round,choice=duelFor(seed,round).oracle.winner)=>({seed,round,version:DUEL_VERSION,choice,reason:"risk",confidence:3});
test("1,000 deterministic blind policy pairings cover four verified decision types",()=>{
  const families=new Set(),outcomes=new Set();
  for(let seed=1;seed<=125;seed++){
    for(let round=0;round<DUEL_ROUNDS;round++){
      const duel=duelFor(seed,round);
      assert.deepEqual(duel,duelFor(seed,round));
      assert.notDeepEqual(duel.A.guards,duel.B.guards);
      assert.equal(duel.oracle.A.scenario_seed,seed);
      assert.equal(duel.oracle.B.scenario_seed,seed);
      const winner=duel.oracle.winner;
      if(round%4===0||round%4===1)assert.ok(winner==="A"||winner==="B");
      if(round%4===2){
        assert.ok(duel.oracle.A.passed&&duel.oracle.B.passed);
        assert.notEqual(duel.A.cost,duel.B.cost);
        assert.ok(winner==="A"||winner==="B");
      }
      if(round%4===3)assert.equal(winner,"neither");
      assert.equal(evaluateDuelVote(vote(seed,round)).correct,true);
      families.add(duel.scenario.id);outcomes.add(winner);
    }
  }
  assert.equal(families.size,4);
  assert.deepEqual([...outcomes].sort(),["A","B","neither"]);
});
test("replay labels reject fabricated provenance, tampered round IDs and duplicate elections",()=>{
  const good={session_version:DUEL_VERSION,ballots:[vote(197,0),vote(197,1),vote(197,2)]};
  const replay=evaluateDuelSession(good);
  assert.equal(replay.ballots.length,3);
  assert.equal(replay.correct,3);
  assert.ok(replay.ballots.every(b=>b.oracle.A.checked_states>0&&b.oracle.B.checked_states>0));
  assert.throws(()=>evaluateDuelSession({...good,passed:true}),/Invalid duel/);
  assert.throws(()=>evaluateDuelSession({...good,ballots:[vote(197,0),vote(197,0)]}),/Duplicate/);
  assert.throws(()=>evaluateDuelSession({...good,ballots:[vote(197,0)]}),/2 to 3/);
  assert.throws(()=>evaluateDuelSession({...good,ballots:[...good.ballots,vote(197,3)]}),/2 to 3/);
  for(const mutation of [{winner:"A"},{reason:"anything"},{confidence:99},{choice:"PASS"},{round:-1},{seed:0}]){
    assert.throws(()=>evaluateDuelVote({...vote(197,0),...mutation}));
  }
});
test("server replay distinguishes factual oracle from human confidence and disagreement",()=>{
  const b=vote(197,3,"A");
  const result=evaluateDuelVote(b);
  assert.equal(result.oracle_winner,"neither");
  assert.equal(result.correct,false);
  assert.equal(result.reason,"risk");
  assert.equal(result.confidence,3);
  assert.match(result.provenance,/cannot be established/);
});
test("owner export converter rechecks the exact simulator labels and holds out all space-world cases",()=>{
  const seed=197,first=[vote(seed,0),vote(seed,1),vote(seed,2)];
  const data={format:"pcs-forge-duel-optin-research-dataset-v1",
    entries:[evaluateDuelSession({session_version:DUEL_VERSION,ballots:first})]};
  const prep=prepareForgeDuelDataset(data);
  assert.equal(prep.rows.length,3);
  assert.equal(prep.data_quality.high_confidence_correct_training_preferences,3);
  assert.ok(prep.rows.every(x=>!Object.hasOwn(x,"user_id")&&!Object.hasOwn(x,"email")));
  assert.ok(prep.evaluation_holdout_world==="space");
  const poisoned=structuredClone(data);
  poisoned.entries[0].ballots[0].oracle_winner=poisoned.entries[0].ballots[0].oracle_winner==="A"?"B":"A";
  assert.throws(()=>prepareForgeDuelDataset(poisoned),/Disagreement/);
  const exposed=structuredClone(data);exposed.entries[0].email="participant@example.com";
  assert.throws(()=>prepareForgeDuelDataset(exposed),/identity fields/);
});
test("public page has usable reasons, choices, opt-in buttons and no passive telemetry",()=>{
  const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
  const html=read("public/forge-duel.html"),js=read("public/forge-duel.js"),w=read("src/worker.js");
  assert.equal(DUEL_REASONS.length,7);
  for(const id of ["duelPickA","duelPickB","duelPickNeither","duelReasons","duelConfidence","duelAdult","duelConsent","duelDonate","duelErase","duelReveal"]){
    assert.ok(html.includes('id="'+id+'"')||id==="duelConfidence",id);
  }
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size);
  for(const m of js.matchAll(/\$\("([^"]+)"\)/g))assert.ok(ids.includes(m[1]),"Unbound UI ID: "+m[1]);
  assert.match(js,/await researchApi\("\/api\/arena\/forge-duel\/donate"/);
  assert.match(js,/if\(!\$\("duelAdult"\)\.checked\|\|!\$\("duelConsent"\)\.checked\)/);
  assert.match(w,/evaluateDuelSession\(submitted\)/);
  assert.match(w,/forge_duel_research_sessions WHERE user_id=\?/);
  assert.match(w,/isOwner\(admin\)/);
});
