import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PUZZLES,gradeOrder} from "../public/proof-order-core.mjs";
import {scenarioForSeed,verifyShield,replayActions} from "../public/safety-forge-core.mjs";

const src=name=>readFileSync(new URL("../"+name,import.meta.url),"utf8");
const qHtml=src("public/arena-proof-quest.html"),qJs=src("public/arena-proof-quest.js");
const fHtml=src("public/arena-safety-forge.html"),fJs=src("public/arena-safety-forge.js");
const worker=src("src/worker.js");
function ids(html){return [...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);}
function checkReferences(html,js){
  const known=ids(html);
  assert.equal(new Set(known).size,known.length,"HTML ids must be unique");
  for(const m of js.matchAll(/\$\("([^"]+)"\)/g))assert.ok(known.includes(m[1]),"Missing DOM id "+m[1]);
}
test("both games offer real three-step tutorials with readable beginner steps",()=>{
  for(const [html,js,prefix] of [[qHtml,qJs,"quest"],[fHtml,fJs,"forge"]]){
    checkReferences(html,js);
    for(const piece of ["ShowTutorial","TourBack","TourNext","TourSkip"]){
      assert.ok(html.includes('id="'+prefix+piece+'"'),prefix+piece);
    }
    assert.match(js,/const tour=\[/);
    assert.match(html,/No account to play/);
    assert.match(html,/arena-onboarding\.css/);
  }
});
test("consent is an easy single visible toggle; uploading is a separate explicit click",()=>{
  for(const [html,js,prefix] of [[qHtml,qJs,"quest"],[fHtml,fJs,"forge"]]){
    assert.match(html,new RegExp('role="switch" id="'+prefix+'Adult"|id="'+prefix+'Adult" type="checkbox" role="switch"'));
    assert.match(html,new RegExp('id="'+prefix+'Consent" type="checkbox" hidden'));
    assert.match(html,/Anyone can play/);
    assert.match(html,/adults 18\+ only/);
    assert.match(html,/does not upload anything/);
    assert.ok(js.includes('$("'+prefix+'Consent").checked=$("'+prefix+'Adult").checked'));
    assert.ok(js.includes('$("'+prefix+'Donate").addEventListener("click",async()=>{'));
  }
  assert.match(worker,/adult_confirmation!==true/);
  assert.match(worker,/consent_training!==true/);
  assert.match(worker,/email_verification_required/);
});
test("Proof Quest disguises the topological source order and offers meaningful feedback",()=>{
  assert.match(qJs,/bankOrder=shuffled\(selected\.nodes\.map/);
  assert.match(qJs,/for\(const n of bankOrder\.map/);
  assert.match(qHtml,/id="questProgress"/);
  assert.match(qHtml,/id="questTryAgain"/);
  assert.match(qHtml,/id="questNext"/);
  assert.equal(PUZZLES.length,8);
  assert.equal(gradeOrder("bridge",["plan","parts","banks","build","cross"]).valid,true);
  assert.equal(gradeOrder("bridge",["banks","plan","parts","build","cross"]).valid,true);
  assert.equal(gradeOrder("bridge",["cross","build","parts","banks","plan"]).valid,false);
});
test("Safety Forge captures local trials automatically and retains independently checked research semantics",()=>{
  assert.match(fJs,/if\(ended\)\{\s*recordAttack\(\)/);
  assert.match(fHtml,/id="forgeGoRepair"/);
  assert.match(fHtml,/id="forgeVictoryNext"/);
  const seed=197;
  assert.ok(scenarioForSeed(seed).risk_budget>=2);
  assert.equal(replayActions(seed,[],["shortcut"]).unsafe,true);
  const repaired=verifyShield(seed,["joint_review","redact","risk"]);
  assert.equal(repaired.passed,true);
  assert.ok(repaired.checked_states>0);
});
test("verified examples are explicitly synthetic, not claims about Lean or real agent safety",()=>{
  assert.match(qHtml,/not a Lean 4 proof/);
  assert.match(fHtml,/finite-state/);
  assert.match(worker,/gradeOrder\(body\.puzzle_id,body\.order,body\.hints_used\)/);
  assert.match(worker,/evaluateResearchSession\(submitted\)/);
  assert.match(src("scripts/prepare_proof_quest_dataset.mjs"),/lean_tactic_trajectory:false/);
  assert.match(src("scripts/prepare_safety_forge_dataset.mjs"),/real_lean_tactic_traces:false/);
});
