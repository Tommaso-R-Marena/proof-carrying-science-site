/* Real Chromium/production UI; provider is explicit loopback transport using an
 actual archived proof. This is not fresh hosted authorization or a human study. */
const {chromium}=require('playwright'),http=require('node:http'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../public'),example=JSON.parse(fs.readFileSync(path.join(root,'proof-workbench-example.json'))),temp=fs.mkdtempSync(path.join(os.tmpdir(),'pcs-workbench-browser-'));
let state={submits:[],polls:0,failSubmit:false,failPoll:false};
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const json=(value,status=200)=>{res.statusCode=status;res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
 if(url.pathname==='/api/lean-research/status')return json({status:'configured',readiness:'ready',core_sha:example.source_revision,pcs_authority:false});
 if(req.method==='POST'){
  let raw='';req.on('data',b=>raw+=b);req.on('end',()=>{
   if(url.pathname.endsWith('/submit')){state.submits.push({key:req.headers['idempotency-key'],body:JSON.parse(raw)});if(state.failSubmit){state.failSubmit=false;return json({message:'Fixture accepted dispatch; acknowledgment interrupted'},503);}return json({status:'queued',ticket:'fixture-ticket-not-a-real-authorization',request_id:example.request_id,core_sha:example.source_revision});}
   if(url.pathname.endsWith('/result')){state.polls++;if(state.failPoll){state.failPoll=false;return json({message:'Fixture interrupted provider read'},503);}return json({status:'completed',run_url:example.run_url,evidence:example.evidence});}
   return json({status:'cancellation_requested',pcs_authority:false});
  });return;
 }
 if(/^\/portable-(320|390|768|1440)\.html$/.test(url.pathname)){res.setHeader('Content-Type','text/html');return res.end(fs.readFileSync(path.join(temp,'report-'+url.pathname.match(/[0-9]+/)[0]+'.html')));}
 if(url.pathname.startsWith('/api/'))return json({message:'No account in this fixture'},401);
 const file=path.resolve(root,'.'+url.pathname);if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
 try{res.setHeader('Content-Type',/\.(js|mjs)$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.statusCode=404;res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.PCS_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});const rows=[];
 try{
  for(const width of [320,390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/proof-workbench-study.html');await page.selectOption('#pilotKind','automated');await page.selectOption('#pilotExperience','none');await page.check('#pilotAdult');await page.check('#pilotConsent');await page.click('#pilotStart');await page.locator('#pilotStatus').filter({hasText:'active'}).waitFor();
   await page.goto(base+'/proof-workbench.html');await page.locator('#wbService').filter({hasText:'ready'}).waitFor();
   await page.fill('#wbContext','PRIVATE NOTE NEVER PUBLISHED');await page.fill('#wbClaim','Unsupported private business context');await page.click('#wbRecognize');assert.equal(await page.locator('#wbRun').isDisabled(),true);assert.equal(state.submits.length,0);
   await page.click('#wbExample');await page.locator('#wbOutcome').filter({hasText:'Recorded report'}).waitFor();assert.equal(await page.locator('#wbOutcome').getAttribute('data-state'),'recorded');assert.equal(state.submits.length,0);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2));
   const download=page.waitForEvent('download');await page.click('#wbSave');const html=await download;const htmlPath=path.join(temp,'report-'+width+'.html');await html.saveAs(htmlPath);
   let offline=await context.newPage();offline.setDefaultTimeout(20000);const requests=[];offline.on('request',r=>{if(r.url().startsWith('http'))requests.push(r.url());});let fileScheme=true;try{await offline.goto('file://'+htmlPath);}catch(error){if(!String(error.message).includes('ERR_BLOCKED_BY_ADMINISTRATOR'))throw error;fileScheme=false;await offline.close();offline=await context.newPage();offline.setDefaultTimeout(20000);offline.on('request',r=>{if(r.url().startsWith('http'))requests.push(r.url());});await offline.goto(base+'/portable-'+width+'.html');}requests.length=0;await context.setOffline(true);await offline.getByRole('heading',{name:'PCS recorded proof result'}).waitFor();
   const evidenceDownload=offline.waitForEvent('download');await offline.click('#save-json');const evidence=await evidenceDownload;const data=JSON.parse(fs.readFileSync(await evidence.path()));assert.deepEqual(data,example);assert.deepEqual(requests,[]);await context.setOffline(false);await offline.close();
   await page.goto(base+'/proof-workbench-study.html');assert.match(await page.locator('#pilotSummary').innerText(),/questions answered/);for(const [id,choice] of [['meaning',0],['publication',1],['unknown',2],['recorded',1],['replay',2]])await page.locator('input[name="'+id+'"]').nth(choice).check();
   const studyDownload=page.waitForEvent('download');await page.click('#pilotExport');const studyFile=await studyDownload;const study=JSON.parse(fs.readFileSync(await studyFile.path()));assert.equal(study.participant_kind,'automated');assert.equal(study.human_origin_verified,false);assert.equal(study.answers.length,5);assert.equal(study.events.some(e=>e.event==='fresh-result-received'),false);assert.ok(!JSON.stringify(study).includes('PRIVATE NOTE'));
   rows.push({width,unsupported_not_published:true,recorded_not_presented_as_fresh:true,offline_evidence_matches:true,file_scheme_tested:fileScheme,network_disabled_during_offline_download:true,study_automation_excluded:true,overflow:false});assert.deepEqual(errors,[]);await context.close();
  }
  state={submits:[],polls:0,failSubmit:true,failPoll:true};
  const context=await browser.newContext({acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(30000);await page.goto(base+'/proof-workbench.html');await page.locator('#wbService').filter({hasText:'ready'}).waitFor();await page.click('[data-case="reuse"]');await page.check('#wbMeaningConsent');assert.equal(await page.locator('#wbRun').isDisabled(),true);await page.check('#wbPublishConsent');await page.click('#wbRun');await page.locator('#wbQueue').filter({hasText:'Unresolved'}).waitFor();assert.equal(state.submits.length,1);
  await page.reload();await page.locator('#wbService').filter({hasText:'ready'}).waitFor();await page.click('[data-case="combine"]');await page.check('#wbMeaningConsent');await page.click('#wbResume');await page.locator('#wbQueue').filter({hasText:'Restored the exact saved question'}).waitFor();assert.equal(state.submits.length,1);assert.equal(await page.locator('#wbMeaningConsent').isChecked(),false);assert.equal(await page.locator('#wbClaim').inputValue(),example.statement);await page.check('#wbMeaningConsent');await page.click('#wbResume');await page.locator('#wbQueue').filter({hasText:'Unresolved'}).waitFor();assert.equal(state.submits.length,2);assert.deepEqual(state.submits[0],state.submits[1]);
  await page.reload();await page.locator('#wbService').filter({hasText:'ready'}).waitFor();assert.equal(await page.locator('#wbStrategy').inputValue(),'verified-memory-v1');await page.check('#wbMeaningConsent');await page.click('#wbResume');await page.locator('#wbOutcome').filter({hasText:'A proof was checked'}).waitFor();assert.equal(state.submits.length,2,'Acknowledged ticket must resume without another submit');assert.equal(await page.locator('#wbSave').isEnabled(),true);assert.equal(state.submits[0].body.statement,example.statement);assert.ok(!JSON.stringify(state.submits).includes('PRIVATE NOTE'));await context.close();
  const report={format:'pcs-proof-workbench-browser-v1',transport:'explicit loopback provider with actual archived proof; not fresh authorization',fresh_authorization_exercised:false,real_human_participants:0,rows,recovery:{same_idempotency_key_after_uncertain_submit:true,acknowledged_ticket_poll_only:true,changed_meaning_requires_reconfirmation:true,private_context_excluded:true}};
  if(process.env.PCS_WORKBENCH_BROWSER_OUTPUT)fs.writeFileSync(process.env.PCS_WORKBENCH_BROWSER_OUTPUT,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
