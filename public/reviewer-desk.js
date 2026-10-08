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
refresh();
