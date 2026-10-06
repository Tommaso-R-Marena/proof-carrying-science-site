(() => {
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
let snapshot={user:null,roles:[]};
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
async function api(path,options={}){
  const init={credentials:"same-origin",...options};
  if(init.body&&typeof init.body!=="string"){init.headers={...(init.headers||{}),"content-type":"application/json"};init.body=JSON.stringify(init.body);}
  const res=await fetch(path,init);const data=await res.json().catch(()=>({message:"Invalid server response."}));
  if(!res.ok){const e=new Error(data.message||"Request failed.");e.status=res.status;e.code=data.error;throw e;}return data;
}
function roleCard(role){
  const app=role.my_application;
  let action="";
  if(app?.status==="pending"){
    action=`<div class="actions"><span class="commons-chip planned">APPLICATION PENDING</span><button class="button secondary" data-withdraw-role="${esc(app.id)}" type="button">Withdraw</button></div>`;
  }else if(app?.status==="approved"){
    action='<div class="actions"><span class="commons-chip volunteer">APPROVED ROLE</span></div>';
  }else if(role.eligibility?.can_apply){
    action=`<div class="actions"><button class="button primary" data-apply-role="${esc(role.id)}" type="button">Apply for role</button></div>`;
  }else{
    action=`<div class="role-eligibility locked"><strong>${esc(role.eligibility?.reason||"Not currently eligible.")}</strong></div>`;
  }
  return `<article class="role-card">
    <div class="task-card-top"><div><span class="commons-chip category">${esc(role.category)}</span><span class="commons-chip level">L${esc(role.min_level)}+</span></div><code>${esc(role.id)}</code></div>
    <h3>${esc(role.title)}</h3><p>${esc(role.summary)}</p>
    <div class="task-meta"><span><b>${esc(role.expected_hours_per_week)}h/week</b> expected</span><span><b>${esc(role.slots)}</b> pilot slot${Number(role.slots)===1?"":"s"}</span><span><b>manual</b> selection</span></div>
    <div class="role-detail"><strong>Responsibilities</strong><p>${esc(role.responsibilities)}</p></div>
    <div class="role-detail"><strong>Selection criteria</strong><p>${esc(role.selection_criteria)}</p></div>
    ${action}
  </article>`;
}
function render(){
  const banner=$("#roleAccountBanner");
  if(snapshot.user)banner.innerHTML=`<strong>Signed in: L${snapshot.user.level} · ${esc(snapshot.user.display_name)}</strong><span>Role applications are reviewed manually and do not grant technical authority.</span>`;
  else banner.innerHTML='<strong>Sign in required to apply:</strong><span>You can browse openings now. Create or sign into a contributor account when you are ready to apply.</span>';
  $("#roleList").innerHTML=snapshot.roles.map(roleCard).join("")||'<div class="commons-empty"><strong>No roles are published right now.</strong><span>PCS only exposes openings it is actively prepared to review.</span></div>';
  $("#roleCount").textContent=`${snapshot.roles.length} current opening${snapshot.roles.length===1?"":"s"}`;
  $$("[data-apply-role]").forEach(btn=>btn.addEventListener("click",()=>openApplication(btn.dataset.applyRole)));
  $$("[data-withdraw-role]").forEach(btn=>btn.addEventListener("click",async()=>{
    if(!confirm("Withdraw this role application?"))return;
    try{await api(`/api/roles/applications/${encodeURIComponent(btn.dataset.withdrawRole)}/withdraw`,{method:"POST"});await refresh();}catch(e){alert(e.message);}
  }));
}
function openApplication(id){
  if(!snapshot.user){location.href="account.html?next="+encodeURIComponent("/roles.html");return;}
  const role=snapshot.roles.find(r=>r.id===id),dialog=$("#roleApplicationDialog"),form=$("#roleApplicationForm");
  form.reset();form.elements.role_id.value=id;$("#roleApplicationTitle").textContent=`Apply for ${id} — ${role?.title||"role"}`;$("#roleApplicationMessage").textContent="";dialog.showModal();
}
function initDialog(){
  const dialog=$("#roleApplicationDialog"),form=$("#roleApplicationForm");
  $("#closeRoleApplication")?.addEventListener("click",()=>dialog.close());
  form?.addEventListener("submit",async event=>{
    event.preventDefault();const fd=new FormData(form),id=fd.get("role_id"),msg=$("#roleApplicationMessage");
    try{
      const result=await api(`/api/roles/${encodeURIComponent(id)}/apply`,{method:"POST",body:{note:fd.get("note"),experience:fd.get("experience"),availability:fd.get("availability")}});
      msg.textContent=result.message;msg.className="form-message successline";
      setTimeout(()=>{dialog.close();refresh();},900);
    }catch(e){msg.textContent=e.message;msg.className="form-message validation bad";}
  });
}
async function refresh(){const data=await api("/api/roles");snapshot={user:data.user||null,roles:data.roles||[]};render();}
document.addEventListener("DOMContentLoaded",async()=>{initDialog();try{await refresh();}catch(e){$("#roleList").innerHTML=`<div class="commons-empty"><strong>Roles unavailable.</strong><span>${esc(e.message)}</span></div>`;}});
})();