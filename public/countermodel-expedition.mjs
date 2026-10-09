import {COUNTERMODEL_MISSIONS,countermodelMission,validateWorld,countermodelVerdict,replayCountermodelSession} from './countermodel-core.mjs';

// Goals are derived from actual replay, never supplied scores or local storage.
export function mastery(session){
 const r=replayCountermodelSession(session);
 return {mission_id:r.mission_id,discovered:r.final_verified,
  minimal:r.final_verified&&r.final_world.n===r.minimum_domain_size,
  independent:r.final_verified&&r.hints===0,
  precise:r.final_verified&&r.hints===0&&r.checks<=2};
}
export function expedition(sessions){
 if(!Array.isArray(sessions)||sessions.length>200)throw Error('Expedition notebook bound exceeded');
 const missions=COUNTERMODEL_MISSIONS.map(m=>({id:m.id,name:m.name,discovered:false,minimal:false,independent:false,precise:false}));
 for(const s of sessions){const result=mastery(s),entry=missions.find(m=>m.id===result.mission_id);for(const k of ['discovered','minimal','independent','precise'])entry[k]||=result[k];}
 return {missions,completed:missions.filter(m=>m.discovered).length,
  mastery:missions.reduce((n,m)=>n+['minimal','independent','precise'].filter(k=>m[k]).length,0),
  next:missions.find(m=>!m.discovered)?.id||null};
}
export function dailyMission(date){
 if(typeof date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('Use a valid UTC calendar date');
 const day=Math.floor(Date.parse(date+'T00:00:00Z')/86400000);
 return COUNTERMODEL_MISSIONS[(day%COUNTERMODEL_MISSIONS.length+COUNTERMODEL_MISSIONS.length)%COUNTERMODEL_MISSIONS.length].id;
}

export function explainWorld(id,world){
 const mission=countermodelMission(id);if(!mission)throw Error('Unknown mission');validateWorld(world);
 function visit(n,env={}){
  let label,value,children=[];
  if(n.op==='pred'){value=world[n.p][env[n.x]];label=`${n.p}(Agent ${env[n.x]+1})`;}
  else if(n.op==='rel'){value=world.R[env[n.x]][env[n.y]];label=`R(Agent ${env[n.x]+1}, Agent ${env[n.y]+1})`;}
  else if(['forall','exists'].includes(n.op)){
   children=Array.from({length:world.n},(_,i)=>{const child=visit(n.f,{...env,[n.x]:i});return {...child,label:`${n.x} = Agent ${i+1} · ${child.label}`};});
   value=n.op==='forall'?children.every(c=>c.value):children.some(c=>c.value);
   label=n.op==='forall'?`Every ${n.x}: all ${world.n} cases must be true`:`Some ${n.x}: one true case suffices`;
  }else if(n.op==='not'){children=[visit(n.f,env)];value=!children[0].value;label='NOT: reverse the truth value';}
  else{children=[visit(n.a,env),visit(n.b,env)];const [a,b]=children.map(c=>c.value);value=n.op==='and'?a&&b:n.op==='or'?a||b:!a||b;label=n.op==='and'?'AND: both sides must be true':n.op==='or'?'OR: at least one side must be true':'IF / THEN: false only when the premise is true and conclusion false';}
  return {label,value,children};
 }
 const left=visit(mission.a),right=visit(mission.b),verdict=countermodelVerdict(id,world);
 if(left.value!==verdict.left||right.value!==verdict.right)throw Error('Explanation and checker disagree');
 return {left,right,counterexample:verdict.counterexample};
}
