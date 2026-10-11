/* Actual disposable Worker/D1 donation → owner export → Lean intake → gradient update → erasure.
 * All accounts and choices are synthetic integration fixtures, never research participants.
 */
const {chromium}=require('playwright'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {spawnSync}=require('node:child_process');
const base=process.env.PCS_BROWSER_BASE_URL||'http://127.0.0.1:8788';
const state=process.env.PCS_RESEARCH_DB_STATE,output=process.env.PCS_BRIDGE_RESEARCH_OUTPUT;
const core=process.env.PCS_LEAN_CORE||path.resolve(__dirname,'../../proof-carrying-science');
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname)||!state||!path.isAbsolute(state)||!output||!path.isAbsolute(output))throw Error('Disposable loopback database and absolute private output required');
fs.mkdirSync(output,{recursive:true});
const password=crypto.randomBytes(24).toString('base64url'),email='synthetic-bridge-'+crypto.randomBytes(8).toString('hex')+'@example.invalid';
let browser,context,userId;
function fixture(sql){const r=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','execute','pcs-commons','--local','--persist-to',state,'--command',sql],{encoding:'utf8',timeout:30000,maxBuffer:2*1024*1024});if(r.status!==0)throw Error('Disposable fixture failed');}
async function cleanup(){if(userId){try{fixture("UPDATE users SET role='contributor',is_owner=0 WHERE id='"+userId+"' AND email='"+email+"'");await context.request.post(base+'/api/account/delete',{headers:{Origin:base},data:{password,confirmation:'DELETE'}});}catch{}}if(browser)await browser.close();}
(async()=>{
 browser=await chromium.launch({executablePath:process.env.PCS_CHROMIUM||'/usr/bin/chromium',headless:true});
 context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
 const page=await context.newPage();await page.goto(base+'/account.html',{waitUntil:'networkidle'});
 for(const [name,value] of [['display_name','Synthetic Bridge Integration Fixture'],['email',email],['password',password],['password_confirm',password]])await page.locator('#registerForm [name='+name+']').fill(value);
 await page.locator('#registerForm [name=ai_policy_ack]').check();await page.locator('#registerForm [name=terms_ack]').check();
 const registration=page.waitForResponse(r=>r.url().endsWith('/api/auth/register'));await page.locator('#registerForm button[type=submit]').click();if((await registration).status()!==201)throw Error('Fixture registration failed');
 const me=await (await context.request.get(base+'/api/me')).json();userId=me.user.id;if(!/^[0-9a-f-]{36}$/.test(userId)||me.user.is_owner||me.user.level!==0)throw Error('Invalid fixture identity');
 const catalog=JSON.parse(fs.readFileSync('public/bridge-builder-catalog.json','utf8')),mission=catalog.missions[0];
 await page.goto(base+'/bridge-builder.html',{waitUntil:'networkidle'});await page.locator('#guideDismiss').click();
 let node=mission.start;const invalid=mission.nodes[node].edges.findIndex(e=>e.status==='invalid');
 if(invalid>=0)await page.locator('#choices button').nth(invalid).click();
 for(const action of mission.receipts[0].actions.slice(mission.automatic_setup_actions.length)){
  const edges=mission.nodes[node].edges,index=edges.findIndex(e=>JSON.stringify(e.action)===JSON.stringify(action)&&e.status!=='invalid');
  await page.locator('#choices button').nth(index).click();node=edges[index].next;
 }
 await page.locator('#completed').waitFor({state:'visible'});
 await page.locator('#adult').check();await page.locator('#trainingConsent').check();
 async function donate(expected){const pending=page.waitForResponse(r=>r.url().endsWith('/api/arena/bridge-builder/donate'));await page.locator('#donate').click();const response=await pending;if(response.status()!==expected)throw Error('Donation expected '+expected+', got '+response.status());return response.json();}
 await donate(403);fixture("UPDATE users SET email_verified=1 WHERE id='"+userId+"' AND email='"+email+"'");
 if(!(await donate(200)).recorded||(await donate(200)).recorded)throw Error('D1 insertion/deduplication failed');
 fixture("UPDATE users SET role='admin',is_owner=1 WHERE id='"+userId+"' AND email='"+email+"'");
 const login=await context.request.post(base+'/api/admin/login',{headers:{Origin:base},data:{email,password}});if(login.status()!==200)throw Error('Synthetic owner login failed');
 await page.goto(base+'/admin.html',{waitUntil:'networkidle'});await page.locator('#adminDashboard').waitFor();
 const pendingExport=page.waitForEvent('download');await page.locator('#adminBridgeExport').click();const downloaded=await pendingExport;
 const data=JSON.parse(fs.readFileSync(await downloaded.path(),'utf8'));
 if(data.entries.length!==1||JSON.stringify(data).includes(email)||JSON.stringify(data).includes(userId)||data.eligible_for_training!==false)throw Error('Export provenance/privacy failed');
 const file=path.join(output,'synthetic-export.json');fs.writeFileSync(file,JSON.stringify(data));
 const intake=path.join(output,'independent-intake.json');
 let r=spawnSync('python',['-m','pcs.experimental.prover.bridge_data','--catalog',path.resolve('public/bridge-builder-catalog.json'),'--export',file,'--heldout',path.join(core,'research/induction-abstraction-v2/tasks.json'),'--output',intake],{cwd:core,encoding:'utf8',timeout:120000});
 if(r.status!==0)throw Error('Independent Lean intake failed: '+r.stderr);
 const checked=JSON.parse(fs.readFileSync(intake,'utf8'));if(checked.verified_training_examples.length!==1||!checked.verified_training_examples[0].hint_exposure)throw Error('Fresh trajectory/hint label missing');
 const trainingCode=[
  'import json,sys',
  'from pathlib import Path',
  'from pcs.experimental.prover.grounded_model import GroundedNetwork',
  'from pcs.experimental.prover.environment import LeanEnvironment',
  'from pcs.experimental.prover.model import imitate',
  'folder=Path("research/induction-abstraction-v2")',
  'registry=json.loads((folder/"registry.json").read_text())',
  'entry=next(e for e in registry["models"] if e["id"]==registry["selected_local_experiment"])',
  'model=GroundedNetwork.load(folder/entry["checkpoint"],entry["sha256"])',
  'examples=json.loads(Path(sys.argv[1]).read_text())["verified_training_examples"]',
  'env=LeanEnvironment(timeout=30)',
  'try:',
  ' report=imitate(model,examples,epochs=2,seed=71,candidate_provider=env.candidates)',
  ' assert report["changed_parameters"]',
  ' sha=model.save(Path(sys.argv[2])/"synthetic-candidate.json",{"approval":"synthetic integration only; never deploy"})',
  ' (Path(sys.argv[2])/"synthetic-training.json").write_text(json.dumps({"training":report,"checkpoint_sha256":sha,"real_participants":0,"automatic_promotion":False}))',
  'finally: env.close()'
 ].join('\n');
 r=spawnSync('python',['-c',trainingCode,intake,output],{cwd:core,encoding:'utf8',timeout:120000});if(r.status!==0)throw Error('Actual training update failed: '+r.stderr);
 const erased=await (await context.request.post(base+'/api/arena/bridge-builder/erase',{headers:{Origin:base},data:{}})).json();if(erased.deleted!==1)throw Error('Active erasure failed');
 const empty=await (await context.request.get(base+'/api/admin/arena/bridge-builder/dataset')).json();if(empty.entries.length)throw Error('Erased rows remained exportable');
 const report={format:'pcs-bridge-real-integration-v1',source:'synthetic browser/account fixture; zero human participant records',actualD1InsertAndDedup:true,emailVerificationFixture:true,identityFreeOwnerExport:true,independentLeanIntake:true,hintsTracked:true,actualGradientUpdate:true,checkpointNotPromoted:true,activeErasure:true,financial_spend:0};
 fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));await cleanup();
})().catch(async e=>{console.error(e);await cleanup();process.exitCode=1;});
