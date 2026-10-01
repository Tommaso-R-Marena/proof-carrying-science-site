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
function render(x){
  current=x;$("inspectorSummary").hidden=false;$("bundleHash").textContent=x.bundleHash;$("bundleSize").textContent=x.buffer.byteLength.toLocaleString()+" archive bytes";
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
  renderReceipt();
}
function renderReceipt(){
  const box=$("receiptCards"); if(!receipt){box.innerHTML="";return}
  if(!current){$("receiptStatus").textContent="Receipt loaded. Open its corresponding bundle to cross-check commitments.";return}
  const matches=[
    ["bundle_sha256",receipt.bundle_sha256,current.bundleHash],
    ["certificate_semantic_hash",receipt.certificate_semantic_hash,current.cert.semantic_hash],
    ["certificate_integrity_hash",receipt.certificate_integrity_hash,current.cert.integrity_hash],
    ["normalized_index_semantic_hash",receipt.normalized_index_semantic_hash,current.index?.index_semantic_hash]
  ].filter(x=>x[1]!=null&&x[2]!=null);
  const all=matches.every(x=>x[1]===x[2]);
  $("receiptStatus").textContent=(all?"Receipt commitments match this inspected package. ":"Receipt commitment mismatch detected. ")+"The browser is displaying the receipt's assertions, not independently recreating Lean/replay authority.";
  box.innerHTML='<div class="receipt-mini"><span>valid</span><strong>'+esc(String(receipt.valid))+'</strong></div><div class="receipt-mini"><span>authoritative</span><strong>'+esc(String(receipt.authoritative))+'</strong></div><div class="receipt-mini"><span>accepted</span><strong>'+esc(String(receipt.accepted))+'</strong></div>'+matches.map(([k,a,b])=>'<div class="receipt-match"><code>'+esc(k)+'</code>'+chip(a===b,"MATCH","MISMATCH")+'</div>').join("");
}
async function inspectFile(file){
  $("dropStatus").textContent="Inspecting "+file.name+"…"; try{render(await analyze(await file.arrayBuffer(),file.name))}catch(e){$("dropStatus").textContent="Rejected: "+e.message;$("inspectorSummary").hidden=true}
}
$("bundleInput").addEventListener("change",e=>{const f=e.target.files?.[0];if(f) inspectFile(f)});
$("receiptInput").addEventListener("change",async e=>{const f=e.target.files?.[0];if(!f)return;try{receipt=JSON.parse(await f.text());renderReceipt()}catch(err){$("receiptStatus").textContent="Receipt rejected: "+err.message}});
$("loadGolden").addEventListener("click",async()=>{try{$("dropStatus").textContent="Loading v0.6 golden fixture…";const r=await fetch("pcs-v06-golden.pcs.zip");if(!r.ok)throw Error("example fetch failed");const b=await r.arrayBuffer();render(await analyze(b,"PCS v0.6 golden fixture"))}catch(e){$("dropStatus").textContent="Example failed: "+e.message}});
const drop=$("inspectorDrop");["dragenter","dragover"].forEach(k=>drop.addEventListener(k,e=>{e.preventDefault();drop.classList.add("drag")}));["dragleave","drop"].forEach(k=>drop.addEventListener(k,e=>{e.preventDefault();drop.classList.remove("drag")}));drop.addEventListener("drop",e=>{const f=[...e.dataTransfer.files].find(x=>/\.zip$/i.test(x.name));if(f)inspectFile(f)});
})();