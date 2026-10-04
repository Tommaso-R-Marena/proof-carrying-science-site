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
const ENVIRONMENT_FORMAT="pcs-environment-capture-v1";
const ENVIRONMENT_PLAN_FORMAT="pcs-environment-replay-plan-v1";
let sourceFiles=[],inventory=[],recommendations=[],skipped=[],selected=new Set();
let workflowInferences=[],workflowUnresolved=[],selectedWorkflow=new Set();
let environmentCapture=null;
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
function artifactPathForClaim(artifactId){
  return inventory.find(x=>x.artifact_id===artifactId)?.path||artifactId||"unspecified";
}
function explainPredicate(predicate){
  const p=predicate&&typeof predicate==="object"?predicate:{};
  if(p.type==="csv_disjoint"){
    return {
      template:"Dataset separation",
      summary:`No value in ${artifactPathForClaim(p.left_artifact)}[${p.key}] may also appear in ${artifactPathForClaim(p.right_artifact)}[${p.key}].`,
      fields:[
        ["First dataset",artifactPathForClaim(p.left_artifact)],
        ["Second dataset",artifactPathForClaim(p.right_artifact)],
        ["Identity key",p.key||"unspecified"],
        ["Pass condition","Intersection of key values is empty"]
      ],
      scope:"This establishes separation by the declared key only; it does not prove the datasets are otherwise independent or free of leakage."
    };
  }
  if(p.type==="reaction_balance"){
    const side=rows=>(Array.isArray(rows)?rows:[]).map(x=>`${x.coefficient??1} × ${x.formula||"?"}`).join(" + ")||"unspecified";
    return {
      template:"Chemical reaction balance",
      summary:`The declared reaction ${side(p.reactants)} → ${side(p.products)} must conserve each parsed element.`,
      fields:[
        ["Reactants",side(p.reactants)],
        ["Products",side(p.products)],
        ["Pass condition","Element counts match on both sides"]
      ],
      scope:"This checks stoichiometric atom balance under the PCS formula grammar; it does not establish thermodynamic or kinetic feasibility."
    };
  }
  if(p.type==="unit_compatible"){
    return {
      template:"Unit compatibility",
      summary:`${p.left_unit||"?"} and ${p.right_unit||"?"} must reduce to the same PCS physical dimension.`,
      fields:[
        ["Left unit",p.left_unit||"unspecified"],
        ["Right unit",p.right_unit||"unspecified"],
        ["Pass condition","Normalized dimensions are equal"]
      ],
      scope:"This checks dimensional compatibility, not whether the numerical values or scientific interpretation are correct."
    };
  }
  if(p.type==="pkpd_contract"){
    return {
      template:"PK/PD model contract",
      summary:`The model in ${artifactPathForClaim(p.model_artifact)} must satisfy PCS's restricted PK/PD positivity, unit, and representation contract.`,
      fields:[
        ["Model artifact",artifactPathForClaim(p.model_artifact)],
        ["Pass condition","Restricted model parameters and units satisfy the PCS PK/PD contract"]
      ],
      scope:"This checks the declared computational model contract; it does not establish biological or clinical adequacy."
    };
  }
  if(p.type==="pkpd_peak_concentration_threshold"){
    return {
      template:"PK/PD reported concentration bound",
      summary:`Every value in ${artifactPathForClaim(p.output_artifact)}[${p.concentration_column||"concentration"}] must be non-negative and no greater than ${String(p.upper_bound??"unspecified")} ${p.unit||""}.`,
      fields:[
        ["Model artifact",artifactPathForClaim(p.model_artifact)],
        ["Output artifact",artifactPathForClaim(p.output_artifact)],
        ["Concentration column",p.concentration_column||"concentration"],
        ["Upper bound",String(p.upper_bound??"unspecified")],
        ["Unit",p.unit||"unspecified"],
        ["Pass condition","Every committed concentration-table value is at or below the bound"]
      ],
      scope:"This certifies the maximum reported table value only; it is not a continuous-time Cmax theorem and does not establish clinical safety."
    };
  }
  if(p.type==="pkpd_reference_match"){
    return {
      template:"PK/PD output reproduction",
      summary:`Values in ${artifactPathForClaim(p.output_artifact)} must match the restricted model in ${artifactPathForClaim(p.model_artifact)} within the declared tolerances.`,
      fields:[
        ["Model artifact",artifactPathForClaim(p.model_artifact)],
        ["Output artifact",artifactPathForClaim(p.output_artifact)],
        ["Time column",p.time_column||"unspecified"],
        ["Concentration column",p.concentration_column||"unspecified"],
        ["Effect column",p.effect_column||"unspecified"],
        ["Relative tolerance",String(p.rel_tol??"unspecified")],
        ["Absolute tolerance",String(p.abs_tol??"unspecified")],
        ["Pass condition","Every checked row matches the PCS reference equations within tolerance"]
      ],
      scope:"This establishes deterministic agreement with the restricted reference equations; it does not validate the model against biological or clinical reality."
    };
  }
  return {
    template:"Unsupported formal claim",
    summary:"PCS does not currently have machine semantics for this predicate type.",
    fields:[["Predicate type",p.type||"unspecified"]],
    scope:"Do not treat this prose as a rigorous PCS claim until a supported checker and predicate semantics exist."
  };
}
function artifactEntry(item){return{id:item.artifact_id,path:item.path,role:item.role,media_type:item.media_type,metadata:{pcs_discovery_sha256:item.sha256,pcs_discovery_size:item.size}}}
function recommendationCard(r){const on=selected.has(r.id);return `<label class="recommendation-card ${on?"selected":""}"><input type="checkbox" data-rec="${esc(r.id)}" ${on?"checked":""}><div><div class="recommendation-title"><strong>${esc(r.detector)}</strong><span class="chip ${r.confidence>=.99?"verified":"pending"}">${Math.round(r.confidence*100)}%</span></div><p>${esc(r.reason)}</p><small>${esc(r.check.type)} · ${esc(r.claim.id)}</small></div></label>`}
function workflowCard(w){const on=selectedWorkflow.has(w.id),readPaths=Array.isArray(w.read_paths)?w.read_paths:[],writePaths=Array.isArray(w.write_paths)?w.write_paths:[],reads=readPaths.length?readPaths.join(", "):"none",writes=writePaths.length?writePaths.join(", "):"none";return `<label class="recommendation-card workflow-inference-card ${on?"selected":""}"><input type="checkbox" data-wf="${esc(w.id)}" ${on?"checked":""}><div><div class="recommendation-title"><strong>${esc(w.source_path)}</strong><span class="chip pending">${Math.round(w.confidence*100)}% heuristic</span></div><p><strong>Reads:</strong> ${esc(reads)}<br><strong>Writes:</strong> ${esc(writes)}</p><small>Static only · source code not executed · ${w.unresolved_reference_count||0} unresolved reference(s)</small></div></label>`}
function downloadJson(name,obj){const b=new Blob([JSON.stringify(obj,null,2)+"\n"],{type:"application/json"}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)}
function downloadText(name,text,type="text/plain"){const b=new Blob([text],{type}),u=URL.createObjectURL(b),a=document.createElement("a");a.href=u;a.download=name;a.click();URL.revokeObjectURL(u)}
function discoveryReviewMarkdown(){
  if(!lastReport)return "";
  const lines=["# PCS guided discovery review","","> Static discovery only. User code was not executed. Confirmation does not prove source-code correctness or runtime behavior.","",`Project: **${lastReport.project_root_name}**`,`Subject: **${lastReport.subject}**`,"","## Summary","",`- Files inventoried: **${lastReport.summary.files_inventoried}**`,`- Selected scientific recommendations: **${lastReport.summary.selected_recommendations}**`,`- Workflow nodes drafted: **${lastReport.summary.workflow_nodes_drafted}**`,`- Unresolved workflow items: **${lastReport.summary.workflow_unresolved_items}**`,"","## Scientific-check recommendations",""];
  for(const r of lastReport.recommendations){const mark=lastReport.selected_recommendations.includes(r.id)?"x":" ";lines.push(`- [${mark}] **${r.detector}** (${Number(r.confidence).toFixed(2)})`,`  - Claim: ${r.claim?.statement||""}`,`  - Check: ${r.check?.type||""}`,`  - Why: ${r.reason||""}`)}
  lines.push("","## Static workflow inferences","");
  for(const w of lastReport.workflow_map.sources||[]){const mark=lastReport.selected_workflow_inferences.includes(w.id)?"x":" ";const reads=(w.reads||[]).map(a=>lastReport.inventory.find(x=>x.artifact_id===a)?.path||a).join(", ")||"none";const writes=(w.writes||[]).map(a=>lastReport.inventory.find(x=>x.artifact_id===a)?.path||a).join(", ")||"none";lines.push(`- [${mark}] **${w.source_path}** (${w.source_kind}, confidence ${Number(w.confidence).toFixed(2)})`,`  - Reads: ${reads}`,`  - Writes: ${writes}`,`  - Unresolved recognized references: ${w.unresolved_reference_count||0}`)}
  const env=lastReport.environment_capture;
  lines.push("","## Reproducibility environment","");
  if(env){
    lines.push(`- Hermeticity: **${env.hermeticity}**`,`- Environment source files: **${env.summary?.source_files||0}**`,`- Dependency records: **${env.summary?.dependency_records||0}**`,`- Environment unresolved items: **${env.summary?.unresolved_items||0}**`,"","Interpreter constraints:");
    const py=(env.python?.interpreter_constraints||[]).map(x=>`Python ${x.value} (${x.source_path})`);
    const rv=(env.r?.interpreter_constraints||[]).map(x=>`R ${x.value} (${x.source_path})`);
    for(const x of [...py,...rv])lines.push(`- ${x}`);
    if(!py.length&&!rv.length)lines.push("- No interpreter constraint detected.");
    lines.push("","Proposed reconstruction steps:");
    for(const step of env.replay_plan?.steps||[])lines.push(`- **${step.kind}**: ${step.command_template}`);
    if(!(env.replay_plan?.steps||[]).length)lines.push("- No reconstructable environment strategy detected.");
  }else lines.push("- No environment capture.");
  lines.push("","## Unresolved review items","");if(lastReport.unresolved.length){for(const x of lastReport.unresolved)lines.push(`- **${x.type||"unresolved"}**: ${x.message||x.source_path||""}`)}else lines.push("- None reported.");
  lines.push("","## Before confirmation","","1. Confirm each selected scientific claim says what you intend.","2. Confirm each selected workflow edge matches the intended artifact flow.","3. Inspect unresolved or dynamic references instead of guessing.","4. Review dependency declarations, lockfiles, interpreter constraints, and environment reconstruction steps.","5. Remove any recommendation or environment claim you do not want to attest.","6. Only then run pcs confirm-v06.","");
  return lines.join("\n");
}
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
function analyzeBrowserRSource(text,locationPrefix=""){
  const refs=[];let m;
  const readRx=/\b(?:read\.csv|read\.table|readRDS|readr::read_csv|readr::read_tsv|data\.table::fread|fread|load)\s*\(\s*["']([^"']+)["']/g;
  while((m=readRx.exec(text)))refs.push({kind:"read",path:m[1],api:"r.read",location:locationPrefix+"offset:"+m.index});
  const writeRx=/\b(?:write\.csv|write\.table|readr::write_csv|readr::write_tsv|data\.table::fwrite|fwrite|saveRDS)\s*\([^,\n]+,\s*["']([^"']+)["']/g;
  while((m=writeRx.exec(text)))refs.push({kind:"write",path:m[1],api:"r.write",location:locationPrefix+"offset:"+m.index});
  const writeFileRx=/\b(?:write\.csv|write\.table|saveRDS|save)\s*\([^\)]*?\bfile\s*=\s*["']([^"']+)["']/g;
  while((m=writeFileRx.exec(text)))refs.push({kind:"write",path:m[1],api:"r.write.file",location:locationPrefix+"offset:"+m.index});
  return refs.slice(0,128);
}

async function detectBrowserWorkflow(){
  workflowInferences=[];workflowUnresolved=[];selectedWorkflow.clear();
  const byPath=new Map(inventory.map(x=>[x.path,x])),sources=[];
  for(const item of inventory){
    const low=item.path.toLowerCase();if(!(low.endsWith(".py")||low.endsWith(".ipynb")||low.endsWith(".r"))||item.size>MAX_INSPECT)continue;
    let refs=[],kind="python",confidence=.90,analysisMode="browser_literal_heuristic";
    if(low.endsWith(".py")){
      refs=analyzeBrowserSource(await item.file.text(),item.path);
    }else if(low.endsWith(".ipynb")){
      kind="jupyter";
      try{
        const nb=JSON.parse(await item.file.text()),cells=Array.isArray(nb.cells)?nb.cells:[];
        cells.forEach((cell,i)=>{if(cell&&cell.cell_type==="code"){const src=Array.isArray(cell.source)?cell.source.join(""):String(cell.source||"");refs.push(...analyzeBrowserSource(src,item.path,`cell[${i}]:`))}})
      }catch{workflowUnresolved.push({type:"source_parse_incomplete",source_path:item.path})}
    }else{
      kind="r";confidence=.88;analysisMode="browser_r_literal_heuristic";
      refs=analyzeBrowserRSource(await item.file.text(),item.path);
    }
    const resolved=[],unresolved=[];
    for(const ref of refs){const rel=resolveBrowserPath(ref.path,item.path,byPath);if(rel){const art=byPath.get(rel);resolved.push({...ref,path:rel,artifact_id:art.artifact_id})}else unresolved.push({...ref,resolution:"unresolved"})}
    if(unresolved.length)workflowUnresolved.push({type:"unresolved_source_references",source_path:item.path,references:unresolved.slice(0,48),truncated:unresolved.length>48});
    const reads=[...new Set(resolved.filter(x=>x.kind==="read").map(x=>x.artifact_id))].sort(),writes=[...new Set(resolved.filter(x=>x.kind==="write").map(x=>x.artifact_id))].sort(),read_paths=[...new Set(resolved.filter(x=>x.kind==="read").map(x=>x.path))].sort(),write_paths=[...new Set(resolved.filter(x=>x.kind==="write").map(x=>x.path))].sort();
    if(!reads.length&&!writes.length)continue;
    const id="W_STATIC_"+item.artifact_id,nodeId=("N_STATIC_"+item.artifact_id).slice(0,127);
    sources.push({id,source_artifact_id:item.artifact_id,source_path:item.path,source_kind:kind,analysis_mode:analysisMode,confidence,reason:"Browser literal-path heuristic resolved local artifact references; CLI static analysis remains authoritative.",resolved_references:resolved,unresolved_reference_count:unresolved.length,reads,writes,read_paths,write_paths,node:{id:nodeId,operation:"static_"+kind+"_workflow",inputs:[...new Set([item.artifact_id,...reads])].sort(),outputs:[...writes],contract:{inference_format:WORKFLOW_FORMAT,inference_id:id,static_only:true,user_code_executed:false,source_path:item.path,source_kind:kind,analysis_mode:analysisMode,dependency_claim_mode:"claimed_subset",confidence,browser_heuristic:true,resolved_references:resolved.slice(0,8).map(x=>({kind:x.kind,path:x.path,artifact_id:x.artifact_id,api:x.api,location:x.location})),references_truncated:resolved.length>8}}});
  }
  const producers=new Map();for(const w of sources)for(const aid of w.writes){if(!producers.has(aid))producers.set(aid,[]);producers.get(aid).push(w.id)}
  for(const [aid,ids] of producers)if(ids.length>1){workflowUnresolved.push({type:"multiple_static_producers",artifact_id:aid,source_inference_ids:[...ids].sort()});for(const w of sources)w.node.outputs=w.node.outputs.filter(x=>x!==aid)}
  workflowInferences=sources;
  const producerNode=new Map();for(const w of sources)for(const aid of w.node.outputs)producerNode.set(aid,w.node.id);
  const edges=[];for(const w of sources)for(const aid of w.node.inputs){const from=producerNode.get(aid);if(from&&from!==w.node.id)edges.push({from,to:w.node.id,artifact_id:aid})}
  for(const w of sources)w.edges=edges.filter(e=>e.from===w.node.id||e.to===w.node.id);
  const cut=Number($("workflowConfidence")?.value||.95);selectedWorkflow=new Set(workflowInferences.filter(w=>w.confidence>=cut).map(w=>w.id));
}

async function detectBrowserEnvironment(){
  const byPath=new Map(inventory.map(x=>[x.path,x])),sources=[],pyDeps=[],rDeps=[],condaDeps=[],pyConstraints=[],rConstraints=[],containers=[],unresolved=[];
  const addSource=(item,kind)=>{if(item&&!sources.some(x=>x.artifact_id===item.artifact_id))sources.push({artifact_id:item.artifact_id,path:item.path,kind,sha256:item.sha256,size:item.size})};
  const envNames=new Set(["pyproject.toml","poetry.lock","uv.lock","Pipfile","Pipfile.lock","requirements.txt","requirements-dev.txt","requirements.lock","constraints.txt",".python-version","runtime.txt","environment.yml","environment.yaml","conda-lock.yml","conda-lock.yaml","renv.lock","DESCRIPTION","Dockerfile","Containerfile","flake.nix","flake.lock"]);
  for(const item of inventory){
    const name=item.path.split("/").pop(),low=name.toLowerCase();
    if(!envNames.has(name)&&!(low.startsWith("requirements")&&(low.endsWith(".txt")||low.endsWith(".in"))))continue;
    const text=item.size<=MAX_INSPECT?await item.file.text():"";
    if(!text){unresolved.push({type:"environment_source_unreadable_or_too_large",source_path:item.path});continue}
    if(name==="pyproject.toml"){
      addSource(item,"pyproject");
      const py=text.match(/requires-python\s*=\s*["']([^"']+)["']/);if(py)pyConstraints.push({source_path:item.path,value:py[1]});
      const depBlock=text.match(/dependencies\s*=\s*\[([\s\S]*?)\]/m);if(depBlock){for(const m of depBlock[1].matchAll(/["']([^"']+)["']/g)){const raw=m[1],nm=(raw.match(/^\s*([A-Za-z0-9_.-]+)/)||[])[1]||null;pyDeps.push({ecosystem:"python",name:nm,raw,source_path:item.path,source_kind:"pyproject_browser_preview",exact_pin:/^[A-Za-z0-9_.-]+\s*==/.test(raw),hash_pinned:false,version:raw.includes("==")?raw.split("==")[1].split(";")[0].trim():null})}}
    }else if(low.startsWith("requirements")){
      addSource(item,name.endsWith(".lock")?"requirements_lock":"requirements");
      for(const rawLine of text.split(/\r?\n/)){const raw=rawLine.trim();if(!raw||raw.startsWith("#"))continue;const nm=(raw.match(/^([A-Za-z0-9_.-]+)/)||[])[1]||null;pyDeps.push({ecosystem:"python",name:nm,raw,source_path:item.path,source_kind:"requirements",exact_pin:/^[A-Za-z0-9_.-]+\s*==/.test(raw),hash_pinned:raw.includes("--hash=sha256:"),version:raw.includes("==")?raw.split("==")[1].split(/[ ;]/)[0]:null})}
    }else if(name===".python-version"||name==="runtime.txt"){
      addSource(item,"python_version");const m=text.match(/(?:python[- ]?)?([0-9]+(?:\.[0-9]+){1,2})/i);if(m)pyConstraints.push({source_path:item.path,value:m[1]});
    }else if(name==="uv.lock"||name==="poetry.lock"||name==="Pipfile.lock"||name==="conda-lock.yml"||name==="conda-lock.yaml"||name==="flake.lock"){
      const kind=name==="uv.lock"?"uv_lock":name==="poetry.lock"?"poetry_lock":name==="Pipfile.lock"?"pipfile_lock":name.startsWith("conda-lock")?"conda_lock":"nix_flake_lock";addSource(item,kind);
    }else if(name==="Pipfile"){addSource(item,"pipfile")
    }else if(name==="renv.lock"){
      addSource(item,"renv_lock");try{const o=JSON.parse(text);if(o.R?.Version)rConstraints.push({source_path:item.path,value:o.R.Version});for(const [nm,p] of Object.entries(o.Packages||{})){rDeps.push({ecosystem:"r",name:nm,raw:JSON.stringify({Version:p.Version,Source:p.Source,Repository:p.Repository}),source_path:item.path,source_kind:"renv_lock",exact_pin:!!p.Version,hash_pinned:false,version:p.Version||null})}}catch{unresolved.push({type:"renv_parse_error",source_path:item.path})}
    }else if(name==="DESCRIPTION"){
      addSource(item,"r_description");const rm=text.match(/(?:^|\n)Depends:\s*[^\n]*R\s*\(([^\)]+)\)/);if(rm)rConstraints.push({source_path:item.path,value:rm[1].trim()});
    }else if(name==="environment.yml"||name==="environment.yaml"){
      addSource(item,"conda_environment");for(const raw of text.split(/\r?\n/)){const m=raw.trim().match(/^-\s*([A-Za-z0-9_.-]+)(?:=([^\s]+))?/);if(!m)continue;condaDeps.push({ecosystem:"conda",name:m[1],raw:m[0].slice(1).trim(),source_path:item.path,source_kind:"conda_environment",exact_pin:!!m[2],hash_pinned:false,version:m[2]||null});if(m[1].toLowerCase()==="python"&&m[2])pyConstraints.push({source_path:item.path,value:m[2]})}
    }else if(name==="Dockerfile"||name==="Containerfile"){
      addSource(item,"containerfile");const stages=[];for(const raw of text.split(/\r?\n/)){const m=raw.trim().match(/^FROM\s+(?:--platform=\S+\s+)?(\S+)/i);if(m){const ref=m[1],dynamic=ref.includes("$"),digest=ref.includes("@sha256:")&&!dynamic;stages.push({reference:ref,digest_pinned:digest,tag:!digest&&ref.split("/").pop().includes(":")?ref.split(":").pop():null,dynamic});if(dynamic)unresolved.push({type:"dynamic_container_base",source_path:item.path,reference:ref})}}containers.push({source_path:item.path,stages,all_base_images_digest_pinned:stages.length>0&&stages.every(x=>x.digest_pinned),package_install_commands:[]});
    }else if(name==="flake.nix"){addSource(item,"nix_flake")}
  }
  const kinds=new Set(sources.map(x=>x.kind));let hermeticity="environment_unspecified";
  if(containers.length&&containers.every(x=>x.all_base_images_digest_pinned)){hermeticity=[...kinds].some(x=>["uv_lock","poetry_lock","pipfile_lock","conda_lock","renv_lock","nix_flake_lock"].includes(x))?"strongly_pinned":"container_base_pinned"}
  else if(kinds.has("conda_lock")||kinds.has("nix_flake_lock"))hermeticity="strongly_pinned";
  else if(["uv_lock","poetry_lock","pipfile_lock","renv_lock"].some(x=>kinds.has(x)))hermeticity="locked_application_dependencies";
  else {const req=pyDeps.filter(x=>x.source_kind==="requirements");if(req.length&&req.every(x=>x.exact_pin&&x.hash_pinned))hermeticity="hash_pinned_dependencies";else if(pyDeps.length||rDeps.length||condaDeps.length)hermeticity="declared_dependencies"}
  const steps=[],tools=[];const first=(kind)=>sources.filter(x=>x.kind===kind).map(x=>x.path).sort()[0];
  if(containers.length){tools.push("docker-or-compatible-oci-builder");for(const c of containers)steps.push({kind:"container_build",source_path:c.source_path,command_template:`docker build -f ${c.source_path} .`,network_required:true,executes_project_build_instructions:true})}
  else if(kinds.has("nix_flake_lock")&&kinds.has("nix_flake")){tools.push("nix");steps.push({kind:"nix_flake",source_path:"flake.nix",command_template:"nix develop --offline",network_required:false,executes_project_build_instructions:true})}
  else if(kinds.has("conda_lock")){tools.push("conda-lock-compatible-installer");const p=first("conda_lock");steps.push({kind:"conda_lock",source_path:p,command_template:`conda-lock install ${p}`,network_required:true,executes_project_build_instructions:false})}
  else if(kinds.has("uv_lock")&&kinds.has("pyproject")){tools.push("uv");steps.push({kind:"uv_sync",source_path:"uv.lock",command_template:"uv sync --frozen",network_required:true,executes_project_build_instructions:true})}
  else if(kinds.has("poetry_lock")&&kinds.has("pyproject")){tools.push("poetry");steps.push({kind:"poetry_install",source_path:"poetry.lock",command_template:"poetry install --sync",network_required:true,executes_project_build_instructions:true})}
  else {const req=first("requirements_lock")||first("requirements");if(req){tools.push("python");steps.push({kind:"pip_install",source_path:req,command_template:`python -m pip install ${hermeticity==="hash_pinned_dependencies"?"--require-hashes ":""}-r ${req}`,network_required:true,executes_project_build_instructions:true})}}
  if(kinds.has("renv_lock")&&!containers.length){tools.push("R+renv");steps.push({kind:"renv_restore",source_path:first("renv_lock"),command_template:"R -e 'renv::restore(prompt = FALSE)'",network_required:true,executes_project_build_instructions:true})}
  if(kinds.has("conda_environment")&&!containers.length&&!kinds.has("conda_lock")){tools.push("conda-or-mamba");const p=first("conda_environment");steps.push({kind:"conda_environment",source_path:p,command_template:`conda env create -f ${p}`,network_required:true,executes_project_build_instructions:false})}
  environmentCapture={format:ENVIRONMENT_FORMAT,static_only:true,network_accessed:false,user_code_executed:false,source_artifact_ids:sources.map(x=>x.artifact_id).sort(),sources:sources.sort((a,b)=>a.path.localeCompare(b.path)),python:{interpreter_constraints:pyConstraints,dependencies:pyDeps},r:{interpreter_constraints:rConstraints,dependencies:rDeps},conda:{dependencies:condaDeps},containers,hermeticity,replay_plan:{format:ENVIRONMENT_PLAN_FORMAT,hermeticity,required_tools:[...new Set(tools)].sort(),steps,automatic_execution_permitted_by_pcs:false,reason:"Browser preview only. Authoritative CLI capture is regenerated before signing and review."},unresolved,summary:{source_files:sources.length,dependency_records:pyDeps.length+rDeps.length+condaDeps.length,python_dependency_records:pyDeps.length,r_dependency_records:rDeps.length,conda_dependency_records:condaDeps.length,container_specs:containers.length,unresolved_items:unresolved.length}};
  environmentCapture.semantic_sha256=await sha256Text(stableStringify(environmentCapture));
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
    ],"generate.py",{type:"text/x-python"}),
    new File(["numpy==1.26.4\npandas==2.2.2\n"],"requirements.txt",{type:"text/plain"}),
    new File(["3.12.2\n"],".python-version",{type:"text/plain"})
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
  await detect();await detectBrowserWorkflow();await detectBrowserEnvironment();autoSelect();await render();
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
function autoSelect(){const cut=Number($("confidence").value);selected=new Set(recommendations.filter(r=>r.confidence>=cut).map(r=>r.id));const wcut=Number($("workflowConfidence")?.value||.95);selectedWorkflow=new Set(workflowInferences.filter(w=>w.confidence>=wcut).map(w=>w.id))}
async function buildDraft(){
  const recs=recommendations.filter(r=>selected.has(r.id)),wfs=workflowInferences.filter(w=>selectedWorkflow.has(w.id)),ids=new Set(recs.flatMap(r=>r.artifact_ids||[])),byId=new Map(inventory.map(x=>[x.artifact_id,x]));
  const dedupe=arr=>[...new Map(arr.filter(Boolean).map(x=>[x.id,structuredClone(x)])).values()];
  const claims=dedupe(recs.map(r=>r.claim)),checks=dedupe(recs.map(r=>r.check)),assumptions=dedupe(recs.map(r=>r.assumption));
  for(const a of assumptions)a.scope=claims.filter(c=>(c.assumptions||[]).includes(a.id)).map(c=>c.id);
  for(const w of wfs)for(const aid of [...w.node.inputs,...w.node.outputs])ids.add(aid);
  if(environmentCapture)for(const aid of environmentCapture.source_artifact_ids||[])ids.add(aid);
  const staticNodes=wfs.map(w=>structuredClone(w.node)),staticOutputs=new Set(staticNodes.flatMap(n=>n.outputs||[]));
  const semanticNodes=dedupe(recs.map(r=>r.workflow_node)).map(n=>{n.outputs=(n.outputs||[]).filter(a=>!staticOutputs.has(a));return n}).filter(n=>n.outputs.length);
  const nodes=dedupe([...staticNodes,...semanticNodes]);
  const invCommit=await sha256Text(stableStringify(inventory.map(x=>({path:x.path,sha256:x.sha256,size:x.size}))));
  return{subject:$("subject").value.trim()||"scientific-project",assumptions,claims,artifacts:[...ids].sort().map(id=>artifactEntry(byId.get(id))).filter(Boolean),checks,workflow:{nodes},environment:environmentCapture?{...structuredClone(environmentCapture),human_confirmed:false,confirmation_scope:"Browser preview only; authoritative CLI confirmation re-derives and binds environment metadata."}:undefined,pcs_intake:{format:"pcs-manifest-draft-v1",status:"draft",requires_confirmation:true,project_root_name:(sourceFiles[0]?.webkitRelativePath||"scientific-project").split("/")[0],minimum_selected_confidence:Number($("confidence").value),selected_recommendations:recs.map(r=>r.id),recommendation_count:recommendations.length,selected_recommendation_count:recs.length,workflow_discovery_format:WORKFLOW_FORMAT,minimum_workflow_confidence:Number($("workflowConfidence")?.value||.95),selected_workflow_inferences:wfs.map(w=>w.id),workflow_inference_count:workflowInferences.length,selected_workflow_inference_count:wfs.length,environment_capture_format:environmentCapture?.format||null,environment_source_artifacts:environmentCapture?.source_artifact_ids||[],environment_hermeticity:environmentCapture?.hermeticity||"environment_unspecified",inventory_commitment_sha256:invCommit}}
}
function workflowMapForReport(){
  const producer=new Map();for(const w of workflowInferences)for(const aid of w.node.outputs)producer.set(aid,w.node.id);
  const edges=[];for(const w of workflowInferences)for(const aid of w.node.inputs){const from=producer.get(aid);if(from&&from!==w.node.id)edges.push({from,to:w.node.id,artifact_id:aid})}
  return{format:WORKFLOW_FORMAT,static_only:true,user_code_executed:false,browser_heuristic:true,sources:workflowInferences.map(w=>({id:w.id,source_artifact_id:w.source_artifact_id,source_path:w.source_path,source_kind:w.source_kind,confidence:w.confidence,reason:w.reason,resolved_references:w.resolved_references,unresolved_reference_count:w.unresolved_reference_count,reads:w.reads,writes:w.writes})),nodes:workflowInferences.map(w=>w.node),edges,selected_artifact_ids:[...new Set(workflowInferences.flatMap(w=>[...w.node.inputs,...w.node.outputs]))].sort(),unresolved:workflowUnresolved,summary:{source_files_considered:inventory.filter(x=>/\.(py|ipynb|r)$/i.test(x.path)).length,source_files_with_resolved_dependencies:workflowInferences.length,workflow_nodes:workflowInferences.length,workflow_edges:edges.length,resolved_artifact_references:workflowInferences.reduce((a,w)=>a+w.resolved_references.length,0),unresolved_items:workflowUnresolved.length}}
}
async function rebuild(){
  if(!sourceFiles.length)return;
  lastDraft=await buildDraft();
  const unsupported=inventory.filter(x=>!lastDraft.artifacts.some(a=>a.id===x.artifact_id)).map(x=>x.path),workflowMap=workflowMapForReport();
  lastReport={format:"pcs-project-discovery-v1",project_root_name:lastDraft.pcs_intake.project_root_name,subject:lastDraft.subject,inventory_commitment_sha256:lastDraft.pcs_intake.inventory_commitment_sha256,inventory:inventory.map(({file,...x})=>x),skipped,recommendations,selected_recommendations:lastDraft.pcs_intake.selected_recommendations,workflow_map:workflowMap,selected_workflow_inferences:lastDraft.pcs_intake.selected_workflow_inferences,environment_capture:environmentCapture,unresolved:[...workflowUnresolved,...(environmentCapture?.unresolved||[]),...(lastDraft.claims.length?[]:[{type:"no-supported-checks-detected",message:"No currently supported PCS check was detected."}]),...(unsupported.length?[{type:"unselected-artifacts",message:"Some discovered files are not referenced by a selected check or workflow step.",paths:unsupported.slice(0,100),truncated:unsupported.length>100}]:[])],summary:{files_inventoried:inventory.length,files_skipped:skipped.length,bytes_inventoried:inventory.reduce((a,x)=>a+x.size,0),recommendations:recommendations.length,selected_recommendations:selected.size,claims_drafted:lastDraft.claims.length,checks_drafted:lastDraft.checks.length,artifacts_selected:lastDraft.artifacts.length,workflow_sources_analyzed:workflowMap.summary.source_files_considered,workflow_nodes_drafted:lastDraft.workflow.nodes.length,workflow_edges_inferred:workflowMap.summary.workflow_edges,workflow_unresolved_items:workflowUnresolved.length,environment_sources:environmentCapture?.summary?.source_files||0,environment_dependencies:environmentCapture?.summary?.dependency_records||0,environment_unresolved_items:environmentCapture?.summary?.unresolved_items||0,environment_hermeticity:environmentCapture?.hermeticity||"environment_unspecified"},manifest_draft:lastDraft};
  $("manifestPreview").textContent=JSON.stringify(lastDraft,null,2);$("downloadDraft").disabled=false;$("downloadDiscovery").disabled=false;$("downloadReview").disabled=false;
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
  $("workflowInferences").innerHTML=workflowInferences.length?workflowInferences.map(workflowCard).join(""):'<p class="tiny">No literal local Python/notebook/R file dependencies were inferred.</p>';
  $("workflowInferences").querySelectorAll("[data-wf]").forEach(x=>x.addEventListener("change",async e=>{e.target.checked?selectedWorkflow.add(e.target.dataset.wf):selectedWorkflow.delete(e.target.dataset.wf);await render()}));
  $("workflowIssues").textContent=workflowUnresolved.length?`${workflowUnresolved.length} unresolved workflow item(s). Use the Python CLI AST analyzer for authoritative review.`:"No unresolved browser workflow references.";
  renderWorkflowGraph();
  const env=environmentCapture;
  if(env){
    const py=env.python.interpreter_constraints.map(x=>x.value).join(", ")||"not declared";
    const rv=env.r.interpreter_constraints.map(x=>x.value).join(", ")||"not declared";
    $("environmentSummary").innerHTML=`<div><strong>Hermeticity</strong><span>${esc(env.hermeticity)}</span></div><div><strong>Python</strong><span>${esc(py)} · ${env.python.dependencies.length} dependency record(s)</span></div><div><strong>R</strong><span>${esc(rv)} · ${env.r.dependencies.length} dependency record(s)</span></div><div><strong>Container specs</strong><span>${env.containers.length} · ${env.containers.every(x=>x.all_base_images_digest_pinned)&&env.containers.length?"digest-pinned":"not fully digest-pinned"}</span></div><div><strong>Reconstruction</strong><span>${env.replay_plan.steps.map(x=>x.kind).join(", ")||"no strategy detected"}</span></div>`;
    $("environmentIssues").textContent=env.unresolved.length?`${env.unresolved.length} environment issue(s) require review.`:"No unresolved environment items in browser preview.";
    $("environmentHermeticity").textContent=env.hermeticity;
    $("downloadEnvironmentPlan").disabled=false;
  }else{
    $("environmentSummary").innerHTML='<div><strong>No environment capture yet</strong><span>Choose a project folder to begin.</span></div>';
    $("environmentIssues").textContent="";
    $("environmentHermeticity").textContent="unspecified";
    $("downloadEnvironmentPlan").disabled=true;
  }
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
$("rescan").onclick=async()=>{await detect();await detectBrowserWorkflow();await detectBrowserEnvironment();autoSelect();await render()};
$("clearProject").onclick=()=>{sourceFiles=[];inventory=[];recommendations=[];skipped=[];selected.clear();workflowInferences=[];workflowUnresolved=[];selectedWorkflow.clear();environmentCapture=null;lastDraft=lastReport=null;$("projectFiles").value="";$("recommendations").innerHTML='<p class="tiny">Choose a project folder to begin.</p>';$("workflowInferences").innerHTML='<p class="tiny">Choose a project folder to begin.</p>';$("workflowIssues").textContent="";$("workflowGraph").innerHTML='<p class="tiny">No workflow graph yet.</p>';$("environmentSummary").innerHTML='<div><strong>No environment capture yet</strong><span>Choose a project folder to begin.</span></div>';$("environmentIssues").textContent="";$("inventory").innerHTML="";$("manifestPreview").textContent="{}";$("draftValidation").className="validation";$("draftValidation").textContent="No project selected.";["filesCount","recommendationCount","selectedCount","artifactCount","workflowCount","workflowIssueCount"].forEach(id=>$(id).textContent="0");$("downloadDraft").disabled=true;$("downloadDiscovery").disabled=true;$("downloadReview").disabled=true;$("downloadEnvironmentPlan").disabled=true;$("environmentHermeticity").textContent="unspecified";$("mapperState").textContent="NO PROJECT"};
$("toggleInventory").onclick=()=>{const box=$("inventory"),show=box.hidden;box.hidden=!show;$("toggleInventory").textContent=show?"Hide":"Show"};
$("downloadDraft").onclick=()=>lastDraft&&downloadJson("pcs-manifest.draft.json",lastDraft);
$("downloadDiscovery").onclick=()=>lastReport&&downloadJson("pcs-discovery.json",lastReport);
$("downloadReview").onclick=()=>lastReport&&downloadText("pcs-discovery-review.md",discoveryReviewMarkdown(),"text/markdown");
$("downloadEnvironmentPlan").onclick=()=>environmentCapture&&downloadJson("pcs-environment-plan.json",environmentCapture.replay_plan);
$("copyConfirm").onclick=async()=>{try{await navigator.clipboard.writeText($("confirmCommand").textContent);$("copyConfirm").textContent="Copied";setTimeout(()=>$("copyConfirm").textContent="Copy",1200)}catch{$("copyConfirm").textContent="Select + copy"}};

// Public adapter used by the beginner Guided Submission flow.
// It deliberately reuses the same discovery/draft engine as Advanced Mapper.
function pcsMapperApiClone(value){
  if(value==null)return value;
  try{return structuredClone(value)}catch{return JSON.parse(JSON.stringify(value))}
}
function pcsMapperApiState(){
  return {
    subject: $("subject")?.value?.trim() || "scientific-project",
    inventory: inventory.map(({file,...x})=>pcsMapperApiClone(x)),
    skipped: pcsMapperApiClone(skipped),
    recommendations: recommendations.map(r=>({
      id:r.id,
      detector:r.detector,
      confidence:r.confidence,
      reason:r.reason,
      selected:selected.has(r.id),
      claim:pcsMapperApiClone(r.claim),
      check:pcsMapperApiClone(r.check),
      artifact_ids:[...(r.artifact_ids||[])],
      formal_explanation:pcsMapperApiClone(explainPredicate(r.claim?.predicate))
    })),
    workflow_inferences: workflowInferences.map(w=>({
      id:w.id,
      selected:selectedWorkflow.has(w.id),
      source_path:w.source_path,
      source_kind:w.source_kind,
      confidence:w.confidence,
      read_paths:[...(Array.isArray(w.read_paths)?w.read_paths:[])],
      write_paths:[...(Array.isArray(w.write_paths)?w.write_paths:[])],
      unresolved_reference_count:w.unresolved_reference_count
    })),
    workflow_unresolved: pcsMapperApiClone(workflowUnresolved),
    environment_capture: pcsMapperApiClone(environmentCapture),
    draft: pcsMapperApiClone(lastDraft),
    report: pcsMapperApiClone(lastReport)
  };
}
window.PCSProjectMapper = Object.freeze({
  async loadFiles(files, options={}){
    const list=[...(files||[])];
    if(!list.length)throw new Error("No project files were provided.");
    if(options.subject && $("subject")) $("subject").value=String(options.subject);
    await inspectFiles(list);
    return pcsMapperApiState();
  },
  async loadExample(){
    await loadSyntheticExample();
    return pcsMapperApiState();
  },
  getState(){return pcsMapperApiState()},
  async setSubject(value){
    $("subject").value=String(value||"").trim()||"scientific-project";
    await rebuild();
    return pcsMapperApiState();
  },
  async setRecommendationSelected(id, enabled){
    if(enabled) selected.add(id); else selected.delete(id);
    await render();
    return pcsMapperApiState();
  },
  async setClaimStatement(claimId, statement){
    const next=String(statement||"").trim();
    if(!next)throw new Error("Claim statement cannot be empty.");
    let changed=false;
    for(const r of recommendations){
      if(r.claim?.id===claimId){r.claim.statement=next;changed=true}
    }
    if(!changed)throw new Error("Unknown claim: "+claimId);
    await render();
    return pcsMapperApiState();
  },
  explainPredicate(predicate){
    return pcsMapperApiClone(explainPredicate(predicate));
  },
  downloadDraft(){
    if(!lastDraft)throw new Error("No manifest draft is ready.");
    downloadJson("pcs-manifest.draft.json",lastDraft);
  },
  downloadDiscovery(){
    if(!lastReport)throw new Error("No discovery report is ready.");
    downloadJson("pcs-discovery.json",lastReport);
  },
  downloadReview(){
    if(!lastReport)throw new Error("No discovery review is ready.");
    downloadText("pcs-discovery-review.md",discoveryReviewMarkdown(),"text/markdown");
  },
  downloadEnvironmentPlan(){
    if(!environmentCapture)throw new Error("No environment reconstruction plan is ready.");
    downloadJson("pcs-environment-plan.json",environmentCapture.replay_plan);
  }
});

