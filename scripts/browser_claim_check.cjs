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
const B_CSV = 'animal,group,mass_g\n1,a,99\n2,a,98\n3,b,NA\n4,b,97\n5,b,96\n6,b,95\n';   // the second security review's B.csv: mean 97
const sha256 = (b) => require('node:crypto').createHash('sha256').update(b).digest('hex');
const CATALOG = JSON.parse(fs.readFileSync(path.join(root, 'claim-check/examples.json'), 'utf8'));
const RUNNER_SHA256 = sha256(fs.readFileSync(path.join(root, 'claim-check/claimcheck_kernel_runner.py')));
assert.equal(RUNNER_SHA256, CATALOG.v1_1.kernel_runner.sha256);

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
      assert.equal(draft.data.name, 'animals.csv'); assert.equal(draft.data.sha256, sha256(Buffer.from(CSV)));
      // the runner's SHA-256 from the catalog is shown next to its download link (second review, I3)
      assert.equal(await page.locator('#runnerDigest code').textContent(), RUNNER_SHA256);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2), false, `horizontal overflow with a result at ${width}px`);

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

      // --- any change to the inputs clears the result, an opened report and the downloads (second review, F3)
      const cleared = [];
      for (const [what, act] of [
        ['sentence', () => page.fill('#sentence', 'Mean mass was 12.4 g in these animals, and 10.81 g overall.')],
        ['number', () => page.selectOption('#numberSelect', { index: 1 })],
        ['statistic', () => page.selectOption('#stat', 'mean')],
        ['column', () => page.selectOption('#column', 'animal')],
        ['row condition added', () => page.click('#addFilter')],
        ['row condition value', () => page.fill('#filters .cond input', 'a')],
        ['row condition removed', () => page.click('#filters .cond button')],
        ['unit in the file', () => page.selectOption('#dataUnit', 'g')],
        ['unit printed', () => page.selectOption('#reportedUnit', 'kg')],
        ['data file', () => page.setInputFiles('#dataFile', { name: 'B.csv', mimeType: 'text/csv', buffer: Buffer.from(B_CSV) })],
      ]) {
        assert.equal(await page.locator('#check').isEnabled(), true, `${what}: Check is available`);
        await page.click('#check'); await page.waitForSelector('#result:not([hidden])');
        assert.equal(await page.locator('#downloadLean').isEnabled(), true);
        await page.setInputFiles('#kernelRun', { name: 'kernel-run.json', mimeType: 'application/json', buffer: Buffer.from('{}') });
        await page.waitForFunction(() => /Not shown/.test(document.getElementById('kernelRunStatus').textContent));
        await act();
        await page.waitForFunction(() => document.getElementById('result').hidden);
        assert.equal(await page.locator('#downloadLean').isDisabled(), true, `${what}: Lean file download still enabled`);
        assert.equal(await page.locator('#downloadDraft').isDisabled(), true, `${what}: result download still enabled`);
        assert.equal(await page.locator('#kernelRunStatus').isHidden(), true, `${what}: report still shown`);
        assert.equal(await page.locator('#kernelRunStatus').textContent(), '', `${what}: report text kept`);
        cleared.push(what);
      }
      await page.selectOption('#dataUnit', ''); await page.selectOption('#reportedUnit', '');

      // --- malformed file: a clear message, nothing computed
      await page.setInputFiles('#dataFile', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('a,b\n1\n') });
      await page.waitForFunction(() => /not a plain rectangular CSV/.test(document.getElementById('status').textContent));

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 2);
      assert.equal(overflow, false, `horizontal overflow at ${width}px`);
      const step = { width, examples, benchmark_rows: arms, recorded_rows: rows, recorded_verdicts: [...new Set(verdicts)].sort(), recorded_file_rebuilt_in_browser: true, own_claim_preview: 'match / conditional / mismatch / link check failed / malformed file all shown', overflow,
        runner_sha256_shown: RUNNER_SHA256, inputs_whose_change_cleared_result_report_and_downloads: cleared };
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
          // the published runner on the browser-generated proof file, then its report opened in the page
          const runJson = path.join(tmp, 'kernel-run.json');
          execFileSync('python3', [path.join(root, 'claim-check/claimcheck_kernel_runner.py'), path.join(tmp, 'own.lean'), '--lean', process.env.PCS_LEAN, '--out', runJson], { encoding: 'utf8', timeout: 900000, stdio: ['ignore', 'pipe', 'pipe'] });
          const run = JSON.parse(fs.readFileSync(runJson, 'utf8'));
          assert.equal(run.accepted, true); assert.equal(run.theorems.length, 1);
          assert.equal(run.schema, 'pcs-claimcheck-kernel-run-v2'); assert.equal(run.generated_part_canonical, true);
          await page.setInputFiles('#kernelRun', runJson);
          await page.waitForSelector('#kernelRunStatus:not([hidden])');
          const shown = await page.locator('#kernelRunStatus').textContent();
          assert.match(shown, /REPORTED BY YOUR LOCAL RUN · NOT VERIFIED BY THIS PAGE/); assert.match(shown, /MATCHES/); assert.match(shown, /not about the paper/);
          assert.match(shown, /What such a run verifies: the supplied mathematical obligation/);
          assert.match(shown, /What no kernel run verifies: that the obligation faithfully represents the sentence in the paper/);
          // a receipt of the withdrawn runner (schema v1) is refused with the reason
          const old = path.join(tmp, 'v1-run.json');
          fs.writeFileSync(old, JSON.stringify({ ...run, schema: 'pcs-claimcheck-kernel-run-v1' }));
          await page.setInputFiles('#kernelRun', old);
          await page.waitForFunction(() => /earlier runner \(kernel-run v1\), withdrawn/.test(document.getElementById('kernelRunStatus').textContent));
          // the forgery reported in the core repository's research record: the Lean kernel accepts it,
          // the served runner refuses it before asking Lean anything
          const forgedLean = path.join(tmp, 'forged.lean');
          const dataHex = Buffer.from(CSV).toString('hex');
          fs.writeFileSync(forgedLean, ownLean.split('\n-- ===== generated obligations')[0]
            + '\n-- ===== generated obligations (data numeral, claims, expected outcomes) =====\nopen PCS.ClaimCheck\n\n'
            + `def pcs_src : Source := ⟨0x${dataHex}, ${Buffer.byteLength(CSV)}⟩\n\n`
            + 'structure Decoy where\n  n : Nat\n\ndef pcs_c0 : Decoy := ⟨0⟩\n\n'
            + 'def run (_ : Source) (_ : Decoy) : Outcome := .checked .consistent (.rat ((999 : Rat) / 1)) 2 0\n\n'
            + 'theorem pcs_claim_0 : run pcs_src pcs_c0 = .checked .consistent (.rat ((999 : Rat) / 1)) 2 0 :=\n  rfl\n#print axioms pcs_claim_0\n\n');
          const plain = execFileSync(process.env.PCS_LEAN, [forgedLean], { encoding: 'utf8', timeout: 1800000 });
          assert.match(plain, /'pcs_claim_0'/, 'plain Lean accepts the forged file: the check of its form is what refuses it');
          const forgedRun = path.join(tmp, 'forged-file-run.json');
          let refusedCode = 0;
          try { execFileSync('python3', [path.join(root, 'claim-check/claimcheck_kernel_runner.py'), forgedLean, '--lean', process.env.PCS_LEAN, '--out', forgedRun], { encoding: 'utf8', timeout: 900000, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { refusedCode = e.status; }
          const refused = JSON.parse(fs.readFileSync(forgedRun, 'utf8'));
          assert.equal(refusedCode, 1); assert.equal(refused.accepted, false); assert.match(refused.why_not, /not in canonical form/);
          assert.equal(refused.lean, undefined, 'Lean was not even asked for its version');
          step.forged_proof_file = { accepted_by_plain_lean: true, served_runner_exit_code: refusedCode, served_runner_why_not: refused.why_not, lean_started_by_runner: false };
          step.withdrawn_v1_receipt_refused = true;
          const other = path.join(tmp, 'other-run.json');
          fs.writeFileSync(other, JSON.stringify({ ...run, data_sha256: '0'.repeat(64) }));
          await page.setInputFiles('#kernelRun', other);
          await page.waitForFunction(() => /different data file/.test(document.getElementById('kernelRunStatus').textContent));
          const forged = path.join(tmp, 'forged-run.json');
          fs.writeFileSync(forged, JSON.stringify({ ...run, proof_file_sha256: 'f'.repeat(64) }));
          await page.setInputFiles('#kernelRun', forged);
          await page.waitForFunction(() => /different proof file/.test(document.getElementById('kernelRunStatus').textContent));
          step.local_kernel_run_shown_as_reported_not_verified = true; step.kernel_run_for_other_data_or_proof_refused = true;
          step.browser_generated_lean_accepted_by_real_kernel = true;
          step.recorded_lean_re_accepted_by_real_kernel = true;
          step.lean = execFileSync(process.env.PCS_LEAN, ['--version'], { encoding: 'utf8' }).trim();

          // --- second review, F4: no text from a report is displayed
          const openRun = async (file, re) => {
            await page.evaluate(() => { document.getElementById('kernelRunStatus').textContent = ''; });
            await page.setInputFiles('#kernelRun', file);
            await page.waitForFunction((src) => new RegExp(src).test(document.getElementById('kernelRunStatus').textContent), re.source);
            return page.locator('#kernelRunStatus').innerText();
          };
          const write = (name, obj) => { const f = path.join(tmp, name); fs.writeFileSync(f, JSON.stringify(obj)); return f; };
          const PROSE = 'PCS-certified: the paper\u2019s claim is correct, peer-reviewed and VERIFIED \u202e.tcerroc si repap ehT\u202c';
          const planted = ['PCS-certified', 'peer-reviewed', '\u202e', 'tcerroc'];
          const free = (text, what) => { for (const p of planted) assert.ok(!text.includes(p), `${what} shows report text: ${p}`); };
          let text = await openRun(runJson, /REPORTED BY YOUR LOCAL RUN/);
          assert.match(text, /Checked here: the data file “animals\.csv”/);
          assert.ok(text.includes(`Reported run: ${run.lean}, ${run.utc} (UTC).`), 'version and time of the exact forms the runner writes');
          text = await openRun(write('prose-run.json', { ...run, lean: PROSE, utc: PROSE, host: PROSE, meaning: PROSE, proof_file: PROSE, establishes: PROSE,
            theorems: run.theorems.map((t) => ({ ...t, in_words: PROSE })) }), /REPORTED BY YOUR LOCAL RUN/);
          free(text, 'a shown report'); assert.doesNotMatch(text, /Reported run:/);
          text = await openRun(write('refused-prose-run.json', { ...run, accepted: false, why_not: PROSE }), /Not shown/);
          free(text, 'a refused report'); assert.match(text, /The runner did not report an accepted proof\. Nothing is established\./);
          const handwritten = { schema: run.schema, proof_file_sha256: run.proof_file_sha256, data_sha256: run.data_sha256, reviewed_checker_sha256: run.reviewed_checker_sha256,
            accepted: true, generated_part_canonical: true, theorems: [{ theorem: 'pcs_claim_0', proved_outcome: run.theorems[0].proved_outcome, axioms: ['sorryAx'], kernel_accepted: false }],
            lean: 'Lean 4.28.0 \u2014 PCS-certified: the paper\u2019s claim is correct', utc: 'peer-reviewed and VERIFIED' };
          text = await openRun(write('handwritten-run.json', handwritten), /Not shown/);
          free(text, 'the hand-written report of the review'); assert.match(text, /research-only authority label/);
          text = await openRun(write('handwritten-complete-run.json', { ...handwritten, authority: run.authority, checker_pin_overridden: false, all_settings_as_the_page_writes: true }), /Not shown/);
          free(text, 'a hand-written report'); assert.match(text, /does not say that the Lean kernel accepted every theorem/);
          text = await openRun(write('pin-overridden-run.json', { ...run, checker_pin_overridden: true }), /Not shown/);
          assert.match(text, /digest was replaced on the command line/);
          step.report_text_never_displayed = true;

          // --- second review, F3: after Check, another data file clears the report and disables the downloads;
          // the receipt for the previous file is refused afterwards, and the new download is that file's
          await openRun(runJson, /REPORTED BY YOUR LOCAL RUN/);
          await page.setInputFiles('#dataFile', { name: 'B.csv', mimeType: 'text/csv', buffer: Buffer.from(B_CSV) });
          await page.waitForFunction(() => /B\.csv/.test(document.getElementById('dataName').textContent));
          assert.equal(await page.locator('#result').isHidden(), true);
          assert.equal(await page.locator('#kernelRunStatus').isHidden(), true);
          assert.equal(await page.locator('#kernelRunStatus').textContent(), '');
          assert.equal(await page.locator('#downloadLean').isDisabled(), true);
          assert.equal(await page.locator('#downloadDraft').isDisabled(), true);
          await page.selectOption('#numberSelect', { index: 0 }); await page.selectOption('#stat', 'mean'); await page.selectOption('#column', 'mass_g'); await page.click('#check');
          await page.waitForSelector('#result:not([hidden])');
          assert.match(await page.locator('#q1Status').textContent(), /DOES NOT MATCH/);
          assert.match(await page.locator('#proofText').textContent(), /“B\.csv”/);
          const d4 = page.waitForEvent('download'); await page.click('#downloadLean');
          const bLean = fs.readFileSync(await (await d4).path(), 'utf8');
          assert.ok(bLean.includes(`⟨0x${Buffer.from(B_CSV).toString('hex')}, ${Buffer.byteLength(B_CSV)}⟩`), 'the download embeds the data that was checked');
          assert.match(bLean, /theorem pcs_claim_0 : run pcs_src pcs_c0 = \.checked \.inconsistent \(\.rat \(\(97 : Rat\) \/ 1\)\) 5 1 :=/);
          const previous = await openRun(runJson, /Not shown/);
          assert.match(previous, /different data file/); assert.match(previous, /“B\.csv”/);
          fs.writeFileSync(path.join(tmp, 'b.lean'), bLean);
          const bRunJson = path.join(tmp, 'b-kernel-run.json');
          execFileSync('python3', [path.join(root, 'claim-check/claimcheck_kernel_runner.py'), path.join(tmp, 'b.lean'), '--lean', process.env.PCS_LEAN, '--out', bRunJson], { encoding: 'utf8', timeout: 900000, stdio: ['ignore', 'pipe', 'pipe'] });
          const bRun = JSON.parse(fs.readFileSync(bRunJson, 'utf8'));
          assert.equal(bRun.accepted, true); assert.equal(bRun.data_sha256, sha256(Buffer.from(B_CSV))); assert.equal(bRun.all_settings_as_the_page_writes, true);
          text = await openRun(bRunJson, /REPORTED BY YOUR LOCAL RUN/);
          assert.match(text, /DOES NOT MATCH/); assert.match(text, /“B\.csv”/);
          step.other_data_file_after_check = { result_report_and_downloads_cleared: true, receipt_for_previous_file: previous.split('\n').slice(0, 2).join(' '),
            new_download_embeds_checked_data: true, new_download_accepted_by_served_runner_and_kernel: true, its_report_shown_as_reported: true };
        }
      }
      report.steps.push(step);
      await context.close();
    }
    // --- second review, F5: a checker without the catalog's pinned digest builds no proof file (nor rebuilds a
    // recorded one); without the catalog no proof file is built and no report is shown
    const checkerText = fs.readFileSync(path.join(root, 'claim-check/ClaimCheck.lean'), 'utf8');
    const lookalike = { schema: 'pcs-claimcheck-kernel-run-v2', authority: CATALOG.authority, accepted: true, generated_part_canonical: true, checker_pin_overridden: false,
      reviewed_checker_sha256: CATALOG.checker_sha256, data_sha256: sha256(Buffer.from(CSV)), proof_file_sha256: '0'.repeat(64), all_settings_as_the_page_writes: true, theorems: [] };
    report.checker_and_catalog_failures = {};
    for (const [label, pattern, body, onDownload, onReport] of [
      ['checker_without_the_pinned_digest', '**/claim-check/ClaimCheck.lean', checkerText + '\n-- altered\n', /does not have the reviewed checker digest pinned by the catalog, so this page builds no proof file/, /could not build its own proof file/],
      ['catalog_not_loaded', '**/claim-check/examples.json', 'not json', /catalog with the reviewed checker digest could not be loaded, so this page builds no proof file/, /catalog with the reviewed checker digest could not be loaded, so this page cannot tell/],
    ]) {
      const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
      const page = await context.newPage();
      page.on('request', (r) => { if (!r.url().startsWith(base) && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) report.external_requests.push(r.url()); });
      page.on('pageerror', (e) => report.page_errors.push(String(e)));
      page.on('console', (m) => { if (m.type() === 'error') report.page_errors.push(m.text()); });
      await page.route(pattern, (route) => route.fulfill({ status: 200, contentType: 'text/plain', body }));
      let downloads = 0; page.on('download', () => { downloads += 1; });
      await page.goto(`${base}/claim-check.html`);
      const recorded = {};
      if (label === 'catalog_not_loaded') {
        await page.waitForFunction(() => /could not be loaded/.test(document.getElementById('runnerDigest').textContent));
      } else {
        await page.waitForFunction(() => document.querySelectorAll('#exampleSelect option').length > 1);
        await page.selectOption('#exampleSelect', { index: 1 }); await page.click('#loadExample');
        await page.waitForFunction(() => document.getElementById('recordedBinding').textContent.length > 0);
        assert.match(await page.locator('#recordedBinding').textContent(), /could not rebuild the recorded Lean file/);
        assert.equal(await page.locator('#recordedLean').isDisabled(), true);
        recorded.recorded_example_not_rebuilt = true;
      }
      await page.setInputFiles('#dataFile', { name: 'animals.csv', mimeType: 'text/csv', buffer: Buffer.from(CSV) });
      await page.waitForFunction(() => /data rows/.test(document.getElementById('dataFacts').textContent));
      await page.fill('#sentence', 'Mean mass was 10.81 g overall.');
      await page.selectOption('#numberSelect', { index: 0 }); await page.selectOption('#stat', 'mean'); await page.selectOption('#column', 'mass_g'); await page.click('#check');
      await page.waitForSelector('#result:not([hidden])');
      await page.click('#downloadLean');
      await page.waitForFunction((src) => new RegExp(src).test(document.getElementById('status').textContent), onDownload.source);
      await page.setInputFiles('#kernelRun', { name: 'kernel-run.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(lookalike)) });
      await page.waitForFunction((src) => new RegExp(src).test(document.getElementById('kernelRunStatus').textContent), onReport.source);
      assert.equal(downloads, 0, `${label}: a proof file was offered`);
      report.checker_and_catalog_failures[label] = { ...recorded, proof_file_built: false, report_refused: (await page.locator('#kernelRunStatus').innerText()).split('\n')[0] };
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
