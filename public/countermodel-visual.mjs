import {countermodelMission,validateWorld} from './countermodel-core.mjs';

// Plain-language projections of the seven pinned mission formulas.
const meanings={
 'quantifier-switch':['Every agent who has a key opens the door.','At least one agent satisfies: if they have a key, they open the door.'],
 'negation-drop':['Every agent who has a key does not open the door.','Every agent who has a key opens the door.'],
 'implication-flip':['Every agent who has a key opens the door.','Every agent who opens the door has a key.'],
 'connective-swap':['At least one agent both has a key and opens the door.','At least one agent has a key or opens the door (or both).'],
 'assumption-loss':['Every agent who has a key opens the door.','Every agent opens the door, whether or not they have a key.'],
 'quantifier-scope':['Each agent relates to at least one agent. Different agents may have different partners.','There is one agent that every agent relates to.'],
 'variable-capture':['Each agent relates to at least one agent, possibly itself.','Every agent relates to itself.']
};
export function plainMission(id){if(!countermodelMission(id))throw Error('Unknown mission');return [...meanings[id]];}

// Undo appends real inverse edits. It never erases assistance, failures or work.
export function inverseWorldEdit(action,before){
 validateWorld(before);
 if(action.type==='toggle'||action.type==='toggle_relation')return [{...action}];
 if(action.type==='add')return [{type:'remove'}];
 if(action.type!=='remove'||before.n<=1)throw Error('Not an undoable world edit');
 const i=before.n-1,edits=[{type:'add'}];
 for(const p of ['P','Q'])if(before[p][i])edits.push({type:'toggle',p,i});
 for(let j=0;j<before.n;j++){
  if(before.R[i][j])edits.push({type:'toggle_relation',i,j});
  if(j!==i&&before.R[j][i])edits.push({type:'toggle_relation',i:j,j:i});
 }
 return edits;
}

export function renderRelationMap(doc,root,world,onToggle){
 validateWorld(world);root.replaceChildren();
 const ns='http://www.w3.org/2000/svg';
 const svg=doc.createElementNS(ns,'svg');svg.setAttribute('viewBox','0 0 360 330');svg.setAttribute('role','group');svg.setAttribute('aria-label','Relationships: choose an arrow to toggle it');root.append(svg);
 const points=world.n===1?[[180,150]]:world.n===2?[[80,150],[280,150]]:[[80,95],[280,95],[180,265]];
 const create=(tag,attrs,parent=svg,text)=>{const el=doc.createElementNS(ns,tag);for(const [k,v]of Object.entries(attrs))el.setAttribute(k,String(v));if(text)el.textContent=text;parent.append(el);return el;};
 const defs=create('defs',{});const marker=create('marker',{id:'cmRelationArrow',viewBox:'0 0 10 10',refX:9,refY:5,markerWidth:6,markerHeight:6,orient:'auto'},defs);create('path',{d:'M 0 0 L 10 5 L 0 10 z',fill:'context-stroke'},marker);
 for(let i=0;i<world.n;i++)for(let j=0;j<world.n;j++){
  const [x,y]=points[i],[tx,ty]=points[j],active=world.R[i][j];
  const group=create('g',{role:'button',tabindex:0,'aria-label':`Toggle relation from Agent ${i+1} to Agent ${j+1}`,'aria-pressed':active,class:'cm-edge','data-from':i,'data-to':j,'data-cm-focus':`edge-${i}-${j}`});
  let d,lx,ly;
  if(i===j){d=`M ${x-20} ${y-19} C ${x-70} ${y-82}, ${x+70} ${y-82}, ${x+20} ${y-19}`;lx=x;ly=y-60;}
  else{const dx=tx-x,dy=ty-y,len=Math.hypot(dx,dy),ux=dx/len,uy=dy/len;const cx=(x+tx)/2-uy*56,cy=(y+ty)/2+ux*56;d=`M ${x+ux*30} ${y+uy*30} Q ${cx} ${cy}, ${tx-ux*35} ${ty-uy*35}`;lx=(x+tx)/2-uy*28;ly=(y+ty)/2+ux*28;}
  const arrow=create('path',{d,fill:'none',stroke:active?'#176f58':'#99aaa5','stroke-width':active?4:2,'stroke-dasharray':active?'none':'5 4','marker-end':'url(#cmRelationArrow)',class:'cm-arrow'});
  const hit=create('path',{d,fill:'none',stroke:'transparent','stroke-width':22,class:'cm-arrow'});
  for(const path of [arrow,hit])path.addEventListener('click',()=>onToggle(i,j));
  svg.append(group);
  create('rect',{x:lx-23,y:ly-22,width:46,height:44,rx:12,fill:active?'#176f58':'#edf3f0'},group);
  create('text',{x:lx,y:ly+5,'text-anchor':'middle',fill:active?'white':'#36534b','font-size':13,'font-weight':700},group,active?'On':'Off');
  group.addEventListener('click',()=>onToggle(i,j));
  group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();onToggle(i,j);}});
 }
 points.forEach(([cx,cy],i)=>{create('circle',{cx,cy,r:27,fill:'#e0f3ec',stroke:'#357e6d','stroke-width':2});create('text',{x:cx,y:cy+5,'text-anchor':'middle',fill:'#224b40','font-size':13,'font-weight':700},svg,'Agent '+(i+1));});
}
