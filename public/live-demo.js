import {COUNTERMODEL_VERSION,initialWorld,countermodelVerdict,replayCountermodelSession,exportLeanCountermodel} from './countermodel-core.mjs';
const $=id=>document.getElementById(id),mission='implication-flip';
let world=initialWorld(),actions=[],generation=0,busy=false;
const session=()=>({version:COUNTERMODEL_VERSION,mission_id:mission,actions:[...actions,{type:'check'}]});
const witness=()=>({format:'pcs-countermodel-witness-v1',version:COUNTERMODEL_VERSION,mission_id:mission,world:structuredClone(world)});
function render(){
 const verdict=countermodelVerdict(mission,world);
 $('ldUsed').textContent='Tool used: '+(world.P[0]?'yes':'no');$('ldAuthorized').textContent='Permission granted: '+(world.Q[0]?'yes':'no');
 $('ldUsed').setAttribute('aria-pressed',String(world.P[0]));$('ldAuthorized').setAttribute('aria-pressed',String(world.Q[0]));
 $('ldOriginal').textContent=verdict.left?'TRUE in this world':'FALSE in this world';$('ldProposal').textContent=verdict.right?'TRUE in this world':'FALSE in this world';
 $('ldVerdict').dataset.different=String(verdict.counterexample);$('ldVerdict').textContent=verdict.counterexample?'COUNTEREXAMPLE FOUND · The meanings disagree':'SAME RESULT HERE · This world does not expose the error';
 $('ldExplanation').textContent=world.P[0]&&!world.Q[0]?'The tool was used without permission. Your intended rule fails, while the reversed proposal passes: it only constrains cases where permission exists. A proof of that proposal would certify the wrong statement.':!world.P[0]&&world.Q[0]?'Permission was granted but the tool was not used. Your safety rule permits that, while the reversed proposal demands use. The proposal changes the meaning in both directions.':'Both statements happen to agree here. Try changing one fact; agreement on an example does not establish logical equivalence.';
 $('ldWitness').disabled=!verdict.counterexample;$('ldLean').disabled=!verdict.counterexample;
 $('ldServer').disabled=busy;
}
function change(p,value=!world[p][0]){
 if(world[p][0]===value)return;
 if(actions.length>=110)actions=['P','Q'].filter(key=>world[key][0]).map(key=>({type:'toggle',p:key,i:0}));
 world[p][0]=value;actions.push({type:'toggle',p,i:0});generation++;
 $('ldServerStatus').textContent='World changed. This input has not been replayed on the server.';render();
}
function reset(){world=initialWorld();actions=[];generation++;$('ldServerStatus').textContent='No server replay requested.';render();}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);}
function serverReplay(path,snapshot){
 if(path !== "/api/demo/countermodel/replay")throw Error('Unreviewed demo endpoint');
 return fetch(path,{method:'POST',headers:{'content-type':'application/json'},credentials:'omit',body:JSON.stringify(snapshot),signal:AbortSignal.timeout(15000)});
}
$('ldUsed').addEventListener('click',()=>change('P'));$('ldAuthorized').addEventListener('click',()=>change('Q'));
$('ldAttack').addEventListener('click',()=>{reset();change('P',true);});$('ldReset').addEventListener('click',reset);
$('ldWitness').addEventListener('click',()=>{if(countermodelVerdict(mission,world).counterexample)download('pcs-countermodel-witness.json',JSON.stringify(witness(),null,2)+'\n','application/json');});
$('ldLean').addEventListener('click',()=>{if(!countermodelVerdict(mission,world).counterexample)return;const out=exportLeanCountermodel(mission,world);download(out.file_name,out.lean_source,'text/plain');});
$('ldServer').addEventListener('click',async()=>{
 if(busy)return;busy=true;const snapshot=session(),epoch=generation;
 $('ldServerStatus').textContent='Recomputing your exact synthetic moves on the PCS Worker…';render();
 try{
  const response=await serverReplay("/api/demo/countermodel/replay",snapshot);
  const data=await response.json();if(!response.ok)throw Error(data.message||data.error||'Replay rejected');
  const local=replayCountermodelSession(snapshot);
  if(JSON.stringify(data.replay)!==JSON.stringify(local)||data.research_recorded!==false||data.authority!=='FINITE_MODEL_ONLY')throw Error('Server response does not match the exact local replay');
  if(epoch!==generation)return;
  $('ldServerStatus').textContent=(local.final_verified?'Counterexample confirmed':'Both statements agree in this world')+' by server replay. No research record saved. Same JavaScript semantics; no Lean or PCS authority.';
 }catch(error){if(epoch===generation)$('ldServerStatus').textContent='Server replay unavailable: '+error.message+'. Your local result and downloads are still available.';}
 finally{busy=false;render();}
});
for(const used of [false,true])for(const authorized of [false,true]){const w=initialWorld();w.P[0]=used;w.Q[0]=authorized;const v=countermodelVerdict(mission,w),row=document.createElement('tr');for(const value of [used,authorized,v.left,v.right,v.counterexample]){const cell=document.createElement('td');cell.textContent=value?'Yes':'No';row.append(cell);}$('ldTruthTable').append(row);}
render();
