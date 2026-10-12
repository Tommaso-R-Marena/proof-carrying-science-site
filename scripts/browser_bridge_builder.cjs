/* Real archived Lean gameplay, independent proof downloads and four-width geometry. */
const {chromium}=require('playwright');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),child=require('node:child_process');
(async()=>{
 const core=process.env.PCS_LEAN_CORE||path.resolve(__dirname,'../../proof-carrying-science');
 const base=process.env.PCS_BRIDGE_BASE||'http://127.0.0.1:8766';
 const output=process.env.PCS_BRIDGE_BROWSER_OUTPUT||fs.mkdtempSync(path.join(os.tmpdir(),'pcs-bridge-'));
 fs.mkdirSync(output,{recursive:true});
 const catalog=JSON.parse(fs.readFileSync(path.resolve(__dirname,'../public/'+(process.env.PCS_BRIDGE_CATALOG||'bridge-builder-catalog.json')),'utf8'));
 const prefix=child.execFileSync('lean',['--print-prefix'],{cwd:core,encoding:'utf8'}).trim();
 const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||'/usr/bin/chromium',headless:true});
 const rows=[];
 try {
  for(const width of [320,390,768,1440]){
   const page=await browser.newPage({viewport:{width,height:1000}}),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.goto(base+'/'+(process.env.PCS_BRIDGE_PAGE||'bridge-builder.html'),{waitUntil:'networkidle'});
   await page.locator('#choices button').first().waitFor();
   if(await page.locator('#donate').isEnabled()||await page.locator('#kernelCheck').isEnabled())throw Error('Consent defaults invalid');
   await page.locator('#guideDismiss').click();
   for(const mission of catalog.missions){
    await page.locator('#missions').selectOption(mission.id);
    await page.locator('#hint').click();
    await page.locator('#guideDismiss').click();
    const receipt=mission.receipts[0],setup=mission.automatic_setup_actions.length;
    let current=mission.start,remaining=receipt.actions.slice(setup),rejected=false;
    const startNode=mission.nodes[current],bad=startNode.edges.findIndex(e=>e.status==='invalid');
    if(bad>=0){await page.locator('#choices button').nth(bad).click();await page.locator('#feedback.error').waitFor();rejected=true;}
    let undoChecked=false;
    for(const action of remaining){
     const node=mission.nodes[current],index=node.edges.findIndex(e=>e.status!=='invalid'&&JSON.stringify(e.action)===JSON.stringify(action));
     if(index<0)throw Error('Checked path missing from real catalog');
     await page.locator('#choices button').nth(index).click();
     if(!undoChecked&&node.edges[index].status!=='closed'){
      await page.locator('#undo:enabled').click();
      await page.locator('#choices button').nth(index).click();
      undoChecked=true;
     }
     current=node.edges[index].next;
    }
    await page.locator('#completed').waitFor({state:'visible'});
    if(await page.locator('#kernelCheck').isEnabled())throw Error('Proof publication consent bypass');
    const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadProof').click()]);
    const proofFile=path.join(output,mission.id+'-'+width+'.lean');await download.saveAs(proofFile);
    const proofCheck=child.execFileSync(path.join(prefix,'bin','lean'),[proofFile],{cwd:output,encoding:'utf8',timeout:60000});
    if(/sorryAx|Lean.ofReduceBool/.test(proofCheck))throw Error('Unapproved axiom in exact proof');
    if(!proofCheck.includes('pcs_bridge'))throw Error('No actual kernel audit');
    const [exported]=await Promise.all([page.waitForEvent('download'),page.locator('#export').click()]);
    const events=JSON.parse(fs.readFileSync(await exported.path(),'utf8'));
    if(!events.events.some(e=>e.kind==='hint')||events.events.some(e=>'elapsed_ms' in e))throw Error('Hint/privacy export failure');
    const layout=await page.evaluate(()=>{
     const groups=['.workshop>section','.research-grid>div','#choices>button','#facts>.fact'];
     const clashes=[];
     for(const group of groups){const rects=[...document.querySelectorAll(group)].map(e=>e.getBoundingClientRect());for(let i=0;i<rects.length;i++)for(let j=i+1;j<rects.length;j++){const a=rects[i],b=rects[j];if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)clashes.push([group,i,j]);}}
     return {overflow:document.documentElement.scrollWidth>innerWidth+1,clashes};
    });
    if(layout.overflow||layout.clashes.length||errors.length)throw Error(JSON.stringify({width,mission:mission.id,layout,errors}));
    await page.screenshot({path:path.join(output,mission.id+'-'+width+'.png'),fullPage:true});
    rows.push({width,mission:mission.id,proofActions:receipt.actions.length,kernelChecked:true,rejectedChoiceChecked:rejected,undoChecked,hintsTracked:true,layout});
   }
   if(width===1440&&base==='http://127.0.0.1:8766'){
    await page.goto(base+'/',{waitUntil:'networkidle'});
    await page.locator('#connect').click();await page.locator('#connection').filter({hasText:'ready'}).waitFor();
    await page.locator('#mode').selectOption('abstraction-model');
    await page.locator('#statement').fill('For all lists of natural numbers xs, ys and zs, if ((xs appended to ys) appended to zs) equals (xs appended to (ys appended to zs)) then the length of ((xs appended to ys) appended to zs) equals the length of (xs appended to (ys appended to zs)).');
    await page.locator('#interpret').click();await page.locator('#solve:enabled').waitFor();await page.locator('#solve').click();
    await page.locator('#result').filter({hasText:'verified'}).waitFor({timeout:120000});
    const learned=JSON.parse(await page.locator('#evidence').textContent());
    if(learned.model!=='graph-17'||learned.search.receipt.actions.length!==5)throw Error('No genuine trained multi-step induction interface');
    await page.locator('#mode').selectOption('abstraction-symbolic');await page.locator('#solve').click();
    await page.locator('#result').filter({hasText:'verified'}).waitFor({timeout:120000});
    const baseline=JSON.parse(await page.locator('#evidence').textContent());
    if(baseline.model!=='symbolic'||baseline.search.expansions>96)throw Error('Missing equal-budget baseline');
    rows.push({actualLearnedMultiStepProof:true,actualSymbolicComparison:true,policy:learned.model});
   }
   await page.close();
  }
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify(rows));
 }finally{await browser.close();if(!process.env.PCS_BRIDGE_BROWSER_OUTPUT)fs.rmSync(output,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
