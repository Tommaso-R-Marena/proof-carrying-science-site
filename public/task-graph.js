(() => {
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let graph={tasks:[],edges:[],groups:[]};

async function api(path){
    if(typeof path!=="string" || !path.startsWith("/api/")) throw new Error("Same-origin PCS API path required.");
  const res=await fetch(path,{credentials:"same-origin"});
  const data=await res.json().catch(()=>({message:"Invalid server response."}));
  if(!res.ok)throw new Error(data.message||"Request failed.");
  return data;
}
function edgesFor(id){return graph.edges.filter(e=>e.task_id===id);}
function groupsFor(id){return graph.groups.filter(g=>g.task_id===id);}
function taskState(task){
  const edges=edgesFor(task.id),groups=groupsFor(task.id);
  let blocked=false;
  for(const group of groups){
    const members=edges.filter(e=>e.group_id===group.id);
    const satisfied=members.filter(e=>e.completed).length;
    const required=group.mode==="all"?members.length:group.mode==="any"?1:Math.max(1,Number(group.min_satisfied||1));
    if(satisfied<required)blocked=true;
  }
  if(edges.some(e=>e.dependency_type==="hard"&&!e.group_id&&!e.completed))blocked=true;
  return blocked?"blocked":"ready";
}
function groupCard(group,edges){
  const members=edges.filter(e=>e.group_id===group.id);
  const satisfied=members.filter(e=>e.completed).length;
  const required=group.mode==="all"?members.length:group.mode==="any"?1:Math.max(1,Number(group.min_satisfied||1));
  const done=satisfied>=required;
  return `<div class="dependency-group ${done?"ready":"blocked"}">
    <div><strong>${esc(group.label)}</strong><span>${esc(group.mode==="all"?"ALL":group.mode==="any"?"ANY":`AT LEAST ${required}`)} · ${satisfied}/${members.length} accepted</span></div>
    <p>${esc(group.description||"")}</p>
  </div>`;
}
function edgeCard(edge){
  return `<div class="dependency-edge ${edge.completed?"complete":edge.dependency_type==="hard"?"blocked":"informative"}">
    <div class="dependency-edge-head"><span>${edge.completed?"✓ accepted":edge.dependency_type==="hard"?"blocking":"informative"}</span><code>${esc(edge.depends_on_task_id)}</code><b>→ ${esc(edge.relation||"requires")}</b></div>
    <p>${esc(edge.artifact_contract||edge.rationale||"Dependency relationship.")}</p>
    <small>criticality ${esc(edge.criticality??50)} · required outcome: ${esc(edge.required_outcome||"completed")}</small>
  </div>`;
}
function nodeCard(task){
  const edges=edgesFor(task.id),groups=groupsFor(task.id),state=taskState(task);
  return `<article class="task-graph-node ${state}" id="node-${esc(task.id)}">
    <div class="task-card-top"><div><span class="commons-chip level">L${esc(task.min_level)}</span><span class="commons-chip category">${esc(task.category||"research")}</span><span class="commons-chip ${state==="blocked"?"planned":"volunteer"}">${state.toUpperCase()}</span></div><code>${esc(task.id)}</code></div>
    <h3>${esc(task.title)}</h3><p>${esc(task.summary)}</p>
    ${task.why_now?`<div class="task-why-now"><strong>Why now</strong><span>${esc(task.why_now)}</span></div>`:""}
    ${groups.length?`<div class="dependency-groups">${groups.map(g=>groupCard(g,edges)).join("")}</div>`:""}
    ${edges.length?`<div class="dependency-edges">${edges.map(edgeCard).join("")}</div>`:'<div class="dependency-root"><strong>Root / independently startable node</strong><span>No blocking prerequisites are declared.</span></div>'}
    <div class="actions"><a class="button secondary" href="tasks.html?task=${encodeURIComponent(task.id)}">Open task</a></div>
  </article>`;
}
function populateFilter(){
  const values=new Map();
  for(const task of graph.tasks){
    if(task.program_id)values.set("program:"+task.program_id,task.program_id);
    values.set("category:"+task.category,task.category);
  }
  const select=$("#graphFilter");
  for(const [value,label] of [...values.entries()].sort((a,b)=>a[1].localeCompare(b[1]))){
    const option=document.createElement("option");option.value=value;option.textContent=label;select.appendChild(option);
  }
}
function render(){
  const filter=$("#graphFilter").value,stateFilter=$("#graphState").value;
  let tasks=graph.tasks.filter(task=>{
    const matches=filter==="all"||(filter.startsWith("program:")&&task.program_id===filter.slice(8))||(filter.startsWith("category:")&&task.category===filter.slice(9));
    return matches&&(stateFilter==="all"||taskState(task)===stateFilter);
  });
  const programs=new Map();
  for(const task of tasks){
    const key=task.program_id||("category:"+task.category);
    if(!programs.has(key))programs.set(key,[]);
    programs.get(key).push(task);
  }
  $("#taskGraphPrograms").innerHTML=[...programs.entries()].map(([key,nodes])=>`
    <section class="task-graph-program">
      <div class="task-graph-program-head"><div><span>${key.startsWith("category:")?"WORKSTREAM":"PROGRAM"}</span><h2>${esc(key.replace("category:",""))}</h2></div><strong>${nodes.length} node${nodes.length===1?"":"s"}</strong></div>
      <div class="task-graph-node-list">${nodes.sort((a,b)=>(b.priority||0)-(a.priority||0)||(a.program_step||999)-(b.program_step||999)).map(nodeCard).join("")}</div>
    </section>`).join("")||'<div class="commons-empty"><strong>No graph nodes match this view.</strong><span>Change the graph filters.</span></div>';
  const ready=graph.tasks.filter(t=>taskState(t)==="ready").length,blocked=graph.tasks.length-ready;
  $("#taskGraphStats").innerHTML=`<article><strong>${graph.tasks.length}</strong><span>published needed nodes</span></article><article><strong>${graph.edges.length}</strong><span>explicit dependency edges</span></article><article><strong>${ready}</strong><span>ready now</span></article><article><strong>${blocked}</strong><span>blocked by gates</span></article>`;
  const params=new URLSearchParams(location.search),focus=params.get("task");
  if(focus){const node=document.getElementById("node-"+focus);if(node){node.classList.add("task-focus");setTimeout(()=>node.scrollIntoView({behavior:"smooth",block:"center"}),100);}}
}
document.addEventListener("DOMContentLoaded",async()=>{
  try{const data=await api("/api/task-graph");graph={tasks:data.tasks||[],edges:data.edges||[],groups:data.groups||[]};populateFilter();render();$("#graphFilter").addEventListener("change",render);$("#graphState").addEventListener("change",render);}
  catch(e){$("#taskGraphPrograms").innerHTML=`<div class="commons-empty"><strong>Dependency graph unavailable.</strong><span>${esc(e.message)}</span></div>`;}
});
})();