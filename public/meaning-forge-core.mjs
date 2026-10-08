// PCS Meaning Forge v1: BOUNDED English/Lean proposition semantics.
// This is a game template, not a prover or a universal semantic translator.
export const MEANING_VERSION="pcs-meaning-forge-v1";
export const FIELDS=Object.freeze(["quantifier","left","left_negated","connective","right","right_negated"]);
const QUANTIFIERS=["forall","exists"],CONNECTIVES=["implies","and"];
const RAW=[
 ["agent-approval","Agent",["Approved","Safe","Observed"],["forall","Approved",false,"implies","Safe",false],"Every approved agent is safe.","ai-safety"],
 ["agent-evidence","Agent",["Monitored","Protected","Approved"],["exists","Monitored",false,"and","Protected",true],"Some monitored agent is not protected.","ai-safety"],
 ["review-bounds","Claim",["Supported","Reviewed","Accepted"],["forall","Accepted",false,"implies","Reviewed",false],"Every accepted claim has been reviewed.","assurance"],
 ["claim-evidence","Claim",["Bound","Replayed","Supported"],["forall","Supported",false,"implies","Bound",false],"Every supported claim has bound evidence.","assurance"],
 ["evidence-types","Evidence",["Registered","Signed","Replayed"],["forall","Replayed",false,"implies","Registered",false],"Every replayed evidence item is registered.","assurance"],
 ["evidence-unknown","Evidence",["Registered","Approved","Examined"],["exists","Examined",false,"and","Registered",true],"Some examined evidence is not registered.","assurance"],
 ["agent-failure","Agent",["Authorized","Unsafe","Flagged"],["exists","Authorized",false,"and","Unsafe",false],"Some authorized agent is unsafe.","ai-safety"],
 ["agent-block","Agent",["Revoked","Blocked","Observed"],["forall","Revoked",false,"implies","Blocked",false],"Every revoked agent is blocked.","ai-safety"],
 ["claims-nothing","Claim",["Accepted","Rejected","Audited"],["forall","Rejected",false,"implies","Accepted",true],"Every rejected claim is not accepted.","assurance"],
 ["research-assumption","Experiment",["Controlled","Reproducible","Observed"],["forall","Controlled",false,"implies","Reproducible",false],"Every controlled experiment is reproducible.","research"],
 ["policy-outlier","Policy",["Verified","Minimal","Unsafe"],["exists","Verified",false,"and","Minimal",true],"Some verified policy is not minimal.","ai-safety"],
 ["policy-guard","Policy",["Guarded","Unsafe","Certified"],["forall","Guarded",false,"implies","Unsafe",true],"Every guarded policy is not unsafe.","ai-safety"]
];
function claim(a){return {quantifier:a[0],left:a[1],left_negated:a[2],connective:a[3],right:a[4],right_negated:a[5]};}
export const MISSIONS=Object.freeze(RAW.map(([id,type,predicates,target,description,domain],i)=>Object.freeze({
 id,type,predicates:Object.freeze(predicates),target:Object.freeze(claim(target)),description,domain,
 difficulty:i%3+1,version:MEANING_VERSION
})));
export function missionById(id){return MISSIONS.find(m=>m.id===id)||null;}
export function validateClaim(m,c){
 if(!m||!c||typeof c!=="object"||Array.isArray(c)||
    Object.keys(c).sort().join(",")!==[...FIELDS].sort().join(","))
    throw Error("Invalid semantic claim fields.");
 if(!QUANTIFIERS.includes(c.quantifier)||!CONNECTIVES.includes(c.connective)||
   !m.predicates.includes(c.left)||!m.predicates.includes(c.right)||
   typeof c.left_negated!=="boolean"||typeof c.right_negated!=="boolean"||c.left===c.right)
    throw Error("Unsupported claim expression.");
 return {...c};
}
export function renderLean(m,c){
 const v=validateClaim(m,c);
 const atom=(key,neg)=>neg?"¬ ("+key+" x)":key+" x";
 return (v.quantifier==="forall"?"∀":"∃")+" x : "+m.type+", "+atom(v.left,v.left_negated)+" "+
   (v.connective==="implies"?"→":"∧")+" "+atom(v.right,v.right_negated);
}
export function parseLean(m,text){
 if(typeof text!=="string"||text.length>240)throw Error("Outside supported Lean fragment.");
 const z=text.match(/^(∀|∃) x : (Agent|Claim|Evidence|Experiment|Policy), (¬ \()?([A-Za-z]+) x(\))? (→|∧) (¬ \()?([A-Za-z]+) x(\))?$/);
 if(!z||z[2]!==m.type||Boolean(z[3])!==Boolean(z[5])||Boolean(z[7])!==Boolean(z[9]))
   throw Error("Only the bounded grammar is parsed; arbitrary Lean requires the real elaborator.");
 return validateClaim(m,{quantifier:z[1]==="∀"?"forall":"exists",left:z[4],
   left_negated:!!z[3],connective:z[6]==="→"?"implies":"and",right:z[8],right_negated:!!z[7]});
}
export function renderEnglish(m,c){
 const v=validateClaim(m,c),who=v.quantifier==="forall"?"For every ":"There is a ";
 const pre=who+m.type.toLowerCase()+" x";
 const atom=(pred,neg)=>"x is "+(neg?"not ":"")+pred.toLowerCase();
 return v.connective==="implies"?
   pre+", if "+atom(v.left,v.left_negated)+", then "+atom(v.right,v.right_negated)+".":
   pre+" such that "+atom(v.left,v.left_negated)+" and "+atom(v.right,v.right_negated)+".";
}
export function differences(m,c){
 const v=validateClaim(m,c);return FIELDS.filter(f=>v[f]!==m.target[f]);
}
export function roundtrip(m,c){
 const v=validateClaim(m,c),parsed=parseLean(m,renderLean(m,v));
 return FIELDS.every(f=>parsed[f]===v[f]);
}
export function initialClaim(m,mode){
 if(!["english-to-lean","lean-to-english"].includes(mode))throw Error("Unknown mode.");
 const o={...m.target};
 if(mode==="english-to-lean"){o.quantifier=o.quantifier==="forall"?"exists":"forall";o.right_negated=!o.right_negated;}
 else {o.connective=o.connective==="implies"?"and":"implies";o.left_negated=!o.left_negated;}
 return o;
}
export function publicMission(m){return {
 id:m.id,type:m.type,predicates:[...m.predicates],domain:m.domain,difficulty:m.difficulty,
 version:MEANING_VERSION,statement:m.description,lean:renderLean(m,m.target),literal_english:renderEnglish(m,m.target)
};}
export function replaySession(p){
 if(!p||typeof p!=="object"||Array.isArray(p)||
   Object.keys(p).sort().join(",")!=="confidence,explanation,hints_used,mission_id,mode,moves,version")
   throw Error("Invalid research-session envelope.");
 if(p.version!==MEANING_VERSION)throw Error("Unsupported session version.");
 const m=missionById(p.mission_id);
 if(!m)throw Error("Unknown mission.");
 if(!["english-to-lean","lean-to-english"].includes(p.mode))throw Error("Unsupported mode.");
 if(!Array.isArray(p.moves)||p.moves.length<1||p.moves.length>36)throw Error("Expected 1–36 replayable moves.");
 if(!Number.isInteger(p.hints_used)||p.hints_used<0||p.hints_used>5)throw Error("Invalid hints.");
 if(!Number.isInteger(p.confidence)||p.confidence<1||p.confidence>5)throw Error("Confidence must be 1–5.");
 if(typeof p.explanation!=="string"||p.explanation.trim().length<25||p.explanation.length>1000)
   throw Error("Supply a 25–1000 character explanation.");
 let current=initialClaim(m,p.mode),steps=[],previous=differences(m,current).length;
 for(const move of p.moves){
  if(!move||typeof move!=="object"||Array.isArray(move)||
    Object.keys(move).sort().join(",")!=="field,value"||
    !FIELDS.includes(move.field))throw Error("Malformed move.");
  const allowed=move.field==="quantifier"?QUANTIFIERS:move.field==="connective"?CONNECTIVES:
    move.field.endsWith("_negated")?[true,false]:m.predicates;
  if(!allowed.includes(move.value))throw Error("Invalid move value.");
  current=validateClaim(m,{...current,[move.field]:move.value});
  const wrong=differences(m,current);
  steps.push({field:move.field,value:move.value,remaining_mismatches:wrong.length,
    improvement:previous-wrong.length});previous=wrong.length;
 }
 const misses=differences(m,current),solved=misses.length===0;
 return {format:"pcs-meaning-forge-replay-v1",mission_id:m.id,domain:m.domain,
  version:MEANING_VERSION,mode:p.mode,
  grounding:{type:m.type,predicates:[...m.predicates],namespace:"game-template-v1",
    source:"PCS-curated educational predicates"},
  given:p.mode==="english-to-lean"?m.description:renderLean(m,m.target),
  oracle:p.mode==="english-to-lean"?renderLean(m,m.target):renderEnglish(m,m.target),
  target_ir:{...m.target},initial_ir:initialClaim(m,p.mode),final_ir:current,
  steps,hints_used:p.hints_used,confidence:p.confidence,
  explanation:p.explanation.trim(),
  structural_correct:solved,errors:misses,semantic_roundtrip:roundtrip(m,current),
  best_verified_label:solved?"structured_match":"structured_mismatch",
  score:Math.max(0,Math.round((solved?100:Math.max(0,45-12*misses))-
    Math.max(0,p.moves.length-4)*2-p.hints_used*9)),
  limitations:["No Lean compiler/kernel execution","Human explanation is an unverified annotation",
    "Grammar restricted to a typed variable and two predicates","Correctness is against a selected game interpretation"]
 };
}
