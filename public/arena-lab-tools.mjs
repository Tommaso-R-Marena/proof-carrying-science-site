// Pure, deterministic gameplay analysis. This code never sends data or claims Lean authority.
import {replayActions,GUARDS} from "./safety-forge-core.mjs";
export function dependencyState(puzzle,ordered=[]){
  if(!puzzle||!Array.isArray(puzzle.nodes)||!Array.isArray(ordered))throw Error("Invalid puzzle state.");
  const ids=new Set(puzzle.nodes.map(n=>n.id)),placed=new Set();
  for(const id of ordered){
    if(!ids.has(id)||placed.has(id))throw Error("Unknown or duplicate puzzle card.");
    placed.add(id);
  }
  const byId=new Map(puzzle.nodes.map(n=>[n.id,n]));
  const depthMemo=new Map(),visiting=new Set();
  const depth=id=>{
    if(depthMemo.has(id))return depthMemo.get(id);
    if(visiting.has(id)||!byId.has(id))throw Error("Invalid dependency graph.");
    visiting.add(id);
    const value=byId.get(id).needs.reduce((max,dep)=>Math.max(max,depth(dep)+1),0);
    visiting.delete(id);depthMemo.set(id,value);return value;
  };
  const nodes=puzzle.nodes.map((n,index)=>({
    id:n.id,label:n.label,why:n.why,index,depth:depth(n.id),
    state:placed.has(n.id)?"done":n.needs.every(dep=>placed.has(dep))?"ready":"waiting",
    missing:n.needs.filter(dep=>!placed.has(dep))
  }));
  return {nodes,edges:puzzle.nodes.flatMap(n=>n.needs.map(dep=>({from:dep,to:n.id}))),
    ready:nodes.filter(n=>n.state==="ready").map(n=>n.id),
    completed:placed.size,total:nodes.length};
}
export function graphLayout(puzzle,order=[]){
  const data=dependencyState(puzzle,order),levels=new Map();
  for(const n of data.nodes){if(!levels.has(n.depth))levels.set(n.depth,[]);levels.get(n.depth).push(n);}
  const maxDepth=Math.max(...levels.keys()),width=760,rowHeight=116,nodeWidth=148,nodeHeight=72;
  const nodes=data.nodes.map(n=>{
    const siblings=levels.get(n.depth);
    const col=siblings.indexOf(n);
    return {...n,x:(width-(siblings.length*nodeWidth+(siblings.length-1)*20))/2+col*(nodeWidth+20),
      y:25+n.depth*rowHeight};
  });
  const byId=new Map(nodes.map(n=>[n.id,n]));
  const edges=data.edges.map(e=>{
    const a=byId.get(e.from),b=byId.get(e.to);
    return {...e,x1:a.x+nodeWidth/2,y1:a.y+nodeHeight,x2:b.x+nodeWidth/2,y2:b.y};
  });
  return {nodes,edges,width,height:Math.max(240,(maxDepth+1)*rowHeight+25),nodeWidth,nodeHeight};
}
export function inspectPlacement(puzzle,previous,nextId){
  const data=dependencyState(puzzle,previous);
  const card=data.nodes.find(n=>n.id===nextId);
  if(!card||card.state==="done")throw Error("Card already placed or unavailable.");
  return {valid:card.state==="ready",missing:[...card.missing],
    explanation:card.state==="ready"?"Every prerequisite is already placed.":card.missing.length+" prerequisite(s) are missing."};
}
export function repairFirstInversion(puzzle,order,mistakes){
  if(!Array.isArray(order)||!Array.isArray(mistakes))throw Error("Invalid repair attempt.");
  dependencyState(puzzle,order);
  const next=[...order];
  const inverted=mistakes.find(m=>next.indexOf(m.before)>next.indexOf(m.after));
  if(!inverted)return {order:next,changed:false};
  const source=next.indexOf(inverted.before),target=next.indexOf(inverted.after);
  const [card]=next.splice(source,1);
  next.splice(target,0,card);
  return {order:next,changed:true,from:inverted.before,before:inverted.after};
}
export function classifyPolicyTrials(trials){
  if(!Array.isArray(trials))throw Error("Invalid policy notebook.");
  const sorted=trials.map((trial,index)=>{
    const result=trial.result;
    if(!result||!Array.isArray(trial.guards)||!Number.isFinite(result.score)||!Number.isFinite(result.guard_cost))
      throw Error("Policy score must be independently verified first.");
    return {...trial,index,label:result.passed?"Certified in toy world":result.safe?"Mission overblocked":"Unsafe route remains",
      rating:result.passed?3:result.safe?2:1};
  }).sort((a,b)=>b.rating-a.rating||b.result.score-a.result.score||a.result.guard_cost-b.result.guard_cost||a.index-b.index);
  return sorted;
}
export function traceFrames(seed,guards,actions){
  const replay=replayActions(seed,guards,actions);
  return replay.events.map((event,index)=>({
    index:index+1,action:event.action,blocked:event.blocked,unsafe:event.unsafe,goal:event.goal,
    before:event.before,after:event.after,reason:event.reason,violations:[...event.violations]
  }));
}
