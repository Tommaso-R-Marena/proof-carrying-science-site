import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {PUZZLES,gradeOrder,proceduralPuzzle,getPuzzleById,puzzleVersionFor,PROCEDURAL_PUZZLE_VERSION} from "../public/proof-order-core.mjs";
import {prepareDataset} from "../scripts/prepare_proof_quest_dataset.mjs";
import {evaluateTrace,evaluateModel,examples} from "../public/research-preview-engine.mjs";
const read=path=>readFileSync(new URL("../"+path,import.meta.url),"utf8");
test("procedural puzzle worlds are deterministic, acyclic, meaningfully diverse and bounded",()=>{
  const families=new Set(),versions=new Set(),shapes=new Set();
  for(let seed=1;seed<=150;seed++){
    const a=proceduralPuzzle(seed),b=proceduralPuzzle(seed);
    assert.deepEqual(a,b,"stable generated puzzle seed="+seed);
    assert.equal(a.id,"lab-"+seed);
    assert.ok(a.nodes.length>=8&&a.nodes.length<=12);
    assert.ok(a.nodes.every(n=>n.label.length>15&&n.why.length>20));
    const solved=[],seen=new Set();
    while(solved.length<a.nodes.length){
      const ready=a.nodes.find(n=>!seen.has(n.id)&&n.needs.every(dep=>seen.has(dep)));
      assert.ok(ready,"No dependency cycle allowed");
      seen.add(ready.id);solved.push(ready.id);
    }
    const valid=gradeOrder(a.id,solved);
    assert.equal(valid.valid,true);
    assert.equal(valid.puzzle_version,PROCEDURAL_PUZZLE_VERSION);
    assert.equal(gradeOrder(a.id,[...solved].reverse()).valid,false);
    assert.deepEqual(getPuzzleById(a.id),a);
    families.add(a.family);versions.add(valid.puzzle_version);
    shapes.add(a.nodes.map(n=>n.id+":"+n.needs.join("+")).join("|"));
  }
  assert.equal(families.size,4);
  assert.equal(versions.size,1);
  assert.ok(shapes.size>=15,"Procedural generator must yield materially different valid graphs");
  assert.equal(PUZZLES.length,8,"Retain the original beginner content");
});
test("unsafe seeds, injected puzzle IDs, and incorrect server scores fail closed",()=>{
  for(const id of ["lab-0","lab-10000000","lab-0002","lab-1;DROP","lab--3","../../whatever","lab-1/evil"]){
    assert.equal(getPuzzleById(id),null,id);
    assert.equal(puzzleVersionFor(id),null);
  }
  for(const seed of [null,0,-1,1.5,"2",1e12,NaN,Infinity]){
    assert.throws(()=>proceduralPuzzle(seed),/seed/);
  }
  assert.throws(()=>gradeOrder("lab-injection",[]),/Unknown puzzle/);
});
test("procedural data is regraded offline and split by entire unseen semantic family",()=>{
  const rows=[];
  const families=new Map();
  for(let seed=1;seed<70;seed++){
    const p=proceduralPuzzle(seed);
    if(families.has(p.family))continue;
    const order=[],ready=new Set();
    while(order.length<p.nodes.length){const n=p.nodes.find(n=>!ready.has(n.id)&&n.needs.every(dep=>ready.has(dep)));order.push(n.id);ready.add(n.id);}
    const grade=gradeOrder(p.id,order,0);
    rows.push({puzzle_id:p.id,puzzle_version:PROCEDURAL_PUZZLE_VERSION,order,hints_used:0,score:grade.score,
      constraints_satisfied:grade.correct,total_constraints:grade.total,valid_order:grade.valid});
    families.set(p.family,p.id);
  }
  assert.equal(families.size,4);
  const result=prepareDataset({format:"pcs-proof-order-optin-research-dataset-v1",examples:rows});
  assert.equal(result.episodes.length,4);
  const holdout=result.episodes.filter(e=>e.puzzle_family==="package-integrity");
  assert.equal(holdout.length,1);
  assert.equal(holdout[0].split,"evaluation");
  assert.equal(result.episodes.filter(e=>e.split==="training").length,3);
  rows[0].score=999;
  assert.throws(()=>prepareDataset({format:"pcs-proof-order-optin-research-dataset-v1",examples:rows}),/recomputed/);
});
test("tour uses the actual local evaluator and shows both pass and failure examples",()=>{
  assert.equal(evaluateTrace(examples.trace_pass).verdict,"PASS");
  assert.equal(evaluateTrace(examples.trace_fail).verdict,"FAIL");
  assert.equal(evaluateModel(examples.model_pass).verdict,"PASS");
  const experience=read("public/experience.html"),js=read("public/experience.js");
  assert.match(experience,/What if a claim/);
  assert.match(experience,/not the executable Lean authority/);
  assert.match(js,/evaluateTrace\(input\)/);
  assert.match(js,/evaluateModel\(input\)/);
  assert.doesNotMatch(js,/fetch\(/);
  for(const id of ["xpRun","xpVerdict","xpEvents","xpRisk","xpDeviation","xpLayerStatus","xpCopy"]){
    assert.ok(experience.includes('id="'+id+'"'),"Missing tour control "+id);
  }
});
test("every new game control is present, and no new automatic upload path exists",()=>{
  for(const [page,script] of [["public/arena-proof-quest.html","public/arena-proof-quest.js"],["public/arena-safety-forge.html","public/arena-safety-forge.js"]]){
    const html=read(page),js=read(script);
    const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
    assert.equal(ids.length,new Set(ids).size,"Duplicate HTML ID in "+page);
    for(const m of js.matchAll(/\$\("([^"]+)"\)/g))assert.ok(ids.includes(m[1]),page+" missing id "+m[1]);
  }
  const quest=read("public/arena-proof-quest.js"),forge=read("public/arena-safety-forge.js");
  assert.match(quest,/puzzle_version:puzzleVersionFor\(selected\.id\)/);
  assert.match(quest,/bankOrder=shuffled\(selected\.nodes\.map/);
  assert.match(forge,/traceFrames\(seed,guardList,actions\)/);
  assert.match(forge,/classifyPolicyTrials/);
  assert.match(quest,/#?questNewLab/);
  assert.match(read("src/worker.js"),/getPuzzleById\(body\.puzzle_id\)/);
});
test("navigation makes the start tour and both games discoverable without remote search",()=>{
  const site=read("public/site.js");
  assert.match(site,/siteShortcuts=\[/);
  assert.match(site,/experience\.html/);
  assert.match(site,/arena-safety-forge\.html/);
  assert.match(site,/arena-proof-quest\.html/);
  assert.match(site,/event\.metaKey\|\|event\.ctrlKey/);
  assert.match(site,/pcs-quick-results/);
  assert.match(site,/pcs-crumbs/);
  assert.doesNotMatch(site,/fetch\([^\n]*siteShortcuts/);
});
