// Read-only browser replay of the exact public data; no remote provider or account writes.
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../public');
let corrupt=false;
const server=http.createServer((req,res)=>{
  const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);
  if(req.method!=='GET'||!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  try{
    let raw=fs.readFileSync(file);
    if(corrupt&&file.endsWith('/calibration-v1/view.json'))raw=Buffer.concat([raw,Buffer.from('\n')]);
    res.setHeader('Content-Type',({'.mjs':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.zip':'application/zip'})[path.extname(file)]||'text/plain');
    res.end(raw);
  }catch{res.statusCode=404;res.end();}
});
async function run(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||process.env.PCS_CHROMIUM||'/usr/bin/chromium',headless:true});
  const sourceFiles=['public/calibration-core.mjs','public/calibration-lab.mjs','public/calibration-lab.html','public/calibration-lab.css','scripts/browser_calibration.cjs'];
  const report={format:'pcs-calibration-browser-v1',source_sha256:Object.fromEntries(sourceFiles.map(n=>[n,crypto.createHash('sha256').update(fs.readFileSync(path.resolve(__dirname,'..',n))).digest('hex')])),kernel_invocations:0,scientific_acceptance:false,viewports:[]};
  try{
    for(const width of [320,768,1440]){
      const context=await browser.newContext({viewport:{width,height:1000},acceptDownloads:true});
      const page=await context.newPage(),errors=[],requests=[];
      page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({url:r.url(),method:r.method()}));
      await page.goto(base+'/calibration-lab.html',{waitUntil:'networkidle'});
      await page.locator('#hull:enabled').waitFor();
      if(await page.locator('#hull option').count()!==22)throw Error('Missing source hulls');
      if(await page.locator('#chart circle').count()!==14)throw Error('Actual observations not plotted');
      if(!await page.locator('#chart').evaluate(svg=>Math.abs(svg.viewBox.baseVal.width-svg.clientWidth)<2))throw Error('Plot labels are scaled down instead of using the actual viewport');
      const r=JSON.parse(await page.locator('#exact').textContent());
      if(r.scores.minimax!=='789285969463/41472000000'||r.kernel_executed!==false||r.scientific_acceptance!==false)throw Error('Exact result or authority boundary differs');
      await page.locator('#query').selectOption('7');
      if(!(await page.locator('#radius').textContent()).includes('611/1600'))throw Error('Unobserved target radius differs');
      await page.locator('#epsilon').selectOption('0');
      if(JSON.parse(await page.locator('#exact').textContent()).minimax_radius!=='0')throw Error('Zero perturbation failed');
      await page.locator('#degree').selectOption('1');await page.locator('#hull').selectOption('21');
      if(JSON.parse(await page.locator('#exact').textContent()).id!=='hull-21')throw Error('Hull selection failed');
      await page.locator('#tamper').click();
      if(!(await page.locator('#control').textContent()).includes('Gain witness failed')||await page.locator('#chart circle').count()!==0)throw Error('Modified certificate left a supported result');
      await page.locator('#restore').click();
      if(await page.locator('#chart circle').count()!==14)throw Error('Restore failed');
      const downloaded=page.waitForEvent('download');
      await page.getByRole('link',{name:'Download exact protected-CI artifact',exact:true}).click();
      const saved=await downloaded,raw=fs.readFileSync(await saved.path());
      if(crypto.createHash('sha256').update(raw).digest('hex')!=='4b53e9a38d283da4e60577b031ceb9ebfd5b6b844308b0956696eb80aa965924')throw Error('Downloaded evidence substituted');
      const overflow=await page.evaluate(()=>({width:innerWidth,document:document.documentElement.scrollWidth,wide:[...document.querySelectorAll('body *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).map(e=>({tag:e.tagName,id:e.id,text:e.textContent.slice(0,90)})).slice(0,8)}));
      const unexpected=requests.filter(r=>r.method!=='GET'||!r.url.startsWith(base+'/'));
      if(overflow.document>width+1||errors.length||unexpected.length)throw Error('Layout, privacy or runtime failure: '+JSON.stringify({overflow,errors,unexpected}));
      report.viewports.push({width,observations:14,hulls:22,selectors:true,exact_radii:true,corrupt_witness_rejected:true,stale_result_cleared:true,restored:true,exact_evidence_download:true,no_overflow:true,no_external_requests:true});
      await context.close();
    }
    corrupt=true;
    const page=await browser.newPage();await page.goto(base+'/calibration-lab.html',{waitUntil:'networkidle'});
    await page.locator('#status').filter({hasText:'hash mismatch'}).waitFor();
    if(!await page.locator('#hull').isDisabled()||await page.locator('#chart circle').count()!==0)throw Error('Source substitution enabled results');
    report.corrupt_source_fail_closed=true;
    const output=process.env.PCS_CALIBRATION_BROWSER_OUTPUT;
    if(output)fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n',{flag:'wx'});
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
}
run().catch(error=>{console.error(error);server.close();process.exitCode=1;});
