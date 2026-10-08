import test from "node:test";
import assert from "node:assert/strict";
import {MISSIONS,FIELDS,MEANING_VERSION,renderLean,parseLean,renderEnglish,
  initialClaim,replaySession,differences,roundtrip,validateClaim} from "../public/meaning-forge-core.mjs";
function solve(m,mode){
 let curr=initialClaim(m,mode),moves=[];
 for(const f of FIELDS){
  if(curr[f]!==m.target[f]){curr={...curr,[f]:m.target[f]};moves.push({field:f,value:curr[f]});}
 }
 return {version:MEANING_VERSION,mission_id:m.id,mode,moves,hints_used:0,confidence:4,
  explanation:"The quantifiers and connectives must be preserved exactly under translation."};
}
test("every curated mission roundtrips and is structurally solvable in both directions",()=>{
 assert.ok(MISSIONS.length>=12);
 for(const m of MISSIONS){
  assert.equal(differences(m,m.target).length,0);
  assert.ok(roundtrip(m,m.target));
  assert.deepEqual(parseLean(m,renderLean(m,m.target)),m.target);
  assert.ok(renderEnglish(m,m.target).endsWith("."));
  for(const mode of ["english-to-lean","lean-to-english"]){
   const result=replaySession(solve(m,mode));
   assert.equal(result.structural_correct,true,m.id+":"+mode);
   assert.equal(result.semantic_roundtrip,true,m.id);
   assert.equal(result.steps.length,2);
   assert.equal(result.score,100);
   assert.deepEqual(result.final_ir,m.target);
  }
 }
});
test("unfixed quantifier, connective, polarity, or predicate changes fail on replay",()=>{
 for(const m of MISSIONS){
  for(const mode of ["english-to-lean","lean-to-english"]){
   const s=solve(m,mode);
   s.moves=s.moves.slice(0,1);
   assert.equal(replaySession(s).structural_correct,false);
   const r=replaySession(s);
   assert.ok(r.errors.length>0);
  }
 }
});
test("model-supplied score, oracle, or conclusion is never an accepted input",()=>{
 const s=solve(MISSIONS[0],"english-to-lean");
 assert.throws(()=>replaySession({...s,score:100}),/envelope/);
 assert.throws(()=>replaySession({...s,structural_correct:true}),/envelope/);
 assert.throws(()=>replaySession({...s,mission_id:"hidden-gold"}),/mission/);
 assert.throws(()=>replaySession({...s,version:"other"}),/version/);
 assert.throws(()=>replaySession({...s,explanation:"x"}),/25/);
 assert.throws(()=>replaySession({...s,confidence:100}),/Confidence/);
 assert.throws(()=>replaySession({...s,moves:Array(40).fill(s.moves[0])}),/36/);
 assert.throws(()=>replaySession({...s,moves:[{field:"__proto__",value:"x"}]}),/Malformed/);
 assert.throws(()=>replaySession({...s,moves:[{field:"quantifier",value:"exists",is_gold:true}]}),/Malformed/);
});
test("unsupported Lean syntax is never guessed or implicitly certified",()=>{
 const m=MISSIONS[0];
 assert.throws(()=>parseLean(m,"∀ x : Agent, sorry"),/grammar|fragment/);
 assert.throws(()=>parseLean(m,"∃ x : Agent, Approved x → Safe x\n#eval unsafe"),/grammar|fragment/);
 assert.throws(()=>parseLean(m,"∀ x : Claim, Approved x → Safe x"),/grammar|fragment/);
 assert.throws(()=>validateClaim(m,{...m.target,left:"Unregistered"}),/Unsupported/);
});
