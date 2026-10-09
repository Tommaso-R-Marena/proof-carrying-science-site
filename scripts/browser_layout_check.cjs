// Real rendering at narrow phone, phone, tablet and desktop sizes. No remote writes.
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path');
const base=process.env.PCS_BASE_URL||'http://127.0.0.1:8788';
if(!['http://127.0.0.1:8788','http://127.0.0.1:4173'].includes(new URL(base).origin))throw Error('Layout checks require an isolated local server');
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PCS_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});const rows=[];
 try{
 for(const width of [320,390,768,1440]){
  const context=await browser.newContext({viewport:{width,height:900}});
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  const page=await context.newPage();
  for(const file of fs.readdirSync(path.join(__dirname,'../public')).filter(f=>f.endsWith('.html'))){
   const errors=[];const listener=e=>errors.push(e.message);page.on('pageerror',listener);
   const response=await page.goto(base+'/'+file,{waitUntil:'load'});await page.waitForTimeout(100);
   if(file==='tasks.html'&&new URL(base).port==='8788'){
    await page.locator('#commonsTaskList .commons-task-card').first().waitFor();
    if((await page.locator('#commonsTaskList').innerText()).includes('Account service unavailable'))throw Error('Live task rendering failed');
   }
   const metrics=await page.evaluate(()=>{
    const clashes=[];const rect=e=>e.getBoundingClientRect();
    for(const parent of document.querySelectorAll('main *,header *,footer *')){
     if(parent.closest('svg'))continue;
     // Inline line boxes and rotated decoration overlap in their bounding boxes
     // without occluding content. Inspect normal block/grid/flex sibling panels.
     const kids=[...parent.children].filter(e=>{const s=getComputedStyle(e),r=rect(e);return r.width&&r.height&&s.visibility!=='hidden'&&!['absolute','fixed'].includes(s.position)&&!s.display.startsWith('inline')&&s.transform==='none'&&getComputedStyle(parent).transform==='none'&&!e.closest('svg')&&!e.matches('.duel-versus');});
     for(let i=0;i<kids.length;i++)for(let j=i+1;j<kids.length;j++){
      const a=rect(kids[i]),b=rect(kids[j]);if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>3&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>3)clashes.push({parent:parent.id||parent.className,a:kids[i].id||kids[i].className||kids[i].tagName,b:kids[j].id||kids[j].className||kids[j].tagName});
     }
    }
    const escapes=[...document.querySelectorAll('main *')].filter(e=>rect(e).width&&rect(e).right>innerWidth+2&&!e.closest('svg')).slice(0,10).map(e=>({tag:e.tagName,id:e.id,cls:e.className,text:e.textContent.slice(0,80)}));
    return {scrollWidth:document.documentElement.scrollWidth,clashes,escapes};
   });
   rows.push({file,width,status:response.status(),...metrics,errors});page.off('pageerror',listener);
   if(process.env.PCS_LAYOUT_OUTPUT&&(metrics.scrollWidth>width+2||metrics.clashes.length||errors.length)){fs.mkdirSync(process.env.PCS_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.PCS_LAYOUT_OUTPUT,`failed-${width}-${file}.png`),fullPage:true});}
  }
  // Actual game board, checked explanation, mission advancement and mobile menu.
  await page.goto(base+'/arena-countermodel.html?mission=implication-flip');
  await page.getByRole('button',{name:'○ P(Agent 1)',exact:true}).click();await page.locator('#cmCheck').click();
  if(!(await page.locator('#cmGoals').innerText()).includes('✓ Smallest'))throw Error('Real mastery goal failed');
  await page.locator('.cm-explanation summary').click();if(!(await page.locator('#cmExplanation').innerText()).includes('FALSE'))throw Error('Explanation missing real checker result');
  await page.locator('#cmNext').click();if((await page.locator('#cmTitle').innerText())!=='The One-Example Trap')throw Error('Campaign did not advance');
  await page.locator('#cmDaily').click();await page.locator('#cmAdd').click();await page.locator('#cmAdd').click();await page.locator('#cmCheck').click();
  if(width<=768){await page.locator('.navtoggle').click();if(!(await page.locator('.navlinks').isVisible()))throw Error('Mobile navigation did not open');}
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('Active game overflow');
  if(process.env.PCS_LAYOUT_OUTPUT){fs.mkdirSync(process.env.PCS_LAYOUT_OUTPUT,{recursive:true});await page.screenshot({path:path.join(process.env.PCS_LAYOUT_OUTPUT,`game-${width}.png`),fullPage:true});}
  await page.goto(base+'/arena-proof-quest.html');await page.locator('#questSchedule').click();
  if(!(await page.locator('#questScheduleReport').innerText()).includes('parallel stages'))throw Error('Dependency schedule missing');
  await page.goto(base+'/omega-workspace.html');await page.locator('#omegaStatus').filter({hasText:'Mapped 1 explicit claim'}).waitFor();
  const original=await page.locator('#omegaMeaningSource').innerText();
  for(const strategy of ['adaptive','nonlinear']){
   await page.locator('#omegaStrategy').selectOption(strategy);await page.locator('#omegaRun').click();
   await page.locator('#omegaResult').filter({hasText:'Boolean equivalence checked'}).waitFor();
   const pending=page.waitForEvent('download');await page.locator('#omegaEpisode').click();const download=await pending;
   const e=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
   if(e.format!=='pcs-omega-adaptive-episode-v2'||!e.solution||e.pcs_authority!==false||e.lean_kernel_checked!==false)throw Error('Adaptive download authority or solution invalid');
   if(process.env.PCS_LAYOUT_OUTPUT)fs.writeFileSync(path.join(process.env.PCS_LAYOUT_OUTPUT,`episode-${strategy}-${width}.json`),JSON.stringify(e,null,2));
  }
  await page.locator('#omegaRepair').click();
  await page.locator('#omegaStatus').filter({hasText:'Mapped 1 explicit claim'}).waitFor();
  if(await page.locator('#omegaMeaningSource').innerText()!==original||await page.locator('#omegaEpisode').isEnabled())throw Error('Manual edit changed source or retained stale evidence');
  await page.getByText('Inspect every true / false combination',{exact:true}).click();if(await page.locator('#omegaTruthTable tbody tr').count()<4)throw Error('Actual truth table not rendered');
  if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2))throw Error('Active workspace overflow');
  if(process.env.PCS_LAYOUT_OUTPUT)await page.screenshot({path:path.join(process.env.PCS_LAYOUT_OUTPUT,`workspace-${width}.png`),fullPage:true});
  await context.close();
 }
 const failures=rows.filter(r=>r.status!==200||r.scrollWidth>r.width+2||r.clashes.length||r.errors.length);
 if(process.env.PCS_LAYOUT_OUTPUT)fs.writeFileSync(path.join(process.env.PCS_LAYOUT_OUTPUT,'layout.json'),JSON.stringify(rows,null,2));
 console.log(JSON.stringify({pages:rows.length,viewports:[320,390,768,1440],failures}));if(failures.length)process.exitCode=1;
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
