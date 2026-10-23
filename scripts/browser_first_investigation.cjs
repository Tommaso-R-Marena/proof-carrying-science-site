// Real Chromium interaction against an isolated static server. No external writes.
const {chromium} = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path');
const assert = require('node:assert/strict');
const {pathToFileURL} = require('node:url');
const root = path.resolve(__dirname, '../public');
const output = process.env.PCS_FIRST_EVIDENCE_DIR || '/tmp/pcs-first-investigation-browser';
const server = http.createServer((req, res) => {
  if (!['GET', 'HEAD'].includes(req.method)) {res.statusCode = 405; return res.end();}
  const name = new URL(req.url, 'http://localhost').pathname;
  if (name.startsWith('/api/')) {res.statusCode = 503; res.setHeader('Content-Type', 'application/json'); return res.end('{"error":"offline test"}');}
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  if (!file.startsWith(root + path.sep)) {res.statusCode = 403; return res.end();}
  try {
    res.setHeader('Content-Type', ({'.html':'text/html', '.mjs':'text/javascript', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    res.end(fs.readFileSync(file));
  } catch {res.statusCode = 404; res.end();}
});

(async () => {
  const {makeWorld, readWitness, proofFor} = await import(pathToFileURL(path.join(root, 'first-investigation-core.mjs')));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  fs.mkdirSync(output, {recursive: true});
  const browser = await chromium.launch({executablePath: process.env.PCS_CHROMIUM || (fs.existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), args:['--no-sandbox']});
  const rows = [];
  try {
    for (const width of [320, 390, 768, 1440]) {
      const context = await browser.newContext({viewport:{width, height:900}, reducedMotion:'reduce', acceptDownloads:true});
      const errors = [], writes = [], external = [];
      context.on('request', r => {if (!['GET', 'HEAD'].includes(r.method())) writes.push(r.url());});
      await context.route('**/*', route => {
        if (new URL(route.request().url()).origin !== base) {external.push(route.request().url()); return route.abort();}
        return route.continue();
      });
      const page = await context.newPage(); page.on('pageerror', e => errors.push(e.message));
      assert.equal((await page.goto(base + '/')).status(), 200);
      await page.getByRole('link', {name:'Start here · try your first check →', exact:true}).click();
      await page.locator('#firstInvestigation[data-ready=true]').waitFor();
      assert.equal(await page.locator('#fiCheck').isDisabled(), true);
      assert.equal(await page.locator('#fiWitness').isDisabled(), true);
      assert.equal(await page.locator('#fiCarryPanel').isHidden(), true);
      assert.equal(await page.locator('#fiMore').getAttribute('open'), null);
      await page.locator('#fiUsed').focus(); await page.keyboard.press('Space');
      assert.equal(await page.locator('#fiUsed').getAttribute('aria-pressed'), 'true');
      await page.locator('#fiPrediction').selectOption('both'); await page.locator('#fiCheck').click();
      assert.match(await page.locator('#fiResult').innerText(), /Difference found/);
      assert.match(await page.locator('#fiResult').innerText(), /differs from your prediction/);
      await page.locator('#fiScope').selectOption('real-ai'); await page.locator('#fiUnderstand').click();
      assert.equal(await page.locator('#fiWitness').isDisabled(), true);
      await page.locator('#fiScope').selectOption('meaning'); await page.locator('#fiUnderstand').click();
      assert.match(await page.locator('#fiProgressText').innerText(), /Investigation complete/);
      const download = page.waitForEvent('download'); await page.locator('#fiWitness').click();
      const witness = fs.readFileSync(await (await download).path());
      assert.deepEqual(readWitness(witness.toString()).world, makeWorld(true, false));
      const proofDownload = page.waitForEvent('download'); await page.locator('#fiProof').click();
      const proof = fs.readFileSync(await (await proofDownload).path(), 'utf8');
      assert.equal(proof, proofFor(makeWorld(true, false)).lean_source);
      if (width === 1440) {fs.writeFileSync(path.join(output, 'browser-witness.json'), witness); fs.writeFileSync(path.join(output, 'browser-proof.lean'), proof);}
      await page.locator('#fiReader summary').click();
      await page.locator('#fiFile').setInputFiles({name:'witness.json', mimeType:'application/json', buffer:witness});
      await page.locator('#fiReaderResult[data-state=found]').waitFor();
      assert.match(await page.locator('#fiReaderResult').innerText(), /not a signature check or a Lean kernel run/);
      await page.screenshot({path:path.join(output, `first-investigation-${width}.png`), fullPage:true});
      for (const [name, buffer] of [
        ['fake.json', Buffer.from(witness.toString().replace('"format":', '"verified": true, "format":'))],
        ['duplicate.json', Buffer.from('{"world":1,"world":2}')],
        ['invalid-utf8.json', Buffer.from([255])], ['huge.json', Buffer.alloc(4097, 32)],
      ]) {
        await page.locator('#fiFile').setInputFiles({name, mimeType:'application/json', buffer});
        await page.locator('#fiReaderResult[data-state=error]').waitFor();
        assert.match(await page.locator('#fiReaderResult').innerText(), /File not accepted/);
      }
      // Slow old file reads must not overwrite a later valid file's result.
      await page.evaluate(() => {
        const original = File.prototype.arrayBuffer;
        File.prototype.arrayBuffer = function () {
          return this.name === 'slow.json' ? new Promise(resolve => {window.resolveOldRead = resolve;}) : original.call(this);
        };
      });
      await page.locator('#fiFile').setInputFiles({name:'slow.json', mimeType:'application/json', buffer:Buffer.from('{}')});
      await page.waitForFunction(() => typeof window.resolveOldRead === 'function');
      await page.locator('#fiFile').setInputFiles({name:'fast.json', mimeType:'application/json', buffer:witness});
      await page.locator('#fiReaderResult[data-state=found]').waitFor();
      await page.evaluate(() => window.resolveOldRead(new TextEncoder().encode('{}').buffer));
      await page.waitForTimeout(50);
      assert.equal(await page.locator('#fiReaderResult').getAttribute('data-state'), 'found');
      await page.evaluate(() => {window.resolveOldRead = null;});
      await page.locator('#fiFile').setInputFiles({name:'slow.json', mimeType:'application/json', buffer:Buffer.from('{}')});
      await page.waitForFunction(() => typeof window.resolveOldRead === 'function');
      await page.locator('#fiReset').click();
      await page.evaluate(() => window.resolveOldRead(new TextEncoder().encode('{}').buffer));
      await page.waitForTimeout(50);
      assert.equal(await page.locator('#fiReaderResult').getAttribute('data-state'), 'pending');
      assert.equal(await page.locator('#fiFile').inputValue(), '');
      // Restore a completed investigation for the answer/edit invalidation checks.
      await page.locator('#fiUsed').click(); await page.locator('#fiPrediction').selectOption('intended');
      await page.locator('#fiCheck').click(); await page.locator('#fiScope').selectOption('meaning');
      await page.locator('#fiUnderstand').click();
      await page.locator('#fiScope').selectOption('real-ai');
      assert.equal(await page.locator('#fiWitness').isDisabled(), true);
      assert.equal(await page.locator('#fiCarryPanel').isHidden(), true);
      await page.locator('#fiPermission').click();
      assert.equal(await page.locator('#fiWitness').isDisabled(), true);
      assert.equal(await page.locator('#fiProof').isDisabled(), true);
      assert.match(await page.locator('#fiIntended').innerText(), /Not checked/);
      await page.locator('#fiPrediction').selectOption('neither'); await page.locator('#fiCheck').click();
      assert.match(await page.locator('#fiResult').innerText(), /No difference/);
      assert.equal(await page.locator('#fiScope').isDisabled(), true);
      for (const [u, p, left, right, prediction] of [
        [false, false, true, true, 'neither'], [false, true, true, false, 'proposal'],
        [true, false, false, true, 'intended'], [true, true, true, true, 'neither'],
      ]) {
        await page.locator('#fiReset').click();
        if (u) await page.locator('#fiUsed').click();
        if (p) await page.locator('#fiPermission').click();
        await page.locator('#fiPrediction').selectOption(prediction); await page.locator('#fiCheck').click();
        assert.equal(await page.locator('#fiIntended').innerText(), left ? 'Allows this example' : 'Rejects this example');
        assert.equal(await page.locator('#fiProposal').innerText(), right ? 'Allows this example' : 'Rejects this example');
        assert.equal(await page.locator('#fiMeaningPanel').isVisible(), left !== right);
      }
      // Preserve the older labs and their deep links.
      await page.goto(base + '/experience.html#xpLab');
      await page.locator('#xpMakeFail').click();
      assert.equal(await page.locator('#xpLayerStatus').innerText(), 'LOCAL FAIL');
      const layout = await page.evaluate(() => ({width:innerWidth, scroll:document.documentElement.scrollWidth}));
      assert.ok(layout.scroll <= width + 1, JSON.stringify(layout));
      assert.deepEqual(errors, []); assert.deepEqual(writes, []); assert.deepEqual(external, []);
      rows.push({width, keyboard:true, actual_downloads:true, stale_edits_invalidated:true, reset_invalidates_reader:true,
        delayed_reads_invalidated:true, rejected_files:4, old_lab_preserved:true, ...layout});
      await context.close();
    }
    const context = await browser.newContext({javaScriptEnabled:false});
    const page = await context.newPage(); await page.goto(base + '/experience.html');
    assert.match(await page.locator('noscript').innerText(), /needs JavaScript/);
    assert.equal(await page.locator('#fiWitness').isDisabled(), true); await context.close();
    const unavailable = await browser.newContext();
    await unavailable.route('**/first-investigation.mjs', route => route.abort());
    const failed = await unavailable.newPage(); await failed.goto(base + '/experience.html');
    assert.equal(await failed.locator('#fiUsed').isDisabled(), true);
    assert.equal(await failed.locator('#fiLoadNote').isVisible(), true);
    assert.equal(await failed.locator('#fiWitness').isDisabled(), true);
    await unavailable.close();
    fs.writeFileSync(path.join(output, 'browser-results.json'), JSON.stringify({rows, no_javascript_fallback:true,
      unavailable_checker_fails_closed:true, kernel_executed_in_browser:false, production_authority:false}, null, 2) + '\n');
    console.log(JSON.stringify({viewports:rows.length, passed:true, evidence:output}));
  } finally {await browser.close(); await new Promise(resolve => server.close(resolve));}
})().catch(error => {console.error(error); server.close(); process.exitCode = 1;});
