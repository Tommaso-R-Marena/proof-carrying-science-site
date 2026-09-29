const $=id=>document.getElementById(id);
const enc=new TextEncoder();
const MAX_INSPECT=2*1024*1024;
const KEY_SUFFIXES=[".pem",".key",".p12",".pfx"];
const PRIVATE_MARKERS=["-----BEGIN PRIVATE KEY-----","-----BEGIN ENCRYPTED PRIVATE KEY-----","-----BEGIN OPENSSH PRIVATE KEY-----","-----BEGIN RSA PRIVATE KEY-----","-----BEGIN EC PRIVATE KEY-----"];
const KEY_PRIORITY=["subject_id","patient_id","sample_id","participant_id","record_id","id","rownames","subject","patient","sample"];
let sourceFiles=[],inventory=[],recommendations=[],skipped=[],selected=new Set(),lastDraft=null,lastReport=null;

function safeName(path){return path.split("/").filter(Boolean).slice(1).join("/")||path.split("/").pop()}
function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]))}
function stableStringify(v){if(v===null||typeof v!=="object")return JSON.stringify(v);if(Array.isArray(v))return "["+v.map(stableStringify).join(",")+"]";return "{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stableStringify(v[k])).join(",")+"}"}
async function sha256Bytes(bytes){const d=await crypto.subtle.digest("SHA-256",bytes);return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,"0")).join("")}
async function sha256Text(s){return sha256Bytes(enc.encode(s))}
function artifactId(rel,used){let stem=rel.replace(/\.[^.]+$/,"").replaceAll("/","_").replace(/[^A-Za-z0-9_.:-]+/g,"_").replace(/^[_.:-]+|[_.:-]+$/g,"")||"artifact";let base=("artifact_"+stem).slice(0,100),c=base,n=2;while(used.has(c)){c=(base.slice(0,115)+"_"+n++).slice(0,127)}used.add(c);return c}
function mediaType(name){const x=name.toLowerCase();if(x.endsWith(".csv"))return"text/csv";if(x.endsWith(".json"))return"application/json";if(x.endsWith(".py"))return"text/x-python";if(x.endsWith(".r"))return"text/x-r";if(x.endsWith(".ipynb"))return"application/x-ipynb+json";return"application/octet-stream"}
function roleGuess(name){const n=name.toLowerCase();if(n.endsWith(".csv")){if(/prediction|output|result/.test(n))return"tabular-output";if(/train|test|valid|val|dev/.test(n))return"dataset-split";return"tabular-data"}if(n.endsWith(".json")){if(n.includes("model"))return"model-specification";if(n.includes("reaction"))return"reaction-specification";if(n.includes("unit"))return"unit-specification";return"structured-data"}if(/\.(py|r|jl|ipynb)$/.test(n))return"source-code";return"scientific-artifact"}
function csvLine(line){const out=[];let cur="",quote=false;for(let i=0;i<line.length;i++){const ch=line[i];if(ch==="\""){if(quote&&line[i+1]==="\""){cur+='\"';i++}else quote=!quote}else if(ch===","&&!quote){out.push(cur.trim());cur=""}else cur+=ch}out.push(cur.trim());return out}
function splitKind(name){const t=new Set(name.toLowerCase().split(/[^a-z0-9]+/));if([...t].some(x=>["train","training"].includes(x)))return"train";if([...t].some(x=>["test","testing","holdout"].includes(x)))return"test";if([...t].some(x=>["val","valid","validation","dev"].includes(x)))return"validation";return null}
function claim(id,statement,evidence,predicate,assumptions=[]){return{id,statement,kind:"computational",required_evidence:[evidence],assumptions,predicate}}
function artifactEntry(item){return{id:item.artifact_id,path:item.path,role:item.role,media_type:item.media_type,metadata:{pcs_discovery_sha256:item.sha256,pcs_discovery_size:item.size}}}
function recommendationCard(r){const on=selected.has(r.id);return `<label class="recommendation-card ${on?"selected":""}"><input type="checkbox" data-rec="${esc(r.id)}" ${on?"checked":""}><div><div class="recommendation-title"><strong>${esc(r.detector)}</strong><span class="chip ${r.confidence>=.99?"verified":"pending"}">${Math.round(r.confidence*100)}%</span></div><p>${esc(r.reason)}</p><small>${esc(r.check.type)} · ${esc(r.claim.id)}</small></div></label>`}
function downloadJson(name,obj){const b=new Blob([JSON.stringify(obj,null,2)+"\n"],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)}

async function inspectFiles(files){
  sourceFiles=[...files];
  inventory=[];skipped=[];recommendations=[];selected.clear();
  const used=new Set();
  for(const file of sourceFiles){
    const rel=safeName(file.webkitRelativePath||file.name);
    const low=file.name.toLowerCase();
    if(KEY_SUFFIXES.some(x=>low.endsWith(x))){skipped.push({path:rel,reason:"key-material-excluded"});continue}
    const prefix=file.size<=65536?await file.text():await file.slice(0,65536).text();
    if(PRIVATE_MARKERS.some(x=>prefix.includes(x))){skipped.push({path:rel,reason:"key-material-excluded"});continue}
    const hash=await sha256Bytes(await file.arrayBuffer());
    inventory.push({artifact_id:artifactId(rel,used),path:rel,size:file.size,sha256:hash,media_type:mediaType(rel),role:roleGuess(rel),file});
  }
  await detect();
  autoSelect();
  render();
}
async function detect(){
  const jsons=new Map(),headers=new Map();
  for(const item of inventory){
    if(item.path.toLowerCase().endsWith(".json")&&item.size<=MAX_INSPECT){try{const o=JSON.parse(await item.file.text());if(o&&typeof o==="object"&&!Array.isArray(o))jsons.set(item.path,o)}catch{}}
    if(item.path.toLowerCase().endsWith(".csv")){try{const first=(await item.file.slice(0,65536).text()).split(/\r?\n/,1)[0];const h=csvLine(first);if(h.length)headers.set(item.path,h)}catch{}}
  }
  const models=inventory.filter(x=>{const o=jsons.get(x.path);return o&&o.model_type==="one_compartment_iv_bolus"&&o.pd&&o.pd.model_type==="direct_emax"&&["dose","volume","clearance"].every(k=>k in o)});
  const preds=inventory.filter(x=>{const h=headers.get(x.path)||[];return["time","concentration","effect"].every(k=>h.includes(k))});
  for(const m of models){
    const aid=m.artifact_id,e="E_PKPD_CONTRACT_"+aid,c="C_PKPD_CONTRACT_"+aid,a="A_PKPD_"+aid,p={type:"pkpd_contract",model_artifact:aid};
    recommendations.push({id:"R_PKPD_CONTRACT_"+aid,detector:"restricted-pkpd-model",confidence:1,reason:"JSON declares one_compartment_iv_bolus with direct_emax PD fields.",artifact_ids:[aid],check:{id:e,type:"pkpd_contract",claim_ids:[c],model_artifact:aid},claim:claim(c,"The discovered PK/PD model satisfies the restricted PCS positivity and dimensional contract.",e,p,[a]),assumption:{id:a,statement:"The restricted one-compartment IV-bolus PK plus direct Emax PD equations are the declared computational model; this is not a claim of biological or clinical adequacy.",rationale:"Separates computational replay from empirical model validity."}});
    if(models.length===1&&preds.length===1){const o=preds[0],e2="E_PKPD_REPLAY_"+aid,c2="C_PKPD_REPLAY_"+aid,p2={type:"pkpd_reference_match",model_artifact:aid,output_artifact:o.artifact_id,time_column:"time",concentration_column:"concentration",effect_column:"effect",rel_tol:1e-9,abs_tol:1e-12};recommendations.push({id:"R_PKPD_REPLAY_"+aid+"_"+o.artifact_id,detector:"pkpd-output-columns",confidence:1,reason:"Exactly one CSV exposes time, concentration, and effect columns.",artifact_ids:[aid,o.artifact_id],check:{id:e2,type:"pkpd_reference_match",claim_ids:[c2],...p2},claim:claim(c2,"The discovered prediction table matches the declared restricted PK/PD equations within the PCS numeric tolerance.",e2,p2,[a]),assumption:{id:a,statement:"The restricted one-compartment IV-bolus PK plus direct Emax PD equations are the declared computational model; this is not a claim of biological or clinical adequacy.",rationale:"Separates computational replay from empirical model validity."},workflow_node:{id:"N_PKPD_"+aid,operation:"restricted_one_compartment_iv_bolus_direct_emax",inputs:[aid],outputs:[o.artifact_id],contract:{equations:["C(t)=(Dose/V)*exp(-(CL/V)*t)","E(C)=E0+Emax*C/(EC50+C)"],validation_scope:"computational replay only; not empirical adequacy"}}})}
  }
  const csvs=inventory.filter(x=>headers.has(x.path));
  for(let i=0;i<csvs.length;i++)for(let j=i+1;j<csvs.length;j++){const a=csvs[i],b=csvs[j],ak=splitKind(a.path),bk=splitKind(b.path);if(!ak||!bk||ak===bk)continue;const common=new Set(headers.get(a.path).filter(x=>headers.get(b.path).includes(x))),key=KEY_PRIORITY.find(x=>common.has(x));if(!key)continue;const pair=[a,b].sort((x,y)=>x.path.localeCompare(y.path)),l=pair[0],rr=pair[1],e="E_SPLIT_"+l.artifact_id+"_"+rr.artifact_id,c="C_SPLIT_"+l.artifact_id+"_"+rr.artifact_id,p={type:"csv_disjoint",left_artifact:l.artifact_id,right_artifact:rr.artifact_id,key};recommendations.push({id:"R_SPLIT_"+l.artifact_id+"_"+rr.artifact_id,detector:"named-dataset-split",confidence:.96,reason:`Files look like different dataset splits and share key column "${key}".`,artifact_ids:[l.artifact_id,rr.artifact_id],check:{id:e,type:"csv_disjoint",claim_ids:[c],left_artifact:l.artifact_id,right_artifact:rr.artifact_id,key},claim:claim(c,`The discovered dataset splits ${l.path} and ${rr.path} are disjoint on ${key}.`,e,p)})}
  for(const item of inventory){const o=jsons.get(item.path);if(!o)continue;if(Array.isArray(o.reactants)&&Array.isArray(o.products)){const e="E_REACTION_"+item.artifact_id,c="C_REACTION_"+item.artifact_id,p={type:"reaction_balance",reactants:o.reactants,products:o.products};recommendations.push({id:"R_REACTION_"+item.artifact_id,detector:"reaction-json",confidence:.99,reason:"JSON exposes reactants/products arrays compatible with the reaction-balance checker.",artifact_ids:[item.artifact_id],check:{id:e,type:"reaction_balance",claim_ids:[c],reactants:o.reactants,products:o.products},claim:claim(c,"The discovered reaction specification is element-balanced under the PCS formula parser.",e,p)})}if(typeof o.left_unit==="string"&&typeof o.right_unit==="string"){const e="E_UNITS_"+item.artifact_id,c="C_UNITS_"+item.artifact_id,p={type:"unit_compatible",left_unit:o.left_unit,right_unit:o.right_unit};recommendations.push({id:"R_UNITS_"+item.artifact_id,detector:"unit-pair-json",confidence:.99,reason:"JSON explicitly declares left_unit/right_unit for compatibility checking.",artifact_ids:[item.artifact_id],check:{id:e,type:"unit_compatible",claim_ids:[c],left_unit:o.left_unit,right_unit:o.right_unit},claim:claim(c,"The discovered unit expressions are dimensionally compatible under the PCS unit checker.",e,p)})}}
  const seen=new Map();for(const r of recommendations)seen.set(r.id,r);recommendations=[...seen.values()].sort((a,b)=>b.confidence-a.confidence||a.id.localeCompare(b.id));
}
function autoSelect(){const cut=Number($("confidence").value);selected=new Set(recommendations.filter(r=>r.confidence>=cut).map(r=>r.id))}
async function buildDraft(){
  const recs=recommendations.filter(r=>selected.has(r.id)),ids=new Set(recs.flatMap(r=>r.artifact_ids||[])),byId=new Map(inventory.map(x=>[x.artifact_id,x]));
  const dedupe=arr=>[...new Map(arr.filter(Boolean).map(x=>[x.id,structuredClone(x)])).values()];
  const claims=dedupe(recs.map(r=>r.claim)),checks=dedupe(recs.map(r=>r.check)),assumptions=dedupe(recs.map(r=>r.assumption));
  for(const a of assumptions)a.scope=claims.filter(c=>(c.assumptions||[]).includes(a.id)).map(c=>c.id);
  const nodes=dedupe(recs.map(r=>r.workflow_node)),invCommit=await sha256Text(stableStringify(inventory.map(x=>({path:x.path,sha256:x.sha256,size:x.size}))));
  return{subject:$("subject").value.trim()||"scientific-project",assumptions,claims,artifacts:[...ids].sort().map(id=>artifactEntry(byId.get(id))),checks,workflow:{nodes},pcs_intake:{format:"pcs-manifest-draft-v1",status:"draft",requires_confirmation:true,project_root_name:(sourceFiles[0]?.webkitRelativePath||"scientific-project").split("/")[0],minimum_selected_confidence:Number($("confidence").value),selected_recommendations:recs.map(r=>r.id),recommendation_count:recommendations.length,selected_recommendation_count:recs.length,inventory_commitment_sha256:invCommit}}
}
async function rebuild(){
  if(!sourceFiles.length)return;
  lastDraft=await buildDraft();
  const unsupported=inventory.filter(x=>!lastDraft.artifacts.some(a=>a.id===x.artifact_id)).map(x=>x.path);
  lastReport={format:"pcs-project-discovery-v1",project_root_name:lastDraft.pcs_intake.project_root_name,subject:lastDraft.subject,inventory_commitment_sha256:lastDraft.pcs_intake.inventory_commitment_sha256,inventory:inventory.map(({file,...x})=>x),skipped,recommendations,selected_recommendations:lastDraft.pcs_intake.selected_recommendations,unresolved:[...(lastDraft.claims.length?[]:[{type:"no-supported-checks-detected",message:"No currently supported PCS check was detected."}]),...(unsupported.length?[{type:"unselected-artifacts",message:"Some discovered files are not referenced by a selected check.",paths:unsupported.slice(0,100),truncated:unsupported.length>100}]:[])],summary:{files_inventoried:inventory.length,files_skipped:skipped.length,bytes_inventoried:inventory.reduce((a,x)=>a+x.size,0),recommendations:recommendations.length,selected_recommendations:selected.size,claims_drafted:lastDraft.claims.length,checks_drafted:lastDraft.checks.length,artifacts_selected:lastDraft.artifacts.length},manifest_draft:lastDraft};
  $("manifestPreview").textContent=JSON.stringify(lastDraft,null,2);$("downloadDraft").disabled=false;$("downloadDiscovery").disabled=false;
  $("draftValidation").className="validation "+(lastDraft.claims.length?"good":"bad");$("draftValidation").textContent=lastDraft.claims.length?"Reviewable draft. It still requires explicit CLI confirmation before attestation.":"No supported claims selected. PCS will not confirm an empty draft unless explicitly overridden.";
  $("filesCount").textContent=inventory.length;$("recommendationCount").textContent=recommendations.length;$("selectedCount").textContent=selected.size;$("artifactCount").textContent=lastDraft.artifacts.length;
}
async function render(){
  $("mapperState").textContent=sourceFiles.length?"REVIEW REQUIRED":"NO PROJECT";$("mapperState").className="chip "+(sourceFiles.length?"pending":"open");
  $("recommendations").innerHTML=recommendations.length?recommendations.map(recommendationCard).join(""):'<p class="tiny">No currently supported PCS pattern detected. You can still create a manifest manually or use future domain packs.</p>';
  $("recommendations").querySelectorAll("[data-rec]").forEach(x=>x.addEventListener("change",async e=>{e.target.checked?selected.add(e.target.dataset.rec):selected.delete(e.target.dataset.rec);await render()}));
  $("inventory").innerHTML=inventory.map(x=>`<div class="inventory-row"><div><strong>${esc(x.path)}</strong><small>${esc(x.role)} · ${x.size.toLocaleString()} bytes</small></div><code>${x.sha256.slice(0,16)}…</code></div>`).join("");
  $("skipped").textContent=skipped.length?`Excluded ${skipped.length} file(s): ${skipped.map(x=>x.path+" ("+x.reason+")").join(", ")}`:"";
  $("rescan").disabled=!sourceFiles.length;$("clearProject").disabled=!sourceFiles.length;$("toggleInventory").disabled=!inventory.length;
  await rebuild();
}
$("chooseProject").onclick=()=>$("projectFiles").click();
$("projectFiles").onchange=async e=>{if(!e.target.files?.length)return;const root=(e.target.files[0].webkitRelativePath||"scientific-project").split("/")[0];$("subject").value=root;await inspectFiles(e.target.files)};
$("confidence").oninput=async()=>{$("confidenceValue").textContent=Number($("confidence").value).toFixed(2);autoSelect();await render()};
$("subject").oninput=()=>rebuild();
$("rescan").onclick=async()=>{await detect();autoSelect();await render()};
$("clearProject").onclick=()=>{sourceFiles=[];inventory=[];recommendations=[];skipped=[];selected.clear();lastDraft=lastReport=null;$("projectFiles").value="";$("recommendations").innerHTML='<p class="tiny">Choose a project folder to begin.</p>';$("inventory").innerHTML="";$("manifestPreview").textContent="{}";$("draftValidation").className="validation";$("draftValidation").textContent="No project selected.";["filesCount","recommendationCount","selectedCount","artifactCount"].forEach(id=>$(id).textContent="0");$("downloadDraft").disabled=true;$("downloadDiscovery").disabled=true;$("mapperState").textContent="NO PROJECT"};
$("toggleInventory").onclick=()=>{const box=$("inventory"),show=box.hidden;box.hidden=!show;$("toggleInventory").textContent=show?"Hide":"Show"};
$("downloadDraft").onclick=()=>lastDraft&&downloadJson("pcs-manifest.draft.json",lastDraft);
$("downloadDiscovery").onclick=()=>lastReport&&downloadJson("pcs-discovery.json",lastReport);
$("copyConfirm").onclick=async()=>{try{await navigator.clipboard.writeText($("confirmCommand").textContent);$("copyConfirm").textContent="Copied";setTimeout(()=>$("copyConfirm").textContent="Copy",1200)}catch{$("copyConfirm").textContent="Select + copy"}};
