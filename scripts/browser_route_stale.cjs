/* Delay an actual final Lean response, then change the route. No fake verdict. */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
(async()=>{
 const base=process.env.PCS_CONNECTED_BASE||'http://127.0.0.1:8769',out=process.env.PCS_ROUTE_STALE_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'pcs-route-stale-'));
 const m=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../public/bridge-builder-catalog.json'))).missions[0];
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',args:['--no-sandbox']});
 let release,complete;const held=new Promise(r=>{complete=r}),resume=new Promise(r=>{release=r});let actual=null,timer;
 try{
  const p=await browser.newPage({viewport:{width:390,height:950}});p.setDefaultTimeout(30000);
  await p.route('**/api/step',async route=>{
   const response=await route.fetch(),value=await response.json();
   if(value.receipt&&!actual){actual=value;complete();await resume;}
   // Return precisely the response received from the real local verifier.
   await route.fulfill({response});
  });
  await p.goto(base+'/bridge-builder.html');await p.locator('#choices button').first().waitFor();
  await p.locator('#guideDismiss').click();let current=m.start,last=null;
  for(const action of m.receipts[0].actions.slice(m.automatic_setup_actions.length)){
   const node=m.nodes[current],i=node.edges.findIndex(e=>e.status!=='invalid'&&JSON.stringify(e.action)===JSON.stringify(action));
   assert.ok(i>=0);last=i;await p.locator('#choices button').nth(i).click();current=node.edges[i].next;
  }
  await p.locator('#kernelCheck:enabled').click();
  await Promise.race([held,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Actual closing Lean receipt did not arrive')),120000))]);
  assert.equal(actual.receipt.goal_sha256,m.goal_sha256);assert.deepEqual(actual.receipt.kernel.axioms,[]);
  await p.locator('#undo').click();assert.equal(await p.locator('#downloadFreshEvidence').isDisabled(),true);
  const delivered=p.waitForResponse(r=>r.url().endsWith('/api/step'));release();await delivered;
  // Let the actual response callback run, then reconstruct the completed route.
  await p.waitForTimeout(200);await p.locator('#choices button').nth(last).click();
  await p.locator('#completed').waitFor({state:'visible'});
  assert.equal(await p.locator('#downloadFreshEvidence').isDisabled(),true);
  assert.doesNotMatch(await p.locator('#kernelStatus').innerText(),/Fresh local Lean check passed/);
  // An already displayed successful check must also disappear on the next edit.
  await p.locator('#kernelCheck:enabled').click();
  await p.locator('#kernelStatus').filter({hasText:'Fresh local Lean check passed'}).waitFor({timeout:120000});
  assert.equal(await p.locator('#downloadFreshEvidence').isEnabled(),true);
  await p.locator('#undo').click();
  assert.equal(await p.locator('#downloadFreshEvidence').isDisabled(),true);
  assert.match(await p.locator('#kernelStatus').innerText(),/Route changed. No fresh Lean result/);
  await p.locator('#choices button').nth(last).click();
  assert.doesNotMatch(await p.locator('#kernelStatus').innerText(),/Fresh local Lean check passed/);
  const report={format:'pcs-stale-route-real-Lean-browser-v1',status:'PASS',actual_successful_kernel_receipts_delayed:1,changed_route_did_not_inherit_receipt:true,previously_displayed_success_invalidated:true,actual_fresh_checks:2,producer_response_bytes_changed:false,positive_verdict_fabricated:false,public_jobs_submitted:0,pcs_authority:false};
  fs.mkdirSync(out,{recursive:true});fs.writeFileSync(path.join(out,'result.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
 }finally{clearTimeout(timer);release();await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
