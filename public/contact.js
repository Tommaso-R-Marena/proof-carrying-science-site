const email="marenatommaso@gmail.com";
const $=id=>document.getElementById(id);
$("copyEmail").addEventListener("click",async()=>{
  try{await navigator.clipboard.writeText(email);$("copyStatus").className="validation good";$("copyStatus").textContent="Copied "+email;}
  catch(e){$("copyStatus").className="validation bad";$("copyStatus").textContent="Copy was blocked by the browser. Email: "+email;}
});
$("composeEmail").addEventListener("click",()=>{
  const name=$("name").value.trim(),org=$("org").value.trim(),area=$("workflowType").value,msg=$("message").value.trim();
  const subject="PCS design-partner inquiry — "+area;
  const lines=[
    "Hello Tommaso,","",
    "I am interested in discussing a Proof-Carrying Science design-partner workflow.","",
    "Name: "+(name||"Not provided"),
    "Organization / lab: "+(org||"Not provided"),
    "Workflow area: "+area,"",
    "What another reviewer should be able to verify:",
    msg||"(Please describe the workflow, important claims, and review problem.)","",
    "Best,"
  ];
  window.location.href="mailto:"+email+"?subject="+encodeURIComponent(subject)+"&body="+encodeURIComponent(lines.join("\n"));
});
