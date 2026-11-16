import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Q, obligationTail, unitFactor, evaluate, kernelRunRefusal, KERNEL_RUN_SCHEMA, WITHDRAWN_RUN_SCHEMA } from '../public/claim-check-core.mjs';
import { locateNumbers, linkChecks, interpretiveWords } from '../public/claim-check-text.mjs';

const pub = new URL('../public/', import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, pub));
const sha = (b) => crypto.createHash('sha256').update(b).digest('hex');
const catalog = JSON.parse(read('claim-check/examples.json'));
const checker = read('claim-check/ClaimCheck.lean');

test('the served checker is the pinned reviewed checker and contains no escape hatch', () => {
  assert.equal(sha(checker), catalog.checker_sha256);
  const body = checker.toString('utf8').split('-/').slice(1).join('-/');
  for (const word of ['sorry', 'native_decide', 'partial def', 'unsafe ', 'implemented_by', '@[extern', '\naxiom ']) assert.ok(!body.includes(word), word);
  assert.equal(catalog.authority, 'RESEARCH_ONLY_NOT_PCS_V06_AUTHORITY');
});

test('every recorded example rebuilds to exactly the Lean file the kernel checked', () => {
  assert.ok(catalog.examples.length >= 4);
  const loaders = read('claim-check-examples.mjs').toString('utf8');
  for (const meta of catalog.examples) {
    assert.ok(loaders.includes(`fetch('claim-check/examples/${meta.id}.json')`));
    const ex = JSON.parse(read(`claim-check/examples/${meta.id}.json`));
    const bytes = Uint8Array.from(Buffer.from(ex.data_base64, 'base64'));
    assert.equal(sha(bytes), meta.data_sha256);
    assert.equal(sha(bytes), ex.data_sha256);
    const items = [];
    for (const r of ex.receipts) {
      assert.equal(r.authority, 'RESEARCH_ONLY_NOT_PCS_V06_AUTHORITY');
      assert.equal(r.q3_interpretation.status, 'NOT_ASSESSED');
      if (r.q2_correspondence?.semantic_reading) assert.equal(r.q2_correspondence.semantic_reading, 'UNREVIEWED');
      assert.equal(r.data.sha256, ex.data_sha256);
      const variants = r.q1_mathematics?.variants || [];
      if (r.result !== 'UNKNOWN') {
        assert.equal(r.q2_correspondence.status, 'GROUNDED');
        assert.ok(variants.length && variants.every((v) => v.lean.kernel_accepted === true), 'a decided result needs kernel acceptance');
        assert.ok(variants.every((v) => v.lean.axioms.every((a) => ['propext', 'Classical.choice', 'Quot.sound'].includes(a))));
        assert.match(r.scope, r.result === 'PROVED' ? /Not established/ : /does not show that the paper is wrong/);
      }
      for (const v of variants) {
        if (!v.lean?.kernel_accepted) continue;
        const po = v.predicted_outcome; const spec = r.claim.spec;
        const dataUnit = v.stat === 'share' ? 'fraction' : (ex.column_units?.[spec.column] ?? null);
        const claim = { ...spec, stat: v.stat, scale: unitFactor(dataUnit, spec.reported_unit) };
        const outcome = po.defined
          ? { defined: true, verdict: po.verdict, kind: po.value_kind === 'rational' ? 'rat' : 'sqrt', sign: po.sign, value: new Q(BigInt(po.exact.numerator), BigInt(po.exact.denominator)), used: po.rows_used, missing: po.rows_skipped_as_missing }
          : { defined: false, reason: po.reason };
        // the browser core, run independently, must predict the very outcome the kernel accepted
        const mine = evaluate(bytes, claim, ex.na_tokens);
        assert.equal(mine.defined, outcome.defined);
        if (mine.defined) { assert.equal(mine.verdict, outcome.verdict); assert.ok(mine.value.eq(outcome.value)); assert.equal(mine.used, outcome.used); }
        assert.equal(v.lean.obligation_sha256, ex.obligation_sha256);
        items[v.lean.index] = { claim, outcome };
      }
    }
    assert.ok(items.length > 0 && !items.includes(undefined));
    const text = Buffer.concat([checker, Buffer.from(obligationTail(bytes, items, ex.na_tokens), 'utf8')]);
    assert.equal(sha(text), ex.obligation_sha256, `${meta.id}: rebuilt obligation differs from the recorded one`);
  }
});

test('the benchmark table is published with its failures', () => {
  const b = catalog.benchmark;
  assert.ok(b.arms.length >= 4);
  for (const a of b.arms) for (const k of ['correct_verification', 'correct_refutation', 'unsupported_positive', 'unsupported_refutation', 'abstained']) assert.equal(typeof a[k], 'number');
  assert.match(b.notes, /not expert/);
  assert.ok(b.freezes && /^[0-9a-f]{64}$/.test(b.freezes.software_freeze_sha256));
});

test('page wiring: local only, no provider access, honest labels', () => {
  const html = read('claim-check.html').toString('utf8');
  const js = ['claim-check.mjs', 'claim-check-core.mjs', 'claim-check-text.mjs', 'claim-check-examples.mjs'].map((n) => read(n).toString('utf8')).join('\n');
  assert.doesNotMatch(html + js, /https?:\/\/(?!proof-carrying-science-site\.marenatommaso\.workers\.dev)/);
  assert.doesNotMatch(js, /api[_-]?key|GEMINI|OPENROUTER|Authorization|generativelanguage|openrouter\.ai/i);
  assert.doesNotMatch(js, /localStorage|sessionStorage|XMLHttpRequest|WebSocket|sendBeacon|innerHTML/);
  for (const m of js.matchAll(/\bfetch\s*\(([^)]*)\)/g)) assert.match(m[1], /^'claim-check\/[A-Za-z0-9._/-]+'$/, `non-literal fetch: ${m[0]}`);
  assert.match(html, /that preview is not a proof/);
  assert.match(html, /NOT ASSESSED/);
  assert.match(js, /Status until Lean checks it: UNKNOWN/);
  assert.match(js, /It does not mean the paper is wrong/);
});

test('v1.1 verdicts never exceed the recorded Lean result; the served runner is the published one', () => {
  const v = catalog.v1_1;
  assert.equal(sha(read('claim-check/claimcheck_kernel_runner.py')), v.kernel_runner.sha256);
  assert.equal(v.kernel_run_schema, 'pcs-claimcheck-kernel-run-v2');
  assert.ok(v.withdrawn_runners.some((w) => w.sha256 === WITHDRAWN_RUNNER && w.kernel_run_schema === 'pcs-claimcheck-kernel-run-v1'));
  assert.ok(!v.withdrawn_runners.some((w) => w.sha256 === v.kernel_runner.sha256), 'a withdrawn runner must not be served');
  assert.match(v.kernel_run_meaning.does_not_establish, /faithfully represents a sentence of a paper/);
  assert.match(v.development_note, /development evidence, not a test/);
  assert.match(v.prospective_evaluation, /not run/);
  let confirmations = 0;
  for (const meta of catalog.examples) {
    const ex = JSON.parse(read(`claim-check/examples/${meta.id}.json`));
    const byId = new Map(ex.receipts.map((r) => [r.claim_id, r]));
    assert.equal(ex.v1_1.decisions.length, ex.receipts.length);
    for (const d of ex.v1_1.decisions) {
      const r = byId.get(d.claim_id); assert.ok(r, d.claim_id);
      assert.ok(['CONFIRMATION', 'DISCREPANCY_FOR_REVIEW', 'REQUIRE_HUMAN_REVIEW', 'UNKNOWN'].includes(d.verdict));
      if (d.verdict === 'CONFIRMATION') { assert.equal(r.result, 'PROVED'); assert.equal(d.mathematical_status, 'MATCH_PROVED'); assert.ok(d.findings.length > 0); confirmations += 1; }
      if (d.verdict === 'DISCREPANCY_FOR_REVIEW') { assert.equal(r.result, 'REFUTED'); assert.ok(d.supported_by.length > 0); }
      if (r.result === 'UNKNOWN') assert.ok(['REQUIRE_HUMAN_REVIEW', 'UNKNOWN'].includes(d.verdict), 'a v1 UNKNOWN can never become a verdict');
    }
  }
  assert.ok(confirmations > 0);
  const js = read('claim-check.mjs').toString('utf8'); const html = read('claim-check.html').toString('utf8');
  assert.match(js, /REPORTED BY YOUR LOCAL RUN · NOT VERIFIED BY THIS PAGE/);
  assert.match(js, /const why = kernelRunRefusal\(run, /);
  assert.match(js, /if \(why\) return refuse\(why\);/);
  assert.match(js, /What no kernel run verifies: that the obligation faithfully represents the sentence in the paper/);
  assert.doesNotMatch(js, /t\.in_words/, 'the page words results itself, never from the report');
  assert.match(html, /verifies the supplied mathematical obligation and nothing more/);
  assert.match(html, /Plain Lean alone is not enough for a file someone else made/);
  assert.match(js, /This page cannot verify that\n\/\/ Lean ran|cannot verify that/);
  assert.match(html, /href="claim-check\/claimcheck_kernel_runner\.py" download/);
  const runner = read('claim-check/claimcheck_kernel_runner.py').toString('utf8');
  assert.ok(runner.includes(catalog.checker_sha256), 'the runner pins the same reviewed checker the page serves');
  assert.doesNotMatch(runner, /urllib|http\.client|requests|socket/);
  assert.match(runner, /SCHEMA = "pcs-claimcheck-kernel-run-v2"/);
  assert.match(runner, /def parse_tail\(tail: str\):/);
});

test('a kernel-run report is shown only if it is a strict-runner report about exactly what the page built', () => {
  assert.equal(KERNEL_RUN_SCHEMA, 'pcs-claimcheck-kernel-run-v2');
  assert.equal(WITHDRAWN_RUN_SCHEMA, 'pcs-claimcheck-kernel-run-v1');
  const match = { defined: true, verdict: 'consistent' }, miss = { defined: true, verdict: 'inconsistent' }, undef = { defined: false, reason: 'columnNotFound' };
  const expected = { proofSha256: 'a'.repeat(64), dataSha256: 'b'.repeat(64), checkerSha256: catalog.checker_sha256, outcomes: [match, miss, undef] };
  const good = { schema: KERNEL_RUN_SCHEMA, proof_file_sha256: 'a'.repeat(64), data_sha256: 'b'.repeat(64), reviewed_checker_sha256: catalog.checker_sha256,
    accepted: true, generated_part_canonical: true, theorems: [
      { theorem: 'pcs_claim_0', proved_outcome: '.checked .consistent (.rat ((1 : Rat) / 1)) 1 0' },
      { theorem: 'pcs_claim_1', proved_outcome: '.checked .inconsistent (.rat ((1 : Rat) / 1)) 1 0' },
      { theorem: 'pcs_claim_2', proved_outcome: '.undefined .columnNotFound' }] };
  assert.equal(kernelRunRefusal(good, expected), null);
  const refused = (change, why) => assert.match(String(kernelRunRefusal({ ...good, ...change }, expected)), why);
  refused({ schema: WITHDRAWN_RUN_SCHEMA }, /earlier runner \(kernel-run v1\), withdrawn on 16 November 2026/);
  refused({ schema: 'something-else' }, /not a kernel-run file written by the current runner/);
  refused({ proof_file_sha256: 'f'.repeat(64) }, /different proof file/);
  refused({ data_sha256: 'f'.repeat(64) }, /different data file/);
  refused({ reviewed_checker_sha256: 'f'.repeat(64) }, /checker other than the reviewed one/);
  refused({ accepted: false, why_not: 'Lean rejected the file' }, /did not report an accepted proof: Lean rejected the file/);
  refused({ generated_part_canonical: undefined }, /did not report an accepted proof/);
  refused({ theorems: good.theorems.slice(0, 2) }, /did not report an accepted proof/);
  refused({ theorems: [good.theorems[1], good.theorems[0], good.theorems[2]] }, /do not agree with the proof file/);
  refused({ theorems: [good.theorems[0], { ...good.theorems[1], proved_outcome: '.checked .consistent x' }, good.theorems[2]] }, /do not agree/);
  assert.match(String(kernelRunRefusal(null, expected)), /could not be read/);
  // a v1 receipt is refused even if everything else about it is right
  assert.notEqual(kernelRunRefusal({ ...good, schema: WITHDRAWN_RUN_SCHEMA, generated_part_canonical: undefined }, expected), null);
});

// ------------------------------------------------------------------ the served runner, run for real
const WITHDRAWN_RUNNER = '8d9e07b4ac4b0abed13c9e750cbca113f1db26d82f3709579a7aafa7401f713f';
const MARKER = '\n-- ===== generated obligations (data numeral, claims, expected outcomes) =====\n';

// Run the served runner with a stand-in `lean` that records whether it was started.
function runServedRunner(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pcs-runner-'));
  try {
    const started = path.join(dir, 'lean-was-started');
    const lean = path.join(dir, 'lean');
    fs.writeFileSync(lean, `#!/bin/sh\necho x > '${started}'\necho 'Lean (version 0.0.0)'\n`, { mode: 0o755 });
    const proof = path.join(dir, 'proof.lean');
    fs.writeFileSync(proof, text);
    const r = spawnSync('python3', [new URL('claim-check/claimcheck_kernel_runner.py', pub).pathname, proof, '--lean', lean], { encoding: 'utf8' });
    return { report: JSON.parse(r.stdout), code: r.status, started: fs.existsSync(started) };
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

// The forgery of research/claimcheck_assurance_v1/findings/RUNNER_TAIL_FORGERY.md (core repository):
// its own type and its own `run`, proved by rfl.  The Lean kernel accepts such a file.
function shadowedRunTail(bytes) {
  return 'open PCS.ClaimCheck\n\n'
    + `def pcs_src : Source := ⟨0x${Buffer.from(bytes).toString('hex') || '0'}, ${bytes.length}⟩\n\n`
    + 'structure Decoy where\n  n : Nat\n\n'
    + 'def pcs_c0 : Decoy := ⟨0⟩\n\n'
    + 'def run (_ : Source) (_ : Decoy) : Outcome := .checked .consistent (.rat ((999 : Rat) / 1)) 2 0\n\n'
    + 'theorem pcs_claim_0 : run pcs_src pcs_c0 = .checked .consistent (.rat ((999 : Rat) / 1)) 2 0 :=\n  rfl\n'
    + '#print axioms pcs_claim_0\n\n';
}

test('the served runner passes page-built proof files to Lean and refuses the reported forgery before Lean starts', () => {
  const csv = Buffer.from('id,grp,x,y,Größe\n1,a,1.5,2,3\n2,a,2.5,4,NA\n3,"b",,5,4\n4,b,4,9,5\n');
  const claims = [
    { stat: 'mean', column: 'x', filter: [], sub_filter: [], reported: '2.67' },
    { stat: 'count', column: null, filter: [{ kind: 'text_eq', column: 'grp', value: 'a' }], sub_filter: [], reported: '2' },
    { stat: 'share', column: null, filter: [], sub_filter: [{ kind: 'text_ne', column: 'grp', value: 'say "b"' }], reported: '0.5', scale: new Q(1n, 100n) },
    { stat: 'sd_sample', column: 'y', filter: [{ kind: 'num', column: 'x', cmp: 'ge', value: '-2.50' }], sub_filter: [], reported: '3.5' },
    { stat: 'pearson', column: 'y', x_column: 'x', filter: [], sub_filter: [], reported: '0.98' },
    { stat: 'ols_intercept', column: 'y', x_column: 'x', filter: [], sub_filter: [], reported: '-0.4' },
    { stat: 'median', column: 'Größe', filter: [], sub_filter: [], reported: '4' },
    { stat: 'sem', column: 'missing', filter: [], sub_filter: [], reported: '1' },
  ];
  const items = claims.map((claim) => ({ claim, outcome: evaluate(csv, claim) }));
  assert.ok(items.some((it) => !it.outcome.defined) && items.some((it) => it.outcome.defined));
  const genuine = runServedRunner(Buffer.concat([checker, Buffer.from(obligationTail(csv, items), 'utf8')]));
  assert.equal(genuine.report.generated_part_canonical, true, genuine.report.why_not);
  assert.ok(genuine.started, 'a page-built file must reach Lean');
  assert.equal(genuine.code, 2); assert.match(genuine.report.why_not, /Lean 4\.28\.0 is required/);

  const forged = runServedRunner(Buffer.concat([checker, Buffer.from(MARKER + shadowedRunTail(csv), 'utf8')]));
  assert.equal(forged.report.accepted, false);
  assert.equal(forged.code, 1);
  assert.equal(forged.started, false, 'Lean must not be started for the forged file');
  assert.match(forged.report.why_not, /not in canonical form/);

  const altered = obligationTail(csv, items).replace('def pcs_c0', 'def helper : Nat := 0\n\ndef pcs_c0');
  const extra = runServedRunner(Buffer.concat([checker, Buffer.from(altered, 'utf8')]));
  assert.equal(extra.started, false); assert.match(extra.report.why_not, /not in canonical form/);
});

test('sentence helpers', () => {
  assert.deepEqual(locateNumbers('weighed 3,750 g, r = −0.45, ages 10-20, mean 43.92 mm (n = 342)').map((n) => n.literal), ['3750', '-0.45', '10', '20', '43.92', '342']);
  const s = 'Mean bill length was 43.92 mm in Adelie penguins, suggesting dimorphism.';
  const n = locateNumbers(s)[0];
  const ok = linkChecks(s, n, 'mean', { column: 'bill_length_mm', filter: [{ kind: 'text_eq', column: 'species', value: 'Adelie' }], sub_filter: [] });
  assert.ok(ok.every((c) => c.ok));
  const bad = linkChecks(s, n, 'median', { column: 'flipper_length_mm', filter: [], sub_filter: [], reported_unit: 'cm' });
  assert.equal(bad.filter((c) => !c.ok).length, 3);
  assert.deepEqual(interpretiveWords(s), ['suggesting']);
});
