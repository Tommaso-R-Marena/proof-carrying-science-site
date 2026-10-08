const $=id=>document.getElementById(id);
function node(tag,txt,cls){const v=document.createElement(tag);if(txt!==undefined)v.textContent=String(txt);if(cls)v.className=cls;return v;}
function external(url){
 try{const x=new URL(url);return x.protocol==="https:"&&x.hostname==="github.com"?x.href:null;}catch{return null;}
}
function link(text,href,cls="button secondary"){const a=node("a",text,cls);a.href=href;return a;}
function api(path){
 if(typeof path!=="string"||!path.startsWith("/api/"))throw Error("Same-origin PCS API path required.");
 return fetch(path,{credentials:"same-origin"});
}
function status(s){$("boardStatus").textContent=s;}
function stages(req,sub){
 const requestDone=["approved","completed"].includes(req.status);
 const submitted=Boolean(sub);
 const cicheck=false; // A staged PR is NOT proof of a successful exact-head CI job.
 const reviewed=Boolean(sub&&["accepted","rejected","needs_changes"].includes(sub.status));
 const archived=Boolean(sub?.github_stage_state==="merged");
 const production=Boolean(sub?.production_promotion_state==="merged");
 return [
  ["Task assigned",requestDone,req.status==="pending"?"Waiting for qualification/approval":req.status],
  ["Work submitted",submitted,submitted?"Submission received":"Submit the accepted task in Account"],
  ["Independent CI checks",cicheck,sub?.github_stage_state==="merged"?"Archived after previously checked CI; view the receipt below":(sub?.github_stage_state==="staged"?"Staged is NOT passed. Click Check CI status for live verification.":sub?.github_stage_state||"No code verification required / no PR yet")],
  ["Human review",reviewed,sub?.status||"Not yet submitted"],
  ["Evidence archived",archived,archived?"Staging PR merged":"Archival merge is separate from production"],
  ["Production promotion",production,sub?.production_promotion_state||"Not requested / not applicable"]
 ];
}
function badge(label,okay,detail){
 const li=node("li");const strong=node("strong",(okay?"✓ ":"○ ")+label);
 strong.style.color=okay?"#106b58":"#334c60";
 li.append(strong,node("div",detail,"meaning-small"));return li;
}
async function checkSubmission(id,msg,button){
 button.disabled=true;msg.textContent="Checking pinned GitHub PR and required verification…";
 try{
  const r=await api("/api/submissions/"+encodeURIComponent(id)+"/checks");
  const j=await r.json();if(!r.ok)throw Error(j.message||"Checks unavailable");
  msg.textContent=j.verified?"Required staged contribution check verified for pinned head "+String(j.head_sha||"").slice(0,12)+".":
   "Not verified yet: "+(j.message||j.state||"pending / missing CI");
 }catch(e){msg.textContent=e.message;}finally{button.disabled=false;}
}
function renderWork(req,subs){
 const sub=subs.find(s=>s.request_id===req.id)||null;
 const article=node("article");article.className="panel";
 article.append(node("div",req.task_id+" · "+(req.task_category||"needed work"),"meaning-section-label"),
   node("h2",req.title));
 article.append(node("p","Assignment: "+req.status+" · Integration: "+(req.integration_target||"none"),"meaning-small"));
 const ol=node("ol");ol.className="meaning-history";ol.style.maxHeight="none";
 for(const [title,okay,detail] of stages(req,sub))ol.append(badge(title,okay,detail));
 article.append(ol);
 const actions=node("div");actions.className="meaning-actions";
 actions.append(link("Open task →","tasks.html?task="+encodeURIComponent(req.task_id)),
   link("Continue in Account →","account.html?task="+encodeURIComponent(req.task_id)));
 if(sub){
  const u=external(sub.github_pr_url),p=external(sub.production_promotion_url);
  if(u)actions.append(link("View submission PR ↗",u));
  if(p)actions.append(link("View promotion PR ↗",p));
  if(sub.github_pr_number){
   const button=node("button","Check CI status","button secondary");button.type="button";
   const msg=node("p","","meaning-feedback");
   button.addEventListener("click",()=>checkSubmission(sub.id,msg,button));
   article.append(msg);actions.append(button);
  }
  if(sub.review_note)article.append(node("p","Reviewer feedback: "+sub.review_note,"meaning-small"));
  if(sub.production_review_note)article.append(node("p","Promotion feedback: "+sub.production_review_note,"meaning-small"));
 }
 article.append(actions);return article;
}
async function refresh(){
 const button=$("boardRefresh");button.disabled=true;status("Reading your private PCS work records…");
 try{
  const response=await api("/api/me");
  if(!response.ok)throw Error("PCS account status unavailable.");
  const me=await response.json();
  const root=$("boardItems");root.replaceChildren();
  if(!me.authenticated){root.append(node("p","Sign in first to see your applications and submissions."));
   root.append(link("Sign in →","account.html"));status("Your work is private and only visible when signed in.");return;}
  $("boardTitle").textContent=(me.requests||[]).length+" task request(s)";
  const reqs=[...(me.requests||[])].sort((a,b)=>String(b.requested_at||"").localeCompare(String(a.requested_at||"")));
  if(!reqs.length){root.append(node("p","No task requests yet. Start with a published L0/L1 task and return here to track it."));
   root.append(link("Find a first task →","tasks.html"));}
  for(const req of reqs)root.append(renderWork(req,me.submissions||[]));
  status("Showing your current task records. Refresh after making a submission or receiving a decision.");
 }catch(e){status("Could not load work: "+e.message);}
 finally{button.disabled=false;}
}
$("boardRefresh").addEventListener("click",refresh);refresh();