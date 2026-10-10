/* Real-backend browser check. No mocked proof states or kernel results. */
const {chromium}=require('playwright');
const fs=require('node:fs');
async function main(){
  const executablePath=process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  const browser=await chromium.launch({executablePath,headless:true});
  const observations=[];
  try{
    for(const width of [320,390,768,1440]){
      const page=await browser.newPage({viewport:{width,height:1000}});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto('http://127.0.0.1:8766/',{waitUntil:'networkidle'});
      await page.locator('#connect').click();
      await page.locator('#connection').filter({hasText:'ready'}).waitFor({timeout:60000});
      await page.locator('#interpret').click();
      await page.locator('#startProof:enabled').waitFor();
      await page.locator('#startProof').click();
      await page.locator('.goal').waitFor({timeout:60000});
      for(let i=0;i<3;i++){
        await page.getByRole('button',{name:/Introduce variable or assumption/}).click();
        await page.waitForFunction(n=>document.querySelectorAll('#goals .local').length===n,i+1);
      }
      await page.getByRole('button',{name:'Build both parts',exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('.goal').length===2);
      await page.getByRole('button',{name:'Use h2.2',exact:true}).click();
      await page.waitForFunction(()=>document.querySelectorAll('.goal').length===1);
      await page.getByRole('button',{name:'Use h2.1',exact:true}).click();
      await page.locator('#result').filter({hasText:'verified'}).waitFor({timeout:60000});
      const receipt=JSON.parse(await page.locator('#evidence').textContent());
      if(receipt.kernel.axioms.length!==0||receipt.actions.length!==6)throw Error('Missing real proof or unexpected axioms');
      const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadLean').click()]);
      const os=require('node:os'),path=require('node:path');
      const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'pcs-browser-proof-'));
      try{const proofPath=path.join(scratch,'Proof.lean');await download.saveAs(proofPath);const source=fs.readFileSync(proofPath,'utf8');if(!source.includes(receipt.statement)||!source.includes(receipt.proof))throw Error('Downloaded proof binding mismatch');const child=require('node:child_process');const core=process.env.PCS_LEAN_CORE||path.resolve(__dirname,'../../proof-carrying-science');const prefix=child.execFileSync('lean',['--print-prefix'],{cwd:core,encoding:'utf8'}).trim();const checked=child.execFileSync(path.join(prefix,'bin','lean'),[proofPath],{cwd:scratch,timeout:60000,encoding:'utf8'});if(!checked.includes('does not depend on any axioms'))throw Error('Downloaded proof axiom audit failed');console.log('LEAN_DOWNLOAD_KERNEL_VERIFIED '+JSON.stringify({width,receipt,standalone_check:checked.trim()}));}finally{fs.rmSync(scratch,{recursive:true,force:true});}
      const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+1);
      if(overflow||errors.length)throw Error(JSON.stringify({width,overflow,errors}));
      const dir=process.env.PCS_LEAN_BROWSER_OUTPUT;
      if(dir){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(`${dir}/proof-${width}.json`,JSON.stringify(receipt,null,2));await page.screenshot({path:`${dir}/lab-${width}.png`,fullPage:true});}
      await page.locator('[data-example=ambiguous]').click();await page.locator('#interpret').click();
      await page.waitForFunction(()=>document.querySelectorAll('#interpretations button').length===2);
      if(await page.locator('#solve').isEnabled())throw Error('Ambiguous interpretation automatically accepted');
      observations.push({width,realProofSteps:receipt.actions.length,axioms:receipt.kernel.axioms,ambiguousRequiresSelection:true,noHorizontalOverflow:true});
      await page.close();
    }
    console.log(JSON.stringify({format:'pcs-lean-lab-browser-v1',observations}));
  }finally{await browser.close();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
