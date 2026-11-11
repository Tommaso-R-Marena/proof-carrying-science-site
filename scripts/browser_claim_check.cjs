// Real-browser journey for the ClaimCheck page: recorded example, own data, downloads, failure messages.
// Authored automation in Chromium; not a human usability study.  If PCS_LEAN points at a Lean 4.28.0
// binary, the Lean file the browser generated is also put to the real kernel.
const { chromium } = require('playwright');
const http = require('node:http'), fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '../public');
const out = process.env.PCS_CLAIM_CHECK_OUTPUT || path.resolve(__dirname, '../docs/evidence/claim-check-v1');
const TYPES = { '.html': 'text/html', '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.lean': 'text/plain', '.csv': 'text/csv' };
const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const file = path.resolve(root, '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
  if (req.method !== 'GET' || !file.startsWith(root + path.sep)) { res.statusCode = 403; return res.end(); }
  try { const raw = fs.readFileSync(file); res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream'); res.end(raw); } catch { res.statusCode = 404; res.end(); }
});
const CSV = 'animal,group,mass_g\n1,a,10.5\n2,a,11.5\n3,b,NA\n4,b,9.25\n5,b,12\n';

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ executablePath: process.env.PCS_CHROMIUM || undefined, args: ['--no-sandbox'] });
  const report = { format: 'pcs-claim-check-browser-journey-v1', human_participants: 0, human_usability_established: false, steps: [], external_requests: [], page_errors: [] };
  try {
    for (const width of [390, 1280]) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, acceptDownloads: true });
      const page = await context.newPage();
      page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) report.external_requests.push(r.url()); });
      page.on('pageerror', (e) => report.page_errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') report.page_errors.push(m.text()); });
      await page.goto(`${base}/claim-check.html`);
      assert.equal(await page.locator('h1').count(), 1);
      await page.waitForFunction(() => document.querySelectorAll('#exampleSelect option').length > 1);
      const examples = await page.locator('#exampleSelect option').count() - 1;
      assert.equal(await page.locator('#benchmarkTable').isVisible(), true);
      const arms = await page.locator('#benchmarkRows tr').count();

      // --- recorded published example
      await page.selectOption('#exampleSelect', { index: 1 });
      await page.click('#loadExample');
      await page.waitForSelector('#recorded:not([hidden])');
      const rows = await page.locator('#recordedRows tr').count();
      assert.ok(rows > 0);
      await page.waitForFunction(() => document.getElementById('recordedBinding').textContent.length > 0);
      const binding = await page.locator('#recordedBinding').textContent();
      assert.match(binding, /same SHA-256/);
      const d1 = page.waitForEvent('download'); await page.click('#recordedLean');
      const recordedLean = fs.readFileSync(await (await d1).path(), 'utf8');
      assert.match(recordedLean, /theorem pcs_batch : runAll pcs_src/);
      const verdicts = await page.locator('#recordedRows td:first-child').allTextContents();

      // --- own data: a true statement
      await page.setInputFiles('#dataFile', { name: 'animals.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
      await page.waitForFunction(() => /4|5 data rows/.test(document.getElementById('dataFacts').textContent));
      assert.equal(await page.locator('#recorded').isHidden(), true);
      await page.fill('#sentence', 'Mean mass was 10.81 g (SD 1.21) overall, suggesting no group difference.');
      await page.selectOption('#numberSelect', { index: 0 });
      await page.selectOption('#stat', 'mean'); await page.selectOption('#column', 'mass_g');
      await page.click('#check');
      await page.waitForSelector('#result:not([hidden])');
      assert.match(await page.locator('#q1Status').textContent(), /THE NUMBER MATCHES/);
      assert.match(await page.locator('#q1Text').textContent(), /Status until Lean checks it: UNKNOWN/);
      assert.match(await page.locator('#q2Status').textContent(), /MEANING UNREVIEWED/);
      assert.match(await page.locator('#q3List').textContent(), /suggesting/);
      const d2 = page.waitForEvent('download'); await page.click('#downloadLean');
      const ownLean = fs.readFileSync(await (await d2).path(), 'utf8');
      assert.match(ownLean, /theorem pcs_claim_0 : run pcs_src pcs_c0 = \.checked \.consistent/);
      const d3 = page.waitForEvent('download'); await page.click('#downloadDraft');
      const draft = JSON.parse(fs.readFileSync(await (await d3).path(), 'utf8'));
      assert.equal(draft.kernel_checked, false); assert.equal(draft.question_3, 'NOT_ASSESSED');

      // --- a standard deviation whose convention matters: conditional, never promoted
      await page.selectOption('#numberSelect', { index: 1 }); await page.selectOption('#stat', 'sd'); await page.click('#check');
      assert.match(await page.locator('#q1Status').textContent(), /DEPENDS ON A CONVENTION/);
      assert.match(await page.locator('#scope').textContent(), /No unconditional result/);

      // --- a false statement, and a reading the sentence does not support
      await page.fill('#sentence', 'Mean mass was 12.4 g in these animals.');
      await page.selectOption('#numberSelect', { index: 0 }); await page.selectOption('#stat', 'mean'); await page.click('#check');
      assert.match(await page.locator('#q1Status').textContent(), /DOES NOT MATCH/);
      await page.selectOption('#stat', 'median'); await page.click('#check');
      assert.match(await page.locator('#q2Status').textContent(), /A MECHANICAL CHECK FAILED/);

      // --- malformed file: a clear message, nothing computed
      await page.setInputFiles('#dataFile', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1\n') });
      await page.waitForFunction(() => /not a plain rectangular CSV/.test(document.getElementById('status').textContent));

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false, `horizontal overflow at ${width}px`);
      const step = { width, examples, benchmark_rows: arms, recorded_rows: rows, recorded_verdicts: [...new Set(verdicts)].sort(), recorded_file_rebuilt_in_browser: true, own_claim_preview: 'match / conditional / mismatch / link check failed / malformed file all shown', overflow };
      if (width === 1280) {
        fs.mkdirSync(out, { recursive: true });
        await page.setInputFiles('#dataFile', { name: 'animals.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
        await page.fill('#sentence', 'Mean mass was 10.81 g (SD 1.21) overall, suggesting no group difference.');
        await page.selectOption('#numberSelect', { index: 0 }); await page.selectOption('#stat', 'mean'); await page.selectOption('#column', 'mass_g'); await page.click('#check');
        await page.screenshot({ path: path.join(out, 'claim-check-desktop.png'), fullPage: true });
        if (process.env.PCS_LEAN) {
          const tmp = fs.mkdtempSync('/tmp/pcs-claim-check-');
          for (const [name, text] of [['own.lean', ownLean], ['recorded.lean', recordedLean]]) {
            fs.writeFileSync(path.join(tmp, name), text);
            const stdout = execFileSync(process.env.PCS_LEAN, [path.join(tmp, name)], { encoding: 'utf8', timeout: 1800000 });
            assert.match(stdout, /^'pcs_claim_0' depends on axioms: \[propext, Classical\.choice, Quot\.sound\]/);
            assert.doesNotMatch(stdout, /error|warning|sorry/i);
          }
          step.browser_generated_lean_accepted_by_real_kernel = true;
          step.recorded_lean_re_accepted_by_real_kernel = true;
          step.lean = execFileSync(process.env.PCS_LEAN, ['--version'], { encoding: 'utf8' }).trim();
        }
      }
      report.steps.push(step);
      await context.close();
    }
    assert.deepEqual(report.external_requests, []);
    assert.deepEqual(report.page_errors, []);
    report.ok = true;
  } finally { await browser.close(); server.close(); }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'browser-journey.json'), JSON.stringify(report, null, 1) + '\n');
  console.log(JSON.stringify(report));
})().catch((e) => { console.error(e); process.exit(1); });
