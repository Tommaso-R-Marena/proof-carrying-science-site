/* Real browser inference and finite checks. Provider readiness responses below
   are explicit UI fixtures, never evidence of a real hosted authorization. */
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'../public');
const server=http.createServer((req,res)=>{
 const url=new URL(req.url,'http://localhost');
 const file=path.resolve(root,'.'+url.pathname);
 if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
 try{res.setHeader('Content-Type',file.endsWith('.html')?'text/html':/\.(mjs|js)$/.test(file)?'text/javascript':file.endsWith('.json')?'application/json':file.endsWith('.css')?'text/css':'application/octet-stream');res.end(fs.readFileSync(file));}
 catch{res.statusCode=404;res.end();}
});
(async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const base='http://127.0.0.1:'+server.address().port;
 const browser=await chromium.launch({executablePath:process.env.PCS_CHROMIUM||'/usr/bin/chromium',args:['--no-sandbox']});
 const report={format:'pcs-model-wiring-browser-v1',real_human_participants:0,hosted_authorization_exercised:false,rows:[]};
 try{
  for(const width of [320,390,768,1440]){
   const context=await browser.newContext({viewport:{width,height:950}}),page=await context.newPage();
   page.setDefaultTimeout(20000);console.error("model-wiring viewport",width);
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/capabilities.html');await page.locator('#modelStatus').filter({hasText:'41 frozen checkpoints'}).waitFor();
   assert.equal(await page.locator('#allModels tr').count(),41);
   await page.selectOption('#capabilityFilter','models');assert.equal(await page.locator('#capabilityCards article').count(),6);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
   await page.goto(base+'/repair-model-lab.html');await page.locator('#pmRun:enabled').waitFor();
   await page.selectOption('#pmCase','implication-reversal-1');await page.locator('#pmRun').click();await page.locator('#pmStatus').filter({hasText:'learned edit order'}).waitFor();
   assert.ok(await page.locator('#pmAttempts li').count()>0);
   const actual=await page.locator('#pmStatus').innerText();
   // An altered numerical weight with the original declaration must fail closed.
   await page.route('**/repair-policy-model-v1.json',route=>{
    const m=JSON.parse(fs.readFileSync(path.join(root,'repair-policy-model-v1.json')));m.weights[0]+=0.1;
    return route.fulfill({contentType:'application/json',body:JSON.stringify(m)});
   });
   await page.reload();await page.locator('#pmStatus').filter({hasText:'Model could not be loaded'}).waitFor();assert.equal(await page.locator('#pmRun').isDisabled(),true);
   await page.goto(base+'/semantic-multistep-lab.html');
   await page.locator('#msStatus').filter({hasText:/unavailable|mismatch|digest|Unrecognized|failed/i}).waitFor();
   await context.close();assert.deepEqual(errors,[]);
   report.rows.push({width,real_model_inference:actual,tampered_weights_rejected:true,inventory_models:41});
  }
  const context=await browser.newContext(),page=await context.newPage();page.setDefaultTimeout(20000);
  let ready=false;
  await page.route('**/api/lean-research/status',route=>route.fulfill({json:{status:'configured',...(ready?{readiness:'ready'}:{}),pcs_authority:false}}));
  await page.goto(base+'/lean-learning-lab.html');await page.locator('#publicResult').filter({hasText:'temporarily unavailable'}).waitFor();
  await page.check('#publicConsent');assert.equal(await page.locator('#publicSolve').isDisabled(),true);
  ready=true;await page.reload();await page.locator('#publicResult').filter({hasText:'passed its latest source'}).waitFor();
  await page.check('#publicConsent');assert.equal(await page.locator('#publicSolve').isEnabled(),true);
  await context.close();report.configuration_only_does_not_enable_submit=true;
  if(process.env.PCS_MODEL_WIRING_OUTPUT)fs.writeFileSync(process.env.PCS_MODEL_WIRING_OUTPUT,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
 }finally{await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
