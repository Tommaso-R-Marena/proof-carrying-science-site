(() => {
"use strict";
const $=id=>document.getElementById(id);
const dec=new TextDecoder("utf-8",{fatal:true});
const CONTROL=new Set(["certificate_signature.json","package_manifest.json","package_signature.json"]);
let current=null, receipt=null;
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
const short=s=>s?String(s).slice(0,12)+"…"+String(s).slice(-8):"—";
const hex=b=>[...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,"0")).join("");
async function sha256(bytes){return hex(await crypto.subtle.digest("SHA-256",bytes));}
function u16(v,o){return v.getUint16(o,true)} function u32(v,o){return v.getUint32(o,true)}
function safeName(name){
  if(!name||name.startsWith("/")||name.endsWith("/")||name.includes("\\")||name.includes("\0")) throw Error("unsafe ZIP member path: "+name);
  const parts=name.split("/");
  if(parts.some(x=>!x||x==="."||x==="..")) throw Error("non-canonical ZIP member path: "+name);
  if(name.normalize("NFC")!==name) throw Error("non-NFC ZIP member path: "+name);
}
function parseZip(buffer){
  if(buffer.byteLength>128*1024*1024) throw Error("archive exceeds 128 MiB browser inspection limit");
  const v=new DataView(buffer), bytes=new Uint8Array(buffer);
  let e=-1, min=Math.max(0,buffer.byteLength-65557);
  for(let i=buffer.byteLength-22;i>=min;i--){if(u32(v,i)===0x06054b50){e=i;break}}
  if(e<0) throw Error("ZIP end-of-central-directory record not found");
  if(u16(v,e+4)!==0||u16(v,e+6)!==0) throw Error("multi-disk ZIP archives are not supported");
  const n=u16(v,e+10), cdSize=u32(v,e+12), cdOff=u32(v,e+16), comment=u16(v,e+20);
  if(e+22+comment!==buffer.byteLength) throw Error("trailing bytes after ZIP end record");
  if(cdOff+cdSize!==e) throw Error("central directory byte range is not canonical");
  const entries=new Map(), ranges=[]; let p=cdOff;
  for(let i=0;i<n;i++){
    if(p+46>e||u32(v,p)!==0x02014b50) throw Error("malformed central-directory entry");
    const flags=u16(v,p+8), method=u16(v,p+10), comp=u32(v,p+20), size=u32(v,p+24), nl=u16(v,p+28), xl=u16(v,p+30), cl=u16(v,p+32), lo=u32(v,p+42);
    if(flags & 1) throw Error("encrypted ZIP members are not supported");
    if(flags & 8) throw Error("data-descriptor ZIP members are not canonical PCS bundles");
    if(flags & ~0x0800) throw Error("unsupported ZIP general-purpose flags");
    if(method!==0||comp!==size) throw Error("PCS v0.6 bundles must use ZIP_STORED members");
    const name=dec.decode(bytes.slice(p+46,p+46+nl)); safeName(name);
    if(entries.has(name)) throw Error("duplicate ZIP member: "+name);
    if(lo+30>cdOff||u32(v,lo)!==0x04034b50) throw Error("malformed local header: "+name);
    const lf=u16(v,lo+6), lm=u16(v,lo+8), lcomp=u32(v,lo+18), lsize=u32(v,lo+22), lnl=u16(v,lo+26), lxl=u16(v,lo+28);
    if(lf!==flags||lm!==method||lcomp!==comp||lsize!==size) throw Error("local/central ZIP metadata mismatch: "+name);
    const lname=dec.decode(bytes.slice(lo+30,lo+30+lnl)); if(lname!==name) throw Error("local/central ZIP filename mismatch: "+name);
    const start=lo+30+lnl+lxl,end=start+size; if(end>cdOff) throw Error("ZIP member overlaps central directory: "+name);
    for(const [a,b] of ranges){if(start<b&&end>a) throw Error("overlapping ZIP member data");}
    ranges.push([start,end]); entries.set(name,{name,size,bytes:bytes.slice(start,end)});
    p+=46+nl+xl+cl;
  }
  if(p!==e) throw Error("central directory size/count mismatch");
  for(const c of [...CONTROL,"certificate.json"]){if(!entries.has(c)) throw Error("required PCS control/member missing: "+c);}
  return entries;
}
function jsonEntry(entries,name){try{return JSON.parse(dec.decode(entries.get(name).bytes))}catch(e){throw Error("invalid JSON in "+name+": "+e.message)}}
async function analyze(buffer,name){
  const entries=parseZip(buffer), manifest=jsonEntry(entries,"package_manifest.json"), cert=jsonEntry(entries,"certificate.json");
  const certSig=jsonEntry(entries,"certificate_signature.json"), pkgSig=jsonEntry(entries,"package_signature.json");
  const index=entries.has("normalized/index.json")?jsonEntry(entries,"normalized/index.json"):null;
  const bundleHash=await sha256(buffer);
  const expected=manifest.files&&typeof manifest.files==="object"?manifest.files:{};
  const actualSigned=[...entries.keys()].filter(x=>!CONTROL.has(x)).sort();
  const expectedNames=Object.keys(expected).sort();
  const exact=JSON.stringify(actualSigned)===JSON.stringify(expectedNames);
  const rows=[]; let hashesOk=exact;
  for(const member of expectedNames){
    const e=entries.get(member), m=expected[member];
    if(!e){rows.push({name:member,size:null,hash:null,ok:false,why:"missing"});hashesOk=false;continue}
    const h=await sha256(e.bytes); const ok=Number(m.size)===e.size&&String(m.sha256).toLowerCase()===h;
    if(!ok) hashesOk=false; rows.push({name:member,size:e.size,hash:h,ok,why:ok?"bound":"size/hash mismatch"});
  }
  const certBound=manifest.certificate_semantic_hash===cert.semantic_hash&&manifest.certificate_integrity_hash===cert.integrity_hash;
  const packageFormat=manifest.package_format==="pcs-package-v2"&&cert.spec_version==="pcs-0.6";
  return {name,buffer,entries,manifest,cert,certSig,pkgSig,index,bundleHash,rows,exact,hashesOk,certBound,packageFormat};
}
function chip(ok,a="PASS",b="CHECK"){return '<span class="chip '+(ok?"verified":"open")+'">'+esc(ok?a:b)+'</span>'}
function idMap(items){return new Map((Array.isArray(items)?items:[]).filter(x=>x&&x.id).map(x=>[x.id,x]));}
function uniq(xs){return [...new Set(xs.filter(Boolean))];}
const LEAN_CERTIFIED_EVIDENCE_TYPES=new Set(["reaction_balance","unit_compatible","csv_disjoint","pkpd_contract","pkpd_reference_match"]);
function evidenceCoverage(e){
  const type=e?.check_spec?.type||"";
  return {
    type,
    certified:LEAN_CERTIFIED_EVIDENCE_TYPES.has(type),
    label:LEAN_CERTIFIED_EVIDENCE_TYPES.has(type)?"LEAN-CERTIFIED":"EXTERNAL / UNVERIFIED"
  };
}
function coverageSummary(cert){
  const evidence=Array.isArray(cert?.evidence)?cert.evidence:[];
  const classified=evidence.map(e=>({e,coverage:evidenceCoverage(e)}));
  const certified=classified.filter(x=>x.coverage.certified);
  return {
    total:evidence.length,
    certified:certified.length,
    external:evidence.length-certified.length,
    certified_types:uniq(certified.map(x=>x.coverage.type)).sort()
  };
}
function receiptCommitments(x){
  if(!receipt||!x) return {attached:!!receipt,matches:[],all:false};
  const matches=[
    ["bundle_sha256",receipt.bundle_sha256,x.bundleHash],
    ["certificate_semantic_hash",receipt.certificate_semantic_hash,x.cert.semantic_hash],
    ["certificate_integrity_hash",receipt.certificate_integrity_hash,x.cert.integrity_hash],
    ["normalized_index_semantic_hash",receipt.normalized_index_semantic_hash,x.index?.index_semantic_hash]
  ].filter(v=>v[1]!=null&&v[2]!=null);
  return {attached:true,matches,all:matches.length>0&&matches.every(v=>v[1]===v[2])};
}
function renderAuthorityKpi(x){
  const el=$("authorityState"); if(!el||!x)return;
  const state=receiptCommitments(x);
  const detail=el.nextElementSibling;
  if(!receipt){el.textContent="INSPECTED";if(detail)detail.textContent="authoritative verification remains external";return}
  if(!state.all){el.textContent="RECEIPT MISMATCH";if(detail)detail.textContent="attached receipt does not bind this exact package";return}
  if(receipt.valid===true&&receipt.authoritative===true){
    el.textContent="LEAN-AUTHORITATIVE";
    if(detail)detail.textContent=receipt.accepted===true?"PCS-valid · reviewer policy accepted":"PCS-valid · reviewer policy not accepted";
    return;
  }
  el.textContent=receipt.valid===true?"RECEIPT MATCHED":"REJECTED";
  if(detail)detail.textContent=receipt.failed_stage?("failed at "+receipt.failed_stage):"receipt matched; Lean authority not established";
}
function upstreamTrace(cert,seedArtifacts){
  const nodes=Array.isArray(cert.workflow?.nodes)?cert.workflow.nodes:[];
  const producers=new Map();
  for(const node of nodes) for(const out of (node.outputs||[])) producers.set(out,node);
  const artifacts=new Set(seedArtifacts), workflow=new Map(), stack=[...seedArtifacts];
  while(stack.length){
    const aid=stack.pop(), node=producers.get(aid);
    if(!node||workflow.has(node.id))continue;
    workflow.set(node.id,node);
    for(const input of (node.inputs||[])) if(!artifacts.has(input)){artifacts.add(input);stack.push(input)}
  }
  return {artifactIds:[...artifacts],nodes:[...workflow.values()]};
}
function claimRelation(x,claim){
  const evidenceMap=idMap(x.cert.evidence), artifactMap=idMap(x.cert.artifacts), assumptionMap=idMap(x.cert.assumptions);
  const evidenceIds=uniq([...(claim.required_evidence||[]),...(x.cert.evidence||[]).filter(e=>(e.claim_ids||[]).includes(claim.id)).map(e=>e.id)]);
  const evidence=evidenceIds.map(id=>evidenceMap.get(id)).filter(Boolean);
  const seedArtifacts=uniq(evidence.flatMap(e=>e.artifact_ids||[]));
  const upstream=upstreamTrace(x.cert,seedArtifacts);
  const artifacts=upstream.artifactIds.map(id=>artifactMap.get(id)).filter(Boolean);
  const assumptions=(claim.assumptions||[]).map(id=>assumptionMap.get(id)).filter(Boolean);
  const decision=(x.index?.entries||[]).find(d=>d.claim_id===claim.id)||null;
  return {assumptions,evidence,artifacts,workflow:upstream.nodes,decision};
}
function artifactBinding(x,a){
  const declared=x.manifest.files?.[a.path];
  if(!declared)return {ok:null,label:"certificate reference"};
  const ok=declared.sha256===a.sha256;
  return {ok,label:ok?"manifest-bound":"hash differs"};
}
function supportState(status){
  if(status==="FALSIFIED_OR_CHECK_FAILED"||status==="FAIL")return false;
  if(["FORMALLY_VERIFIED_UNDER_ASSUMPTIONS","COMPUTATIONALLY_SUPPORTED","EMPIRICALLY_VALIDATED_WITHIN_SCOPE","MIXED_SUPPORT_UNDER_ASSUMPTIONS","PASS"].includes(status))return true;
  return null;
}
function graphNode(kind,title,meta,status,attrs=""){
  const cls=status===true?" pass":status===false?" fail":"";
  return '<div class="graph-node '+kind+cls+'" '+attrs+'><strong>'+esc(title)+'</strong>'+(meta?'<small>'+esc(meta)+'</small>':"")+'</div>';
}
function renderAssuranceGraph(x){
  const box=$("assuranceGraph"); if(!box||!x)return;
  const allClaims=Array.isArray(x.cert.claims)?x.cert.claims:[];
  const focus=$("claimFocus")?.value||"all";
  const claims=focus==="all"?allClaims:allClaims.filter(c=>c.id===focus);
  if(!claims.length){box.innerHTML='<p class="muted">No claims available for graphing.</p>';return}
  const rs=receiptCommitments(x);
  box.innerHTML=claims.map(claim=>{
    const rel=claimRelation(x,claim);
    const assumptionNodes=rel.assumptions.length?rel.assumptions.map(a=>graphNode("assumption",a.id,a.statement,null)).join(""):graphNode("empty","No declared assumptions","claim is not scoped to a certificate assumption",null);
    const artifactNodes=rel.artifacts.length?rel.artifacts.map(a=>{const b=artifactBinding(x,a);return graphNode("artifact",a.id,(a.role||"artifact")+" · "+b.label,b.ok,'role="button" tabindex="0" data-impact-artifact="'+esc(a.id)+'"')}).join(""):graphNode("empty","No artifact dependency","evidence may be self-contained or declarative",null);
    const workflowNodes=rel.workflow.length?'<div class="graph-workflow">'+rel.workflow.map(n=>'<span>'+esc(n.id)+" · "+esc(n.operation)+'</span>').join("")+'</div>':"";
    const evidenceNodes=rel.evidence.length?rel.evidence.map(e=>{const cov=evidenceCoverage(e);return graphNode("evidence",e.id,(e.kind||"evidence")+" · "+(e.outcome||"UNVERIFIED")+" · "+cov.label+(cov.type?" · "+cov.type:""),e.outcome==="PASS")}).join(""):graphNode("empty","No linked evidence","claim has no resolved evidence link",false);
    const claimNode=graphNode("claim",claim.id,(claim.kind||"claim")+" · "+(claim.predicate?.type||"unknown predicate"),supportState(claim.assessment?.status));
    const decisionNode=rel.decision?graphNode("decision",rel.decision.decision,rel.decision.claim_id+" · "+short(rel.decision.wire_semantic_hash),supportState(rel.decision.decision)):graphNode("empty","No normalized decision","index entry not found",false);
    let authNode;
    if(!receipt) authNode=graphNode("authority","Authority external","Attach a production verifier receipt",null);
    else if(!rs.all) authNode=graphNode("authority","Receipt mismatch","commitments do not identify this exact package",false);
    else if(receipt.valid===true&&receipt.authoritative===true) authNode=graphNode("authority","Lean authority ACCEPT",receipt.accepted===true?"PCS-valid · policy accepted":"PCS-valid · policy not accepted",true);
    else authNode=graphNode("authority",receipt.valid===true?"Receipt matched":"Verifier rejected",receipt.failed_stage||"authoritative acceptance not established",receipt.valid===true?null:false);
    return '<article class="claim-path"><header><div><span>CLAIM PATH</span><h3>'+esc(claim.id)+" · "+esc(claim.statement||"")+'</h3></div><button type="button" data-focus-claim="'+esc(claim.id)+'">Focus</button></header><div class="claim-path-grid"><div class="graph-stage"><b>1 · Assumptions</b>'+assumptionNodes+'</div><div class="graph-arrow" aria-hidden="true">→</div><div class="graph-stage"><b>2 · Artifacts & workflow</b>'+artifactNodes+workflowNodes+'</div><div class="graph-arrow" aria-hidden="true">→</div><div class="graph-stage"><b>3 · Evidence</b>'+evidenceNodes+'</div><div class="graph-arrow" aria-hidden="true">→</div><div class="graph-stage"><b>4 · Typed claim</b>'+claimNode+'</div><div class="graph-arrow" aria-hidden="true">→</div><div class="graph-stage"><b>5 · Normalized decision</b>'+decisionNode+'</div><div class="graph-arrow" aria-hidden="true">→</div><div class="graph-stage"><b>6 · Authority / policy</b>'+authNode+'</div></div></article>';
  }).join("");
}
function populateExplorerControls(x){
  const claimSelect=$("claimFocus"), impactSelect=$("impactArtifact");
  if(claimSelect){
    const prior=claimSelect.value;
    claimSelect.innerHTML='<option value="all">All claims</option>'+(x.cert.claims||[]).map(c=>'<option value="'+esc(c.id)+'">'+esc(c.id+" · "+(c.statement||""))+'</option>').join("");
    if([...claimSelect.options].some(o=>o.value===prior))claimSelect.value=prior;
  }
  if(impactSelect){
    const prior=impactSelect.value, artifacts=Array.isArray(x.cert.artifacts)?x.cert.artifacts:[];
    impactSelect.innerHTML='<option value="">'+(artifacts.length?"Select an artifact":"No declared certificate artifacts")+'</option>'+artifacts.map(a=>'<option value="'+esc(a.id)+'">'+esc(a.id+" · "+a.path)+'</option>').join("");
    impactSelect.disabled=!artifacts.length;
    $("runImpact").disabled=!artifacts.length;
    if([...impactSelect.options].some(o=>o.value===prior))impactSelect.value=prior;
  }
}
function impactFromArtifact(cert,artifactId){
  const nodes=Array.isArray(cert.workflow?.nodes)?cert.workflow.nodes:[], consumers=new Map();
  for(const node of nodes) for(const aid of (node.inputs||[])){if(!consumers.has(aid))consumers.set(aid,[]);consumers.get(aid).push(node)}
  const affectedArtifacts=new Set([artifactId]), affectedNodes=new Set(), queue=[artifactId];
  while(queue.length){
    const aid=queue.shift();
    for(const node of (consumers.get(aid)||[])){
      if(node.id)affectedNodes.add(node.id);
      for(const out of (node.outputs||[]))if(!affectedArtifacts.has(out)){affectedArtifacts.add(out);queue.push(out)}
    }
  }
  const affectedEvidence=new Set(), affectedClaims=new Set();
  for(const e of (cert.evidence||[]))if((e.artifact_ids||[]).some(a=>affectedArtifacts.has(a))){if(e.id)affectedEvidence.add(e.id);for(const cid of (e.claim_ids||[]))affectedClaims.add(cid)}
  for(const cl of (cert.claims||[]))if((cl.required_evidence||[]).some(e=>affectedEvidence.has(e)))affectedClaims.add(cl.id);
  return {changed_artifacts:[artifactId],affected_artifacts:[...affectedArtifacts].sort(),affected_workflow_nodes:[...affectedNodes].sort(),affected_evidence:[...affectedEvidence].sort(),affected_claims:[...affectedClaims].filter(Boolean).sort()};
}
function impactGroup(title,items,kind){
  return '<div class="impact-group '+kind+'"><span>'+esc(title)+'</span><strong>'+items.length+'</strong><div>'+(items.length?items.map(x=>'<code>'+esc(x)+'</code>').join(""):'<em>none</em>')+'</div></div>';
}
function renderImpact(x,artifactId){
  const box=$("impactResult"); if(!box||!x)return;
  if(!artifactId){box.innerHTML='<p class="muted">Select an artifact to trace its downstream impact.</p>';return}
  const r=impactFromArtifact(x.cert,artifactId);
  box.innerHTML='<div class="impact-summary"><strong>Changing <code>'+esc(artifactId)+'</code> conservatively invalidates the following downstream assurance dependencies.</strong><p>This is dependency impact, not a claim that the new artifact is scientifically wrong.</p></div><div class="impact-groups">'+impactGroup("Affected artifacts",r.affected_artifacts,"artifact")+impactGroup("Workflow nodes",r.affected_workflow_nodes,"workflow")+impactGroup("Evidence",r.affected_evidence,"evidence")+impactGroup("Claims",r.affected_claims,"claim")+'</div>';
}
function inspectionReport(x){
  const rs=receiptCommitments(x);
  return {
    format:"pcs-browser-inspection-report-v1",
    generated_at:new Date().toISOString(),
    browser_authoritative:false,
    bundle:{name:x.name,sha256:x.bundleHash,bytes:x.buffer.byteLength},
    inspection:{pcs_v06_format:x.packageFormat,exact_signed_member_set:x.exact,manifest_member_hashes_match:x.hashesOk,certificate_manifest_binding:x.certBound},
    certificate:{spec_version:x.cert.spec_version,checker_version:x.cert.checker_version,subject:x.cert.subject,mission_scope:x.cert.mission_scope,semantic_hash:x.cert.semantic_hash,integrity_hash:x.cert.integrity_hash,counts:{claims:(x.cert.claims||[]).length,evidence:(x.cert.evidence||[]).length,artifacts:(x.cert.artifacts||[]).length,workflow_nodes:(x.cert.workflow?.nodes||[]).length}},
    claims:(x.cert.claims||[]).map(cl=>({id:cl.id,kind:cl.kind,predicate_type:cl.predicate?.type,assessment_status:cl.assessment?.status,required_evidence:cl.required_evidence||[],assumptions:cl.assumptions||[]})),
    formal_coverage:coverageSummary(x.cert),
    evidence:(x.cert.evidence||[]).map(e=>{const cov=evidenceCoverage(e);return {id:e.id,kind:e.kind,outcome:e.outcome,checker:e.checker,check_type:cov.type||null,formal_coverage:cov.certified?"LEAN_CERTIFIED_BUILTIN":"OUTSIDE_CERTIFIED_BUILTIN_SET",claim_ids:e.claim_ids||[],artifact_ids:e.artifact_ids||[]}}),
    workflow:(x.cert.workflow?.nodes||[]).map(n=>({id:n.id,operation:n.operation,inputs:n.inputs||[],outputs:n.outputs||[],contract_type:n.contract?.type})),
    normalized_decisions:(x.index?.entries||[]).map(d=>({claim_id:d.claim_id,decision:d.decision,path:d.path,wire_semantic_hash:d.wire_semantic_hash})),
    receipt:receipt?{attached:true,commitments_match:rs.all,valid:receipt.valid,authoritative:receipt.authoritative,accepted:receipt.accepted,failed_stage:receipt.failed_stage||null,stages:receipt.stages||null,lean_authority:receipt.lean_authority?{accepted:receipt.lean_authority.accepted,verdict:receipt.lean_authority.verdict,mode:receipt.lean_authority.mode,authority_sha256:receipt.lean_authority.authority_sha256,observation_transcript_sha256:receipt.lean_authority.observation_transcript_sha256}:null}:{attached:false}
  };
}
function downloadInspectionReport(x){
  const report=inspectionReport(x), blob=new Blob([JSON.stringify(report,null,2)+"\n"],{type:"application/json"}), url=URL.createObjectURL(blob), a=document.createElement("a");
  const stem=(x.name||"pcs-package").replace(/[^A-Za-z0-9._-]+/g,"-").replace(/\.pcs\.zip$|\.zip$/i,"");
  a.href=url;a.download=stem+".inspection.json";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
}
function render(x){
  current=x;$("inspectorSummary").hidden=false;$("bundleHash").textContent=x.bundleHash;$("bundleSize").textContent=x.buffer.byteLength.toLocaleString()+" archive bytes";
  populateExplorerControls(x);
  const cov=coverageSummary(x.cert);
  $("certifiedCoverage").textContent=cov.total?cov.certified+"/"+cov.total:"0/0";
  $("certifiedCoverageDetail").textContent=cov.total?(cov.certified_types.length?cov.certified_types.join(", "):"no certified built-in evidence in this package"):"no evidence items";
  $("archiveState").textContent=x.packageFormat?"PCS v0.6":"CHECK";$("memberCount").textContent=x.entries.size+" ZIP members";
  const bind=x.hashesOk&&x.certBound;$("bindingState").textContent=bind?"MATCH":"CHECK";$("bindingDetail").textContent=bind?"exact signed member set + hashes match":"one or more bindings differ";
  $("memberRows").innerHTML=x.rows.map(r=>'<tr><td><code>'+esc(r.name)+'</code></td><td>'+(r.size??"—")+'</td><td><code>'+esc(short(r.hash))+'</code></td><td>'+chip(r.ok,"MATCH","MISMATCH")+'</td></tr>').join("");
  const claims=Array.isArray(x.cert.claims)?x.cert.claims:[];
  $("claimCards").innerHTML=claims.length?claims.map(c=>'<article class="inspector-claim"><header><strong>'+esc(c.id)+" · "+esc(c.kind)+'</strong><span>'+esc(c.assessment?.status||"UNASSESSED")+'</span></header><p>'+esc(c.statement||"")+'</p><code>'+esc(JSON.stringify(c.predicate||{}))+'</code><small>Evidence: '+esc((c.required_evidence||[]).join(", ")||"none")+'</small></article>').join(""):'<p>No claims found.</p>';
  const decisions=x.index?.entries||[];
  $("decisionCards").innerHTML=decisions.length?decisions.map(d=>'<article class="inspector-decision"><strong>'+esc(d.claim_id)+'</strong><span>'+esc(d.decision)+'</span><small>'+esc(short(d.wire_semantic_hash))+'</small></article>').join(""):'<p>No normalized decision index found.</p>';
  const sigs=[["Certificate",x.certSig],["Package",x.pkgSig]];
  $("signatureCards").innerHTML=sigs.map(([label,s])=>'<div class="signature-card"><span>'+label+' signature</span><strong>'+esc(s.algorithm||"—")+'</strong><small>domain: '+esc(s.payload?.domain||"—")+'</small><small>fingerprint: <code>'+esc(short(s.public_key_fingerprint))+'</code></small><em>Record inspected; cryptographic verification requires trusted public key/authoritative verifier.</em></div>').join("");
  const checks=[
    ["ZIP byte structure",true,"Parsed deterministic stored ZIP without extraction."],
    ["Manifest member set",x.exact,x.exact?"Archive members exactly match manifest-signed files plus control files.":"Archive/member set differs from manifest."],
    ["Manifest SHA-256 bindings",x.hashesOk,x.hashesOk?"Every signed member re-hashed and matched.":"At least one member failed size/hash binding."],
    ["Certificate ↔ manifest",x.certBound,x.certBound?"Semantic/integrity hash fields agree.":"Certificate commitment fields differ."],
    ["Ed25519 authenticity",null,"Requires trusted receiver public key; not asserted by browser inspection."],
    ["Scientific replay",null,"Requires supported checker replay over delivered evidence."],
    ["Lean authority",null,"Production valid:true requires compiled Lean acceptance."]
  ];
  $("boundaryCards").innerHTML=checks.map(([t,s,d])=>'<article class="boundary-card '+(s===true?"pass":s===false?"fail":"open")+'"><span>'+(s===true?"✓":s===false?"×":"○")+'</span><div><strong>'+esc(t)+'</strong><p>'+esc(d)+'</p></div></article>').join("");
  $("dropStatus").textContent=x.name+" inspected locally.";
  renderAuthorityKpi(x);
  renderAssuranceGraph(x);
  renderImpact(x,$("impactArtifact")?.value||"");
  renderReceipt();
}
function renderReceipt(){
  const box=$("receiptCards"); if(!receipt){box.innerHTML="";if(current){renderAuthorityKpi(current);renderAssuranceGraph(current)}return}
  if(!current){$("receiptStatus").textContent="Receipt loaded. Open its corresponding bundle to cross-check commitments.";return}
  const state=receiptCommitments(current), matches=state.matches;
  $("receiptStatus").textContent=(state.all?"Receipt commitments match this inspected package. ":"Receipt commitment mismatch detected. ")+"The browser is displaying the receipt's assertions, not independently recreating Lean/replay authority.";
  const lean=receipt.lean_authority;
  box.innerHTML='<div class="receipt-mini"><span>valid</span><strong>'+esc(String(receipt.valid))+'</strong></div><div class="receipt-mini"><span>authoritative</span><strong>'+esc(String(receipt.authoritative))+'</strong></div><div class="receipt-mini"><span>accepted</span><strong>'+esc(String(receipt.accepted))+'</strong></div>'+(lean?'<div class="receipt-mini"><span>Lean authority</span><strong>'+esc(String(lean.verdict||lean.accepted))+'</strong></div>':"")+matches.map(([k,a,b])=>'<div class="receipt-match"><code>'+esc(k)+'</code>'+chip(a===b,"MATCH","MISMATCH")+'</div>').join("");
  renderAuthorityKpi(current);renderAssuranceGraph(current);
}
async function inspectFile(file){
  $("dropStatus").textContent="Inspecting "+file.name+"…"; try{render(await analyze(await file.arrayBuffer(),file.name))}catch(e){$("dropStatus").textContent="Rejected: "+e.message;$("inspectorSummary").hidden=true}
}
$("bundleInput").addEventListener("change",e=>{const f=e.target.files?.[0];if(f) inspectFile(f)});
$("receiptInput").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{receipt=JSON.parse(await f.text());renderReceipt()}catch(err){$("receiptStatus").textContent="Receipt rejected: "+err.message}});
$("loadGolden").addEventListener("click",async()=>{try{$("dropStatus").textContent="Loading v0.6 golden fixture…";const r=await fetch("pcs-v06-golden.pcs.zip");if(!r.ok)throw Error("example fetch failed");const b=await r.arrayBuffer();render(await analyze(b,"PCS v0.6 golden fixture"))}catch(e){$("dropStatus").textContent="Example failed: "+e.message}});
$("claimFocus").addEventListener("change",()=>{if(current)renderAssuranceGraph(current)});
$("resetClaimFocus").addEventListener("click",()=>{if(!current)return;$("claimFocus").value="all";renderAssuranceGraph(current)});
$("runImpact").addEventListener("click",()=>{if(current)renderImpact(current,$("impactArtifact").value)});
$("impactArtifact").addEventListener("change",()=>{if(current&&$("impactArtifact").value)renderImpact(current,$("impactArtifact").value)});
$("assuranceGraph").addEventListener("click",e=>{
  const focus=e.target.closest("[data-focus-claim]"); if(focus&&current){$("claimFocus").value=focus.dataset.focusClaim;renderAssuranceGraph(current);return}
  const artifact=e.target.closest("[data-impact-artifact]"); if(artifact&&current){$("impactArtifact").value=artifact.dataset.impactArtifact;renderImpact(current,artifact.dataset.impactArtifact);$("impactResult").scrollIntoView({behavior:"smooth",block:"nearest"})}
});
$("assuranceGraph").addEventListener("keydown",e=>{if((e.key==="Enter"||e.key===" ")&&e.target.matches("[data-impact-artifact]")){e.preventDefault();e.target.click()}});
$("downloadInspection").addEventListener("click",()=>{if(current)downloadInspectionReport(current)});
const drop=$("inspectorDrop");["dragenter","dragover"].forEach(k=>drop.addEventListener(k,e=>{e.preventDefault();drop.classList.add("drag")}));["dragleave","drop"].forEach(k=>drop.addEventListener(k,e=>{e.preventDefault();drop.classList.remove("drag")}));drop.addEventListener("drop",e=>{const f=[...e.dataTransfer.files].find(x=>/\.zip$/i.test(x.name));if(f)inspectFile(f)});
})();