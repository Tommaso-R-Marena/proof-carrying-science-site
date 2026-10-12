/* Actual Chromium and production UI, with explicit HTTP provider fixtures.
   No live provider request, account, proof or production quota is consumed. */
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),{isDeepStrictEqual}=require('node:util');
const root=path.resolve(__dirname,'../public');
const fixture={submits:[],cancels:0,polls:0,failDispatchReply:true,terminal:false};
const core=fs.readFileSync(path.resolve(__dirname,'../src/lean-research.js'),'utf8').match(/export const CORE_SHA = "([0-9a-f]{40})"/)[1],request_id='a'.repeat(32);
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://127.0.0.1');
 if(url.pathname==='/api/lean-research/status'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify({status:'configured',pcs_authority:false}));}
 if(req.method==='POST'){
  let data='';req.on('data',chunk=>data+=chunk);req.on('end',()=>{
   res.setHeader('Content-Type','application/json');
   if(url.pathname.endsWith('/submit')){
    fixture.submits.push({key:req.headers['idempotency-key'],body:JSON.parse(data)});
    if(fixture.failDispatchReply){fixture.failDispatchReply=false;res.statusCode=503;return res.end(JSON.stringify({message:'Fixture accepted dispatch; confirmation unavailable'}));}
    return res.end(JSON.stringify({status:'queued',ticket:'fixture-ticket-not-a-real-signed-ticket',request_id,core_sha:core,pcs_authority:false}));
   }
   if(url.pathname.endsWith('/cancel')){fixture.cancels++;return res.end(JSON.stringify({status:'cancellation_requested',pcs_authority:false}));}
   if(url.pathname.endsWith('/result')){fixture.polls++;if(!fixture.terminal){res.statusCode=503;return res.end(JSON.stringify({message:'Fixture provider poll interrupted'}));}return res.end(JSON.stringify({status:'cancelled',reason:'Fixture provider confirmed cancellation',pcs_authority:false}));}
   res.statusCode=404;res.end('{}');
  });return;
 }
 const file=path.resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
 try{const data=fs.readFileSync(file);res.setHeader('Content-Type',file.endsWith('.mjs')||file.endsWith('.js')?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'text/html');res.end(data);}catch{res.statusCode=404;res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||process.env.PCS_CHROMIUM||'/usr/bin/chromium',headless:true});
 const rows=[];
 try{
  for(const width of [320,768,1440]){
   const context=await browser.newContext({viewport:{width,height:900},reducedMotion:'reduce'}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/lean-learning-lab.html',{waitUntil:'networkidle'});
   await page.locator('#publicMemory').check();await page.locator('#publicHybrid').check();if(await page.locator('#publicMemory').isChecked()||await page.locator('#publicInduction').isChecked())throw Error('Hybrid selection is not mutually exclusive');await page.locator('#publicConsent').check();await page.locator('#publicSolve:enabled').waitFor();
   fixture.failDispatchReply=true;fixture.terminal=false;const start=fixture.submits.length;
   await page.locator('#publicSolve').click();await page.locator('#publicResult').filter({hasText:'confirmation unavailable'}).waitFor();
   const original=fixture.submits[start];if(original.body.model_family!=='prospective-hybrid-v2')throw Error('Hybrid family was not submitted');if(!/^[0-9a-f]{32}$/.test(original.key))throw Error('Missing real browser idempotency header');
   await page.reload({waitUntil:'networkidle'});await page.locator('#publicResume:enabled').waitFor();
   if(await page.locator('#publicConsent').isChecked())throw Error('Reload implies a new consent');
   await page.locator('#publicResume').click();await page.locator('#publicResult').filter({hasText:'poll interrupted'}).waitFor({timeout:20000});
   if(fixture.submits[start+1].key!==original.key||!isDeepStrictEqual(fixture.submits[start+1].body,original.body))throw Error('Resume changed original request');
   await page.reload({waitUntil:'networkidle'});await page.locator('#publicCancel:enabled').waitFor();await page.locator('#publicCancel').click();
   await page.locator('#publicResult').filter({hasText:'not yet confirmed'}).waitFor();
   if(await page.locator('#publicResume').isDisabled())throw Error('Unconfirmed cancel destroyed recovery');
   fixture.terminal=true;await page.locator('#publicResume').click();await page.locator('#publicResult').filter({hasText:'confirmed cancellation'}).waitFor({timeout:20000});
   if(!await page.locator('#publicResume').isDisabled()||!await page.locator('#publicCancel').isDisabled()||!await page.locator('#publicDownload').isDisabled())throw Error('Terminal cancellation incorrectly retained recovery or certified evidence');
   const before=fixture.cancels;fixture.failDispatchReply=true;await page.locator('#publicConsent').check();await page.locator('#publicSolve').click();await page.locator('#publicResult').filter({hasText:'confirmation unavailable'}).waitFor();await page.locator('#publicForget').click();
   if(fixture.cancels!==before||!await page.locator('#publicResume').isDisabled())throw Error('Forgetting metadata cancels provider or retains request');
   const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth+2,reducedMotion:matchMedia('(prefers-reduced-motion: reduce)').matches}));
   if(layout.overflow||!layout.reducedMotion||errors.length)throw Error(JSON.stringify({width,layout,errors}));
   rows.push({width,hybridFamilySubmitted:true,modelSelectionExclusive:true,reloadPreservesConsentedRequest:true,sameIdempotencyKey:true,interruptedPollRecoverable:true,cancelRequiresProviderConfirmation:true,terminalCancellationClearsRecovery:true,forgetDoesNotCancel:true,noCertifiedProofFromFixtures:true,...layout,errors});await context.close();
  }
  const report={format:'pcs-lean-browser-recovery-campaign-v1',realBrowser:true,realProductionUI:true,transport:'loopback HTTP provider fixtures; no real hosted Lean run',productionRequests:0,financialSpend:0,rows};
  if(process.env.PCS_LEAN_RECOVERY_OUTPUT)fs.writeFileSync(process.env.PCS_LEAN_RECOVERY_OUTPUT,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
