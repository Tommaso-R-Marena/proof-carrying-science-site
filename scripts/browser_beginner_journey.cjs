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
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
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
    source_sha256:Object.fromEntries(['index.html','experience.html','first-investigation.mjs',
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
      const start = p.getByRole('link', {name:'Start here · try your first check →', exact:true});
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
      await start.click(); await p.locator('#firstInvestigation[data-ready=true]').waitFor();
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
      await p.goto(base + '/'); await p.locator('[data-beginner-path=play]').click();
      await p.locator('#wbApp[data-ready=true]').waitFor(); await p.locator('#wbPlay').click();
      await p.locator('#wbCheck').click(); assert.match(await p.locator('#wbFeedback').innerText(), /rules agree/);
      await p.locator('#wbWorld [data-fact=P][data-character="0"]').click();
      await p.locator('#wbCheck').click(); assert.match(await p.locator('#wbFeedback').innerText(), /Difference found/);
      assert.equal(await p.locator('#wbStars [data-earned=true]').count(), 3);
      assert.equal(await noOverflow(p), true);
      await p.goto(base + '/'); await p.locator('[data-beginner-path=inspect]').click();
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
      await p.goto(base + '/#%E0%A4%A'); // malformed escapes cannot break navigation
      assert.equal(await p.locator('[data-beginner-path]').count(), 3);
      assert.deepEqual(errors, []); assert.deepEqual(writes, []); assert.deepEqual(external, []);
      report.rows.push({width,height:900,homepage_visible_words:visibleWords,
        primary_action_bottom:primaryActionBottom,primary_action_in_initial_view:true,
        keyboard_skip_and_check:true,focused_feedback:true,learning_export_and_fresh_reopen:true,
        suggested_example_marked_assisted:true,real_ai_conclusion_rejected:true,
        first_visual_puzzle_completed:true,sample_package_exact_sha256:true,
        inspection_does_not_establish_authority:true,research_bookmarks_preserved:true,
        overflow:false,unexpected_writes:writes.length,external_requests:external.length});
      await context.close();
    }
    const fallback = await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:900}});
    const p = await fallback.newPage(); await p.goto(base + '/');
    assert.equal(await inView(p.getByRole('link',{name:'Start here · try your first check →',exact:true})),true);
    await p.locator('#homeResearch>summary').click(); assert.equal(await p.locator('#product').isVisible(),true);
    await fallback.close(); report.no_javascript_navigation=true;
    fs.writeFileSync(resultPath, JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({passed:true,completed_journeys:report.rows.length*3,
      human_participants:0,evidence:output}));
  } finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); server.close(); process.exitCode=1;});
