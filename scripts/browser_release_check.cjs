const { chromium } = require('playwright');
const fs = require('node:fs');
const crypto = require('node:crypto');
const base = process.env.PCS_BROWSER_BASE_URL || 'http://127.0.0.1:8788';
if(!['127.0.0.1','localhost','[::1]'].includes(new URL(base).hostname))throw Error('Browser mutation checks require isolated loopback service');
const output = process.env.PCS_BROWSER_OUTPUT || '/tmp/pcs-browser-results.json';
const password = crypto.randomBytes(24).toString('base64url');
const email = 'synthetic-' + crypto.randomBytes(8).toString('hex') + '@example.invalid';
let activeBrowser;
let syntheticContext;
(async()=>{
 const browser=activeBrowser=await chromium.launch({executablePath:process.env.PCS_CHROMIUM || '/usr/bin/chromium',headless:true,args:['--no-sandbox']});
 const rows=[];
 for (const viewport of [{width:1440,height:900},{width:375,height:812}]){
  const context=await browser.newContext({viewport});
  await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());
  const page=await context.newPage();
  for(const path of ['/','/arena.html','/arena-countermodel.html','/semantic-gauntlet.html','/semantic-repair-lab.html','/repair-model-lab.html','/semantic-multistep-lab.html','/account.html','/arena-proof-quest.html','/arena-safety-forge.html','/forge-duel.html','/prooflab.html','/meaning-forge.html']){
   const exceptions=[]; const onError=e=>exceptions.push(e.message);page.on('pageerror',onError);
   const response=await page.goto(base+path,{waitUntil:'networkidle'});
   if(path==='/prooflab.html')await page.locator('#plCards button').first().click();
   const metrics=await page.evaluate(()=>({width:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth,title:document.title}));
   const row={path,viewport,status:response.status(),...metrics,exceptions};rows.push(row);
   page.off('pageerror',onError);
  }

  await context.close();
 }

 const context=syntheticContext=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===new URL(base).origin?r.continue():r.abort());const page=await context.newPage();
 await page.goto(base+'/account.html',{waitUntil:'networkidle'});
 await page.locator('#registerForm [name=display_name]').fill('Synthetic Release Tester');
 await page.locator('#registerForm [name=email]').fill(email);
 await page.locator('#registerForm [name=password]').fill(password);
 await page.locator('#registerForm [name=password_confirm]').fill(password);
 await page.locator('#registerForm [name=ai_policy_ack]').check();
 await page.locator('#registerForm [name=terms_ack]').check();
 const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/auth/register'));
 await page.locator('#registerForm button[type=submit]').click();
 const response=await responsePromise;const body=await response.json();
 if(response.status()!==201)throw Error('Registration failed: '+response.status()+' '+body.code);
 const me=await (await context.request.get(base+'/api/me')).json();
 const summary={registration:response.status(),level:me.user.level,role:me.user.role,is_owner:me.user.is_owner,email_delivery:body.email_delivery};
 if(me.user.level!==0||me.user.is_owner||!me.authenticated)throw Error('Registration privilege invariant failed');
 const admin=await context.request.get(base+'/api/admin/arena/countermodel/dataset');
 if(admin.status()!==401)throw Error('Contributor session entered protected admin export');
 summary.admin_export_denied=admin.status();
 const csrf=await context.request.patch(base+'/api/profile',{headers:{Origin:'https://attacker.invalid'},data:{level:7,is_owner:true}});
 if(csrf.status()!==403)throw Error('Cross-origin mutation was not rejected');
 summary.cross_origin_mutation_denied=csrf.status();
 const forgedProfile=await context.request.patch(base+'/api/profile',{headers:{Origin:base},data:{level:7,role:'owner',is_owner:true,availability_hours:1,track:'research',compensation_preference:'volunteer',profile_note:'Synthetic privilege check'}});
 if(forgedProfile.status()!==200)throw Error('Profile API did not execute synthetic mutation test');
 const after=(await (await context.request.get(base+'/api/me')).json()).user;
 if(after.level!==0||after.role!=='contributor'||after.is_owner)throw Error('Crafted profile granted authority');
 summary.crafted_profile_cannot_escalate=true;
 const deleteResponse=await context.request.post(base+'/api/account/delete',{headers:{Origin:base},data:{password,confirmation:'DELETE'}});
 if(deleteResponse.status()!==200)throw Error('Synthetic account cleanup failed: '+deleteResponse.status());
 summary.synthetic_account_deleted=true;
 await context.close();await browser.close();
 const report={format:'pcs-real-browser-local-validation-v1',rows,account:summary,external_services:'not exercised'};
 fs.writeFileSync(output,JSON.stringify(report,null,2));
 console.log(JSON.stringify(report,null,2));
 if(rows.some(x=>x.status!==200||x.scroll>x.width+2||x.exceptions.length))process.exitCode=1;
})().catch(async e=>{console.error(e.message);
 if(syntheticContext){try{await syntheticContext.request.post(base+'/api/account/delete',{headers:{Origin:base},data:{password}})}catch{}}
 if(activeBrowser)await activeBrowser.close();process.exitCode=1;});
