// Exercise navigation and actual edits with real Chromium. All mutations are blocked.
const {chromium}=require('playwright'),fs=require('node:fs');
const assert=require('node:assert/strict');
const base=process.env.PCS_BROWSER_BASE_URL||'http://127.0.0.1:8788';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Game checks require an isolated loopback server');
const pages=['arena-countermodel','arena-proof-quest','arena-safety-forge','prooflab','meaning-forge','semantic-gauntlet','forge-duel','semantic-repair-lab','semantic-multistep-lab','repair-model-lab','intervention-lab'];
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.PCS_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 const rows=[];
 try{
  for(const width of [320,390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'});
   const errors=[],writes=[];context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
   await context.route('**/*',r=>{const q=r.request();if(!['GET','HEAD'].includes(q.method()))writes.push(q.url());return new URL(q.url()).origin===new URL(base).origin&&['GET','HEAD'].includes(q.method())?r.continue():r.abort();});
   const page=await context.newPage();
   for(const name of pages){
    assert.equal((await page.goto(`${base}/${name}.html`)).status(),200);
    await page.locator('#gameGuideStart').waitFor();
    if(await page.locator('#gameGuideQuickPlay').count()){
     await page.locator('#gameGuideQuickPlay').click();
     assert.equal(await page.locator('.game-guide-target').count(),1);
     if(name==='intervention-lab')assert.equal(await page.locator('[data-role=proposal]').first().evaluate(el=>el===document.activeElement),true);
    }
    await page.locator('#gameGuideStart').click();
    for(let step=0;step<3;step++){
     assert.match(await page.locator('#gameGuideTitle').innerText(),new RegExp('^'+(step+1)));
     await page.locator('#gameGuideJump').click();
     assert.equal(await page.locator('.game-guide-target').count(),1,'one highlighted target '+name);
     await page.locator('#gameGuideNext').click();
    }
    assert.equal(await page.locator('#gameGuideTour').isVisible(),false);
    await page.locator('#gameGuideStart').click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('#gameGuideTour').isVisible(),false);
    assert.equal(await page.locator('.game-guide-target').count(),0);
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+2);
    assert.equal(overflow,false,'guide overflow '+name+' '+width);
    rows.push({game:name,path:new URL(page.url()).pathname,width,three_steps:true,escape_closes:true});
   }
   await page.goto(base+'/arena-countermodel.html');
   if(process.env.PCS_USABILITY_OUTPUT)await page.screenshot({path:process.env.PCS_USABILITY_OUTPUT+`.start-${width}.png`});
   assert.equal(await page.locator('#cmTitle').innerText(),'Cause & Consequence');
   const fact=page.locator('[data-cm-focus="fact-P-0"]');await fact.focus();await page.keyboard.press('Space');
   assert.equal(await fact.getAttribute('aria-pressed'),'true');assert.equal(await fact.evaluate(el=>el===document.activeElement),true,'keyboard focus survived render');
   await page.locator('#cmCheck').click();assert.match(await page.locator('#cmFeedback').innerText(),/Counterexample found/);
   assert.equal(await page.locator('#cmWinNext').isVisible(),true);
   await page.locator('#cmHint').click();await page.locator('#cmUndo').click();
   assert.equal(await fact.getAttribute('aria-pressed'),'false');assert.equal(await page.locator('#cmHints').innerText(),'1');
   assert.equal(await page.locator('#cmWitnessExport').isEnabled(),false);
   assert.equal(await page.locator('#cmWinNext').isVisible(),false);
   await page.locator('#cmCheck').click();assert.match(await page.locator('#cmFeedback').innerText(),/Not yet/);
   let pending=page.waitForEvent('download');await page.locator('#cmSessionExport').click();let download=await pending;
   let trace=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
   assert.deepEqual(trace.actions.map(a=>a.type),['toggle','check','hint','toggle','check']);
   await page.getByRole('button',{name:/One Witness for Everyone/}).click();await page.locator('#cmAdd').click();
   const edge=(i,j)=>page.locator(`#cmRelationMap [data-from="${i}"][data-to="${j}"]`);
   await edge(0,0).focus();await page.keyboard.press('Enter');
   assert.equal(await edge(0,0).getAttribute('aria-pressed'),'true');assert.equal(await edge(0,0).evaluate(el=>el===document.activeElement),true);
   await edge(1,1).click();await page.locator('#cmCheck').click();assert.match(await page.locator('#cmFeedback').innerText(),/Counterexample found/);
   await page.locator('#cmRemove').click();await page.locator('#cmUndo').click();
   assert.equal(await edge(1,1).getAttribute('aria-pressed'),'true');
   assert.equal(await page.getByRole('button',{name:'R Agent 2 to Agent 2',exact:true}).getAttribute('aria-pressed'),'true');
   const cell=page.getByRole('button',{name:'R Agent 2 to Agent 2',exact:true});await cell.focus();await page.keyboard.press('Space');assert.equal(await cell.evaluate(el=>el===document.activeElement),true,'table keyboard focus survives render');await page.keyboard.press('Space');
   await page.locator('#cmCheck').click();
   pending=page.waitForEvent('download');await page.locator('#cmSessionExport').click();download=await pending;
   trace=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
   const replay=await page.evaluate(async record=>{const {replayCountermodelSession}=await import('./countermodel-core.mjs');return replayCountermodelSession({version:record.version,mission_id:record.mission_id,actions:record.actions});},trace);
   assert.equal(replay.final_verified,true);assert.equal(replay.final_world.n,2);assert.equal(replay.final_world.R[1][1],true);
   if(process.env.PCS_USABILITY_OUTPUT){fs.writeFileSync(process.env.PCS_USABILITY_OUTPUT+`.trace-${width}.json`,JSON.stringify(trace));await page.screenshot({path:process.env.PCS_USABILITY_OUTPUT+`.${width}.png`,fullPage:true});}
   await page.locator('#cmAdd').click();
   const clashes=await page.locator('#cmRelationMap').evaluate(root=>{
    const boxes=[...root.querySelectorAll('.cm-edge rect')].map(el=>el.getBoundingClientRect());
    return boxes.flatMap((a,i)=>boxes.slice(i+1).filter(b=>Math.min(a.right,b.right)>Math.max(a.left,b.left)&&Math.min(a.bottom,b.bottom)>Math.max(a.top,b.top)).map(()=>i));
   });
   assert.deepEqual(clashes,[],'three-agent relationship controls must not overlap');
   if(process.env.PCS_USABILITY_OUTPUT)await page.locator('#cmRelationMap').screenshot({path:process.env.PCS_USABILITY_OUTPUT+`.three-agents-${width}.png`});
   await page.locator('#cmUndo').click();await page.locator('#cmCheck').click();
   await page.locator('#cmWinNext').click();assert.notEqual(await page.locator('#cmTitle').innerText(),'One Witness for Everyone?');
   assert.deepEqual(errors,[]);assert.deepEqual(writes,[]);await context.close();
  }
  const result={format:'pcs-game-usability-browser-v1',guides:rows,keyboard_and_undo_worlds:4,unexpected_writes:0};
  if(process.env.PCS_USABILITY_OUTPUT)fs.writeFileSync(process.env.PCS_USABILITY_OUTPUT,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
