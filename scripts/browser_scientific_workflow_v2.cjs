/** Real Chromium, actual frozen data/assets, no provider/account/collection request. */
const {chromium}=require('playwright');
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'../public');
let corrupt=false,extraManifestName=false;
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1'),file=path.resolve(root,'.'+url.pathname);
  if(req.method!=='GET'||!file.startsWith(root+path.sep)){res.statusCode=403;return res.end();}
  try{let raw=fs.readFileSync(file);if(corrupt&&file.endsWith('penguins.csv'))raw=Buffer.concat([raw,Buffer.from('\n')]);
    if(extraManifestName&&file.endsWith('scientific-workflow-v2/SHA256.json')){const value=JSON.parse(raw);value.files['arena.html']='0'.repeat(64);raw=Buffer.from(JSON.stringify(value));}
    const ext=path.extname(file);res.setHeader('Content-Type',({'.mjs':'text/javascript','.css':'text/css','.json':'application/json','.html':'text/html','.csv':'text/csv','.zip':'application/zip','.pem':'application/octet-stream'})[ext]||'text/plain');res.end(raw);
  }catch{res.statusCode=404;res.end();}
});
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base='http://127.0.0.1:'+server.address().port;
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||process.env.PCS_CHROMIUM||'/usr/bin/chromium',headless:true});
  const sourceFiles=['scientific-workflow-v2.html','scientific-workflow-v2.css','scientific-workflow-v2.mjs','scientific-workflow-v2-core.mjs',
    'reasoning/scientific-workflow-v2/penguins.csv','reasoning/scientific-workflow-v2/positive.pcs.zip','reasoning/scientific-workflow-v2/recorded-receipt.json'];
  const sources=Object.fromEntries(sourceFiles.map(name=>[name,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,name))).digest('hex')]));
  sources['scripts/browser_scientific_workflow_v2.cjs']=crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex');
  const report={format:'pcs-scientific-workflow-browser-v2',source_sha256:sources,actualFrozenData:true,remoteCheckerInvocations:0,humanParticipants:0,training:false,viewports:[]};
  try{
    for(const width of [320,768,1440]){
      const context=await browser.newContext({viewport:{width,height:950},reducedMotion:'reduce',acceptDownloads:true});
      const page=await context.newPage(),errors=[],requests=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push({method:r.method(),url:r.url()}));
      await page.goto(base+'/scientific-workflow-v2.html',{waitUntil:'networkidle'});await page.locator('#species:enabled').waitFor();
      if(await page.locator('#plot circle.point').count()!==342)throw Error('Missing actual complete measurements');
      const first=await page.locator('#pointDetail').textContent();await page.locator('#plot').focus();await page.keyboard.press('ArrowRight');
      if(await page.locator('#pointDetail').textContent()===first)throw Error('Keyboard inspection failed');
      await page.keyboard.press('End');if(!await page.locator('#next').isDisabled())throw Error('Last-observation navigation is unbounded');
      await page.keyboard.press('Home');if(!await page.locator('#previous').isDisabled())throw Error('First-observation navigation is unbounded');
      await page.locator('#species').selectOption('Gentoo');if(await page.locator('#plot circle.point').count()!==123)throw Error('Species filter did not use real measurements');
      await page.locator('#units').selectOption('si');if(!(await page.locator('#pointDetail').textContent()).includes(' kg'))throw Error('Unit display did not convert actual measurement');
      await page.locator('#showFit').uncheck();if(await page.locator('#plot line[stroke-dasharray]').count())throw Error('Exploratory line toggle failed');
      const point=page.locator('#plot circle.point').nth(4);await point.hover();if(!(await page.locator('#pointDetail').textContent()).includes('Point 5 of 123'))throw Error('Pointer inspection failed');
      await page.locator('#units').selectOption('raw');if(!(await page.locator('#pointDetail').textContent()).includes('Point 5 of 123'))throw Error('Unit change lost the selected observation');
      await page.locator('#negativeCase').selectOption('falsified-dimension');if(!(await page.locator('#negativeResult').textContent()).includes('FALSIFIED_OR_CHECK_FAILED'))throw Error('Actual false dimension was hidden');
      await page.locator('#negativeCase').selectOption('signed-false-report');if(!(await page.locator('#negativeResult').textContent()).includes('legitimate key'))throw Error('Signed false report boundary hidden');
      await page.locator('#reset').click();if(await page.locator('#plot circle.point').count()!==342||await page.locator('#units').inputValue()!=='raw')throw Error('Reset changed the data');
      const download=page.waitForEvent('download');await page.getByRole('link',{name:'Download real source CSV',exact:true}).click();
      const downloaded=await download,raw=fs.readFileSync(await downloaded.path());if(crypto.createHash('sha256').update(raw).digest('hex')!=='f204db2c753b0937caac3cb35258562c14f073e4bbc76be24b4c51ce22767a93')throw Error('CSV download changed bytes');
      const bundleDownload=page.waitForEvent('download');await page.getByRole('link',{name:'Download signed PCS bundle',exact:true}).click();
      const bundleRaw=fs.readFileSync(await (await bundleDownload).path());if(crypto.createHash('sha256').update(bundleRaw).digest('hex')!=='7f503d99a7069a2d3663883520e7c68663241b1f0eed66584bcb343756be8290')throw Error('Bundle download changed bytes');
      if(!(await page.locator('#replayCommand').textContent()).includes('--fingerprint f7e1184ae513ef6fe9688094fa0d64e2d94bb4f9752d3f7c35a2b44b009146e5'))throw Error('Replay command has wrong trust identity');
      if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+1))throw Error('Horizontal layout overflow at '+width);
      const overlaps=await page.locator('.controls select').evaluateAll(nodes=>nodes.map(n=>{const b=n.getBoundingClientRect();return b.width>0&&b.left>=0&&b.right<=window.innerWidth+1;}));
      if(overlaps.some(x=>!x)||errors.length||requests.some(r=>r.method!=='GET'||r.url.includes('/api/')))throw Error('Layout/runtime/privacy boundary failed');
      report.viewports.push({width,completePoints:342,filteredGentooPoints:123,keyboard:true,pointer:true,unitConversion:true,actualDownloads:true,noOverflow:true,noApiOrPostRequests:true});await context.close();
    }
    corrupt=true;const bad=await browser.newPage();await bad.goto(base+'/scientific-workflow-v2.html',{waitUntil:'networkidle'});
    await bad.locator('#loadStatus').filter({hasText:'Published asset bytes differ'}).waitFor();
    if(!await bad.locator('#species').isDisabled()||await bad.locator('#plot circle.point').count())throw Error('Corrupted source displayed as a verified case');
    report.corruptAssetFailClosed=true;
    corrupt=false;extraManifestName=true;const injected=await browser.newPage(),injectedRequests=[];injected.on('request',r=>injectedRequests.push(r.url()));
    await injected.goto(base+'/scientific-workflow-v2.html',{waitUntil:'networkidle'});
    await injected.locator('#loadStatus').filter({hasText:'fixed reader allowlist'}).waitFor();
    if(!await injected.locator('#species').isDisabled()||injectedRequests.some(url=>url.endsWith('/arena.html')))throw Error('Manifest selected a fetch outside the fixed reader allowlist');
    report.unlistedManifestAssetRejectedBeforeFetch=true;
    const output=process.env.PCS_SCIENCE_BROWSER_OUTPUT;if(output){fs.mkdirSync(path.dirname(output),{recursive:true});if(fs.existsSync(output))throw Error('Refusing to replace historical browser evidence');fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');}
    console.log(JSON.stringify(report,null,2));
  }finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);server.close();process.exitCode=1;});
