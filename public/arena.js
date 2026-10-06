(() => {
"use strict";
const $=(s,r=document)=>r.querySelector(s);
const $$=(s,r=document)=>[...r.querySelectorAll(s)];
const esc=v=>String(v??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let snapshot={user:null,challenges:[]};
async function api(path,options={}){
    if(typeof path!=="string" || !path.startsWith("/api/")) throw new Error("Same-origin PCS API path required.");
  const init={credentials:"same-origin",...options};
  if(init.body&&typeof init.body!=="string"){init.headers={...(init.headers||{}),"content-type":"application/json"};init.body=JSON.stringify(init.body);}
  const res=await fetch(path,init);const data=await res.json().catch(()=>({message:"Invalid server response."}));
  if(!res.ok){const e=new Error(data.message||"Request failed.");e.status=res.status;e.code=data.error;throw e;}return data;
}
function scoreFromForm(form){
  const fd=new FormData(form);
  return 10*Number(fd.get("workflow_nodes")||0)+5*Number(fd.get("dependency_edges")||0)+5*Number(fd.get("evidence_items")||0)+5*Number(fd.get("claims")||0);
}
function leaderboard(rows){
  if(!rows.length)return '<div class="commons-empty"><strong>No validated entries yet.</strong><span>The leaderboard stays empty until a reviewer validates a submission.</span></div>';
  return `<div class="arena-leaderboard">${rows.map(row=>`
    <article>
      <strong>#${esc(row.rank)}</strong>
      <div><b>${esc(row.alias)}</b><span>${esc(row.summary)}</span></div>
      <div class="arena-rank-score"><b>${esc(row.score)}</b><small>verified score</small></div>
      <a href="${esc(row.artifact_url)}" target="_blank" rel="noopener">artifact ↗</a>
    </article>`).join("")}</div>`;
}
function ownEntries(challenge){
  const rows=challenge.my_entries||[];
  if(!rows.length)return "";
  return `<details class="arena-own"><summary>Your entries (${rows.length})</summary>${rows.map(row=>`
    <div><span class="commons-chip ${row.status==="verified"?"volunteer":row.status==="rejected"?"planned":""}">${esc(row.status)}</span><b>${esc(row.leaderboard_alias)}</b><span>score ${esc(row.raw_score)}</span>${row.status==="pending"?`<button class="smallbutton" data-withdraw-entry="${esc(row.id)}">Withdraw</button>`:""}${row.review_note?`<small>${esc(row.review_note)}</small>`:""}</div>`).join("")}</details>`;
}
function challengeCard(challenge){
  const e=challenge.eligibility||{};
  const action=e.can_submit
    ? `<button class="button primary" data-enter-challenge="${esc(challenge.id)}">Submit candidate</button>`
    : e.state==="login_required"
      ? '<a class="button primary" href="account.html?next=%2Farena.html">Sign in to enter</a>'
      : `<span class="arena-ineligible">${esc(e.reason||"Not eligible.")}</span>`;
  return `<article class="arena-challenge-card">
    <div class="task-card-top"><div><span class="commons-chip level">L${esc(challenge.min_level)}+</span><span class="commons-chip program">${esc(challenge.leaderboard_state)} pilot</span><span class="commons-chip category">${esc(challenge.verification_mode.replaceAll("_"," "))}</span></div><code>${esc(challenge.id)}</code></div>
    <h2>${esc(challenge.title)}</h2><p>${esc(challenge.summary)}</p>
    <div class="arena-objective"><strong>Objective</strong><span>${esc(challenge.objective)}</span></div>
    <div class="arena-score-rule"><strong>Scoring</strong><span>${esc(challenge.scoring_rule)}</span><b>${challenge.score_direction==="min"?"LOWER IS BETTER":"HIGHER IS BETTER"}</b></div>
    <div class="actions">${action}<a class="button secondary" href="tasks.html?task=${encodeURIComponent(challenge.task_id||"")}">Related PCS task</a></div>
    ${ownEntries(challenge)}
    <div class="arena-board-head"><div><span>VERIFIED LEADERBOARD</span><h3>Best validated entry per contributor</h3></div><strong>${(challenge.leaderboard||[]).length} ranked</strong></div>
    ${leaderboard(challenge.leaderboard||[])}
  </article>`;
}
function render(){
  const banner=$("#arenaAccountBanner");
  if(snapshot.user)banner.innerHTML=`<strong>Signed in: L${snapshot.user.level} · ${esc(snapshot.user.display_name)}</strong><span>Arena rank is challenge-local and does not automatically change level or skills.</span>`;
  else banner.innerHTML='<strong>Browse freely:</strong><span>Sign in only when you want to submit. Public rankings use contributor-chosen aliases, not account email/name.</span>';
  $("#arenaChallenges").innerHTML=snapshot.challenges.map(challengeCard).join("")||'<div class="commons-empty"><strong>No Arena challenges are open.</strong><span>PCS only opens a challenge when the scoring and validation rule are defensible.</span></div>';
  $("#arenaCount").textContent=`${snapshot.challenges.length} open challenge${snapshot.challenges.length===1?"":"s"}`;
  $$("[data-enter-challenge]").forEach(btn=>btn.addEventListener("click",()=>openEntry(btn.dataset.enterChallenge)));
  $$("[data-withdraw-entry]").forEach(btn=>btn.addEventListener("click",async()=>{
    if(!confirm("Withdraw this unreviewed Arena entry?"))return;
    try{await api(`/api/challenges/entries/${encodeURIComponent(btn.dataset.withdrawEntry)}/withdraw`,{method:"POST"});await refresh();}catch(e){alert(e.message);}
  }));
}
function openEntry(id){
  const challenge=snapshot.challenges.find(c=>c.id===id),dialog=$("#arenaEntryDialog"),form=$("#arenaEntryForm");
  form.reset();form.elements.challenge_id.value=id;$("#arenaEntryTitle").textContent=`Enter ${id} — ${challenge?.title||"challenge"}`;$("#arenaEntryMessage").textContent="";updateScore();dialog.showModal();
}
function updateScore(){
  const form=$("#arenaEntryForm"),target=$("#arenaProvisionalScore span");if(form&&target)target.textContent=String(scoreFromForm(form));
}
function initDialog(){
  const dialog=$("#arenaEntryDialog"),form=$("#arenaEntryForm");
  $("#closeArenaEntry")?.addEventListener("click",()=>dialog.close());
  ["workflow_nodes","dependency_edges","evidence_items","claims"].forEach(name=>form?.elements[name]?.addEventListener("input",updateScore));
  form?.addEventListener("submit",async event=>{
    event.preventDefault();const fd=new FormData(form),id=fd.get("challenge_id"),msg=$("#arenaEntryMessage");
    const body={leaderboard_alias:fd.get("leaderboard_alias"),artifact_url:fd.get("artifact_url"),summary:fd.get("summary"),hidden_dependency_explanation:fd.get("hidden_dependency_explanation"),workflow_nodes:Number(fd.get("workflow_nodes")),dependency_edges:Number(fd.get("dependency_edges")),evidence_items:Number(fd.get("evidence_items")),claims:Number(fd.get("claims"))};
    try{
      const result=await api(`/api/challenges/${encodeURIComponent(id)}/submit`,{method:"POST",body});
      msg.textContent=result.message+` Provisional score: ${result.provisional_score}.`;msg.className="form-message successline";
      setTimeout(()=>{dialog.close();refresh();},1100);
    }catch(e){msg.textContent=e.message;msg.className="form-message validation bad";}
  });
}
async function refresh(){const data=await api("/api/challenges");snapshot={user:data.user||null,challenges:data.challenges||[]};render();}
document.addEventListener("DOMContentLoaded",async()=>{initDialog();try{await refresh();}catch(e){$("#arenaChallenges").innerHTML=`<div class="commons-empty"><strong>Arena unavailable.</strong><span>${esc(e.message)}</span></div>`;}});
})();