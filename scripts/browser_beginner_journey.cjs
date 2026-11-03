// Actual browser task completion is evidence of working controls, not a user study.
const {chromium} = require('playwright');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '../public');
const output = process.env.PCS_BEGINNER_OUTPUT || fs.mkdtempSync('/tmp/pcs-beginner-browser-');
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {res.statusCode = 405; return res.end();}
  const name = new URL(req.url, 'http://localhost').pathname;
  if (name.startsWith('/api/')) {
    res.statusCode = 503; res.setHeader('Content-Type', 'application/json');
    return res.end('{"error":"offline test"}');
  }
  // Match the observed production asset handling: .html redirects to clean URLs.
  if (name.endsWith('.html')) {
    res.statusCode = 308;
    res.setHeader('Location', name === '/index.html' ? '/' : name.slice(0,-5));
    return res.end();
  }
  const asset = name === '/' ? '/index.html' : path.extname(name) ? name : name + '.html';
  const file = path.resolve(root, '.' + asset);
  if (!file.startsWith(root + path.sep)) {res.statusCode = 403; return res.end();}
  try {
    res.setHeader('Content-Type', ({'.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript',
      '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json'})[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch {res.statusCode = 404; res.end();}
});
const sha = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const inView = locator => locator.evaluate(e => {
  const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight;
});
const noOverflow = p => p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 2);
(async () => {
  fs.mkdirSync(output, {recursive:true});
  const resultPath = path.join(output, 'results.json');
  if (fs.existsSync(resultPath)) throw Error('Choose a fresh evidence directory');
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({executablePath:process.env.PCS_CHROMIUM || '/usr/bin/chromium', args:['--no-sandbox']});
  const report = {format:'pcs-beginner-journey-browser-v1', real_human_participants:0,
    browser_version:browser.version(), production_authority_executed:false, rows:[],
    source_sha256:Object.fromEntries(['index.html','experience.html','file-check-core.mjs','file-check.mjs','one-minute-core.mjs','one-minute.mjs','one-minute.css','first-investigation.mjs',
      'first-investigation.css','world-builder.html','world-builder.mjs','package-inspector.html',
      'package-inspector.js','site.js','styles.css'].map(name => [name, sha(fs.readFileSync(path.join(root,name)))]))};
  try {
    for (const width of [320,390,768,1440]) {
      const context = await browser.newContext({viewport:{width,height:900}, reducedMotion:'reduce', acceptDownloads:true});
      const errors = [], writes = [], external = [];
      context.on('page', p => p.on('pageerror', e => errors.push(e.message)));
      await context.route('**/*', route => {
        const req = route.request();
        if (!['GET','HEAD'].includes(req.method())) {writes.push(req.url()); return route.abort();}
        if (new URL(req.url()).origin !== base) {external.push(req.url()); return route.abort();}
        return route.continue();
      });
      const p = await context.newPage(); await p.goto(base + '/');
      const start = p.getByRole('link', {name:'Try the scientific example', exact:true});
      assert.equal(await inView(start), true, 'the first action must be visible without scrolling');
      assert.equal(await p.locator('#homeResearch').getAttribute('open'), null);
      assert.equal(await p.locator('.home-sample').getAttribute('open'), null);
      const visibleWords = await p.locator('main').evaluate(e => e.innerText.trim().split(/\s+/).length);
      assert.ok(visibleWords <= 350, 'keep the initial homepage short');
      assert.equal(await p.locator('[data-beginner-path]').count(), 3);
      assert.equal(await noOverflow(p), true);
      await p.screenshot({path:path.join(output,`home-${width}.png`)});
      await p.keyboard.press('Tab');
      assert.equal(await p.locator('.pcs-skip').evaluate(e => e === document.activeElement), true);
      await p.keyboard.press('Enter');
      assert.equal(await p.locator('main').evaluate(e => e === document.activeElement), true);
      const primaryActionBottom = await start.evaluate(e => e.getBoundingClientRect().bottom + scrollY);
      await start.click(); await p.locator('#firstInvestigation[data-ready=true]').waitFor({state:'attached'});
      // The first task is an actual file check, not a prerequisite logic quiz.
      await p.locator('#minuteExamplePanel[data-ready=true]').waitFor({state:'attached'});
      assert.equal(await p.locator('#ruleInvestigation').getAttribute('open'),null);
      assert.equal(await p.locator('#minuteResults').isHidden(),true);
      assert.equal(await p.locator('#minuteReport').isDisabled(),true);
      const introductionWords=await p.locator('.minute-intro').evaluate(e=>e.innerText.trim().split(/\s+/).length);
      assert.ok(introductionWords<=260,'keep the initial explanation short: '+introductionWords);
      assert.equal(await p.locator('nav.pcs-nav-ready .navlinks>a').count(),3);
      await p.screenshot({path:path.join(output,`one-minute-${width}.png`),fullPage:true});
      await p.locator('#practiceLists>summary').click();
      await p.locator('#minuteCheck').focus();await p.keyboard.press('Enter');
      await p.locator('#minuteResults:not([hidden])').waitFor();
      assert.equal(await p.locator('#minuteOutcome').innerText(),'1 shared ID found');
      assert.equal(await p.locator('.minute-match').count(),2);
      assert.equal(await p.locator('#minuteOutcome').evaluate(e=>e===document.activeElement),true);
      const readableDownload=p.waitForEvent('download');await p.locator('#minuteReport').click();
      const readable=fs.readFileSync(await(await readableDownload).path(),'utf8');
      assert.match(readable,/Browser calculation. No local Lean check was run/);
      assert.match(readable,/<td>103<\/td><td>4<\/td><td>2<\/td>/);
      const replayDownload=p.waitForEvent('download');await p.locator('#minuteReplay').click();
      const replayBytes=fs.readFileSync(await(await replayDownload).path());
      assert.equal(JSON.parse(replayBytes).local_receipt,null);
      const receiving=await context.newPage();await receiving.goto(base+'/check-my-files');
      await receiving.locator('#openDocument').setInputFiles({name:'example-recheck.json',mimeType:'application/json',buffer:replayBytes});
      await receiving.locator('#check:not([disabled])').waitFor();await receiving.locator('#check').click();
      await receiving.locator('#result:not([hidden])').waitFor();
      assert.match(await receiving.locator('#verdict').innerText(),/1 shared ID found/);
      assert.match(await receiving.locator('#status').innerText(),/Replay matched the original files and counts/);
      assert.equal(await noOverflow(receiving),true);await receiving.close();
      await p.locator('#minuteChange').click();
      assert.equal(await p.locator('#minuteResults').isHidden(),true);
      assert.equal(await p.locator('#minuteReport').isDisabled(),true);
      assert.equal(await p.locator('#minuteReplay').isDisabled(),true);
      await p.locator('#minuteCheck').click();
      await p.locator('#minuteResults:not([hidden])').waitFor();
      assert.equal(await p.locator('#minuteOutcome').innerText(),'No shared IDs found');
      assert.equal(await p.locator('.minute-match').count(),0);
      const cleanDownload=p.waitForEvent('download');await p.locator('#minuteReplay').click();
      const cleanBytes=fs.readFileSync(await(await cleanDownload).path());
      const cleanReader=await context.newPage();await cleanReader.goto(base+'/check-my-files');
      await cleanReader.locator('#openDocument').setInputFiles({name:'separate-recheck.json',mimeType:'application/json',buffer:cleanBytes});
      await cleanReader.locator('#check:not([disabled])').waitFor();await cleanReader.locator('#check').click();
      await cleanReader.locator('#result:not([hidden])').waitFor();assert.match(await cleanReader.locator('#verdict').innerText(),/No shared IDs found/);
      await cleanReader.close();
      await p.screenshot({path:path.join(output,`one-minute-result-${width}.png`),fullPage:true});
      assert.equal(new URL(p.url()).pathname, '/experience');
      assert.equal(await p.locator('.nav-primary-link').getAttribute('aria-current'), 'page');
      assert.equal(await p.getByRole('navigation',{name:'Breadcrumb'}).isVisible(), true);
      await p.locator('#ruleInvestigation>summary').click();
      await p.getByRole('link', {name:'Start my first investigation ↓', exact:true}).click();
      assert.equal(await p.locator('#fiHint').getAttribute('open'), null);
      await p.locator('#fiHint summary').click();
      assert.match(await p.locator('#fiHint').innerText(), /suggested example, not an independent discovery/);
      await p.locator('#fiUsed').focus(); await p.keyboard.press('Space');
      await p.locator('#fiPrediction').selectOption('intended');
      await p.locator('#fiCheck').focus(); await p.keyboard.press('Enter');
      assert.equal(await p.locator('#fiResult').evaluate(e => e === document.activeElement), true);
      assert.match(await p.locator('#fiResult').innerText(), /Difference found/);
      await p.locator('#fiScope').selectOption('real-ai'); await p.locator('#fiUnderstand').click();
      assert.equal(await p.locator('#fiWitness').isDisabled(), true);
      assert.equal(await p.locator('#fiScopeFeedback').evaluate(e => e === document.activeElement), true);
      await p.locator('#fiScope').selectOption('meaning'); await p.locator('#fiUnderstand').click();
      assert.equal(await p.locator('#fiCarryTitle').evaluate(e => e === document.activeElement), true);
      const event = p.waitForEvent('download'); await p.locator('#fiWitness').click();
      const bytes = fs.readFileSync(await (await event).path());
      const witness = JSON.parse(bytes);
      assert.equal(witness.world.P[0], true); assert.equal(witness.world.Q[0], false);
      assert.equal(witness.format, 'pcs-countermodel-witness-v1');
      // A fresh reader must get the result from the file, not the editor's state.
      const reader = await context.newPage(); await reader.goto(base + '/experience.html#fiReader');
      await reader.locator('#firstInvestigation[data-ready=true]').waitFor();
      assert.equal(await reader.locator('#fiReader').getAttribute('open'), '');
      assert.equal(await reader.locator('#fiUsed').getAttribute('aria-pressed'), 'false');
      await reader.locator('#fiFile').setInputFiles({name:'pcs-first-witness.json',mimeType:'application/json',buffer:bytes});
      await reader.locator('#fiReaderResult[data-state=found]').waitFor();
      assert.match(await reader.locator('#fiReaderResult').innerText(), /not a signature check or a Lean kernel run/);
      assert.equal(await reader.locator('#fiWitness').isDisabled(), true);
      await reader.screenshot({path:path.join(output,`reopened-evidence-${width}.png`)});
      assert.equal(await noOverflow(reader), true); await reader.close();
      await p.goto(base + '/'); await p.locator('[data-beginner-path=research]').click();
      await p.locator('#homeResearch a[href="arena.html"]').first().click();
      await p.locator('main a[href="world-builder.html"]').first().click();
      await p.locator('#wbApp[data-ready=true]').waitFor(); await p.locator('#gameGuideQuickPlay').click();
      await p.locator('#wbCheck').click(); assert.match(await p.locator('#wbFeedback').innerText(), /rules agree/);
      await p.locator('#wbWorld [data-fact=P][data-character="0"]').click();
      await p.locator('#wbCheck').click(); assert.match(await p.locator('#wbFeedback').innerText(), /Difference found/);
      assert.equal(await p.locator('#wbStars [data-earned=true]').count(), 3);
      assert.equal(await noOverflow(p), true);
      await p.goto(base + '/'); await p.locator('[data-beginner-path=research]').click();
      await p.locator('#homeResearch a[href="package-inspector.html"]').first().click();
      await p.getByRole('button', {name:'Try a sample package',exact:true}).click();
      await p.locator('#inspectorSummary').waitFor();
      assert.match(await p.locator('#inspectorReviewSnapshotTitle').innerText(), /Authoritative verification is still required/);
      assert.equal(await p.locator('#bundleHash').textContent(), sha(fs.readFileSync(path.join(root,'pcs-v06-golden.pcs.zip'))));
      assert.match(await p.locator('#reviewAuthorityStatus').innerText(), /NOT ESTABLISHED/);
      await p.screenshot({path:path.join(output,`sample-package-${width}.png`)});
      assert.equal(await noOverflow(p), true);
      // Existing research bookmarks must open the folded catalogue automatically.
      await p.goto(base + '/#product');
      assert.equal(await p.locator('#homeResearch').getAttribute('open'), '');
      assert.equal(await p.locator('#product').isVisible(), true);
      const contrast = await p.locator('#homeResearch .hero-plain-flow').evaluate(root => {
        const rgba = s => {const a=s.match(/[\d.]+/g).map(Number);return [...a.slice(0,3),a[3]??1];};
        const background = el => {
          if (!el) return [255,255,255];
          const c=rgba(getComputedStyle(el).backgroundColor);
          if(c[3]===1)return c.slice(0,3);
          const behind=background(el.parentElement);
          return c.slice(0,3).map((v,i)=>v*c[3]+behind[i]*(1-c[3]));
        };
        const luminance = rgb => {
          const c=rgb.map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});
          return .2126*c[0]+.7152*c[1]+.0722*c[2];
        };
        return [...root.querySelectorAll('small,strong')].map(el=>{
          const style=getComputedStyle(el),bg=background(el),fg=rgba(style.color);
          const l1=luminance(fg.slice(0,3).map((v,i)=>v*fg[3]+bg[i]*(1-fg[3]))),l2=luminance(bg);
          return {tag:el.tagName,ratio:(Math.max(l1,l2)+.05)/(Math.min(l1,l2)+.05),font_px:parseFloat(style.fontSize)};
        });
      });
      assert.equal(contrast.length,6);
      assert.ok(contrast.every(c=>c.ratio>=4.5),'expanded summary text needs 4.5:1 contrast: '+JSON.stringify(contrast));
      assert.ok(contrast.every(c=>c.font_px>=(c.tag==='SMALL'?12:14)),'summary text must be readable at its rendered size');
      await p.locator('#homeResearch .hero-plain-flow').screenshot({path:path.join(output,`expanded-summary-${width}.png`)});
      await p.goto(base + '/#%E0%A4%A'); // malformed escapes cannot break navigation
      assert.equal(await p.locator('[data-beginner-path]').count(), 3);
      assert.deepEqual(errors, []); assert.deepEqual(writes, []); assert.deepEqual(external, []);
      report.rows.push({width,height:900,homepage_visible_words:visibleWords,
        primary_action_bottom:primaryActionBottom,primary_action_in_initial_view:true,
        one_minute_introduction_words:introductionWords,actual_CSV_example_and_changed_inputs:true,
        readable_report_and_two_fresh_independent_reopens:true,stale_sample_export_invalidated:true,
        keyboard_skip_and_check:true,focused_feedback:true,learning_export_and_fresh_reopen:true,
        suggested_example_marked_assisted:true,real_ai_conclusion_rejected:true,
        first_visual_puzzle_completed:true,sample_package_exact_sha256:true,
        inspection_does_not_establish_authority:true,research_bookmarks_preserved:true,
        clean_url_current_page_and_breadcrumbs:true,
        expanded_summary_min_contrast:Math.min(...contrast.map(c=>c.ratio)),
        overflow:false,unexpected_writes:writes.length,external_requests:external.length});
      await context.close();
    }
    const fallback = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
    const p = await fallback.newPage(); await p.goto(base + '/');
    assert.equal(await inView(p.getByRole('link',{name:'Try the scientific example',exact:true})),true);
    await p.locator('#homeResearch>summary').click(); assert.equal(await p.locator('#product').isVisible(),true);
    await p.getByRole('link',{name:'Try the scientific example',exact:true}).click();
    assert.equal(await p.locator('#minuteCheck').isDisabled(),true);assert.equal(await p.locator('#minuteRows0 tr').count(),3);
    assert.match(await p.locator('noscript').first().innerText(),/needs JavaScript/);
    await fallback.close(); report.no_javascript_navigation=true;
    const unavailable=await browser.newContext();await unavailable.route('**/one-minute.mjs',route=>route.abort());
    const failed=await unavailable.newPage();await failed.goto(base+'/experience');
    assert.equal(await failed.locator('#minuteCheck').isDisabled(),true);assert.equal(await failed.locator('#minuteReport').isDisabled(),true);
    assert.equal(await failed.locator('#minuteResults').isHidden(),true);await unavailable.close();report.unavailable_intro_fails_closed=true;
    fs.writeFileSync(resultPath, JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({passed:true,completed_journeys:report.rows.length*3,
      human_participants:0,evidence:output}));
  } finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); server.close(); process.exitCode=1;});
