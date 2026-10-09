// Real Worker/D1/browser flow using an explicitly synthetic fixture account.
// Email verification and owner role are test fixtures, never production actions.
const {chromium}=require('playwright');
const fs=require('node:fs');const path=require('node:path');const crypto=require('node:crypto');const {spawnSync}=require('node:child_process');
const base=process.env.PCS_BROWSER_BASE_URL||'http://127.0.0.1:8788';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Research tests require an isolated loopback Worker');
const state=process.env.PCS_RESEARCH_DB_STATE;
if(!state||!path.isAbsolute(state))throw Error('Set PCS_RESEARCH_DB_STATE to a disposable local D1 state directory');
const output=process.env.PCS_RESEARCH_OUTPUT||'/tmp/pcs-research-browser.json';
const password=crypto.randomBytes(24).toString('base64url'),email='synthetic-research-'+crypto.randomBytes(8).toString('hex')+'@example.invalid';
let browser,context,userId;
function fixture(sql){
 const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','pcs-commons','--local','--persist-to',state,'--command',sql],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});
 if(r.status!==0)throw Error('Disposable D1 fixture update failed');
}
async function cleanup(){
 if(userId){try{fixture(`UPDATE users SET role='contributor',is_owner=0 WHERE id='${userId}' AND email='${email}'`);await context.request.post(base+'/api/account/delete',{headers:{Origin:base},data:{password,confirmation:'DELETE'}});}catch{}}
 if(browser)await browser.close();
}
(async()=>{
 browser=await chromium.launch({executablePath:process.env.PCS_CHROMIUM||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 const page=await context.newPage();await page.goto(base+'/account.html',{waitUntil:'networkidle'});
 await page.locator('#registerForm [name=display_name]').fill('Synthetic Research Pipeline Fixture');
 await page.locator('#registerForm [name=email]').fill(email);await page.locator('#registerForm [name=password]').fill(password);await page.locator('#registerForm [name=password_confirm]').fill(password);
 await page.locator('#registerForm [name=ai_policy_ack]').check();await page.locator('#registerForm [name=terms_ack]').check();
 const registration=page.waitForResponse(r=>r.url().endsWith('/api/auth/register'));await page.locator('#registerForm button[type=submit]').click();
 if((await registration).status()!==201)throw Error('Synthetic registration failed');
 const me=await (await context.request.get(base+'/api/me')).json();userId=me.user.id;
 if(!/^[0-9a-f-]{36}$/.test(userId)||me.user.is_owner||me.user.level!==0)throw Error('Invalid synthetic account fixture');
 const report={format:'pcs-real-browser-research-pipeline-v1',data_origin:'synthetic test account and scripted choices; no real participant data',email_verification:'local fixture; outbound email not tested',production:'not exercised'};
 async function donate(expected){
  await page.locator('#cmAdult').check();await page.locator('#cmConsent').check();
  const reply=page.waitForResponse(r=>r.url().endsWith('/api/arena/countermodel/donate'));await page.locator('#cmDonate').click();
  const response=await reply,data=await response.json();if(response.status()!==expected)throw Error('Donation status '+response.status()+', expected '+expected);
  return data;
 }
 await page.goto(base+'/arena-countermodel.html?mission=implication-flip',{waitUntil:'networkidle'});
 await page.locator('#cmWorld button').first().click();await page.locator('#cmCheck').click();
 await donate(403);report.unverified_email_denied=true;
 fixture(`UPDATE users SET email_verified=1 WHERE id='${userId}' AND email='${email}'`);
 const first=await donate(200);if(first.recorded!==true)throw Error('Verified session not actually stored');
 const duplicate=await donate(200);if(duplicate.recorded!==false)throw Error('Duplicate donation counted as new data');
 report.real_d1_insert_and_deduplication=true;
 await page.goto(base+'/arena-countermodel.html?mission=quantifier-switch',{waitUntil:'networkidle'});
 await page.locator('#cmAdd').click();await page.locator('#cmWorld button').first().click();await page.locator('#cmCheck').click();
 if((await donate(200)).recorded!==true)throw Error('Evaluation-family session not stored');
 fixture(`UPDATE users SET role='admin',is_owner=1 WHERE id='${userId}' AND email='${email}'`);
 const login=await context.request.post(base+'/api/admin/login',{headers:{Origin:base},data:{email,password}});
 if(login.status()!==200)throw Error('Fixture owner login failed');
 await page.goto(base+'/admin.html',{waitUntil:'networkidle'});await page.locator('#adminDashboard').waitFor();
 const download=page.waitForEvent('download');await page.locator('#adminCountermodelExport').click();const file=await download;
 const exported=JSON.parse(fs.readFileSync(await file.path(),'utf8'));
 if(exported.entries.length!==2||JSON.stringify(exported).includes(email)||JSON.stringify(exported).includes(userId))throw Error('Incomplete or personally identifying export');
 const {prepareCountermodelDataset}=await import('../scripts/prepare_countermodel_dataset.mjs');
 const {trainCountermodelSearchPolicy,evaluateCountermodelSearchPolicy}=await import('../scripts/train_countermodel_search_policy.mjs');
 const dataset=prepareCountermodelDataset(exported),model=trainCountermodelSearchPolicy(exported),evaluation=evaluateCountermodelSearchPolicy(model,exported);
 if(dataset.stats.training!==1||dataset.stats.evaluation!==1||model.training.examples!==2||evaluation.examples!==3)throw Error('Training/evaluation firewall failed on actual stored data');
 report.dataset_stats=dataset.stats;report.fitted_model_training=model.training;report.held_out_evaluation=evaluation;
 report.model_digest_sha256=model.model_digest_sha256;
 // Actually load the owner-export model into the game and donate assisted play.
 await page.goto(base+'/arena-countermodel.html?mission=implication-flip',{waitUntil:'networkidle'});
 await page.locator('#cmModelFile').setInputFiles({name:'owner-model.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(model))});
 await page.locator('#cmLearningStatus').filter({hasText:'Loaded a format- and integrity-checked'}).waitFor();
 await page.locator('#cmCoach').click();await page.locator('#cmCoachApply').click();await page.locator('#cmCheck').click();
 if((await donate(200)).recorded!==true)throw Error('Model-assisted real session was not stored');
 const withAssistance=await (await context.request.get(base+'/api/admin/arena/countermodel/dataset')).json();
 if(withAssistance.entries.length!==3||withAssistance.entries.filter(e=>e.replay.hints===1).length!==1)throw Error('Server assistance replay was not preserved');
 const refitted=trainCountermodelSearchPolicy(withAssistance),reevaluated=evaluateCountermodelSearchPolicy(refitted,withAssistance);
 if(JSON.stringify(refitted)!==JSON.stringify(model)||JSON.stringify(reevaluated)!==JSON.stringify(evaluation))throw Error('Assisted choices contaminated owner fitting or held-out evaluation');
 report.imported_model_assistance_replayed_and_excluded=true;

 await page.goto(base+'/arena-countermodel.html?mission=implication-flip',{waitUntil:'networkidle'});page.once('dialog',dialog=>dialog.accept());
 const erase=page.waitForResponse(r=>r.url().endsWith('/api/arena/countermodel/erase'));await page.locator('#cmErase').click();const erased=await (await erase).json();
 if(erased.deleted!==3)throw Error('Self-service deletion failed');
 const empty=await (await context.request.get(base+'/api/admin/arena/countermodel/dataset')).json();if(empty.entries.length!==0)throw Error('Withdrawn rows remained exportable');
 report.self_service_deletion_and_empty_export=true;
 fixture(`UPDATE users SET role='contributor',is_owner=0 WHERE id='${userId}' AND email='${email}'`);
 const removed=await context.request.post(base+'/api/account/delete',{headers:{Origin:base},data:{password,confirmation:'DELETE'}});if(removed.status()!==200)throw Error('Fixture account cleanup failed');
 userId=null;report.synthetic_account_deleted=true;
 fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));await cleanup();
})().catch(async error=>{console.error(error.message);await cleanup();process.exitCode=1;});
