const $=id=>document.getElementById(id);
const enc=new TextEncoder();
const MAX_INSPECT=2*1024*1024;
const MAX_SINGLE_FILE=50*1024*1024;
const MAX_TOTAL_BYTES=200*1024*1024;
const MAX_FILES=2000;
const KEY_SUFFIXES=[".pem",".key",".p12",".pfx"];
const PRIVATE_MARKERS=["-----BEGIN PRIVATE KEY-----","-----BEGIN ENCRYPTED PRIVATE KEY-----","-----BEGIN OPENSSH PRIVATE KEY-----","-----BEGIN RSA PRIVATE KEY-----","-----BEGIN EC PRIVATE KEY-----"];
const KEY_PRIORITY=["subject_id","patient_id","sample_id","participant_id","record_id","id","rownames","subject","patient","sample"];
const WORKFLOW_FORMAT="pcs-static-workflow-map-v1";
let sourceFiles=[],inventory=[],recommendations=[],skipped=[],selected=new Set();
let workflowInferences=[],workflowUnresolved=[],selectedWorkflow=new Set();
let lastDraft=null,lastReport=null;

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
function workflowCard(w){const on=selectedWorkflow.has(w.id),reads=w.read_paths.length?w.read_paths.join(", "):"none",writes=w.write_paths.length?w.write_paths.join(", "):"none";return `<label class="recommendation-card workflow-inference-card ${on?"selected":""}"><input type="checkbox" data-wf="${esc(w.id)}" ${on?"checked":""}><div><div class="recommendation-title"><strong>${esc(w.source_path)}</strong><span class="chip pending">${Math.round(w.confidence*100)}% heuristic</span></div><p><strong>Reads:</strong> ${esc(reads)}<br><strong>Writes:</strong> ${esc(writes)}</p><small>Static only · source code not executed · ${w.unresolved_reference_count} unresolved reference(s)</small></div></label>`}
function downloadJson(name,obj){const b=new Blob([JSON.stringify(obj,null,2)+"\n"],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)}
function normalizeRel(path){const out=[];for(const part of String(path).replaceAll("\\","/").split("/")){if(!part||part===".")continue;if(part===".."){if(!out.length)return null;out.pop()}else out.push(part)}return out.join("/")}
function resolveBrowserPath(raw,sourcePath,byPath){if(!raw||/^(?:https?|s3|gs):\/\//i.test(raw))return null;const sourceDir=sourcePath.includes("/")?sourcePath.slice(0,sourcePath.lastIndexOf("/")):"";const candidates=new Set();for(const x of [normalizeRel(raw),normalizeRel((sourceDir?sourceDir+"/":"")+raw)])if(x&&byPath.has(x))candidates.add(x);return candidates.size===1?[...candidates][0]:null}
function collectRegex(text,regex,kind,api,locationPrefix,refs){let m;while((m=regex.exec(text))){refs.push({kind,path:m[1],api,location:locationPrefix+"offset:"+m.index})}}
function analyzeBrowserSource(text,sourcePath,locationPrefix=""){
  const refs=[];
  collectRegex(text,/\b(?:pd|pandas)\.read_(?:csv|json|parquet|excel|feather|pickle)\(\s*["']([^"']+)["']/g,"read","pandas.read_*",locationPrefix,refs);
  collectRegex(text,/\b(?:np|numpy)\.(?:load|loadtxt|genfromtxt)\(\s*["']([^"']+)["']/g,"read","numpy.load*",locationPrefix,refs);
  collectRegex(text,/\.(?:to_csv|to_json|to_parquet|to_excel|to_feather|to_pickle)\(\s*["']([^"']+)["']/g,"write","dataframe.to_*",locationPrefix,refs);
  collectRegex(text,/\b(?:np|numpy)\.(?:save|savetxt|savez|savez_compressed)\(\s*["']([^"']+)["']/g,"write","numpy.save*",locationPrefix,refs);
  let m,openRx=/\bopen\(\s*["']([^"']+)["']\s*(?:,\s*["']([^"']+)["'])?/g;
  while((m=openRx.exec(text))){const mode=m[2]||"r";refs.push({kind:/[wax+]/.test(mode)?"write":"read",path:m[1],api:"open",location:locationPrefix+"offset:"+m.index})}
  let pathRx=/Path\(\s*["']([^"']+)["']\s*\)\.(read_text|read_bytes|write_text|write_bytes)\(/g;
  while((m=pathRx.exec(text))){refs.push({kind:m[2].startsWith("write")?"write":"read",path:m[1],api:"Path."+m[2],location:locationPrefix+"offset:"+m.index})}
  return refs;
}
async function detectBrowserWorkflow(){
  workflowInferences=[];workflowUnresolved=[];selectedWorkflow.clear();
  const byPath=new Map(inventory.map(x=>[x.path,x])),sources=[];
  for(const item of inventory){
    const low=item.path.toLowerCase();if(!(low.endsWith(".py")||low.endsWith(".ipynb"))||item.size>MAX_INSPECT)continue;
    let refs=[],kind="python";
    if(low.endsWith(".py")){
      refs=analyzeBrowserSource(await item.file.text(),item.path);
    }else{
      kind="jupyter";
      try{
        const nb=JSON.parse(await item.file.text()),cells=Array.isArray(nb.cells)?nb.cells:[];
        cells.forEach((cell,i)=>{if(cell&&cell.cell_type==="code"){const src=Array.isArray(cell.source)?cell.source.join(""):String(cell.source||"");refs.push(...analyzeBrowserSource(src,item.path,`cell[${i}]:`))}})
      }catch{workflowUnresolved.push({type:"source_parse_incomplete",source_path:item.path})}
    }
    const resolved=[],unresolved=[];
    for(const ref of refs){const rel=resolveBrowserPath(ref.path,item.path,byPath);if(rel){const art=byPath.get(rel);resolved.push({...ref,path:rel,artifact_id:art.artifact_id})}else unresolved.push({...ref,resolution:"unresolved"})}
    if(unresolved.length)workflowUnresolved.push({type:"unresolved_source_references",source_path:item.path,references:unresolved.slice(0,48),truncated:unresolved.length>48});
    const reads=[...new Set(resolved.filter(x=>x.kind==="read").map(x=>x.artifact_id))].sort(),writes=[...new Set(resolved.filter(x=>x.kind==="write").map(x=>x.artifact_id))].sort();
    if(!reads.length&&!writes.length)continue;
    const id="W_STATIC_"+item.artifact_id,confidence=.90,nodeId=("N_STATIC_"+item.artifact_id).slice(0,127);
    sources.push({id,source_artifact_id:item.artifact_id,source_path:item.path,source_kind:kind,confidence,reason:"Browser heuristic resolved literal local paths; Python CLI AST analysis remains authoritative.",resolved_references:resolved,unresolved_reference_count:unresolved.length,reads,writes,node:{id:nodeId,operation:"static_"+kind+"_workflow",inputs:[...new Set([item.artifact_id,...reads])].sort(),outputs:[...writes],contract:{inference_format:WORKFLOW_FORMAT,inference_id:id,static_only:true,user_code_executed:false,source_path:item.path,source_kind:kind,confidence,browser_heuristic:true,resolved_references:resolved.slice(0,8).map(x=>({kind:x.kind,path:x.path,artifact_id:x.artifact_id,api:x.api,location:x.location})),references_truncated:resolved.length>8}}});
  }
  const producers=new Map();for(const w of sources)for(const aid of w.writes){if(!producers.has(aid))producers.set(aid,[]);producers.get(aid).push(w.id)}
  for(const [aid,ids] of producers)if(ids.length>1){workflowUnresolved.push({type:"multiple_static_producers",artifact_id:aid,source_inference_ids:[...ids].sort()});for(const w of sources)w.node.outputs=w.node.outputs.filter(x=>x!==aid)}
  workflowInferences=sources;
  const producerNode=new Map();for(const w of sources)for(const aid of w.node.outputs)producerNode.set(aid,w.node.id);
  const edges=[];for(const w of sources)for(const aid of w.node.inputs){const from=producerNode.get(aid);if(from&&from!==w.node.id)edges.push({from,to:w.node.id,artifact_id:aid})}
  for(const w of sources)w.edges=edges.filter(e=>e.from===w.node.id||e.to===w.node.id);
  const cut=Number($("workflowConfidence")?.value||.95);selectedWorkflow=new Set(workflowInferences.filter(w=>w.confidence>=cut).map(w=>w.id));
}

async function loadSyntheticExample(){
  const model={
    model_type:"one_compartment_iv_bolus",
    dose:{value:100,unit:"mg"},
    volume:{value:20,unit:"L"},
    clearance:{value:2,unit:"L/h"},
    time_unit:"h",
    concentration_unit:"mg/L",
    pd:{model_type:"direct_emax",effect_unit:"1",e0:{value:0,unit:"1"},emax:{value:1,unit:"1"},ec50:{value:2,unit:"mg/L"}}
  };
  const files=[
    new File([JSON.stringify(model,null,2)+"\n"],"model.json",{type:"application/json"}),
    new File(["time,concentration,effect\n0,5,0.7142857143\n1,4.52418709,0.693569\n"],"predictions.csv",{type:"text/csv"}),
    new File(["subject_id,value\nS1,1\nS2,2\n"],"train.csv",{type:"text/csv"}),
    new File(["subject_id,value\nS3,3\nS4,4\n"],"test.csv",{type:"text/csv"}),
    new File([
      "import json\n",
      "import pandas as pd\n",
      "model = json.load(open('model.json'))\n",
      "df = pd.read_csv('predictions.csv')\n",
      "df.to_csv('predictions.csv', index=False)\n"
    ],"generate.py",{type:"text/x-python"})
  ];
  $("subject").value="synthetic-guided-demo";
  await inspectFiles(files);
}

async function inspectFiles(files){
  sourceFiles=[...files];inventory=[];skipped=[];recommendations=[];selected.clear();workflowInferences=[];workflowUnresolved=[];selectedWorkflow.clear();
  const used=new Set();let totalBytes=0;
  for(const file of sourceFiles){
    const rel=safeName(file.webkitRelativePath||file.name);
    if(inventory.length>=MAX_FILES){skipped.push({path:rel,reason:"discovery-file-limit"});continue}
    if(file.size>MAX_SINGLE_FILE){skipped.push({path:rel,reason:"exceeds-package-single-file-limit"});continue}
    if(totalBytes+file.size>MAX_TOTAL_BYTES){skipped.push({path:rel,reason:"discovery-total-byte-limit"});continue}
    totalBytes+=file.size;const low=file.name.toLowerCase();
    if(KEY_SUFFIXES.some(x=>low.endsWith(x))){skipped.push({path:rel,reason:"key-material-excluded"});continue}
    const prefix=file.size<=65536?await file.text():await file.slice(0,65536).text();
    if(PRIVATE_MARKERS.some(x=>prefix.includes(x))){skipped.push({path:rel,reason:"key-material-excluded"});continue}
    const hash=await sha256Bytes(await file.arrayBuffer());
    inventory.push({artifact_id:artifactId(rel,used),path:rel,size:file.size,sha256:hash,media_type:mediaType(rel),role:roleGuess(rel),file});
  }
  await detect();await detectBrowserWorkflow();autoSelect();await render();
}
async function detect(){
  recommendations=[];
  const jsons=new Map(),headers=new Map();
  for(const item of inventory){
    if(item.path.toLowerCase().endsWith(".json")&&item.size<=MAX_INSPECT){try{const o=JSON.parse(await item.file.text());if(o&&typeof o==="object"&&!Array.isArray(o))jsons.set(item.path,o)}catch{}}
    if(item.path.toLowerCase().endsWith(".csv")){try{const first=(await item.file.slice(0,65536).text()).split(/\r?\n/,1)[0],h=csvLine(first);if(h.length)headers.set(item.path,h)}catch{}}
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
function autoSelect(){const cut=Number($("confidence").value);selected=new Set(recommendations.filter(r=>r.confidence>=cut).map(r=>r.id));const wcut=Number($("workflowConfidence")?.value||.90);selectedWorkflow=new Set(workflowInferences.filter(w=>w.confidence>=wcut).map(w=>w.id))}
async function buildDraft(){
  const recs=recommendations.filter(r=>selected.has(r.id)),wfs=workflowInferences.filter(w=>selectedWorkflow.has(w.id)),ids=new Set(recs.flatMap(r=>r.artifact_ids||[])),byId=new Map(inventory.map(x=>[x.artifact_id,x]));
  const dedupe=arr=>[...new Map(arr.filter(Boolean).map(x=>[x.id,structuredClone(x)])).values()];
  const claims=dedupe(recs.map(r=>r.claim)),checks=dedupe(recs.map(r=>r.check)),assumptions=dedupe(recs.map(r=>r.assumption));
  for(const a of assumptions)a.scope=claims.filter(c=>(c.assumptions||[]).includes(a.id)).map(c=>c.id);
  for(const w of wfs)for(const aid of [...w.node.inputs,...w.node.outputs])ids.add(aid);
  const staticNodes=wfs.map(w=>structuredClone(w.node)),staticOutputs=new Set(staticNodes.flatMap(n=>n.outputs||[]));
  const semanticNodes=dedupe(recs.map(r=>r.workflow_node)).map(n=>{n.outputs=(n.outputs||[]).filter(a=>!staticOutputs.has(a));return n}).filter(n=>n.outputs.length);
  const nodes=dedupe([...staticNodes,...semanticNodes]);
  const invCommit=await sha256Text(stableStringify(inventory.map(x=>({path:x.path,sha256:x.sha256,size:x.size}))));
  return{subject:$("subject").value.trim()||"scientific-project",assumptions,claims,artifacts:[...ids].sort().map(id=>artifactEntry(byId.get(id))).filter(Boolean),checks,workflow:{nodes},pcs_intake:{format:"pcs-manifest-draft-v1",status:"draft",requires_confirmation:true,project_root_name:(sourceFiles[0]?.webkitRelativePath||"scientific-project").split("/")[0],minimum_selected_confidence:Number($("confidence").value),selected_recommendations:recs.map(r=>r.id),recommendation_count:recommendations.length,selected_recommendation_count:recs.length,workflow_discovery_format:WORKFLOW_FORMAT,minimum_workflow_confidence:Number($("workflowConfidence")?.value||.95),selected_workflow_inferences:wfs.map(w=>w.id),workflow_inference_count:workflowInferences.length,selected_workflow_inference_count:wfs.length,inventory_commitment_sha256:invCommit}}
}
function workflowMapForReport(){
  const producer=new Map();for(const w of workflowInferences)for(const aid of w.node.outputs)producer.set(aid,w.node.id);
  const edges=[];for(const w of workflowInferences)for(const aid of w.node.inputs){const from=producer.get(aid);if(from&&from!==w.node.id)edges.push({from,to:w.node.id,artifact_id:aid})}
  return{format:WORKFLOW_FORMAT,static_only:true,user_code_executed:false,browser_heuristic:true,sources:workflowInferences.map(w=>({id:w.id,source_artifact_id:w.source_artifact_id,source_path:w.source_path,source_kind:w.source_kind,confidence:w.confidence,reason:w.reason,resolved_references:w.resolved_references,unresolved_reference_count:w.unresolved_reference_count,reads:w.reads,writes:w.writes})),nodes:workflowInferences.map(w=>w.node),edges,selected_artifact_ids:[...new Set(workflowInferences.flatMap(w=>[...w.node.inputs,...w.node.outputs]))].sort(),unresolved:workflowUnresolved,summary:{source_files_considered:inventory.filter(x=>/\.(py|ipynb)$/i.test(x.path)).length,source_files_with_resolved_dependencies:workflowInferences.length,workflow_nodes:workflowInferences.length,workflow_edges:edges.length,resolved_artifact_references:workflowInferences.reduce((a,w)=>a+w.resolved_references.length,0),unresolved_items:workflowUnresolved.length}}
}
async function rebuild(){
  if(!sourceFiles.length)return;
  lastDraft=await buildDraft();
  const unsupported=inventory.filter(x=>!lastDraft.artifacts.some(a=>a.id===x.artifact_id)).map(x=>x.path),workflowMap=workflowMapForReport();
  lastReport={format:"pcs-project-discovery-v1",project_root_name:lastDraft.pcs_intake.project_root_name,subject:lastDraft.subject,inventory_commitment_sha256:lastDraft.pcs_intake.inventory_commitment_sha256,inventory:inventory.map(({file,...x})=>x),skipped,recommendations,selected_recommendations:lastDraft.pcs_intake.selected_recommendations,workflow_map:workflowMap,selected_workflow_inferences:lastDraft.pcs_intake.selected_workflow_inferences,unresolved:[...workflowUnresolved,...(lastDraft.claims.length?[]:[{type:"no-supported-checks-detected",message:"No currently supported PCS check was detected."}]),...(unsupported.length?[{type:"unselected-artifacts",message:"Some discovered files are not referenced by a selected check or workflow step.",paths:unsupported.slice(0,100),truncated:unsupported.length>100}]:[])],summary:{files_inventoried:inventory.length,files_skipped:skipped.length,bytes_inventoried:inventory.reduce((a,x)=>a+x.size,0),recommendations:recommendations.length,selected_recommendations:selected.size,claims_drafted:lastDraft.claims.length,checks_drafted:lastDraft.checks.length,artifacts_selected:lastDraft.artifacts.length,workflow_sources_analyzed:workflowMap.summary.source_files_considered,workflow_nodes_drafted:lastDraft.workflow.nodes.length,workflow_edges_inferred:workflowMap.summary.workflow_edges,workflow_unresolved_items:workflowUnresolved.length},manifest_draft:lastDraft};
  $("manifestPreview").textContent=JSON.stringify(lastDraft,null,2);$("downloadDraft").disabled=false;$("downloadDiscovery").disabled=false;
  $("draftValidation").className="validation "+(lastDraft.claims.length?"good":"bad");$("draftValidation").textContent=lastDraft.claims.length?"Reviewable draft. Workflow edges are static inferences and the draft still requires explicit CLI confirmation.":"No supported scientific claims selected. Workflow mapping alone does not authorize attestation.";
  $("filesCount").textContent=inventory.length;$("recommendationCount").textContent=recommendations.length;$("selectedCount").textContent=selected.size;$("artifactCount").textContent=lastDraft.artifacts.length;$("workflowCount").textContent=lastDraft.workflow.nodes.length;$("workflowIssueCount").textContent=workflowUnresolved.length;
}
function renderWorkflowGraph(){
  const selectedW=workflowInferences.filter(w=>selectedWorkflow.has(w.id));
  if(!selectedW.length){$("workflowGraph").innerHTML='<p class="tiny">No selected workflow inference.</p>';return}
  const byId=new Map(inventory.map(x=>[x.artifact_id,x.path]));
  const producer=new Map();for(const w of selectedW)for(const aid of w.node.outputs)producer.set(aid,w);
  const rows=[];
  for(const w of selectedW){
    const inputs=w.node.inputs.filter(a=>a!==w.source_artifact_id).map(a=>byId.get(a)||a);
    const outputs=w.node.outputs.map(a=>byId.get(a)||a);
    rows.push(`<div class="workflow-graph-row"><div class="workflow-graph-step"><strong>${esc(w.source_path)}</strong><small>${esc(w.source_kind)} · static only</small></div><div class="workflow-graph-arrow">→</div><div class="workflow-graph-artifacts"><span><b>reads</b> ${esc(inputs.join(", ")||"none")}</span><span><b>writes</b> ${esc(outputs.join(", ")||"none")}</span></div></div>`);
  }
  const edges=[];
  for(const w of selectedW)for(const aid of w.node.inputs){const p=producer.get(aid);if(p&&p.id!==w.id)edges.push(`${p.source_path} → ${w.source_path} via ${byId.get(aid)||aid}`)}
  $("workflowGraph").innerHTML=rows.join("")+(edges.length?`<div class="workflow-edge-list"><strong>Step dependencies</strong>${edges.map(x=>`<code>${esc(x)}</code>`).join("")}</div>`:"");
}

async function render(){
  $("mapperState").textContent=sourceFiles.length?"REVIEW REQUIRED":"NO PROJECT";$("mapperState").className="chip "+(sourceFiles.length?"pending":"open");
  $("recommendations").innerHTML=recommendations.length?recommendations.map(recommendationCard).join(""):'<p class="tiny">No currently supported PCS scientific-check pattern detected.</p>';
  $("recommendations").querySelectorAll("[data-rec]").forEach(x=>x.addEventListener("change",async e=>{e.target.checked?selected.add(e.target.dataset.rec):selected.delete(e.target.dataset.rec);await render()}));
  $("workflowInferences").innerHTML=workflowInferences.length?workflowInferences.map(workflowCard).join(""):'<p class="tiny">No literal local Python/notebook file dependencies were inferred.</p>';
  $("workflowInferences").querySelectorAll("[data-wf]").forEach(x=>x.addEventListener("change",async e=>{e.target.checked?selectedWorkflow.add(e.target.dataset.wf):selectedWorkflow.delete(e.target.dataset.wf);await render()}));
  $("workflowIssues").textContent=workflowUnresolved.length?`${workflowUnresolved.length} unresolved workflow item(s). Use the Python CLI AST analyzer for authoritative review.`:"No unresolved browser workflow references.";
  renderWorkflowGraph();
  $("inventory").innerHTML=inventory.map(x=>`<div class="inventory-row"><div><strong>${esc(x.path)}</strong><small>${esc(x.role)} · ${x.size.toLocaleString()} bytes</small></div><code>${x.sha256.slice(0,16)}…</code></div>`).join("");
  $("skipped").textContent=skipped.length?`Excluded ${skipped.length} file(s): ${skipped.map(x=>x.path+" ("+x.reason+")").join(", ")}`:"";
  $("rescan").disabled=!sourceFiles.length;$("clearProject").disabled=!sourceFiles.length;$("toggleInventory").disabled=!inventory.length;
  await rebuild();
}
$("chooseProject").onclick=()=>$("projectFiles").click();
$("loadExampleProject").onclick=loadSyntheticExample;
$("projectFiles").onchange=async e=>{if(!e.target.files?.length)return;const root=(e.target.files[0].webkitRelativePath||"scientific-project").split("/")[0];$("subject").value=root;await inspectFiles(e.target.files)};
$("confidence").oninput=async()=>{$("confidenceValue").textContent=Number($("confidence").value).toFixed(2);autoSelect();await render()};
$("workflowConfidence").oninput=async()=>{$("workflowConfidenceValue").textContent=Number($("workflowConfidence").value).toFixed(2);autoSelect();await render()};
$("subject").oninput=()=>rebuild();
$("rescan").onclick=async()=>{await detect();await detectBrowserWorkflow();autoSelect();await render()};
$("clearProject").onclick=()=>{sourceFiles=[];inventory=[];recommendations=[];skipped=[];selected.clear();workflowInferences=[];workflowUnresolved=[];selectedWorkflow.clear();lastDraft=lastReport=null;$("projectFiles").value="";$("recommendations").innerHTML='<p class="tiny">Choose a project folder to begin.</p>';$("workflowInferences").innerHTML='<p class="tiny">Choose a project folder to begin.</p>';$("workflowIssues").textContent="";$("workflowGraph").innerHTML='<p class="tiny">No workflow graph yet.</p>';$("inventory").innerHTML="";$("manifestPreview").textContent="{}";$("draftValidation").className="validation";$("draftValidation").textContent="No project selected.";["filesCount","recommendationCount","selectedCount","artifactCount","workflowCount","workflowIssueCount"].forEach(id=>$(id).textContent="0");$("downloadDraft").disabled=true;$("downloadDiscovery").disabled=true;$("mapperState").textContent="NO PROJECT"};
$("toggleInventory").onclick=()=>{const box=$("inventory"),show=box.hidden;box.hidden=!show;$("toggleInventory").textContent=show?"Hide":"Show"};
$("downloadDraft").onclick=()=>lastDraft&&downloadJson("pcs-manifest.draft.json",lastDraft);
$("downloadDiscovery").onclick=()=>lastReport&&downloadJson("pcs-discovery.json",lastReport);
$("copyConfirm").onclick=async()=>{try{await navigator.clipboard.writeText($("confirmCommand").textContent);$("copyConfirm").textContent="Copied";setTimeout(()=>$("copyConfirm").textContent="Copy",1200)}catch{$("copyConfirm").textContent="Select + copy"}};
