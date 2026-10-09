// Real game, local fitting and downloads. Scripted validation, no participant data.
const {chromium}=require('playwright');const fs=require('node:fs');
const base=process.env.PCS_BROWSER_BASE_URL||'http://127.0.0.1:8795';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Learning validation requires an isolated loopback Worker');
const output=process.env.PCS_LEARNING_OUTPUT||'/tmp/pcs-countermodel-learning-browser.json';
let browser;
(async()=>{
 browser=await chromium.launch({executablePath:process.env.PCS_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const rows=[];
 for(const viewport of [{width:1440,height:900},{width:375,height:812}]){
  const context=await browser.newContext({viewport});let mutations=0;const exceptions=[];
  await context.route('**/*',r=>{const request=r.request();if(!['GET','HEAD'].includes(request.method()))mutations++;
   return new URL(request.url()).origin===new URL(base).origin&&['GET','HEAD'].includes(request.method())?r.continue():r.abort();});
  const page=await context.newPage();page.on('pageerror',e=>exceptions.push(e.message));
  const response=await page.goto(base+'/arena-countermodel.html?mission=implication-flip',{waitUntil:'networkidle'});if(response.status()!==200)throw Error('Game unavailable');
  await page.locator('#cmGuideStart').click();await page.locator('#cmWorld button').first().click();await page.locator('#cmCheck').click();
  await page.locator('#cmGuideStatus').filter({hasText:'You made a real counterexample'}).waitFor();
  if(await page.locator('#cmHints').innerText()!=='1')throw Error('Walkthrough assistance missing');
  await page.locator('#cmNotebookSave').click();if(await page.locator('#cmTrain').isEnabled())throw Error('Assisted walkthrough enabled fitting');
  await page.locator('#cmRestart').click();await page.locator('#cmWorld button').first().click();await page.locator('#cmCheck').click();await page.locator('#cmNotebookSave').click();
  await page.getByRole('button',{name:/The One-Example Trap/}).click();await page.locator('#cmAdd').click();await page.locator('#cmWorld button').first().click();await page.locator('#cmCheck').click();await page.locator('#cmNotebookSave').click();
  const traceDownload=page.waitForEvent('download');await page.locator('#cmSessionExport').click();const traceFile=await traceDownload;
  const trace=JSON.parse(fs.readFileSync(await traceFile.path(),'utf8'));fs.writeFileSync(output+'.trace-'+viewport.width+'.json',JSON.stringify(trace,null,2)+'\n');
  await page.locator('#cmTrain').click();await page.locator('#cmLearningStatus').filter({hasText:'Fitted 486 coefficients'}).waitFor();
  if(!(await page.locator('#cmLearningEvaluation').innerText()).includes('/3'))throw Error('Held-out choices were not actually evaluated');
  const modelDownload=page.waitForEvent('download');await page.locator('#cmModelDownload').click();const modelFile=await modelDownload;
  const model=JSON.parse(fs.readFileSync(await modelFile.path(),'utf8'));fs.writeFileSync(output+'.model-'+viewport.width+'.json',JSON.stringify(model,null,2)+'\n');
  if(model.training.examples!==2||model.training.episodes!==1||!model.weights.flat().some(x=>x!==0)||model.provenance.evaluation_examples_used_for_training!==0)throw Error('Real fitting/firewall failed');
  await page.getByRole('button',{name:/Cause & Consequence/}).click();await page.locator('#cmCoach').click();
  if(await page.locator('#cmHints').innerText()!=='1'||!await page.locator('#cmCoachApply').isEnabled())throw Error('Model suggestion did not mark assistance');
  await page.locator('#cmCoachApply').click();await page.locator('#cmCheck').click();await page.locator('#cmCheck').click();await page.locator('#cmNotebookSave').click();
  const assistedDownload=page.waitForEvent('download');await page.locator('#cmSessionExport').click();const assistedFile=await assistedDownload;
  fs.writeFileSync(output+'.trace-assisted-'+viewport.width+'.json',fs.readFileSync(await assistedFile.path()));
  const leanDownload=page.waitForEvent('download');await page.locator('#cmLeanExport').click();const leanFile=await leanDownload;
  fs.writeFileSync(output+'.witness-'+viewport.width+'.lean',fs.readFileSync(await leanFile.path()));
  await page.locator('#cmTrain').click();await page.locator('#cmLearningStatus').filter({hasText:'Fitted 486 coefficients'}).waitFor();
  if(!(await page.locator('#cmLearningStatus').innerText()).includes('from 2 choices in 1'))throw Error('Model-assisted choices contaminated fitting');
  // A hint after success must invalidate donation until another final check.
  await page.locator('#cmAdult').check();await page.locator('#cmConsent').check();if(!await page.locator('#cmDonate').isEnabled())throw Error('Checked opt-in controls did not enable donation');
  await page.locator('#cmHint').click();if(await page.locator('#cmDonate').isEnabled())throw Error('Stale success survived a hint');
  if(await page.locator('#cmLeanExport').isEnabled())throw Error('Stale final check remained exportable as a Lean witness');
  const tampered=structuredClone(model);tampered.weights[0][0]+=.5;
  await page.locator('#cmModelFile').setInputFiles({name:'tampered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(tampered))});
  await page.locator('#cmLearningStatus').filter({hasText:'Model rejected'}).waitFor();if(await page.locator('#cmCoach').isEnabled()||await page.locator('#cmModelDownload').isEnabled())throw Error('Rejected artifact left a usable model');
  await page.locator('#cmModelFile').setInputFiles({name:'real-model.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});await page.locator('#cmLearningStatus').filter({hasText:'Loaded a format- and integrity-checked'}).waitFor();
  const metrics=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));
  if(metrics.scroll>metrics.width+2||exceptions.length||mutations)throw Error('Overflow, exception or gameplay upload detected');
  rows.push({viewport,...metrics,training_choices:model.training.examples,coefficients:model.weights.flat().length,
   model_sha256:model.model_digest_sha256,guided_and_model_assistance_excluded:true,tampered_model_rejected:true,uploads:mutations,exceptions});
  await page.screenshot({path:output+'.'+viewport.width+'.png',fullPage:true});
  await page.locator('#cmNotebookClear').click();if(await page.locator('#cmCoach').isEnabled()||!(await page.locator('#cmNotebookCount').innerText()).startsWith('0 '))throw Error('Private collection/model clear failed');
  await page.getByRole('button',{name:/The Missing Premise/}).click();await page.locator('#cmCheck').click();
  if(!await page.locator('#cmLeanExport').isEnabled()||await page.locator('#cmDonate').isEnabled())throw Error('A valid zero-edit witness became an eligible research donation');
  await context.close();
 }
 const report={format:'pcs-countermodel-learning-real-browser-v1',data_origin:'scripted validation choices in an isolated real Worker; no participant data',rows};
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await browser.close();
})().catch(async error=>{console.error(error.message);if(browser)await browser.close();process.exitCode=1;});
