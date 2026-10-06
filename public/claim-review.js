(()=>{
"use strict";
const $=id=>document.getElementById(id);
const fileInput=$("claimReviewFile");
const workspace=$("claimReviewWorkspace");
const message=$("claimReviewMessage");
const tree=$("claimReviewTree");
const detail=$("claimReviewDetail");
let current=null;
let candidateByClaim=new Map();
let claimById=new Map();
let childrenById=new Map();
let relationByChild=new Map();
let dependenciesById=new Map();

const example={
  format:"pcs-proof-translation-v1",
  compiler:"pcs-proof-translation-compiler/0.3",
  plan_sha256:"5c0e4ba19a9ce6b2a343507a12f5ab32fa884bb3ea8d0e1426204eb9a70ea7d2",
  claim_ir:{
    format:"pcs-claim-ir-v1",
    claim_ir_sha256:"37e978e1016a8a351037a3ec0d2a62061663b6c4fb35e8286b8d3d77f1d9c453",
    roots:["C_ROOT"],
    summary:{claims:4,decomposed_claims:4,decomposition_roots:1,decomposition_relations:3,dependency_relations:0,max_decomposition_depth:2},
    claims:[
      {claim_id:"C_ROOT",proposal_id:"MODEL_ROOT",statement:"The cohort comparison is methodologically valid.",kind:"mixed",predicate:null,closure_state:"BLOCKED",candidate_status:"DECOMPOSITION_BLOCKED_BY_CHILDREN",selected:false,formalizable:false,decomposition:{parent_claim_id:null,relation:"root",depends_on_claim_ids:[],depth:0,child_claim_ids:["C_METHOD"]},authority:{children_can_set_parent_authority:false,composition_semantics_certified:false,human_review_required_for_uncertified_composition:true}},
      {claim_id:"C_METHOD",proposal_id:"MODEL_METHOD",statement:"The evaluation split is scientifically suitable.",kind:"mixed",predicate:null,closure_state:"BLOCKED",candidate_status:"DECOMPOSITION_BLOCKED_BY_CHILDREN",selected:false,formalizable:false,decomposition:{parent_claim_id:"C_ROOT",relation:"required_subclaim",depends_on_claim_ids:[],depth:1,child_claim_ids:["C_DISJOINT","C_LABELS"]},authority:{children_can_set_parent_authority:false,composition_semantics_certified:false,human_review_required_for_uncertified_composition:true}},
      {claim_id:"C_DISJOINT",proposal_id:"MODEL_DISJOINT",statement:"The two cohorts are disjoint on id.",kind:"computational",predicate:{type:"csv_disjoint",left_artifact:"A_COHORT_A",right_artifact:"A_COHORT_B",key:"id"},closure_state:"COMPILED_PENDING_HUMAN_CONFIRMATION",candidate_status:"COMPILED_LEAN_BUILTIN",selected:true,formalizable:true,decomposition:{parent_claim_id:"C_METHOD",relation:"required_subclaim",depends_on_claim_ids:[],depth:2,child_claim_ids:[]},authority:{children_can_set_parent_authority:false,composition_semantics_certified:false,human_review_required_for_uncertified_composition:true}},
      {claim_id:"C_LABELS",proposal_id:"MODEL_LABELS",statement:"The cohort labels identify the intended scientific populations.",kind:"empirical",predicate:null,closure_state:"BLOCKED",candidate_status:"DECOMPOSITION_LEAF_UNRESOLVED",selected:false,formalizable:false,decomposition:{parent_claim_id:"C_METHOD",relation:"required_assumption",depends_on_claim_ids:[],depth:2,child_claim_ids:[]},authority:{children_can_set_parent_authority:false,composition_semantics_certified:false,human_review_required_for_uncertified_composition:true}}
    ],
    relations:[
      {kind:"decomposition",from_claim_id:"C_ROOT",to_claim_id:"C_METHOD",relation:"required_subclaim"},
      {kind:"decomposition",from_claim_id:"C_METHOD",to_claim_id:"C_DISJOINT",relation:"required_subclaim"},
      {kind:"decomposition",from_claim_id:"C_METHOD",to_claim_id:"C_LABELS",relation:"required_assumption"}
    ]
  },
  obligation_graph:{format:"pcs-proof-obligation-graph-v1",claim_ir_sha256:"37e978e1016a8a351037a3ec0d2a62061663b6c4fb35e8286b8d3d77f1d9c453",graph_sha256:"b8a81ea40e1ea93cae5785a013886607f15148f4998f2ed907e4fb2da121e59c",summary:{nodes:15,edges:18,blocking_obligations:3,repair_actions:2,node_type_counts:{proposal:4,typed_claim:4,typed_check:1,formal_target:1,obligation:5},closure_state_counts:{BLOCKED:3,COMPILED_PENDING_HUMAN_CONFIRMATION:1}}},
  candidates:[
    {id:"MODEL_ROOT",status:"DECOMPOSITION_BLOCKED_BY_CHILDREN",selected:false,formalizable:false,typed_claim:{id:"C_ROOT",statement:"The cohort comparison is methodologically valid.",kind:"mixed"},decomposition:{parent_claim_id:null,relation:"root",depends_on_claim_ids:[],depth:0,child_claim_ids:["C_METHOD"]},obligations:[{kind:"DECOMPOSITION_CHILD_BLOCKED",blocking:true,message:"At least one required decomposed child still has an open blocking obligation."}]},
    {id:"MODEL_METHOD",status:"DECOMPOSITION_BLOCKED_BY_CHILDREN",selected:false,formalizable:false,typed_claim:{id:"C_METHOD",statement:"The evaluation split is scientifically suitable.",kind:"mixed"},decomposition:{parent_claim_id:"C_ROOT",relation:"required_subclaim",depends_on_claim_ids:[],depth:1,child_claim_ids:["C_DISJOINT","C_LABELS"]},obligations:[{kind:"DECOMPOSITION_CHILD_BLOCKED",blocking:true,message:"At least one required decomposed child still has an open blocking obligation."}]},
    {id:"MODEL_DISJOINT",status:"COMPILED_LEAN_BUILTIN",selected:true,formalizable:true,typed_claim:{id:"C_DISJOINT",statement:"The two cohorts are disjoint on id.",kind:"computational",predicate:{type:"csv_disjoint",left_artifact:"A_COHORT_A",right_artifact:"A_COHORT_B",key:"id"}},formal_target:{checker:"PCS.V2.Checkers.csvChecker",soundness_theorem:"PCS.V2.Csv.csvRun_sound",semantic_proposition:"PCS.V2.Csv.CsvHolds",proof_level:"LEAN_KERNEL"},decomposition:{parent_claim_id:"C_METHOD",relation:"required_subclaim",depends_on_claim_ids:[],depth:2,child_claim_ids:[]},obligations:[{kind:"HUMAN_CONFIRMATION_REQUIRED",blocking:false,message:"Human confirmation remains required before attestation."}]},
    {id:"MODEL_LABELS",status:"DECOMPOSITION_LEAF_UNRESOLVED",selected:false,formalizable:false,typed_claim:{id:"C_LABELS",statement:"The cohort labels identify the intended scientific populations.",kind:"empirical"},decomposition:{parent_claim_id:"C_METHOD",relation:"required_assumption",depends_on_claim_ids:[],depth:2,child_claim_ids:[]},obligations:[{kind:"DECOMPOSITION_LEAF_NEEDS_CHECK_OR_CHILDREN",blocking:true,message:"This scientific leaf has no deterministic/external check and no child claims that could further refine it."}]}
  ]
};

function text(v){return v===null||v===undefined?"—":String(v)}
function shortHash(v){return typeof v==="string"&&v.length>20?v.slice(0,12)+"…"+v.slice(-8):text(v)}
function el(tag,cls,content){
  const n=document.createElement(tag);
  if(cls)n.className=cls;
  if(content!==undefined)n.textContent=content;
  return n;
}
function candidateFor(claimId){return candidateByClaim.get(claimId)||{}}
function obligations(c){return Array.isArray(c?.obligations)?c.obligations.filter(x=>x&&typeof x==="object"):[]}
function blocking(c){return obligations(c).filter(x=>x.blocking===true)}
function reviewObligations(c){return obligations(c).filter(x=>x.blocking!==true)}
function classify(claim,c){
  if(blocking(c).length)return {key:"open",label:"BLOCKING OPEN",detail:"At least one machine-blocking obligation remains."};
  if(c?.formalizable===true&&c?.formal_target)return {key:"formal",label:"LEAN-BACKED TARGET",detail:"PCS mapped this exact predicate to a certified formal target. Human confirmation and authoritative replay still remain."};
  if(c?.validation_target)return {key:"external",label:"EXTERNAL VALIDATOR",detail:"PCS bound this claim to an external validator trust contract; validator semantics remain external."};
  if(c?.status==="DECOMPOSED_CHILDREN_CLOSED_PARENT_REVIEW_REQUIRED")return {key:"review",label:"PARENT REVIEW",detail:"Direct children are closed, but PCS has no certified composition rule proving the broader parent."};
  const rel=claim?.decomposition?.relation;
  if(rel==="required_assumption"||claim?.kind==="empirical")return {key:"review",label:"ASSUMPTION / REVIEW",detail:"This node still requires scientific or human judgment."};
  return {key:"review",label:"REVIEW",detail:"No machine-authoritative closure is claimed for this node."};
}
function validate(doc){
  if(!doc||doc.format!=="pcs-proof-translation-v1")throw new Error("Expected a pcs-proof-translation-v1 document.");
  if(!doc.claim_ir||doc.claim_ir.format!=="pcs-claim-ir-v1")throw new Error("This translation does not contain pcs-claim-ir-v1. Generate it with the current PCS core translator.");
  if(!Array.isArray(doc.claim_ir.claims)||!Array.isArray(doc.claim_ir.relations))throw new Error("Claim IR claims/relations are malformed.");
  if(!doc.obligation_graph||doc.obligation_graph.format!=="pcs-proof-obligation-graph-v1")throw new Error("Translation lacks pcs-proof-obligation-graph-v1.");
  if(doc.obligation_graph.claim_ir_sha256&&doc.obligation_graph.claim_ir_sha256!==doc.claim_ir.claim_ir_sha256)throw new Error("Claim IR / obligation-graph commitment references disagree.");
}
function index(doc){
  candidateByClaim=new Map();
  for(const c of Array.isArray(doc.candidates)?doc.candidates:[]){
    const claim=c?.typed_claim||c?.claim_ir_claim;
    if(claim?.id)candidateByClaim.set(claim.id,c);
  }
  claimById=new Map((doc.claim_ir.claims||[]).map(c=>[c.claim_id,c]));
  childrenById=new Map();
  relationByChild=new Map();
  dependenciesById=new Map();
  for(const rel of doc.claim_ir.relations||[]){
    if(rel.kind==="decomposition"){
      if(!childrenById.has(rel.from_claim_id))childrenById.set(rel.from_claim_id,[]);
      childrenById.get(rel.from_claim_id).push(rel.to_claim_id);
      relationByChild.set(rel.to_claim_id,rel.relation);
    }else if(rel.kind==="dependency"){
      if(!dependenciesById.has(rel.to_claim_id))dependenciesById.set(rel.to_claim_id,[]);
      dependenciesById.get(rel.to_claim_id).push(rel.from_claim_id);
    }
  }
  for(const ids of childrenById.values())ids.sort();
}
function renderSummary(doc){
  $("claimReviewPlanHash").textContent=shortHash(doc.plan_sha256);
  $("claimReviewClaimHash").textContent=shortHash(doc.claim_ir.claim_ir_sha256);
  $("claimReviewGraphHash").textContent=shortHash(doc.obligation_graph.graph_sha256);
  $("claimReviewPlanHash").title=text(doc.plan_sha256);
  $("claimReviewClaimHash").title=text(doc.claim_ir.claim_ir_sha256);
  $("claimReviewGraphHash").title=text(doc.obligation_graph.graph_sha256);

  let formal=0,external=0,review=0,open=0;
  for(const claim of doc.claim_ir.claims){
    const k=classify(claim,candidateFor(claim.claim_id)).key;
    if(k==="formal")formal++;
    else if(k==="external")external++;
    else if(k==="open")open++;
    else review++;
  }
  $("claimReviewFormal").textContent=formal;
  $("claimReviewExternal").textContent=external;
  $("claimReviewReview").textContent=review;
  $("claimReviewOpen").textContent=open;
  $("claimReviewIrSummary").textContent=JSON.stringify(doc.claim_ir.summary||{},null,2);
  $("claimReviewGraphSummary").textContent=JSON.stringify(doc.obligation_graph.summary||{},null,2);
}
function renderClaimNode(claimId,seen=new Set()){
  const claim=claimById.get(claimId);
  if(!claim)return null;
  if(seen.has(claimId)){
    const cyc=el("div","claim-review-node open");
    cyc.append(el("strong","",claimId+" · cycle suppressed"));
    return cyc;
  }
  const nextSeen=new Set(seen); nextSeen.add(claimId);
  const c=candidateFor(claimId);
  const cls=classify(claim,c);
  const wrap=el("article","claim-review-node "+cls.key);
  wrap.tabIndex=0;
  wrap.setAttribute("role","button");
  wrap.setAttribute("aria-label","Inspect claim "+claimId);
  const head=el("div","claim-review-node-head");
  const meta=el("div","");
  meta.append(el("span","claim-review-status",cls.label));
  meta.append(el("small","",claimId+" · "+text(claim.kind)));
  head.append(meta);
  const depth=claim?.decomposition?.depth;
  if(Number.isInteger(depth))head.append(el("b","claim-review-depth","depth "+depth));
  wrap.append(head);
  wrap.append(el("h3","",text(claim.statement)));
  wrap.append(el("p","",cls.detail));
  const relation=relationByChild.get(claimId);
  if(relation)wrap.append(el("small","claim-review-relation","Parent relation · "+relation.replaceAll("_"," ")));
  const deps=dependenciesById.get(claimId)||[];
  if(deps.length)wrap.append(el("small","claim-review-deps","Depends on · "+deps.join(", ")));
  wrap.addEventListener("click",()=>renderDetail(claimId));
  wrap.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();renderDetail(claimId)}});

  const childIds=childrenById.get(claimId)||[];
  if(childIds.length){
    const kids=el("div","claim-review-children");
    for(const childId of childIds){
      const node=renderClaimNode(childId,nextSeen);
      if(node)kids.append(node);
    }
    wrap.append(kids);
  }
  return wrap;
}
function renderTree(doc){
  tree.replaceChildren();
  const roots=Array.isArray(doc.claim_ir.roots)&&doc.claim_ir.roots.length
    ? doc.claim_ir.roots
    : doc.claim_ir.claims.filter(c=>!c?.decomposition?.parent_claim_id).map(c=>c.claim_id);
  if(!roots.length){
    tree.append(el("p","claim-review-empty","No Claim IR roots were declared."));
    return;
  }
  for(const id of roots){
    const n=renderClaimNode(id);
    if(n)tree.append(n);
  }
}
function keyValue(container,label,value,code=false){
  const row=el("div","claim-review-detail-row");
  row.append(el("small","",label));
  const v=el(code?"code":"strong","",value);
  row.append(v);
  container.append(row);
}
function renderDetail(claimId){
  const claim=claimById.get(claimId);
  const c=candidateFor(claimId);
  if(!claim)return;
  const cls=classify(claim,c);
  $("claimReviewDetailTitle").textContent=claim.statement||claimId;
  detail.replaceChildren();
  const badge=el("div","claim-review-detail-badge "+cls.key,cls.label);
  detail.append(badge);
  const grid=el("div","claim-review-detail-grid");
  keyValue(grid,"Claim ID",claimId,true);
  keyValue(grid,"Candidate status",text(c.status||claim.candidate_status),true);
  keyValue(grid,"Closure state",text(claim.closure_state),true);
  keyValue(grid,"Relation",text(claim?.decomposition?.relation).replaceAll("_"," "));
  detail.append(grid);

  if(claim.predicate){
    const box=el("section","claim-review-detail-box");
    box.append(el("small","","Exact typed predicate"));
    box.append(el("pre","",JSON.stringify(claim.predicate,null,2)));
    detail.append(box);
  }
  if(c?.formal_target){
    const box=el("section","claim-review-detail-box formal");
    box.append(el("small","","Certified formal target"));
    box.append(el("strong","",text(c.formal_target.soundness_theorem||c.formal_target.checker)));
    box.append(el("p","","PCS has a certified target for this exact check family. This review surface still does not execute Lean."));
    detail.append(box);
  }
  if(c?.validation_target){
    const box=el("section","claim-review-detail-box external");
    box.append(el("small","","External validator target"));
    box.append(el("strong","",text(c.validation_target.validator||c.validation_target.type)));
    box.append(el("p","","PCS can authenticate/bind this result, but scientific validator semantics remain an explicit external trust boundary."));
    detail.append(box);
  }
  const obs=obligations(c);
  if(obs.length){
    const box=el("section","claim-review-detail-box");
    box.append(el("small","","Open/review obligations"));
    const list=el("div","claim-review-obligation-list");
    for(const o of obs){
      const item=el("div",o.blocking===true?"blocking":"review");
      item.append(el("strong","",text(o.kind).replaceAll("_"," ")));
      item.append(el("span","",text(o.message)));
      list.append(item);
    }
    box.append(list);
    detail.append(box);
  }
  if(claim?.authority?.children_can_set_parent_authority===false){
    const box=el("section","claim-review-detail-box boundary");
    box.append(el("small","","Composition authority"));
    box.append(el("strong","","Closed children do not automatically prove this parent."));
    box.append(el("p","","PCS requires an explicit certified composition rule or human scientific review before a broader parent statement can be treated as closed."));
    detail.append(box);
  }
}
function render(doc,source){
  validate(doc);
  current=doc;
  index(doc);
  renderSummary(doc);
  renderTree(doc);
  workspace.hidden=false;
  $("claimReviewSource").textContent=source;
  const roots=doc.claim_ir.roots||[];
  $("claimReviewTitle").textContent=roots.length===1&&claimById.get(roots[0])?.statement
    ? claimById.get(roots[0]).statement
    : "Recursive scientific claim review";
  $("claimReviewSubtitle").textContent=
    "Reviewing "+doc.claim_ir.claims.length+" claim nodes. This is a translation/decomposition view, not an authoritative verifier result.";
  message.textContent="Loaded "+source+". Review the dependency tree and remaining authority boundaries below.";
  if(roots[0])renderDetail(roots[0]);
}
$("claimReviewChoose").addEventListener("click",()=>fileInput.click());
fileInput.addEventListener("change",async()=>{
  const file=fileInput.files?.[0];
  if(!file)return;
  try{
    const doc=JSON.parse(await file.text());
    render(doc,file.name);
  }catch(err){
    workspace.hidden=true;
    message.textContent="Could not open translation: "+(err?.message||String(err));
  }finally{
    fileInput.value="";
  }
});
$("claimReviewExample").addEventListener("click",()=>{
  try{render(JSON.parse(JSON.stringify(example)),"SYNTHETIC RECURSIVE EXAMPLE")}
  catch(err){message.textContent="Example error: "+(err?.message||String(err))}
});
})();
