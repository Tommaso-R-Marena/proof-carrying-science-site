import {validateView,inspectCase} from './calibration-core.mjs';
const VIEW_SHA='52f214687073222fd7b0f091375d512e2c3f2b7ee9c5ecb5bda6a20159e009c0';
const $=id=>document.getElementById(id),NS='http://www.w3.org/2000/svg';
let view=null,broken=false;
const node=(tag,attrs,content)=>{const n=document.createElementNS(NS,tag);for(const[k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(content!==undefined)n.textContent=content;return n;};
function disable(){for(const id of ['hull','degree','query','epsilon','tamper','restore'])$(id).disabled=true;}
function chart(result){
  const svg=$('chart');svg.replaceChildren(node('title',{id:'chartTitle'},'Recorded responses and held-out predictions'),node('desc',{id:'chartDescription'},'Fourteen recorded observations, with seven held-out predictions from each method. Exact errors appear immediately below.'));
  const width=Math.max(240,Math.round(svg.clientWidth)),height=width<500?330:420,bottom=height-70;
  svg.setAttribute('viewBox',`0 0 ${width} ${height}`);
  const points=[...result.observations,...result.predictions.slice(0,7).flatMap(p=>[{x:p.x,y:p.least_squares},{x:p.x,y:p.minimax}])];
  const low=Math.min(0,...points.map(p=>p.y)),high=Math.max(...points.map(p=>p.y));
  const x=n=>55+(n-.125)/(.45-.125)*(width-75),y=n=>bottom-(n-low)/(high-low||1)*(bottom-30);
  svg.append(node('line',{x1:55,y1:bottom,x2:width-20,y2:bottom,stroke:'#92a7bf'}),node('line',{x1:55,y1:30,x2:55,y2:bottom,stroke:'#92a7bf'}));
  for(const t of [.15,.25,.35,.45])svg.append(node('text',{x:x(t),y:bottom+25,fill:'#dce8f6','text-anchor':'middle','font-size':14},t.toFixed(2)));
  for(const t of [low,(low+high)/2,high])svg.append(node('text',{x:49,y:y(t)+5,fill:'#dce8f6','text-anchor':'end','font-size':13},t.toFixed(1)));
  svg.append(node('text',{x:width/2,y:height-13,fill:'#dce8f6','text-anchor':'middle','font-size':17},'Froude number'),node('text',{x:15,y:bottom/2+15,fill:'#dce8f6',transform:`rotate(-90 15 ${bottom/2+15})`,'text-anchor':'middle','font-size':14},'Source resistance response'));
  for(const [kind,color] of [['least_squares','#9ad8ff'],['minimax','#ffda86']]){
    const pairs=result.predictions.slice(0,7).map(p=>[x(p.x),y(p[kind])]);
    svg.append(node('polyline',{points:pairs.map(p=>p.join(',')).join(' '),fill:'none',stroke:color,'stroke-width':2,'stroke-dasharray':kind==='minimax'?'6 4':''}));
    pairs.forEach(([cx,cy])=>svg.append(node('rect',{x:cx-3,y:cy-3,width:6,height:6,fill:color})));
  }
  result.observations.forEach(p=>svg.append(node('circle',{cx:x(p.x),cy:y(p.y),r:5,fill:p.training?'#7ee0c1':'#0b1423',stroke:p.training?'#7ee0c1':'#fff','stroke-width':2})));
}
function clear(message){
  $('chart').replaceChildren();$('scores').textContent='No supported calculation displayed.';$('radius').textContent='No supported sensitivity result displayed.';$('adequacy').textContent='No model adequacy result displayed.';$('exact').textContent='No supported result.';$('control').textContent=message;
}
function show(){
  if(!view)return;
  try{
    const index=Number($('hull').value),degree=Number($('degree').value),query=Number($('query').value),epsilon=$('epsilon').value;
    const c=structuredClone(view.cases[index]);
    if(broken)c.models[2*(degree-1)].queries[query].minimax.gain='0';
    const result=inspectCase(c,degree,query,epsilon);
    chart(result);
    $('hullNote').textContent=`${c.id}: source geometry (${c.hull.join(', ')}). Groups hull-03 and hull-04 have identical response curves; neither was excluded.`;
    $('scores').textContent=`This hull, degree ${degree}: held-out least-squares SSE = ${result.scores.least_squares}; pointwise minimax SSE = ${result.scores.minimax}. All seven held-out observations are included.`;
    $('radius').textContent=`At ε = ${epsilon}, least-squares gain ${result.least_squares_gain} gives sharp radius ${result.least_squares_radius}; the globally optimal uniform gain ${result.minimax_gain} gives radius ${result.minimax_radius}.`;
    $('adequacy').textContent=`Model/error-budget hypothesis ${result.joint_model_budget_excluded?'excluded':'not excluded'}: the full 14-observation SSE floor ${result.full_data_sse} ${result.joint_model_budget_excluded?'>':'≤'} 14ε² = ${result.full_data_budget}. This addresses the joint polynomial/budget premise, not which premise failed.`;
    $('exact').textContent=JSON.stringify(result,null,2);
    $('control').textContent='Recorded witness passes the independent browser arithmetic checks. No new Lean execution or scientific acceptance.';
    $('restore').disabled=true;
  }catch(error){
    clear(`Browser arithmetic rejected the modified certificate: ${error.message}. This browser result is not a kernel proof of falsity.`);
    $('restore').disabled=false;
  }
}
for(const id of ['hull','degree','query','epsilon'])$(id).addEventListener('change',()=>{broken=false;show();});
$('tamper').addEventListener('click',()=>{broken=true;show();});
$('restore').addEventListener('click',()=>{broken=false;show();});
window.addEventListener('resize',()=>show());
try{
  const response=await fetch('calibration-v1/view.json',{credentials:'omit'});
  if(!response.ok)throw Error('Recorded data unavailable');
  const length=Number(response.headers.get('content-length'));
  if(length>2_000_000)throw Error('Recorded data exceeds bound');
  const raw=await response.arrayBuffer();
  if(raw.byteLength>2_000_000)throw Error('Recorded data exceeds bound');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join('');
  if(hash!==VIEW_SHA)throw Error('Recorded data hash mismatch');
  view=validateView(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw)));
  view.cases.forEach((c,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=c.id;$('hull').append(option);});
  for(const id of ['hull','degree','query','epsilon','tamper'])$(id).disabled=false;
  $('status').textContent='Ready: all 22 recorded cases, normal equations, primal/dual witnesses, exact held-out scores and pooled totals pass the independent browser arithmetic checks. No new Lean kernel has run.';
  show();
}catch(error){disable();clear('Source integrity or arithmetic check failed; no successful result displayed.');$('status').textContent='Evidence unavailable: '+error.message;}
