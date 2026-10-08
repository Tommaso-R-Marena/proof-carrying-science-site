const $=id=>document.getElementById(id);
async function api(path,opts={}){
 const r=await fetch(path,{credentials:"same-origin",...opts});
 const body=await r.json().catch(()=>({message:"Server response unavailable."}));
 if(!r.ok)throw Error(body.message||"Request rejected.");return body;
}
function paragraph(text,cls=""){const p=document.createElement("p");p.textContent=String(text||"");if(cls)p.className=cls;return p;}
function heading(text,tag="h2"){const e=document.createElement(tag);e.textContent=text;return e;}
function label(text){
 const e=document.createElement("div");e.className="meaning-section-label";e.textContent=text;return e;
}
async function reviewItem(item,form,submit,feedback){
 if(submit.disabled)return;
 const labelValue=form.querySelector("select").value;
 const reason=form.querySelector("textarea").value.trim();
 if(reason.length<20){feedback.textContent="Write at least 20 characters of evidence-based rationale.";return;}
 submit.disabled=true;feedback.textContent="Recording independent review…";
 try{
  await api("/api/reviewer/meaning/"+encodeURIComponent(item.id)+"/review",{
   method:"POST",headers:{"content-type":"application/json"},
   body:JSON.stringify({label:labelValue,rationale:reason})
  });
  form.replaceWith(paragraph("Review recorded. Thank you for protecting the training-data quality.","meaning-feedback good"));
  feedback.textContent="This review is immutable and auditable.";
 }catch(e){feedback.textContent=e.message;submit.disabled=false;}
}
function card(item){
 const article=document.createElement("article");article.className="panel";
 article.append(label(item.mission_id+" · "+item.mode));
 article.append(heading("Interpretation under review","h2"));
 article.append(label("Given challenge"));article.append(paragraph(item.given));
 article.append(label("Submitted final structured meaning"));
 const pre=document.createElement("pre");
 pre.style.whiteSpace="pre-wrap";pre.style.wordBreak="break-word";
 pre.textContent=JSON.stringify(item.final_ir,null,2);article.append(pre);
 article.append(label("Human explanation (NOT independently verified)"));article.append(paragraph(item.explanation));
 article.append(paragraph(item.notes,"meaning-small"));
 const form=document.createElement("div");
 const select=document.createElement("select");select.className="textinput";
 for(const [value,text] of [["faithful","Faithful"],["unfaithful","Unfaithful"],
 ["ambiguous","Ambiguous"],["unsupported","Unsupported claim"]]){
  const o=document.createElement("option");o.value=value;o.textContent=text;select.append(o);
 }
 const textarea=document.createElement("textarea");
 textarea.className="textinput";textarea.rows=3;textarea.minLength=20;textarea.maxLength=1500;
 textarea.placeholder="Explain exactly which words correspond to the final structure.";
 const button=document.createElement("button");button.type="button";button.className="button primary";button.textContent="Submit independent review";
 const feedback=paragraph("","meaning-feedback");button.onclick=()=>reviewItem(item,form,button,feedback);
 form.append(label("Your evidence-based label"),select,label("Review rationale"),textarea,button);article.append(form,feedback);
 return article;
}

function verifiedGithubLink(raw){
 try{const url=new URL(raw);return url.protocol==="https:"&&url.hostname==="github.com"?url.href:null;}
 catch{return null;}
}
function submissionCard(item){
 const article=document.createElement("article");article.className="panel";
 article.append(label(item.task_id+" · "+item.integration_target),heading(item.title),paragraph(item.summary));
 article.append(label("Task acceptance criteria"),paragraph(item.acceptance_criteria));
 article.append(label("Independent verification plan"),paragraph(item.verification_note));
 article.append(label("Contributor explanation and limitations"),paragraph(item.understanding_note));
 article.append(label("Expected independent checks"),paragraph(item.verification_rule));
 const pr=verifiedGithubLink(item.github_pr_url);
 if(pr){const a=document.createElement("a");a.href=pr;a.rel="noopener noreferrer";a.target="_blank";a.textContent="Inspect staged GitHub artifact PR ↗";article.append(a);}
 const filesBtn=document.createElement("button");filesBtn.type="button";filesBtn.className="button secondary";filesBtn.textContent="Inspect attached text evidence";
 const files=document.createElement("div");files.className="meaning-history";files.style.maxHeight="none";
 filesBtn.addEventListener("click",async()=>{
  filesBtn.disabled=true;files.textContent="Loading authorized attachments…";
  try{
   const data=await api("/api/reviewer/submissions/"+encodeURIComponent(item.id)+"/files");
   files.replaceChildren();
   if(!data.files?.length)files.append(paragraph("No uploaded text attachments. Review the URLs and explanation."));
   for(const f of data.files||[]){
    const details=document.createElement("details"),summary=document.createElement("summary"),pre=document.createElement("pre");
    summary.textContent=f.filename||f.name||"Attachment";pre.textContent=String(f.content||"");
    pre.style.whiteSpace="pre-wrap";pre.style.wordBreak="break-word";details.append(summary,pre);files.append(details);
   }
  }catch(e){files.textContent=e.message;}
  finally{filesBtn.disabled=false;}
 });
 article.append(filesBtn,files);
 const form=document.createElement("div");form.append(label("Your technical recommendation"));
 const select=document.createElement("select");select.className="textinput";
 for(const [value,text] of [["request_changes","Needs changes"],["recommend_accept","Recommend acceptance · exact CI required for code"],["recommend_reject","Recommend rejection"]]){
  const o=document.createElement("option");o.value=value;o.textContent=text;select.append(o);
 }
 const textarea=document.createElement("textarea");textarea.className="textinput";
 textarea.rows=3;textarea.minLength=40;textarea.maxLength=2500;
 textarea.placeholder="Which required task criteria passed or failed? Identify actual evidence and limitations.";
 const submit=document.createElement("button");submit.className="button primary";submit.type="button";
 submit.textContent="Record peer recommendation";
 const msg=paragraph("","meaning-feedback");
 submit.addEventListener("click",async()=>{
  const rationale=textarea.value.trim();
  if(rationale.length<40){msg.textContent="Write a specific rationale of at least 40 characters.";return;}
  submit.disabled=true;msg.textContent="Verifying eligibility, PR head, and evidence…";
  try{
   await api("/api/reviewer/submissions/"+encodeURIComponent(item.id)+"/decision",{
    method:"POST",headers:{"content-type":"application/json"},
    body:JSON.stringify({decision:select.value,rationale})
   });
   form.replaceWith(paragraph("Independent recommendation recorded. Final action remains with authorized administrators.","meaning-feedback good"));
   msg.textContent="The audit log records the review; any recommended code acceptance is bound to a verified CI head.";
  }catch(e){msg.textContent=e.message;submit.disabled=false;}
 });
 form.append(select,label("Review rationale"),textarea,submit);
 article.append(form,msg);return article;
}
async function loadTaskReviews(){
 const root=$("taskReviewQueue");
 root.replaceChildren();
 try{
  const data=await api("/api/reviewer/submissions/queue");
  for(const item of data.entries||[])root.append(submissionCard(item));
  $("taskReviewStatus").textContent=data.entries?.length?
    data.entries.length+" contributions need independent recommendations. Inspect original evidence before voting.":
    "No eligible unreviewed submissions right now.";
 }catch(e){$("taskReviewStatus").textContent=e.message;}
}
async function refresh(){
 const button=$("reviewRefresh"),root=$("reviewQueue");button.disabled=true;
 $("reviewStatus").textContent="Checking your verified reviewer permission…";
 try{
  const data=await api("/api/reviewer/meaning/queue");
  root.replaceChildren();
  for(const item of data.entries||[])root.append(card(item));
  $("reviewStatus").textContent=data.entries?.length?
   data.entries.length+" unreviewed example(s) available. Focus on final proposition semantics.":
   "No pending examples for your account. You cannot review your own submissions.";
 }catch(e){root.replaceChildren();$("reviewStatus").textContent=e.message+" Review eligibility requires verified L5/L6 + review skill, or Founder/Owner.";}
 finally{button.disabled=false;}
}
$("reviewRefresh").addEventListener("click",refresh);
$("reviewRefresh").addEventListener("click",loadTaskReviews);
refresh();loadTaskReviews();
