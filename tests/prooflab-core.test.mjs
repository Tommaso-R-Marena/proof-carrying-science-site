import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {
 PROOFLAB_VERSION,PROOFLAB_MAX_STEPS,allProofLabCases,proofLabCase,
 availablePlanMoves,replayProofLabSteps,evaluateProofLabSession,graphIntegrity
} from "../public/prooflab-core.mjs";
import {PROOFLAB_SOURCE_COMMIT,PROOFLAB_WITHHELD} from "../public/prooflab-source-data.mjs";
const read=p=>readFileSync(new URL("../"+p,import.meta.url),"utf8");
const cases=allProofLabCases();
function solved(c){
 const actions=[],completed=[];
 while(completed.length<c.nodes.length){
  const possible=availablePlanMoves(c.id,completed);
  assert.ok(possible.length>0,"DAG must have available node for "+c.id);
  const next=possible.at(-1);
  actions.push({node:next,reason:"dependency",confidence:3});completed.push(next);
 }
 return actions;
}
function supplied(c,actions=solved(c)){return{
 case_id:c.id,version:PROOFLAB_VERSION,actions,hints_used:0,
 threat:c.threats[0],threat_confidence:2
};}
test("ProofLab research network access is restricted to explicit reviewed API endpoints",()=>{
 const js=read("public/prooflab.js"),policy=read("scripts/check_site.py");
 assert.match(js,/path\.startsWith\("\/api\/"\)/);
 assert.match(js,/Unreviewed ProofLab research API path/);
 assert.match(js,/\/api\/arena\/prooflab\/donate/);
 assert.match(js,/\/api\/arena\/prooflab\/erase/);
 assert.match(policy,/"prooflab\.js"/);
});
test("22 playable real-source training theorems, 18 wholly private holdouts",()=>{
 assert.equal(cases.length,22);assert.equal(PROOFLAB_WITHHELD.validation,8);
 assert.equal(PROOFLAB_WITHHELD.evaluation,10);assert.ok(graphIntegrity());
 assert.equal(new Set(cases.map(c=>c.id)).size,22);
 assert.ok(cases.every(c=>c.split==="training"&&c.source.revision===PROOFLAB_SOURCE_COMMIT));
 assert.equal(proofLabCase("pcs-checkers-01"),null);
 assert.equal(proofLabCase("pcs-packageproofs-01"),null);
 assert.equal(proofLabCase("pcs-frontier-01"),null);
 assert.throws(()=>replayProofLabSteps("pcs-frontier-01",[]),/reserved/);
 const shipped=JSON.parse(read("public/prooflab-benchmark.json"));
 assert.equal(shipped.cases.length,22);
 assert.ok(shipped.cases.every(x=>x.split==="training"));
 assert.equal(shipped.case_count,40);
 assert.deepEqual(shipped.withheld_by_module.Frontier,{split:"evaluation",count:3});
 for(const c of shipped.cases){
  assert.ok(!Object.hasOwn(c,"source_statement"));
  assert.ok(!Object.hasOwn(c,"source_proof_body"));
 }
});
test("every source-pinned case has a complete, repeatable, independently scored proof-review path",()=>{
 for(const c of cases){
  const actions=solved(c),result=replayProofLabSteps(c.id,actions);
  assert.equal(result.completed,true,c.id);
  assert.equal(result.accepted,c.nodes.length);
  assert.equal(result.rejected,0);
  assert.equal(result.score,100);
  assert.equal(result.source_commit,PROOFLAB_SOURCE_COMMIT);
  assert.match(result.verdict_scope,/NO Lean|no Lean|Lean kernel check/i);
  const x=evaluateProofLabSession(supplied(c,actions));
  assert.equal(x.graph_replay.completed,true);
  assert.equal(x.case_theorem,c.theorem);
  assert.equal(x.campaign,c.campaign);
  assert.equal(x.split,"training");
  assert.equal(x.actions.length,c.nodes.length);
 }
});
test("blocked attempts are documented as negative learning signal, not proof failure",()=>{
 for(const c of cases){
  const invalid={node:"review",reason:"intuition",confidence:3},actions=[
   invalid,...solved(c).slice(0,4)
  ];
  const r=replayProofLabSteps(c.id,actions);
  assert.equal(r.checked_steps[0].accepted,false);
  assert.ok(r.checked_steps[0].missing_prerequisites.length>0);
  assert.equal(r.rejected,1);
  const verified=evaluateProofLabSession(supplied(c,actions));
  assert.equal(verified.graph_replay.rejected,1);
  assert.equal(verified.challenge.status,"human-selected hypothesis; not empirically verified");
 }
});
test("multi-answer prerequisite graph never presents one human ordering as uniquely correct",()=>{
 for(const c of cases){
  const first=availablePlanMoves(c.id,[]);
  assert.equal(first.length,1);
  const after=availablePlanMoves(c.id,["scope"]);
  assert.ok(after.includes("premises")&&after.includes("artifact"));
  const p=solved(c);
  const alt=[p.find(x=>x.node==="scope"),p.find(x=>x.node==="premises"),
    p.find(x=>x.node==="artifact"),
    ...p.filter(x=>!["scope","premises","artifact"].includes(x.node))];
  const top=replayProofLabSteps(c.id,alt);
  assert.equal(top.completed,true,c.id);
 }
});
test("malformed actions, unsupported hypotheses, forged labels and abusive repeats are rejected",()=>{
 const c=cases[0],valid=supplied(c);
 const broken=[{...valid,hints_used:13},{...valid,version:"other"},
  {...valid,threat:"I proved alignment"}, {...valid,threat_confidence:0},
  {...valid,actions:[...valid.actions,{node:"review",reason:"madeup",confidence:3}]},
  {...valid,client_verified:true}];
 for(const x of broken)assert.throws(()=>evaluateProofLabSession(x));
 assert.throws(()=>replayProofLabSteps(c.id,new Array(PROOFLAB_MAX_STEPS+1).fill(
  {node:"scope",reason:"source",confidence:2})));
 assert.throws(()=>replayProofLabSteps(c.id,new Array(5).fill(
  {node:"scope",reason:"source",confidence:2})),/Excessive/);
});
test("game has no duplicate controls, explicit consent, mobile graph, keyboard-compatible cards",()=>{
 const html=read("public/prooflab.html"),script=read("public/prooflab.js"),style=read("public/prooflab.css");
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
 assert.equal(ids.length,new Set(ids).size);
 for(const found of script.matchAll(/\$\("([^"]+)"\)/g))
  assert.ok(ids.includes(found[1]),"Unbound game HTML element: "+found[1]);
 for(const id of ["plAdult","plConsent","plDonate","plErase","plGraph","plTray",
  "plCheck","plHistory","plVictory","plTheoremSymbol","plSourceRevision"])
   assert.ok(ids.includes(id));
 assert.match(script,/if\(!\$\("plAdult"\)\.checked\|\|!\$\("plConsent"\)\.checked\)/);
 assert.match(script,/dataTransfer\.getData/);
 assert.match(style,/@media\(max-width:560px\)/);
 assert.match(html,/not<\/strong> that Lean ran|<strong>not<\/strong> that Lean ran/i);
});
