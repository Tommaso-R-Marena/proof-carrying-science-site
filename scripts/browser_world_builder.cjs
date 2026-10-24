// Real visual interactions. All data are synthetic test choices, never human evidence.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../public'),output=process.env.PCS_WORLD_BUILDER_OUTPUT||'/tmp/pcs-world-builder-browser';
const server=http.createServer((req,res)=>{
 if(!['GET','HEAD'].includes(req.method)){res.statusCode=405;return res.end();}
 const name=new URL(req.url,'http://localhost').pathname;
 if(name.startsWith('/api/')){res.statusCode=503;res.setHeader('Content-Type','application/json');return res.end('{}');}
 const file=path.resolve(root,'.'+(name==='/'?'/index.html':name));
 if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
 try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
});
(async()=>{
 const {MISSIONS,readNotebook,analyzeNotebook}=await import('../public/world-builder-core.mjs');
 const {findMinimalCountermodel,exportLeanCountermodel,replayCountermodelSession}=await import('../public/countermodel-core.mjs');
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.PCS_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 const rows=[];
 try{
 for(const width of [320,390,768,1440]){
  const ctx=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce',acceptDownloads:true});const errors=[],writes=[],external=[];
  await ctx.route('**/*',r=>{const q=r.request();if(new URL(q.url()).origin!==base){external.push(q.url());return r.abort();}if(!['GET','HEAD'].includes(q.method()))writes.push(q.url());return r.continue();});
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
  await p.goto(base+'/arena.html');await p.getByRole('link',{name:'Play World Builder →',exact:true}).click();
  await p.locator('#wbApp[data-ready=true]').waitFor();await p.locator('#wbPlay').click();
  assert.equal(await p.locator('#wbTitle').evaluate(e=>e.getBoundingClientRect().top>=0),true,'start keeps the puzzle and rules in view');
  // A sticky mobile bar previously covered the rules at some scroll positions.
  for(const scroll of [0,400,850]){
   await p.evaluate(y=>window.scrollTo(0,y),scroll);
   const covered=await p.evaluate(()=>{const bar=document.querySelector('.wb-controls').getBoundingClientRect();return ['#wbPuzzle','.wb-rules','#wbBoard'].filter(s=>{const r=document.querySelector(s).getBoundingClientRect();return Math.min(bar.right,r.right)-Math.max(bar.left,r.left)>3&&Math.min(bar.bottom,r.bottom)-Math.max(bar.top,r.top)>3;});});
   assert.deepEqual(covered,[],'control bar must not cover the puzzle while scrolling');
  }
  await p.screenshot({path:path.join(output,`start-${width}.png`),fullPage:true});
  assert.equal(await p.locator('#wbWitness').isDisabled(),true);
  await p.locator('#wbCheck').click();assert.match(await p.locator('#wbFeedback').innerText(),/rules agree/);
  const fact=p.locator('#wbWorld [data-fact=P][data-character="0"]');await fact.focus();await p.keyboard.press('Space');
  assert.equal(await fact.getAttribute('aria-pressed'),'true');assert.equal(await fact.evaluate(e=>e===document.activeElement),true);
  assert.equal(await p.locator('#wbWorld .wb-character').getAttribute('data-key'),'true');
  assert.equal(await p.locator('#wbLeftResult').innerText(),'Not tested');
  await p.locator('#wbCheck').click();assert.match(await p.locator('#wbFeedback').innerText(),/Difference found/);
  assert.equal(await p.locator('#wbStars [data-earned=true]').count(),3);
  await p.locator('#wbReplay').click();assert.match(await p.locator('#wbReplayObservation').innerText(),/No checker response yet/);
  await p.locator('#wbForward').click();assert.match(await p.locator('#wbReplayObservation').innerText(),/Rules agree/);
  await p.locator('#wbForward').click();assert.match(await p.locator('#wbReplayObservation').innerText(),/No checker response was requested/);
  assert.equal(await p.locator('#wbReplayWorld .wb-character').getAttribute('data-key'),'true');
  await p.locator('#wbForward').click();assert.match(await p.locator('#wbReplayObservation').innerText(),/Difference found/);
  assert.equal(await p.locator('#wbForward').isDisabled(),true);
  let pending=p.waitForEvent('download');await p.locator('#wbDownload').click();let d=await pending;
  const initial=readNotebook(fs.readFileSync(await d.path(),'utf8'));assert.equal((await analyzeNotebook(initial)).episodes[0].failed_checks,1);
  await p.locator('#wbUndo').click();assert.equal(await p.locator('#wbWitness').isDisabled(),true);assert.equal(await fact.getAttribute('aria-pressed'),'false');
  await p.locator('#wbHint').click();await p.locator('#wbCheck').click();assert.match(await p.locator('#wbStats').innerText(),/1 clues/);
  await p.locator('#wbRestart').click();assert.match(await p.locator('#wbNotebookSummary').innerText(),/1 tested rounds/);
  for(let i=0;i<MISSIONS.length;i++){
   const id=MISSIONS[i];await p.getByRole('button',{name:new RegExp(`^Puzzle ${i+1}:`)}).click();
   const w=findMinimalCountermodel(id).w;
   for(let j=1;j<w.n;j++)await p.locator('#wbAdd').click();
   if(i<5){for(let j=0;j<w.n;j++)for(const key of ['P','Q'])if(w[key][j])await p.locator(`#wbWorld [data-fact=${key}][data-character="${j}"]`).click();}
   else for(let j=0;j<w.n;j++)for(let k=0;k<w.n;k++)if(w.R[j][k]){
    const b=p.getByRole('button',{name:`Character ${j+1} sends a signal to Character ${k+1}, off`,exact:true});await b.focus();await p.keyboard.press('Enter');
    assert.equal(await p.getByRole('button',{name:`Character ${j+1} sends a signal to Character ${k+1}, on`,exact:true}).evaluate(e=>e===document.activeElement),true);
   }
   await p.locator('#wbCheck').click();assert.match(await p.locator('#wbFeedback').innerText(),/Difference found/);
   const detail=p.locator('details').filter({has:p.locator('#wbProof')});await detail.locator('summary').click();
   pending=p.waitForEvent('download');await p.locator('#wbWitness').click();d=await pending;const witness=fs.readFileSync(await d.path(),'utf8');assert.deepEqual(JSON.parse(witness).world,w);
   pending=p.waitForEvent('download');await p.locator('#wbProof').click();d=await pending;const proof=fs.readFileSync(await d.path(),'utf8');assert.equal(proof,exportLeanCountermodel(id,w).lean_source);
   if(width===1440){fs.writeFileSync(path.join(output,id+'.witness.json'),witness);fs.writeFileSync(path.join(output,id+'.lean'),proof);}
   await detail.locator('summary').click();
  }
  assert.match(await p.locator('#wbProgress').innerText(),/7 of 7/);
  assert.match(await p.locator('#wbProgress').innerText(),/21\/21 stars/);
  await p.locator('#wbReplay').click();await p.locator('#wbForward').click();
  const duplicateIds=await p.evaluate(()=>{const ids=[...document.querySelectorAll('[id]')].map(e=>e.id);return ids.filter((v,i)=>ids.indexOf(v)!==i);});assert.deepEqual(duplicateIds,[]);
  await p.locator('#wbAdd').click();assert.equal(await p.locator('#wbWitness').isDisabled(),true);await p.locator('#wbUndo').click();await p.locator('#wbCheck').click();
  pending=p.waitForEvent('download');await p.locator('#wbDownload').click();d=await pending;const raw=fs.readFileSync(await d.path(),'utf8'),n=readNotebook(raw),analysis=await analyzeNotebook(n);
  assert.equal(n.sessions.length,8);assert.equal(analysis.episodes[0].split,'assisted_excluded');assert.equal(analysis.episodes.filter(e=>e.solved).length,7);
  if(width===1440){fs.writeFileSync(path.join(output,'scripted-notebook.json'),raw);fs.writeFileSync(path.join(output,'scripted-analysis.json'),JSON.stringify(analysis,null,2));}
  await p.screenshot({path:path.join(output,`discovery-${width}.png`),fullPage:true});
  assert.deepEqual(writes,[],'no uploads before separate opt-in action');
  await p.locator('#wbShare > summary').click();await p.locator('#wbAdult').check();assert.equal(await p.locator('#wbDonate').isDisabled(),true);await p.locator('#wbConsent').check();assert.equal(await p.locator('#wbDonate').isEnabled(),true);
  // An intentionally denied response tests UI snapshotting, not real authorization.
  let release,received;const held=new Promise(r=>received=r);
  await ctx.route('**/api/arena/countermodel/donate',async route=>{const body=route.request().postDataJSON();await new Promise(r=>{release=()=>r();received(body);});await route.fulfill({status:401,contentType:'application/json',body:'{"error":"authentication_required"}'});});
  await p.locator('#wbDonate').click();const sent=await held;assert.deepEqual(Object.keys(sent).sort(),['adult_confirmation','consent_training','session']);assert.equal(replayCountermodelSession(sent.session).final_verified,true);
  await p.locator('#wbRestart').click();assert.equal(await p.locator('#wbConsent').isChecked(),false);release();await p.locator('#wbShareStatus').filter({hasText:'Sharing did not complete'}).waitFor();
  assert.match(await p.locator('#wbShareStatus').innerText(),/Sign in and verify/);assert.equal(await p.locator('#wbDonate').isDisabled(),true);
  await p.getByRole('button',{name:/^Puzzle 1:/}).click();await p.locator('#wbWorld [data-fact=P][data-character="0"]').click();await p.locator('#wbCheck').click();
  const beforeFile=await p.locator('#wbProgress').innerText();
  await p.locator('#wbReader > summary').click();
  await p.locator('#wbFile').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(raw)});
  await p.locator('#wbLoadStatus[data-state=loaded]').waitFor();
  assert.match(await p.locator('#wbReplayTitle').innerText(),/Saved-file round \(read-only\)/);
  assert.equal(await p.locator('#wbProgress').innerText(),beforeFile);assert.equal(await p.locator('#wbWitness').isDisabled(),true);
  await p.locator('#wbAdult').check();await p.locator('#wbConsent').check();assert.equal(await p.locator('#wbDonate').isDisabled(),true,'imported choices cannot be donated');
  await p.locator('#wbReturn').click();assert.equal(await p.locator('#wbWitness').isEnabled(),true);assert.equal(await p.locator('#wbConsent').isChecked(),false);
  pending=p.waitForEvent('download');await p.locator('#wbDownload').click();d=await pending;
  const unchanged=readNotebook(fs.readFileSync(await d.path(),'utf8'));assert.ok(unchanged.sessions.length<=9,'file never merged into live collection');
  for(const buffer of [Buffer.from('{"sessions":[],"sessions":[]}'),Buffer.from(JSON.stringify({...n,verified:true})),Buffer.from([255]),Buffer.alloc(131073,32)]){
   await p.locator('#wbFile').setInputFiles({name:'bad.json',mimeType:'application/json',buffer});await p.locator('#wbLoadStatus[data-state=error]').waitFor();
   assert.match(await p.locator('#wbLoadStatus').innerText(),/File not accepted/);assert.equal(await p.locator('#wbViewImported').isDisabled(),true);
  }
  await p.evaluate(()=>{const original=File.prototype.arrayBuffer;File.prototype.arrayBuffer=function(){return this.name==='slow.json'?new Promise(resolve=>{window.finishOldNotebook=resolve;}):original.call(this);};});
  await p.locator('#wbFile').setInputFiles({name:'slow.json',mimeType:'application/json',buffer:Buffer.from('{}')});await p.waitForFunction(()=>typeof window.finishOldNotebook==='function');
  await p.locator('#wbFile').setInputFiles({name:'new.json',mimeType:'application/json',buffer:Buffer.from(raw)});await p.locator('#wbLoadStatus[data-state=loaded]').waitFor();
  await p.evaluate(()=>window.finishOldNotebook(new TextEncoder().encode('{}').buffer));await p.waitForTimeout(50);assert.equal(await p.locator('#wbLoadStatus').getAttribute('data-state'),'loaded');
  await p.evaluate(()=>{window.finishOldNotebook=null;});
  await p.locator('#wbFile').setInputFiles({name:'slow.json',mimeType:'application/json',buffer:Buffer.from('{}')});await p.waitForFunction(()=>typeof window.finishOldNotebook==='function');
  await p.locator('#wbClear').click();await p.evaluate(()=>window.finishOldNotebook(new TextEncoder().encode('{}').buffer));await p.waitForTimeout(50);
  assert.equal(await p.locator('#wbLoadStatus').getAttribute('data-state'),'idle');assert.equal(await p.locator('#wbFile').inputValue(),'');assert.equal(await p.locator('#wbViewImported').isDisabled(),true);
  if(width===1440){
   await p.evaluate(()=>{document.getElementById('wbClear').click();for(let round=0;round<20;round++){for(let j=0;j<=round;j++)document.getElementById('wbCheck').click();if(round<19)document.getElementById('wbRestart').click();}document.getElementById('wbRestart').click();});
   assert.match(await p.locator('#wbFeedback').innerText(),/Twenty rounds are ready/);
   pending=p.waitForEvent('download');await p.locator('#wbDownload').click();d=await pending;assert.equal(readNotebook(fs.readFileSync(await d.path(),'utf8')).sessions.length,20);
  }
  assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);
  assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
  rows.push({width,all_seven_puzzles:true,keyboard:true,visual_replay:true,controls_never_cover_rules_or_board:true,failed_and_assisted_rounds_preserved:true,actual_downloads:true,automatic_uploads:0,denied_snapshot_race:true,read_only_file_replay:true,imported_moves_never_donated:true,malformed_files_rejected:4,stale_file_reads_invalidated:true});await ctx.close();
 }
 const nojs=await browser.newContext({javaScriptEnabled:false}),p=await nojs.newPage();await p.goto(base+'/world-builder.html');assert.match(await p.locator('noscript').innerText(),/needs JavaScript/);assert.equal(await p.locator('#wbCheck').isDisabled(),true);await nojs.close();
 const missing=await browser.newContext();await missing.route('**/world-builder.mjs',r=>r.abort());const failed=await missing.newPage();await failed.goto(base+'/world-builder.html');assert.equal(await failed.locator('#wbCheck').isDisabled(),true);assert.equal(await failed.locator('#wbDonate').isDisabled(),true);await missing.close();
 const report={format:'pcs-world-builder-browser-v1',data_origin:'scripted synthetic test choices; not human research data',browser:browser.version(),rows,notebook_cap_preserves_twenty_rounds:true,no_javascript_and_missing_checker_fail_closed:true,kernel_executed_in_browser:false,pcs_authority:false};
 fs.writeFileSync(path.join(output,'browser-results.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
