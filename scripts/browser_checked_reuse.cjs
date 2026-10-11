/* Real Lean reuse, standalone proof download and four-width interaction gate. */
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),child=require('node:child_process');
(async()=>{
 const output=process.env.PCS_REUSE_BROWSER_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'pcs-checked-reuse-browser-'));fs.mkdirSync(output,{recursive:true});
 const core=process.env.PCS_LEAN_CORE||path.resolve(__dirname,'../../proof-carrying-science');
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true});
 const rows=[];
 try{
  for(const width of [320,390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
   // Optional local test transport alias: all data comes from the selected real
   // backend. Proof states and kernel outcomes are never mocked or substituted.
   if(process.env.PCS_REUSE_BACKEND_PORT)await page.route('http://127.0.0.1:8766/**',async route=>{
    const headers={...route.request().headers()};delete headers.origin;delete headers.host;delete headers.referer;
    const response=await route.fetch({url:route.request().url().replace('127.0.0.1:8766','127.0.0.1:'+process.env.PCS_REUSE_BACKEND_PORT),headers,maxRedirects:0,timeout:120000});
    await route.fulfill({response});
   });
   await page.goto('http://127.0.0.1:8766/',{waitUntil:'networkidle'});
   await page.locator('#connect').click();await page.locator('#connection').filter({hasText:'ready'}).waitFor({timeout:60000});
   await page.locator('#mode').selectOption('reuse-model');
   await page.locator('#statement').fill('For all natural numbers a, b and c, if ((a + b equals c) and (c * 1 equals c)) then ((c * 1 equals c) and (a + b equals c)).');
   await page.locator('#interpret').click();await page.locator('#startProof:enabled').waitFor();await page.locator('#startProof').click();
   await page.locator('.goal').waitFor({timeout:60000});
   for(let i=0;i<3;i++){await page.getByRole('button',{name:/Introduce variable or assumption/}).click();await page.waitForFunction(n=>document.querySelectorAll('#goals .local').length===n,i+1);}
   await page.waitForFunction(()=>document.querySelectorAll('#lemmaCards details').length===6);
   await page.getByRole('button',{name:/Apply checked lemma Reorder two facts/}).click();
   await page.locator('#result').filter({hasText:'verified'}).waitFor({timeout:60000});
   const receipt=JSON.parse(await page.locator('#evidence').textContent());
   if(receipt.actions.length!==4||!receipt.library_sha256||receipt.kernel.axioms.length!==0)throw Error('Missing actual checked reuse');
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadLean').click()]);
   const file=path.join(output,'download-'+width+'.lean');await download.saveAs(file);
   const prefix=child.execFileSync('lean',['--print-prefix'],{cwd:core,encoding:'utf8'}).trim();
   const checked=child.execFileSync(path.join(prefix,'bin','lean'),[file],{cwd:output,encoding:'utf8',timeout:60000});
   if(!checked.includes('does not depend on any axioms'))throw Error('Standalone download not kernel checked');
   const layout=await page.evaluate(()=>{
    const nodes=[...document.querySelectorAll('.lemma-cards>details,.reuse-metrics>div,.columns>section')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
    const clashes=[];for(let i=0;i<nodes.length;i++)for(let j=i+1;j<nodes.length;j++){const a=nodes[i],b=nodes[j];if(Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x)>1&&Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y)>1)clashes.push([i,j]);}
    return {overflow:document.documentElement.scrollWidth>innerWidth+1,clashes};
   });
   if(layout.overflow||layout.clashes.length||errors.length)throw Error(JSON.stringify({width,layout,errors}));
   await page.screenshot({path:path.join(output,'lab-'+width+'.png'),fullPage:true});
   fs.writeFileSync(path.join(output,'receipt-'+width+'.json'),JSON.stringify(receipt,null,2));
   await page.locator('[data-example=witness]').click();await page.locator('#interpret').click();await page.locator('#startProof:enabled').waitFor();await page.locator('#startProof').click();
   await page.locator('.goal').waitFor();await page.getByRole('button',{name:/Introduce variable or assumption/}).click();
   await page.getByRole('button',{name:'Choose witness h0',exact:true}).waitFor();await page.getByRole('button',{name:'Choose witness h0',exact:true}).click();
   await page.getByRole('button',{name:'Build both parts',exact:true}).waitFor();await page.getByRole('button',{name:'Build both parts',exact:true}).click();
   await page.waitForFunction(()=>document.querySelectorAll('.goal').length===2);
   if(!(await page.locator('#stepGuide').textContent()).includes('remaining goals'))throw Error('Multiple goals not explained');
   await page.getByRole('button',{name:'Check reflexive equality',exact:true}).click();await page.waitForFunction(()=>document.querySelectorAll('.goal').length===1);
   if(!(await page.locator('#stepGuide').textContent()).includes('equality goal'))throw Error('Equality guidance incorrectly describes conjunction');
   await page.getByRole('button',{name:'Check reflexive equality',exact:true}).click();await page.locator('#result').filter({hasText:'verified'}).waitFor();
   const witness=JSON.parse(await page.locator('#evidence').textContent());
   if(witness.actions.length!==5||witness.kernel.axioms.length!==0)throw Error('No actual local-variable witness proof');
   if(width===1440){
    await page.locator('[data-example=ruleOrder]').click();await page.locator('#interpret').click();await page.locator('#solve:enabled').waitFor();await page.locator('#solve').click();
    await page.locator('#result').filter({hasText:'verified'}).waitFor({timeout:120000});
    const searched=JSON.parse(await page.locator('#evidence').textContent());
    if(searched.search.receipt.actions.length!==16||searched.search.portfolio.selected_stage!=='symbolic_fallback'||!(await page.locator('#result').textContent()).includes('symbolic fallback'))throw Error('Actual long proof or fallback attribution missing');
   }
   await page.locator('[data-example=ambiguous]').click();await page.locator('#interpret').click();await page.waitForFunction(()=>document.querySelectorAll('#interpretations button').length===2);
   if(await page.locator('#solve').isEnabled())throw Error('Ambiguous meaning silently selected');
   rows.push({width,actualProofActions:4,standaloneKernelChecked:true,libraryBound:true,layout,ambiguityRequiresSelection:true,witnessProofActions:witness.actions.length,errors});
   await page.close();
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
 }finally{await browser.close();if(!process.env.PCS_REUSE_BROWSER_OUTPUT)fs.rmSync(output,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
