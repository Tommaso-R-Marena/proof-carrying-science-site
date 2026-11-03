/* Actual browser ranker -> frozen proof model -> Lean. No provider substitutes. */
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=process.env.PCS_CONNECTED_BASE||'http://127.0.0.1:8769';
 const output=process.env.PCS_CONNECTED_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'pcs-connected-models-'));
 fs.mkdirSync(output,{recursive:true});
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 const records=[];let publicWrites=0;
 try{
  for(const id of ['implication-reversal-1','universal-existential-1']){
   const page=await browser.newPage({viewport:{width:390,height:950}}),errors=[];
   page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.method()==='POST'&&r.url().includes('/api/lean-research/'))publicWrites++;});
   await page.goto(base+'/model-walkthrough.html');
   await page.locator('#modelRun:enabled').waitFor();await page.selectOption('#modelCase',id);
   await page.locator('#modelRun').click();await page.locator('#modelLean:enabled').waitFor();
   await page.locator('#modelLean').click();
   await page.locator('#modelLeanStatus').filter({hasText:'Fresh local Lean check passed'}).waitFor({timeout:180000});
   const downloaded=page.waitForEvent('download');await page.locator('#modelLeanEvidence').click();
   const filename=path.join(output,id+'-browser-chain.json');await(await downloaded).saveAs(filename);
   const evidence=JSON.parse(fs.readFileSync(filename,'utf8')),r=evidence.observation;
   assert.equal(evidence.format,'pcs-model-local-lean-chain-v1');assert.equal(evidence.pcs_authority,false);
   assert.equal(evidence.handoff.model_replay.strategy,'learned');
   assert.equal(r.model,'verified-memory-v1');assert.equal(r.status,'verified');
   assert.equal(r.checkpoint_sha256,'869732df6ef29bac30c9878b57e5d8c7e0f1fba41231d0d10c5f1112309aee57');
   assert.equal(r.search.receipt.goal_sha256,evidence.handoff.entry.goal_sha256);
   assert.equal(r.search.receipt.statement,evidence.handoff.entry.lean);
   assert.equal(r.search.receipt.pcs_scientific_authority,false);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2),true);
   await page.locator('#modelReopen > summary').click();
   await page.locator('#modelFile').setInputFiles(filename);
   await page.locator('#modelReplayStatus').filter({hasText:'Recorded model/Lean evidence'}).waitFor();
   // A changed goal must not gain a fresh-looking import verdict.
   const changed=structuredClone(evidence);changed.handoff.entry.lean='False';
   await page.locator('#modelFile').setInputFiles({name:'altered.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(changed))});
   await page.locator('#modelReplayStatus').filter({hasText:'Could not recheck'}).waitFor();
   assert.deepEqual(errors,[]);
   records.push({id,file:path.basename(filename),actual_model_inference:true,actual_memory_model_search:true,expansions:r.search.expansions,actual_Lean_kernel_check:true,axioms:r.search.receipt.kernel.axioms,goal_sha256:r.search.receipt.goal_sha256,altered_import_rejected:true});
   await page.screenshot({path:path.join(output,id+'.png'),fullPage:true});await page.close();
  }
  assert.equal(publicWrites,0);
  const report={format:'pcs-connected-model-browser-v1',status:'PASS',records,public_jobs_submitted:publicWrites,positive_provider_responses_substituted:false,human_participants:0,pcs_authority:false};
  fs.writeFileSync(path.join(output,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
