const $=id=>document.getElementById(id);
const Engine=window.PCSBrowserEngine;
let current={manifest:null,model:null,csv:null,rows:[]};

function esc(s){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));}
function num(id){return Number($(id).value);}
function fmt(x){return Number.isFinite(x)?Number(x).toPrecision(12).replace(/\.?0+$/,""):String(x);}
function parseTimes(){
  const values=$("times").value.split(",").map(x=>Number(x.trim())).filter(x=>Number.isFinite(x));
  const uniq=[...new Set(values)].sort((a,b)=>a-b);
  if(!uniq.length||uniq.some(x=>x<0))throw new Error("Times must contain at least one non-negative number.");
  return uniq;
}
function buildModel(){
  const model={
    model_type:"one_compartment_iv_bolus",
    dose:{value:num("dose"),unit:"mg"},
    volume:{value:num("volume"),unit:"L"},
    clearance:{value:num("clearance"),unit:"L/h"},
    time_unit:"h",
    concentration_unit:"mg/L",
    pd:{
      model_type:"direct_emax",
      e0:{value:num("e0"),unit:"1"},
      emax:{value:num("emax"),unit:"1"},
      ec50:{value:num("ec50"),unit:"mg/L"},
      effect_unit:"1"
    }
  };
  const valid=Engine.validatePkpd(model);
  if(!valid.ok)throw new Error(valid.error||"Model contract failed.");
  return model;
}
function generateRows(model,times){
  const kel=model.clearance.value/model.volume.value,c0=model.dose.value/model.volume.value;
  return times.map(t=>{
    const concentration=c0*Math.exp(-kel*t);
    const effect=model.pd.e0.value+model.pd.emax.value*concentration/(model.pd.ec50.value+concentration);
    return {time:t,concentration,effect};
  });
}
function rowsCsv(rows){
  return "time,concentration,effect\n"+rows.map(r=>[r.time,Number(r.concentration).toPrecision(15),Number(r.effect).toPrecision(15)].join(",")).join("\n")+"\n";
}
function manifestFor(){
  return {
    subject:"browser-generated-one-compartment-iv-bolus-pk-direct-emax-pd",
    assumptions:[{
      id:"A_PK_MODEL",
      statement:"The restricted one-compartment IV-bolus equation is the declared computational model; no claim of biological adequacy is made.",
      rationale:"Separates computational verification from empirical PK model validation.",
      scope:["C_PK_CONTRACT","C_PK_REPLAY"]
    }],
    claims:[
      {
        id:"C_PK_CONTRACT",
        statement:"The PK model artifact satisfies the restricted positivity and dimensional contract.",
        kind:"computational",
        required_evidence:["E_PK_CONTRACT"],
        assumptions:["A_PK_MODEL"],
        predicate:{type:"pkpd_contract",model_artifact:"pk_model"}
      },
      {
        id:"C_PK_REPLAY",
        statement:"The prediction artifact matches the declared analytic one-compartment IV-bolus PK and direct Emax PD model within the stated numeric tolerance.",
        kind:"computational",
        required_evidence:["E_PK_REPLAY"],
        assumptions:["A_PK_MODEL"],
        predicate:{type:"pkpd_reference_match",model_artifact:"pk_model",output_artifact:"pk_predictions",time_column:"time",concentration_column:"concentration",effect_column:"effect",rel_tol:1e-9,abs_tol:1e-12}
      }
    ],
    artifacts:[
      {id:"pk_model",path:"pk_model.json",role:"restricted-pk-model",media_type:"application/json"},
      {id:"pk_predictions",path:"predictions.csv",role:"pk-predictions",media_type:"text/csv"}
    ],
    checks:[
      {id:"E_PK_CONTRACT",type:"pkpd_contract",claim_ids:["C_PK_CONTRACT"],model_artifact:"pk_model"},
      {id:"E_PK_REPLAY",type:"pkpd_reference_match",claim_ids:["C_PK_REPLAY"],model_artifact:"pk_model",output_artifact:"pk_predictions",time_column:"time",concentration_column:"concentration",effect_column:"effect",rel_tol:1e-9,abs_tol:1e-12}
    ],
    workflow:{nodes:[{
      id:"N_PK",operation:"restricted_one_compartment_iv_bolus",inputs:["pk_model"],outputs:["pk_predictions"],
      contract:{equation:"C(t)=(Dose/V)*exp(-(CL/V)*t); E(C)=E0+Emax*C/(EC50+C)",validation_scope:"computational replay only"}
    }]}
  };
}
function polyline(svg,values){
  while(svg.firstChild)svg.removeChild(svg.firstChild);
  const W=640,H=220,p=28;
  const max=Math.max(...values.map(x=>x.y)),min=Math.min(...values.map(x=>x.y));
  const xmin=Math.min(...values.map(x=>x.x)),xmax=Math.max(...values.map(x=>x.x));
  const sx=x=>p+(x-xmin)/(Math.max(xmax-xmin,1e-12))*(W-2*p);
  const sy=y=>H-p-(y-min)/(Math.max(max-min,1e-12))*(H-2*p);
  const grid=document.createElementNS("http://www.w3.org/2000/svg","path");
  grid.setAttribute("d",`M${p} ${p}V${H-p}H${W-p}`);
  grid.setAttribute("fill","none");grid.setAttribute("stroke","#dbe3ed");grid.setAttribute("stroke-width","1");
  svg.appendChild(grid);
  const line=document.createElementNS("http://www.w3.org/2000/svg","polyline");
  line.setAttribute("points",values.map(v=>`${sx(v.x)},${sy(v.y)}`).join(" "));
  line.setAttribute("fill","none");line.setAttribute("stroke","#2f7df4");line.setAttribute("stroke-width","3");line.setAttribute("stroke-linejoin","round");line.setAttribute("stroke-linecap","round");
  svg.appendChild(line);
  for(const v of values){
    const c=document.createElementNS("http://www.w3.org/2000/svg","circle");c.setAttribute("cx",sx(v.x));c.setAttribute("cy",sy(v.y));c.setAttribute("r","3.5");c.setAttribute("fill","#22b8a8");svg.appendChild(c);
  }
}
function download(name,text,type){
  const blob=new Blob([text],{type:type||"text/plain"}),url=URL.createObjectURL(blob),a=document.createElement("a");
  a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);
}
function generate(){
  const overall=$("labOverall");
  try{
    const model=buildModel(),times=parseTimes(),rows=generateRows(model,times),csv=rowsCsv(rows),manifest=manifestFor();
    const replay=Engine.replayPkpd(model,csv,manifest.checks[1]);
    current={manifest,model,csv,rows};
    overall.classList.remove("fail");overall.classList.add(replay.ok?"pass":"fail");
    $("labStatus").textContent=replay.ok?"Generated output independently replays":"Generated output failed replay";
    $("labDetail").textContent=replay.ok?"The browser engine reproduced every generated row within the PCS adapter tolerances.":"Inspect the parameters and generated output.";
    $("kel").textContent=fmt(model.clearance.value/model.volume.value);
    $("c0").textContent=fmt(model.dose.value/model.volume.value);
    $("replayResult").textContent=replay.ok?"PASS":"FAIL";
    $("predictionRows").innerHTML=rows.map(r=>`<tr><td>${esc(r.time)}</td><td>${esc(fmt(r.concentration))}</td><td>${esc(fmt(r.effect))}</td></tr>`).join("");
    $("manifestView").textContent=JSON.stringify(manifest,null,2);
    $("modelView").textContent=JSON.stringify(model,null,2);
    polyline($("pkChart"),rows.map(r=>({x:r.time,y:r.concentration})));
    polyline($("pdChart"),rows.map(r=>({x:r.time,y:r.effect})));
  }catch(e){
    overall.classList.remove("pass");overall.classList.add("fail");$("labStatus").textContent="Model input rejected";$("labDetail").textContent=String(e);$("replayResult").textContent="FAIL";
  }
}
function reset(){
  $("dose").value=100;$("volume").value=10;$("clearance").value=1;$("ec50").value=2;$("e0").value=0;$("emax").value=100;$("times").value="0, 0.5, 1, 2, 4, 8, 12, 24";generate();
}
document.querySelectorAll(".tab").forEach(btn=>btn.addEventListener("click",()=>{
  document.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));document.querySelectorAll(".tabpane").forEach(x=>x.classList.remove("active"));btn.classList.add("active");$("tab-"+btn.dataset.tab).classList.add("active");
}));
$("generate").onclick=generate;$("reset").onclick=reset;
$("downloadManifest").onclick=()=>current.manifest&&download("manifest.json",JSON.stringify(current.manifest,null,2)+"\n","application/json");
$("downloadModel").onclick=()=>current.model&&download("pk_model.json",JSON.stringify(current.model,null,2)+"\n","application/json");
$("downloadCsv").onclick=()=>current.csv&&download("predictions.csv",current.csv,"text/csv");
reset();
