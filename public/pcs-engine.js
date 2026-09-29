(function(global){
"use strict";

const FORMAL="FORMALLY_VERIFIED_UNDER_ASSUMPTIONS";
const COMPUTATIONAL="COMPUTATIONALLY_SUPPORTED";
const EMPIRICAL="EMPIRICALLY_VALIDATED_WITHIN_SCOPE";
const MIXED="MIXED_SUPPORT_UNDER_ASSUMPTIONS";
const OPEN="OPEN";
const FAILED="FALSIFIED_OR_CHECK_FAILED";
const enc=new TextEncoder();
const dec=new TextDecoder("utf-8",{fatal:true});

function clone(x){return JSON.parse(JSON.stringify(x));}
function bytesOf(s){return enc.encode(s);}
function fileBytes(entry){
  if(!entry)throw new Error("missing file entry");
  if(entry.encoding==="base64")return b64bytes(entry.content||"");
  return bytesOf(String(entry.content??""));
}
function fileText(entry){
  if(!entry)throw new Error("missing file entry");
  return entry.encoding==="base64"?dec.decode(fileBytes(entry)):String(entry.content??"");
}
function hex(buf){return [...new Uint8Array(buf)].map(x=>x.toString(16).padStart(2,"0")).join("");}
async function sha256Bytes(bytes){return hex(await crypto.subtle.digest("SHA-256",bytes));}
async function sha256Text(s){return sha256Bytes(bytesOf(s));}
function canonicalJson(v){
  if(v===null||typeof v!=="object")return JSON.stringify(v);
  if(Array.isArray(v))return "["+v.map(canonicalJson).join(",")+"]";
  return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+canonicalJson(v[k])).join(",")+"}";
}
function sameArray(a,b){return JSON.stringify(a||[])===JSON.stringify(b||[]);}
function deepEqual(a,b){return canonicalJson(a)===canonicalJson(b);}

function assessClaim(claim,evidenceMap){
  const ids=[...(claim.required_evidence||[])];
  const req=ids.filter(id=>Object.prototype.hasOwnProperty.call(evidenceMap,id)).map(id=>evidenceMap[id]);
  if(req.length!==ids.length)return {status:OPEN,reason:"required evidence missing"};
  if(req.some(e=>e.outcome==="FAIL"))return {status:FAILED,reason:"at least one required check failed"};
  if(req.some(e=>e.outcome==="UNVERIFIED"))return {status:OPEN,reason:"at least one required evidence object is not independently verified"};
  if(!req.length)return {status:OPEN,reason:"no evidence supplied"};
  const kind=claim.kind||"computational";
  const kinds=new Set(req.map(e=>e.kind));
  if(kind==="formal"){
    const allFormal=[...kinds].every(k=>k==="formal_proof")&&req.every(e=>e.outcome==="PASS");
    return allFormal?{status:FORMAL,reason:"all declared formal obligations independently accepted"}:{status:OPEN,reason:"formal claim lacks independently accepted formal evidence"};
  }
  if(kind==="empirical"){
    return (kinds.has("empirical_validation")||kinds.has("statistical_validation"))
      ?{status:EMPIRICAL,reason:"declared empirical/statistical evidence passed"}
      :{status:OPEN,reason:"empirical claim lacks empirical/statistical evidence"};
  }
  if(kind==="mixed"){
    return kinds.has("formal_proof")&&(kinds.has("empirical_validation")||kinds.has("statistical_validation"))
      ?{status:MIXED,reason:"formal and empirical evidence classes present"}
      :{status:OPEN,reason:"mixed claim still lacks formal or empirical evidence class"};
  }
  return (kinds.has("computational_test")||kinds.has("formal_proof"))
    ?{status:COMPUTATIONAL,reason:"all declared computational checks passed"}
    :{status:OPEN,reason:"computational claim lacks computational/formal correctness evidence"};
}

const BASE={
  "1":[{},1],"kg":[{M:1},1],"g":[{M:1},1e-3],"mg":[{M:1},1e-6],"ug":[{M:1},1e-9],
  "m":[{L:1},1],"cm":[{L:1},1e-2],"L":[{L:3},1e-3],"mL":[{L:3},1e-6],"uL":[{L:3},1e-9],
  "s":[{T:1},1],"min":[{T:1},60],"h":[{T:1},3600],
  "mol":[{N:1},1],"mmol":[{N:1},1e-3],"umol":[{N:1},1e-6],
  "M":[{N:1,L:-3},1e3],"mM":[{N:1,L:-3},1]
};
function addDims(dst,src,mul){
  for(const [k,v] of Object.entries(src))dst[k]=(dst[k]||0)+v*mul;
  for(const k of Object.keys(dst))if(dst[k]===0)delete dst[k];
}
function parseProduct(text){
  if(!text||text==="1")return [{},1];
  const dims={};let scale=1;
  for(const raw of text.split("*")){
    const m=raw.match(/^([A-Za-z0-9]+)(?:\^(-?\d+))?$/);
    if(!m||!BASE[m[1]])throw new Error("unsupported unit term "+JSON.stringify(raw));
    const power=Number(m[2]||1),[ud,us]=BASE[m[1]];
    addDims(dims,ud,power);scale*=Math.pow(us,power);
  }
  return [dims,scale];
}
function parseUnit(expr){
  const parts=String(expr).replace(/\s/g,"").split("/");
  let [dims,scale]=parseProduct(parts[0]);
  for(const d of parts.slice(1)){const [dd,ds]=parseProduct(d);addDims(dims,dd,-1);scale/=ds;}
  return [dims,scale];
}
function dimsEq(a,b){return canonicalJson(a)===canonicalJson(b);}
function quantity(q,name,expectedDims,positive=true){
  if(!q||typeof q!=="object")throw new Error(name+" must be an object with value and unit");
  const value=Number(q.value),unit=q.unit;
  if(!Number.isFinite(value))throw new Error(name+".value must be finite numeric");
  if(positive&&value<=0)throw new Error(name+".value must be > 0");
  if(typeof unit!=="string"||!unit)throw new Error(name+".unit must be a non-empty string");
  const [dims,scale]=parseUnit(unit);
  if(!dimsEq(dims,expectedDims))throw new Error(name+".unit has incompatible dimensions");
  return {value,unit,si:value*scale,scale,dims};
}
function validatePkpd(spec){
  try{
    if(spec?.model_type!=="one_compartment_iv_bolus")throw new Error("unsupported model_type");
    const dose=quantity(spec.dose,"dose",{M:1});
    const volume=quantity(spec.volume,"volume",{L:3});
    const clearance=quantity(spec.clearance,"clearance",{L:3,T:-1});
    const [td,ts]=parseUnit(spec.time_unit),[cd,cs]=parseUnit(spec.concentration_unit);
    if(!dimsEq(td,{T:1}))throw new Error("time_unit has incompatible dimensions");
    if(!dimsEq(cd,{M:1,L:-3}))throw new Error("concentration_unit has incompatible dimensions");
    const kel=clearance.si/volume.si,c0=dose.si/volume.si;
    if(!(Number.isFinite(kel)&&kel>0&&Number.isFinite(c0)&&c0>0))throw new Error("derived PK parameters must be finite and positive");
    let pd=null;
    if(spec.pd!=null){
      if(spec.pd.model_type!=="direct_emax")throw new Error("unsupported pd.model_type");
      const [ed,es]=parseUnit(spec.pd.effect_unit);
      const e0=quantity(spec.pd.e0,"pd.e0",ed,false);
      const emax=quantity(spec.pd.emax,"pd.emax",ed,true);
      const ec50=quantity(spec.pd.ec50,"pd.ec50",cd,true);
      pd={effectScale:es,e0,emax,ec50};
    }
    return {ok:true,model:{timeScale:ts,concScale:cs,kel,c0,pd}};
  }catch(e){return {ok:false,error:String(e)};}
}
function parseCsv(text){
  const lines=String(text).trim().split(/\r?\n/);
  if(lines.length<2)throw new Error("prediction CSV has no data rows");
  const headers=lines[0].split(",");
  return lines.slice(1).filter(Boolean).map((line,i)=>{
    const values=line.split(","); if(values.length!==headers.length)throw new Error("CSV shape error at row "+(i+2));
    const row={};headers.forEach((h,j)=>row[h]=values[j]);return row;
  });
}
function isClose(a,b,rel,abs){return Math.abs(a-b)<=Math.max(rel*Math.max(Math.abs(a),Math.abs(b)),abs);}
function replayPkpd(spec,csvText,check){
  const c=validatePkpd(spec);
  if(!c.ok)return {ok:false,details:{contract_valid:false,error:c.error}};
  const rows=parseCsv(csvText),m=c.model,pd=m.pd;
  const tc=check.time_column||"time",cc=check.concentration_column||"concentration",ec=check.effect_column||"effect";
  const rel=Number(check.rel_tol??1e-9),abs=Number(check.abs_tol??1e-12);
  let maxCA=0,maxCR=0,maxEA=0,maxER=0,mismatch=0;
  for(let idx=0;idx<rows.length;idx++){
    const row=rows[idx],t=Number(row[tc]),obs=Number(row[cc]);
    if(!Number.isFinite(t)||t<0||!Number.isFinite(obs))throw new Error("invalid PK numeric row "+(idx+2));
    const expectedSi=m.c0*Math.exp(-m.kel*t*m.timeScale),expected=expectedSi/m.concScale;
    const ca=Math.abs(obs-expected),cr=ca/Math.max(Math.abs(expected),abs>0?abs:1e-300);
    maxCA=Math.max(maxCA,ca);maxCR=Math.max(maxCR,cr);if(!isClose(obs,expected,rel,abs))mismatch++;
    if(pd){
      const oe=Number(row[ec]); if(!Number.isFinite(oe))throw new Error("invalid PD numeric row "+(idx+2));
      const eeSi=pd.e0.si+pd.emax.si*expectedSi/(pd.ec50.si+expectedSi),ee=eeSi/pd.effectScale;
      const ea=Math.abs(oe-ee),er=ea/Math.max(Math.abs(ee),abs>0?abs:1e-300);
      maxEA=Math.max(maxEA,ea);maxER=Math.max(maxER,er);if(!isClose(oe,ee,rel,abs))mismatch++;
    }
  }
  return {ok:mismatch===0,details:{contract_valid:true,row_count:rows.length,rel_tol:rel,abs_tol:abs,max_concentration_abs_error:maxCA,max_concentration_rel_error:maxCR,max_effect_abs_error:pd?maxEA:null,max_effect_rel_error:pd?maxER:null,mismatch_count_reported:mismatch}};
}
function artifactMap(cert){return Object.fromEntries((cert.artifacts||[]).map(a=>[a.id,a]));}
function runCheck(spec,cert,files){
  const arts=artifactMap(cert);
  try{
    if(spec.type==="pkpd_contract"){
      const a=arts[spec.model_artifact];if(!a)throw new Error("unknown model artifact");
      const model=JSON.parse(fileText(files[a.path]));const r=validatePkpd(model);
      return {id:spec.id,kind:"computational_test",claim_ids:spec.claim_ids||[],outcome:r.ok?"PASS":"FAIL",artifact_ids:[spec.model_artifact],details:r};
    }
    if(spec.type==="pkpd_reference_match"){
      const ma=arts[spec.model_artifact],oa=arts[spec.output_artifact];if(!ma||!oa)throw new Error("unknown replay artifact");
      const model=JSON.parse(fileText(files[ma.path])),r=replayPkpd(model,fileText(files[oa.path]),spec);
      return {id:spec.id,kind:"computational_test",claim_ids:spec.claim_ids||[],outcome:r.ok?"PASS":"FAIL",artifact_ids:[spec.model_artifact,spec.output_artifact],details:r.details};
    }
    if(spec.type==="external_formal_proof")return {id:spec.id,kind:"formal_proof",claim_ids:spec.claim_ids||[],outcome:"UNVERIFIED",artifact_ids:spec.proof_artifact?[spec.proof_artifact]:[],details:{reason:"external formal proof recorded but not independently checked by browser profile"}};
    return {id:spec.id,kind:"check_error",claim_ids:spec.claim_ids||[],outcome:"FAIL",artifact_ids:[],details:{error:"unsupported check type",check_type:spec.type}};
  }catch(e){return {id:spec.id,kind:"check_error",claim_ids:spec.claim_ids||[],outcome:"FAIL",artifact_ids:[],details:{error:String(e),check_type:spec.type}};}
}
function pemBody(pem){return pem.replace(/-----BEGIN PUBLIC KEY-----|-----END PUBLIC KEY-----|\s/g,"");}
function b64bytes(s){const raw=atob(s);return Uint8Array.from(raw,c=>c.charCodeAt(0));}
async function verifyPackageSignature(manifestText,record,pem){
  try{
    if(record.signature_format!=="pcs-package-ed25519-v1")return {valid:false,error:"unsupported package signature format"};
    if(record.algorithm!=="Ed25519")return {valid:false,error:"unsupported algorithm"};
    const manifestSha=await sha256Text(manifestText);
    if(manifestSha!==record.package_manifest_sha256)return {valid:false,error:"signed package manifest hash mismatch"};
    const spki=b64bytes(pemBody(pem));
    const key=await crypto.subtle.importKey("spki",spki,{name:"Ed25519"},true,["verify"]);
    const raw=new Uint8Array(await crypto.subtle.exportKey("raw",key));
    const fp=await sha256Bytes(raw);
    if(fp!==record.public_key_fingerprint)return {valid:false,error:"public key fingerprint mismatch",fingerprint:fp};
    const manifest=JSON.parse(manifestText);
    const ok=await crypto.subtle.verify({name:"Ed25519"},key,b64bytes(record.signature),bytesOf(canonicalJson(manifest)));
    return {valid:ok,fingerprint:fp,error:ok?null:"signature verification failed"};
  }catch(e){return {valid:false,error:String(e)};}
}
function evaluatePolicy(certificate,policy,signatureValid,signerFingerprint){
  const statuses=Object.fromEntries((certificate.claims||[]).map(c=>[c.id,c.assessment?.status]));
  const failures=[];
  for(const [cid,allowed] of Object.entries(policy.required_claims||{})){
    const actual=statuses[cid]||"MISSING";if(!allowed.includes(actual))failures.push({type:"claim_status",claim_id:cid,actual,allowed});
  }
  if(policy.require_signature&&signatureValid!==true)failures.push({type:"signature",reason:"valid package signature required"});
  if(policy.expected_signer_fingerprint&&String(signerFingerprint||"").toLowerCase()!==policy.expected_signer_fingerprint.toLowerCase())failures.push({type:"signer",reason:"signer fingerprint does not match policy"});
  return {pass:failures.length===0,failures,required_claims:policy.required_claims||{}};
}
function workflowSummary(workflow,artifactIds){
  const nodes=workflow?.nodes||[],nodeIds=new Set(),producers=new Map(),edges=new Map();
  for(const n of nodes){if(nodeIds.has(n.id))throw new Error("duplicate workflow node "+n.id);nodeIds.add(n.id);edges.set(n.id,new Set());}
  for(const n of nodes){
    for(const a of [...(n.inputs||[]),...(n.outputs||[])])if(!artifactIds.has(a))throw new Error("unknown workflow artifact "+a);
    for(const out of n.outputs||[]){if(producers.has(out))throw new Error("multiple producers for "+out);producers.set(out,n.id);}
  }
  for(const [art,prod] of producers)for(const n of nodes)if((n.inputs||[]).includes(art)&&n.id!==prod)edges.get(prod).add(n.id);
  const temp=new Set(),perm=new Set(),order=[];
  function visit(n){if(perm.has(n))return;if(temp.has(n))throw new Error("workflow cycle at "+n);temp.add(n);for(const m of [...edges.get(n)].sort())visit(m);temp.delete(n);perm.add(n);order.push(n);}
  for(const n of [...nodeIds].sort())visit(n);order.reverse();return {node_count:nodes.length,topological_order:order};
}

async function verifyVirtualPackage(pkg,policyOverride=null){
  const errors=[],files=pkg?.files||{};
  const supportedTransport=new Set(["pcs-browser-virtual-package-v1","pcs-browser-directory-package-v1"]);
  if(!supportedTransport.has(pkg?.transport_format))throw new Error("unsupported browser transport format");
  for(const required of ["certificate.json","package_manifest.json"])if(!files[required])errors.push("missing "+required);
  if(errors.length)return {valid:false,errors};
  const manifestText=fileText(files["package_manifest.json"]);
  const certText=fileText(files["certificate.json"]);
  const manifest=JSON.parse(manifestText),cert=JSON.parse(certText);
  const sigrec=files["package_signature.json"]?JSON.parse(fileText(files["package_signature.json"])):null;
  if(manifest.package_format!=="pcs-package-v1")errors.push("unsupported package manifest format");
  if(cert.spec_version!=="pcs-0.5")errors.push("unsupported certificate spec_version");
  if(cert.checker_version!=="pcs-python-kernel/0.5.0")errors.push("unexpected checker_version");
  const expectedNames=new Set(Object.keys(manifest.files||{}));
  const actualNames=new Set(Object.keys(files).filter(n=>!["package_manifest.json","package_signature.json"].includes(n)));
  for(const n of expectedNames)if(!actualNames.has(n))errors.push("package file missing: "+n);
  for(const n of actualNames)if(!expectedNames.has(n))errors.push("unexpected package file: "+n);
  for(const [name,meta] of Object.entries(manifest.files||{})){
    if(!files[name])continue;const b=fileBytes(files[name]);
    const h=await sha256Bytes(b);if(h!==meta.sha256)errors.push("package hash mismatch: "+name);if(b.byteLength!==meta.size)errors.push("package size mismatch: "+name);
  }
  if(manifest.certificate_semantic_hash!==cert.semantic_hash)errors.push("manifest semantic hash does not match certificate");
  if(manifest.certificate_integrity_hash!==cert.integrity_hash)errors.push("manifest integrity hash does not match certificate");
  for(const a of cert.artifacts||[]){
    if(!files[a.path]){errors.push("missing packaged artifact "+a.id);continue;}
    if(await sha256Bytes(fileBytes(files[a.path]))!==a.sha256)errors.push("artifact hash mismatch: "+a.id);
  }
  let sig={valid:false,fingerprint:null,error:null,status:"UNSIGNED"};
  if(sigrec){
    if(!files["signer-public.pem"]){
      sig={valid:false,fingerprint:sigrec.public_key_fingerprint||null,error:"signer-public.pem is missing",status:"INVALID"};
      errors.push("package signature: signer-public.pem is missing");
    }else{
      sig=await verifyPackageSignature(manifestText,sigrec,fileText(files["signer-public.pem"]));
      sig.status=sig.valid?"VERIFIED":"INVALID";
      if(!sig.valid)errors.push("package signature: "+sig.error);
    }
  }
  const evidenceMap={};const replayRows=[];
  for(const recorded of cert.evidence||[]){
    const replayed=runCheck(recorded.check_spec||{},cert,files);evidenceMap[recorded.id]=replayed;replayRows.push({recorded,replayed});
    if(replayed.outcome!==recorded.outcome)errors.push("evidence replay outcome mismatch: "+recorded.id);
    if(replayed.kind!==recorded.kind)errors.push("evidence replay kind mismatch: "+recorded.id);
    if(!sameArray(replayed.claim_ids,recorded.claim_ids))errors.push("evidence replay claim binding mismatch: "+recorded.id);
    if(!sameArray(replayed.artifact_ids,recorded.artifact_ids))errors.push("evidence replay artifact binding mismatch: "+recorded.id);
  }
  const claimResults=[];
  for(const claim of cert.claims||[]){
    const assessment=assessClaim(claim,evidenceMap);claimResults.push({id:claim.id,assessment});
    if(!deepEqual(assessment,claim.assessment))errors.push("claim assessment mismatch: "+claim.id);
  }
  try{
    const ws=workflowSummary(cert.workflow,new Set((cert.artifacts||[]).map(a=>a.id)));
    if(!deepEqual(ws,cert.workflow_summary))errors.push("workflow_summary mismatch");
  }catch(e){errors.push(String(e));}
  const defaultPolicy={
    policy_version:"pcs-acceptance-policy-v1",
    require_signature:Boolean(sigrec),
    expected_signer_fingerprint:sigrec?sigrec.public_key_fingerprint:null,
    required_claims:Object.fromEntries((cert.claims||[]).map(c=>[c.id,[c.assessment.status]]))
  };
  const policy=evaluatePolicy(cert,policyOverride||defaultPolicy,sig.valid,sig.fingerprint);
  if(!policy.pass)errors.push(...policy.failures.map(f=>"policy: "+JSON.stringify(f)));
  const scientificOk=replayRows.every(x=>x.replayed.outcome===x.recorded.outcome)&&claimResults.every(x=>deepEqual(x.assessment,(cert.claims.find(c=>c.id===x.id)||{}).assessment));
  const packageOk=[...expectedNames].every(n=>actualNames.has(n))&&[...actualNames].every(n=>expectedNames.has(n))&&!errors.some(e=>
    e.startsWith("package hash mismatch")||
    e.startsWith("package size mismatch")||
    e.startsWith("package file")||
    e.startsWith("unexpected package file")||
    e.startsWith("manifest semantic hash")||
    e.startsWith("manifest integrity hash")
  );
  return {
    valid:errors.length===0,errors,certificate:cert,manifest,signature:sig,policy,replayRows,claimResults,
    assurance_dimensions:{
      scientific_replay:scientificOk?"PASS":"FAIL",
      package_integrity:packageOk?"PASS":"FAIL",
      signer_authenticity:sigrec?(sig.valid?"VERIFIED":"INVALID"):"UNSIGNED",
      reviewer_policy:policy.pass?"PASS":"FAIL"
    }
  };
}

const DECISION_VECTORS=[
["missing_required",{id:"C",kind:"computational",required_evidence:["E"]},{},OPEN],
["unverified_blocks",{id:"C",kind:"computational",required_evidence:["E"]},{E:{id:"E",kind:"computational_test",outcome:"UNVERIFIED"}},OPEN],
["failure_dominates",{id:"C",kind:"computational",required_evidence:["E"]},{E:{id:"E",kind:"computational_test",outcome:"FAIL"}},FAILED],
["computational_pass",{id:"C",kind:"computational",required_evidence:["E"]},{E:{id:"E",kind:"computational_test",outcome:"PASS"}},COMPUTATIONAL],
["formal_pass",{id:"C",kind:"formal",required_evidence:["E"]},{E:{id:"E",kind:"formal_proof",outcome:"PASS"}},FORMAL],
["formal_wrong_class",{id:"C",kind:"formal",required_evidence:["E"]},{E:{id:"E",kind:"computational_test",outcome:"PASS"}},OPEN],
["empirical_pass",{id:"C",kind:"empirical",required_evidence:["E"]},{E:{id:"E",kind:"empirical_validation",outcome:"PASS"}},EMPIRICAL],
["statistical_empirical_pass",{id:"C",kind:"empirical",required_evidence:["E"]},{E:{id:"E",kind:"statistical_validation",outcome:"PASS"}},EMPIRICAL],
["mixed_pass",{id:"C",kind:"mixed",required_evidence:["F","V"]},{F:{id:"F",kind:"formal_proof",outcome:"PASS"},V:{id:"V",kind:"statistical_validation",outcome:"PASS"}},MIXED],
["mixed_missing_empirical",{id:"C",kind:"mixed",required_evidence:["F"]},{F:{id:"F",kind:"formal_proof",outcome:"PASS"}},OPEN],
["computational_can_use_formal_evidence",{id:"C",kind:"computational",required_evidence:["F"]},{F:{id:"F",kind:"formal_proof",outcome:"PASS"}},COMPUTATIONAL]
];
function runDecisionParity(){
  return DECISION_VECTORS.map(([name,claim,evidence,expected])=>{const got=assessClaim(claim,evidence).status;return {name,expected,got,pass:got===expected};});
}

global.PCSBrowserEngine={
  statuses:{FORMAL,COMPUTATIONAL,EMPIRICAL,MIXED,OPEN,FAILED},
  canonicalJson,sha256Text,sha256Bytes,fileBytes,fileText,assessClaim,validatePkpd,replayPkpd,evaluatePolicy,verifyVirtualPackage,runDecisionParity
};
})(window);
