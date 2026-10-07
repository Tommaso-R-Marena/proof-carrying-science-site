// Educational dependency-ordering puzzles. Simulated logic dependencies, NOT Lean proof validation.
// Explicitly separate practice from optional adult-only research-data donation.
export const PUZZLE_VERSION = "pcs-proof-order-puzzles-v1";
export const PUZZLES = Object.freeze([
  {id:"bridge",level:1,title:"Build a bridge",topic:"Everyday reasoning",goal:"Cross the river safely",story:"Put each step after the things it needs. More than one valid route may exist.",nodes:[
    {id:"plan",label:"Draw the bridge plan",why:"You need a plan before choosing parts.",needs:[]},
    {id:"parts",label:"Choose the parts",why:"Select parts that fit your plan.",needs:["plan"]},
    {id:"banks",label:"Check both riverbanks",why:"The shore must be safe before installation.",needs:[]},
    {id:"build",label:"Build the bridge",why:"Both parts and banks must be ready.",needs:["parts","banks"]},
    {id:"cross",label:"Cross the bridge",why:"Cross only when construction is finished.",needs:["build"]}]},
  {id:"cookie",level:1,title:"Cookie lab",topic:"Science steps",goal:"Produce and evaluate an experimental batch",story:"Some preparations can happen in either order, but the experiment needs them both.",nodes:[
    {id:"recipe",label:"Read the recipe",why:"The recipe defines what ingredients to choose.",needs:[]},
    {id:"oven",label:"Preheat the oven",why:"The oven must be hot before baking.",needs:[]},
    {id:"mix",label:"Mix the ingredients",why:"You must read what to use first.",needs:["recipe"]},
    {id:"bake",label:"Bake the batch",why:"Mixing and preheating must both be done.",needs:["oven","mix"]},
    {id:"taste",label:"Record the result",why:"Only assess the batch after baking.",needs:["bake"]}]},
  {id:"math",level:2,title:"Number detective",topic:"Mathematical logic",goal:"Conclude that 8 is even",story:"A mathematical conclusion must be supported by a definition and the matching fact.",nodes:[
    {id:"definition",label:"Understand what even means",why:"An even number is twice an integer.",needs:[]},
    {id:"witness",label:"Show 8 = 2 × 4",why:"This supplies the needed example.",needs:[]},
    {id:"apply",label:"Apply the definition to 8",why:"Use both the definition and the witness.",needs:["definition","witness"]},
    {id:"finish",label:"Conclude: 8 is even",why:"The proof's conclusion depends on the argument.",needs:["apply"]}]},
  {id:"signature",level:2,title:"Detective envelope",topic:"Proof-carrying evidence",goal:"Decide what the signed evidence establishes",story:"A signature can authenticate bytes, but it does not make every claim true.",nodes:[
    {id:"read",label:"Read the claimed statement",why:"Identify the precise statement being assessed.",needs:[]},
    {id:"key",label:"Identify the trusted signing key",why:"Verification needs an authorized public key.",needs:[]},
    {id:"sig",label:"Verify the signature",why:"Signature verification requires the public key.",needs:["key"]},
    {id:"checker",label:"Find a registered independent checker",why:"Understand the semantics of the claimed property.",needs:["read"]},
    {id:"execute",label:"Run the independent check",why:"Only after a checker is selected and the signature validated.",needs:["sig","checker"]},
    {id:"claim",label:"State the bounded verified conclusion",why:"Only claim what the check and its assumptions actually establish.",needs:["execute"]}]},
  {id:"lean",level:2,title:"Tiny proof ladder",topic:"Lean-style reasoning",goal:"Derive C from A → B, B → C, and A",story:"This is a simplified dependency map, not actual Lean 4 elaboration.",nodes:[
    {id:"premise_a",label:"Use the given fact A",why:"You are allowed to start with the supplied fact.",needs:[]},
    {id:"rule_ab",label:"Use the rule A → B",why:"Read the first implication.",needs:[]},
    {id:"rule_bc",label:"Use the rule B → C",why:"Read the second implication.",needs:[]},
    {id:"derive_b",label:"Derive fact B",why:"You need both A and the first implication.",needs:["premise_a","rule_ab"]},
    {id:"derive_c",label:"Derive fact C",why:"You need B and the second implication.",needs:["derive_b","rule_bc"]}]},
  {id:"archive",level:3,title:"Archive guardian",topic:"AI-safety assurance",goal:"Verify a bounded trace property of committed archive bytes",story:"Order the dependency checks without confusing a record with the real world.",nodes:[
    {id:"bytes",label:"Pin the exact archive bytes",why:"Checks must apply to stable, exact evidence.",needs:[]},
    {id:"parse",label:"Decode the canonical archive",why:"Correct parsing depends on the archive bytes.",needs:["bytes"]},
    {id:"type",label:"Reject any unregistered check type",why:"Unsupported tags cannot inherit transcript-reported PASS.",needs:["parse"]},
    {id:"sig",label:"Verify authorized signature",why:"Authenticate the decoded evidence.",needs:["parse"]},
    {id:"run",label:"Run the registered checker",why:"Checker semantics must be selected, and provenance validated.",needs:["type","sig"]},
    {id:"sound",label:"Apply the bounded soundness theorem",why:"Use the checker result only under the theorem's premises.",needs:["run"]},
    {id:"scope",label:"Report the committed-trace guarantee",why:"Deployed-world fidelity is a separate assumption.",needs:["sound"]}]},
  {id:"invalidation",level:3,title:"Change dominoes",topic:"Claim dependency graphs",goal:"Know what to re-check after a source file changes",story:"An affected claim must reopen when one of its required evidence pieces changes.",nodes:[
    {id:"change",label:"Spot the modified source",why:"A change starts the invalidation process.",needs:[]},
    {id:"deps",label:"Identify dependent computations",why:"Trace data flow from the source.",needs:["change"]},
    {id:"evidence",label:"Invalidate affected evidence",why:"Old evidence cannot be reused without checking.",needs:["deps"]},
    {id:"claim",label:"Mark downstream claim as OPEN",why:"The claim no longer has its earlier complete support.",needs:["evidence"]},
    {id:"retest",label:"Recompute and review the result",why:"New evidence must be checked before acceptance.",needs:["claim"]}]},
  {id:"optimize",level:3,title:"Optimizer mystery",topic:"Certified transformation",goal:"Justify a claim that a transformation preserves specified behavior",story:"A faster result is not automatically equivalent; the transformation needs a separate semantic check.",nodes:[
    {id:"spec",label:"Define the behavior to preserve",why:"Specify what equivalence means.",needs:[]},
    {id:"source",label:"Pin the original program",why:"The original must be fixed before comparison.",needs:[]},
    {id:"optimized",label:"Produce the optimized program",why:"The original is input to the transformation.",needs:["source"]},
    {id:"cert",label:"Construct an equivalence certificate",why:"Reference both programs and the specified behavior.",needs:["optimized","spec"]},
    {id:"verify",label:"Independently check the certificate",why:"Do not trust the optimizer's own PASS claim.",needs:["cert"]},
    {id:"report",label:"Report the scoped equivalence result",why:"The final claim follows only from verified evidence and assumptions.",needs:["verify"]}]}
]);

function validatePuzzle(p) {
  if(!p||typeof p.id!=="string"||!Array.isArray(p.nodes)||p.nodes.length>12||p.nodes.length<2)throw Error("Invalid puzzle");
  const seen=new Set();
  for(const node of p.nodes){if(seen.has(node.id))throw Error("duplicate node");seen.add(node.id);}
  const ids=new Set(p.nodes.map(n=>n.id));
  for(const node of p.nodes)for(const dep of node.needs){if(dep===node.id||!ids.has(dep))throw Error("bad dependency");}
  let done=new Set();
  for(let i=0;i<p.nodes.length;i++){
    const next=p.nodes.find(n=>!done.has(n.id)&&n.needs.every(x=>done.has(x)));
    if(!next)throw Error("cycle in puzzle");done.add(next.id);
  }
  return p;
}
for(const p of PUZZLES)validatePuzzle(p);
export const PUZZLE_BY_ID=new Map(PUZZLES.map(p=>[p.id,p]));

export const PROCEDURAL_PUZZLE_VERSION="pcs-proof-order-lab-v1";
const PROCEDURAL_FAMILIES=Object.freeze([
  {id:"agent-safety",title:"Robot Safety Review",topic:"AI safety dependency lab",goal:"Report what a bounded agent check really supports",story:"A fictional agent produced a trace. Build a defensible review chain; different cases may need different extra evidence.",
   nodes:[
     ["claim","Specify the agent's intended mission",[]],
     ["hazard","List the forbidden actions and risk thresholds",["claim"]],
     ["state","Describe the agent's possible states",[]],
     ["source","Record the origin of the action trace",["state"]],
     ["trace","Collect the bounded agent action sequence",["state"]],
     ["checker","Select the independent rule checker",["hazard"]],
     ["replay","Replay the trace against the actual rules",["trace","checker","source"]],
     ["limits","Record unobserved real-world conditions",["source"]],
     ["report","Report only the bounded safety finding",["replay","limits"]]
   ],
   optional:[
     ["consent","Confirm research reuse permission",["source"]],
     ["budget","Recalculate cumulative risk on the trace",["hazard","trace"]],
     ["receiver","Check the reviewer's acceptance policy",["claim","limits"]]
   ]},
  {id:"scientific-model",title:"Experimental Evidence Lab",topic:"Scientific validation",goal:"Explain which computational prediction was supported",story:"Your lab has a model and data. Establish what can be recomputed before accepting a scientific conclusion.",
   nodes:[
     ["question","State the exact scientific hypothesis",[]],
     ["inputs","Inventory the source observation files",[]],
     ["units","Check measurement units and conversions",["inputs"]],
     ["model","Specify the declared prediction equation",["question"]],
     ["predict","Calculate the expected numerical values",["model","units"]],
     ["compare","Compare predictions against observations",["predict","inputs"]],
     ["assumptions","List the model's biological assumptions",["question"]],
     ["report","Report only the tested numerical agreement",["compare","assumptions"]]
   ],
   optional:[
     ["range","Check that sample values are in range",["inputs"]],
     ["tolerance","Specify the acceptable numeric tolerance",["model"]],
     ["independent","Recompute results with a second method",["predict","units"]]
   ]},
  {id:"package-integrity",title:"Signed Evidence Detective",topic:"Package and signature assurance",goal:"Decide what authenticated, replayable evidence establishes",story:"A package arrives with a signature. A signer can authenticate bytes, but cannot make its claims true by declaration.",
   nodes:[
     ["claim","Identify the exact claim being evaluated",[]],
     ["manifest","Inventory the delivered package members",[]],
     ["key","Identify the trusted public signing key",[]],
     ["signature","Verify the signature on exact package bytes",["key","manifest"]],
     ["checker","Select a registered checker for the claim",["claim"]],
     ["artifacts","Bind evidence to artifact content hashes",["manifest"]],
     ["replay","Independently run the evidence checker",["checker","artifacts","signature"]],
     ["scope","Write down external trust assumptions",["claim"]],
     ["report","Report the bounded verification result",["replay","scope"]]
   ],
   optional:[
     ["paths","Check archive member names are canonical",["manifest"]],
     ["environment","Check the claimed environment evidence",["artifacts"]],
     ["reviewer","Apply the receiver's acceptance policy",["replay","scope"]]
   ]},
  {id:"lean-review",title:"Theorem Workshop",topic:"Lean 4 dependency planning",goal:"Show which steps are required to review a theorem",story:"Model the prerequisites of a real theorem-checking workflow. This ordering game itself is not Lean elaboration or a formal proof.",
   nodes:[
     ["goal","Write the precise theorem statement",[]],
     ["assumptions","List the assumptions used by the theorem",["goal"]],
     ["imports","Import the required Lean definitions",[]],
     ["lemmas","Find previously verified helper lemmas",["imports"]],
     ["term","Construct a candidate typed proof term",["assumptions","lemmas"]],
     ["elaborate","Elaborate and type-check the proof",["term","imports"]],
     ["kernel","Check the proof with the Lean kernel",["elaborate"]],
     ["limits","Record what the theorem does not prove",["goal"]],
     ["report","Report the kernel result and assumptions",["kernel","limits"]]
   ],
   optional:[
     ["toolchain","Pin the exact Lean and Mathlib versions",["imports"]],
     ["sources","Trace imported theorem dependencies",["lemmas"]],
     ["review","Review external axioms and trust bounds",["kernel","limits"]]
   ]}
]);
function labRng(seed){
  let state=seed>>>0;
  return ()=>{
    state=(state+0x6d2b79f5)|0;
    let t=Math.imul(state^(state>>>15),1|state);
    t^=t+Math.imul(t^(t>>>7),61|t);
    return ((t^(t>>>14))>>>0)/4294967296;
  };
}
/** Versioned finite synthetic generator used identically by browser and Worker. */
export function proceduralPuzzle(seed){
  if(!Number.isSafeInteger(seed)||seed<1||seed>9999999)throw Error("Invalid procedural puzzle seed.");
  const random=labRng(seed);
  const family=PROCEDURAL_FAMILIES[Math.floor(random()*PROCEDURAL_FAMILIES.length)];
  const variantPool=[...family.optional];
  for(let i=variantPool.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[variantPool[i],variantPool[j]]=[variantPool[j],variantPool[i]];}
  const added=variantPool.slice(0,1+Math.floor(random()*3));
  const nodes=[...family.nodes,...added].map(([id,label,needs])=>({
    id,label,needs:[...needs],
    why:"This step requires "+(needs.length?needs.join(" and ").replaceAll("_"," "):"no earlier dependency")+
      "; the review must establish the prerequisites before relying on the result."
  }));
  const finish=nodes.find(n=>n.id==="report");
  finish.needs.push(...added.map(n=>n[0]));
  const labels=new Map(nodes.map(n=>[n.id,n.label]));
  for(const node of nodes){
    node.why=node.needs.length
      ?"Before this step, establish: "+node.needs.map(dep=>labels.get(dep)).join("; ")+"."
      :"This is an independent starting point; no other step must precede it.";
  }
  const puzzle={id:"lab-"+seed,seed,family:family.id,level:3,
    title:family.title+" #"+seed,topic:family.topic,goal:family.goal,story:family.story,
    nodes,version:PROCEDURAL_PUZZLE_VERSION};
  return validatePuzzle(puzzle);
}
export function getPuzzleById(id){
  if(typeof id!=="string")return null;
  const fixed=PUZZLE_BY_ID.get(id);
  if(fixed)return fixed;
  if(!/^lab-[1-9][0-9]{0,6}$/.test(id))return null;
  const seed=Number(id.slice(4));
  return seed<=9999999?proceduralPuzzle(seed):null;
}
export function puzzleVersionFor(id){
  const p=getPuzzleById(id);
  return p?(p.version||PUZZLE_VERSION):null;
}


export function gradeOrder(puzzleId,order,hintsUsed=0) {
  const puzzle=getPuzzleById(puzzleId);
  if(!puzzle)throw Error("Unknown puzzle");
  if(!Array.isArray(order)||order.length!==puzzle.nodes.length||new Set(order).size!==puzzle.nodes.length)throw Error("Select each proof step exactly once.");
  if(order.some(x=>typeof x!=="string"||!puzzle.nodes.some(n=>n.id===x)))throw Error("Unknown step.");
  if(!Number.isInteger(hintsUsed)||hintsUsed<0||hintsUsed>20)throw Error("Invalid hint count.");
  const position=new Map(order.map((id,i)=>[id,i]));
  const constraints=puzzle.nodes.flatMap(node=>node.needs.map(dep=>({before:dep,after:node.id})));
  const mistakes=constraints.filter(({before,after})=>position.get(before)>position.get(after));
  const correct=constraints.length-mistakes.length;
  const valid=mistakes.length===0;
  const score=Math.max(0,Math.round(100*correct/Math.max(1,constraints.length))-Math.min(20,hintsUsed*4));
  return {
    puzzle_id:puzzle.id, puzzle_version:puzzleVersionFor(puzzle.id),
    valid,correct,total:constraints.length,score,hints_used:hintsUsed,
    mistakes:mistakes.map(({before,after})=>({before,after})),
    meaning:"Synthetic prerequisite ordering only: not a Lean 4 proof, certified RL label, or PCS authoritative result."
  };
}
export function publicPuzzleList(){return PUZZLES.map(({id,level,title,topic,goal,story,nodes})=>({id,level,title,topic,goal,story,nodes}));}
