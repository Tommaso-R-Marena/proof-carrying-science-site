import {parseMeasurements, filteredPoints, exploratoryFit, checkRecordedCase, checkNegativeCases} from './scientific-workflow-v2-core.mjs';

const $ = id => document.getElementById(id);
const colours = {Adelie:'#8adac1', Chinstrap:'#ffce78', Gentoo:'#94bdff'};
const NS = 'http://www.w3.org/2000/svg';
let dataset, receipt, negatives, manifest, visible = [], selected = 0;
const element = (name, attributes, text) => {const node=document.createElementNS(NS,name);for(const [key,value] of Object.entries(attributes))node.setAttribute(key,String(value));if(text!==undefined)node.textContent=text;return node;};
// A fixed reader for each deployable asset. A manifest can select from these
// names but cannot cause requests to arbitrary routes or remote URLs.
const readers=Object.freeze({
  'SHA256.json':()=>fetch('reasoning/scientific-workflow-v2/SHA256.json',{credentials:'omit'}),
  'penguins.csv':()=>fetch('reasoning/scientific-workflow-v2/penguins.csv',{credentials:'omit'}),
  'positive.pcs.zip':()=>fetch('reasoning/scientific-workflow-v2/positive.pcs.zip',{credentials:'omit'}),
  'producer-public.pem':()=>fetch('reasoning/scientific-workflow-v2/producer-public.pem',{credentials:'omit'}),
  'provenance.json':()=>fetch('reasoning/scientific-workflow-v2/provenance.json',{credentials:'omit'}),
  'UPSTREAM_LICENSE.md':()=>fetch('reasoning/scientific-workflow-v2/UPSTREAM_LICENSE.md',{credentials:'omit'}),
  'UPSTREAM_README.md':()=>fetch('reasoning/scientific-workflow-v2/UPSTREAM_README.md',{credentials:'omit'}),
  'contract.json':()=>fetch('reasoning/scientific-workflow-v2/contract.json',{credentials:'omit'}),
  'recorded-receipt.json':()=>fetch('reasoning/scientific-workflow-v2/recorded-receipt.json',{credentials:'omit'}),
  'recorded-negative-controls.json':()=>fetch('reasoning/scientific-workflow-v2/recorded-negative-controls.json',{credentials:'omit'}),
  'browser-validation.json':()=>fetch('reasoning/scientific-workflow-v2/browser-validation.json',{credentials:'omit'})
});
async function bytes(name) {
  if(typeof name!=='string'||!Object.hasOwn(readers,name))throw Error('Asset outside the fixed reader allowlist.');
  const res=await readers[name]();if(!res.ok)throw Error('Published asset unavailable.');return res.arrayBuffer();
}
async function digest(raw) {return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',raw)),x=>x.toString(16).padStart(2,'0')).join('');}
function selectPoint(index) {
  if(!visible.length)return;
  selected=Math.max(0,Math.min(visible.length-1,index));const p=visible[selected],si=$('units').value==='si';
  const x=si?(p.flipper/1000).toFixed(3)+' m':p.flipper+' mm',y=si?(p.mass/1000).toFixed(3)+' kg':p.mass+' g';
  $('pointDetail').textContent=`Observation ${p.row} · ${p.species} · ${p.island} island · ${p.year} · flipper ${x} · mass ${y} · recorded sex: ${p.sex==='NA'?'missing':p.sex}. Point ${selected+1} of ${visible.length} in this view.`;
  $('plot').querySelectorAll('.point').forEach(node=>node.classList.toggle('selected',Number(node.dataset.index)===selected));
  $('previous').disabled=selected===0;$('next').disabled=selected===visible.length-1;
}
function renderPlot() {
  const previousRow=visible[selected]?.row;
  visible=filteredPoints(dataset.points,$('species').value);selected=0;
  const svg=$('plot');svg.replaceChildren();svg.append(element('title',{},'Real Palmer Penguins measurements'),element('desc',{},`${visible.length} actual observations. Arrow keys inspect points. The fitted line is an unverified browser estimate.`));
  // Keep axis text readable on phones: reduce logical chart width instead of
  // shrinking a desktop-width drawing and its text to seven-pixel labels.
  const logicalWidth=Math.max(300,Math.min(680,Math.floor(svg.clientWidth))),small=logicalWidth<450;
  svg.setAttribute('viewBox',`0 0 ${logicalWidth} 440`);
  const left=small?58:78,top=25,width=logicalWidth-left-24,height=345;
  const x0=170,x1=240,y0=2500,y1=6500;
  const px=x=>left+(x-x0)/(x1-x0)*width,py=y=>top+height-(y-y0)/(y1-y0)*height;
  for(let x=170;x<=240;x+=small?20:10){svg.append(element('line',{x1:px(x),y1:top,x2:px(x),y2:top+height,stroke:'#25374d'}),element('text',{x:px(x),y:top+height+24,fill:'#c6d6e6','text-anchor':'middle','font-size':15},$('units').value==='si'?(x/1000).toFixed(2):x));}
  for(let y=2500;y<=6500;y+=1000){svg.append(element('line',{x1:left,y1:py(y),x2:left+width,y2:py(y),stroke:'#25374d'}),element('text',{x:left-9,y:py(y)+5,fill:'#c6d6e6','text-anchor':'end','font-size':15},$('units').value==='si'?(y/1000).toFixed(1):y));}
  svg.append(element('text',{x:left+width/2,y:427,fill:'#e9edf5','text-anchor':'middle','font-size':17},`Flipper length (${$('units').value==='si'?'m':'mm'})`),element('text',{x:20,y:top+height/2,fill:'#e9edf5','text-anchor':'middle','font-size':17,transform:`rotate(-90 20 ${top+height/2})`},`Body mass (${$('units').value==='si'?'kg':'g'})`));
  const defs=element('defs',{}),clip=element('clipPath',{id:'plotClip'});clip.append(element('rect',{x:left,y:top,width,height}));defs.append(clip);svg.append(defs);
  const group=element('g',{'clip-path':'url(#plotClip)'}),fit=exploratoryFit(visible);
  if(fit&&$('showFit').checked)group.append(element('line',{x1:px(x0),y1:py(fit.intercept+fit.slope*x0),x2:px(x1),y2:py(fit.intercept+fit.slope*x1),stroke:'#fff','stroke-width':2,'stroke-dasharray':'8 5','aria-hidden':'true'}));
  visible.forEach((p,index)=>{const circle=element('circle',{cx:px(p.flipper),cy:py(p.mass),r:small?3.5:5,fill:colours[p.species],class:'point','data-index':index,'aria-hidden':'true'});circle.append(element('title',{},`Observation ${p.row}: ${p.species}, ${p.flipper} mm, ${p.mass} g`));group.append(circle);});svg.append(group);
  $('counts').textContent=`Showing ${visible.length} actual complete observations${$('species').value==='all'?' across all species':' of '+$('species').value}. Full dataset: ${dataset.total} records; ${dataset.excluded.length} excluded only for missing flipper/mass measurements.`;
  $('localFit').textContent=fit?`Exploratory browser estimate · ${fit.points} points · slope ${fit.slope.toFixed(3)} ${$('units').value==='si'?'kg/m':'g/mm'} · intercept ${($('units').value==='si'?fit.intercept/1000:fit.intercept).toFixed(3)} ${$('units').value==='si'?'kg':'g'} · R² ${fit.r2===null?'undefined':fit.r2.toFixed(3)}. This is not a new verified result.`:'No exploratory line is available.';
  selectPoint(Math.max(0,visible.findIndex(point=>point.row===previousRow)));
}
function showNegative() {
  const record=negatives[$('negativeCase').value];let detail;
  if($('negativeCase').value==='wrong-slope')detail='The signed package is valid, but fresh numerical replay finds that the reported zero slope is wrong.';
  else if($('negativeCase').value==='signed-false-report')detail='The producer signed a fabricated report with its legitimate key. Package integrity passed; the receiver rejected the report because it differs from fresh replay.';
  else detail='The signed kg/m*m claim is FALSIFIED_OR_CHECK_FAILED: PCS parses the denominator as m*m. Package validity cannot turn this claim into a successful workflow.';
  $('negativeResult').textContent=`Recorded control: ${detail} Bounded workflow satisfied: ${record.bounded_contract_satisfied?'yes':'NO'}. No new checker is running.`;
}
function showEvidence() {
  const cards=[['Recorded dimensions','Both compiled dimensional claims were COMPUTATIONALLY_SUPPORTED. This is historical evidence for the retained predicates.',''],['Recorded numerical replay','The finite rational report matched a separate receiver calculation. Its numerical PCS claim remains OPEN.','open'],['Biological / causal / population claims','OPEN. This dataset fit does not establish those conclusions, and scientific acceptance is false.','open']];
  $('recordedChecks').replaceChildren(...cards.map(([title,text,extra])=>{const div=document.createElement('div');div.className='check-card '+extra;const strong=document.createElement('strong'),p=document.createElement('p');strong.textContent=title;p.textContent=text;div.append(strong,p);return div;}));
  $('exactResult').textContent=JSON.stringify(receipt.domain_replay.reference,null,2);
  $('identities').textContent=JSON.stringify({upstream_revision:manifest.upstream_revision,data_sha256:manifest.files['penguins.csv'],signed_bundle_sha256:receipt.bundle_sha256,producer_public_key_fingerprint:manifest.public_key_fingerprint,source_receipt_sha256:receipt.source_receipt_sha256,asset_inventory_authority:manifest.authority},null,2);
  showNegative();
}
$('species').addEventListener('change',renderPlot);$('units').addEventListener('change',renderPlot);$('showFit').addEventListener('change',renderPlot);
$('reset').addEventListener('click',()=>{$('species').value='all';$('units').value='raw';$('showFit').checked=true;visible=[];renderPlot();});
$('previous').addEventListener('click',()=>selectPoint(selected-1));$('next').addEventListener('click',()=>selectPoint(selected+1));
$('plot').addEventListener('keydown',event=>{if(!visible.length)return;const actions={ArrowLeft:()=>selected-1,ArrowRight:()=>selected+1,Home:()=>0,End:()=>visible.length-1};if(actions[event.key]){event.preventDefault();selectPoint(actions[event.key]());}});
for(const event of ['pointerover','click'])$('plot').addEventListener(event,e=>{const circle=e.target.closest?.('.point');if(circle)selectPoint(Number(circle.dataset.index));});
$('negativeCase').addEventListener('change',showNegative);
window.addEventListener('resize',()=>{if(dataset)renderPlot();});
try {
  manifest=JSON.parse(new TextDecoder().decode(await bytes('SHA256.json')));
  if(manifest.format!=='pcs-scientific-workflow-public-assets-v2')throw Error('Unsupported published asset inventory.');
  const assets={};
  await Promise.all(Object.entries(manifest.files).map(async([name,expected])=>{if(!/^[A-Za-z0-9_.-]+$/.test(name)||!/^[a-f0-9]{64}$/.test(expected))throw Error('Invalid asset inventory.');const raw=await bytes(name);if(await digest(raw)!==expected)throw Error('Published asset bytes differ from their inventory.');assets[name]=raw;}));
  dataset=parseMeasurements(new TextDecoder().decode(assets['penguins.csv']));receipt=JSON.parse(new TextDecoder().decode(assets['recorded-receipt.json']));negatives=JSON.parse(new TextDecoder().decode(assets['recorded-negative-controls.json']));
  checkRecordedCase(receipt,dataset,manifest.files['penguins.csv']);
  if(receipt.bundle_sha256!==manifest.files['positive.pcs.zip']||receipt.public_key_fingerprint!==manifest.public_key_fingerprint)throw Error('Published evidence identities differ.');
  checkNegativeCases(negatives);
  for(const id of ['species','units','showFit','reset','negativeCase'])$(id).disabled=false;
  renderPlot();showEvidence();$('loadStatus').textContent='Ready: retained source bytes match the published unsigned hash inventory. Displaying actual data and recorded evidence; no new Lean verification has run.';
} catch(error) {$('loadStatus').textContent='Data or evidence unavailable: '+error.message+' No verified result is displayed.';}
