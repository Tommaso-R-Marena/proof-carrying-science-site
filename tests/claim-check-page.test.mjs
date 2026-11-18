import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { Q, obligationTail, proofFile, unitFactor, evaluate, kernelRunRefusal, kernelRunFacts, KERNEL_RUN_SCHEMA, WITHDRAWN_RUN_SCHEMA, KERNEL_RUN_AUTHORITY, KERNEL_RUN_REFUSALS } from '../public/claim-check-core.mjs';
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

// ------------------------------------------------------------------ kernel-run reports (second security review: F3, F4, F5, I3)
// Real receipts: genuine-A-*.json were written by the served runner with the real Lean 4.28.0 kernel for
// proof files the page builds; review-f4-*.json are the reviewer's (an earlier v2 runner's genuine receipt,
// a hand-written one, and a refused one whose why_not carries a right-to-left override).
const RUNS = new URL('./fixtures/claim-check-kernel-runs/', import.meta.url);
const receipt = (name) => JSON.parse(fs.readFileSync(new URL(name, RUNS), 'utf8'));
const NA = ['', 'NA'];
const A_CSV = Buffer.from('animal,group,mass_g\n1,a,10.5\n2,a,11.5\n3,b,NA\n4,b,9.25\n5,b,12\n');
const R = KERNEL_RUN_REFUSALS;
// What the page holds after Check for this data and reading, built with the page's own core.
function pageCheck(csv, stats, reported) {
  const items = stats.map((stat) => {
    const claim = { stat, reported, filter: [], sub_filter: [], column: 'mass_g', x_column: null, reported_unit: null, scale: unitFactor(null, null) };
    return { claim, outcome: evaluate(csv, claim, NA) };
  });
  const file = proofFile(checker, csv, items, NA);
  return { file, expected: { proofSha256: sha(file), dataSha256: sha(csv), checkerSha256: catalog.checker_sha256, outcomes: items.map((it) => it.outcome) } };
}

test('genuine receipts of the served runner about exactly the file the page builds are shown', () => {
  assert.equal(KERNEL_RUN_SCHEMA, 'pcs-claimcheck-kernel-run-v2');
  assert.equal(WITHDRAWN_RUN_SCHEMA, 'pcs-claimcheck-kernel-run-v1');
  assert.equal(KERNEL_RUN_AUTHORITY, catalog.authority);
  const mean = pageCheck(A_CSV, ['mean'], '10.81');
  // the proof file is the one the reviewer downloaded from the page (proof-A.lean), and the one both runners checked
  assert.equal(mean.expected.proofSha256, '8757e5a38921447c404384f64a4f2b57e265361d875ff9f65d9b39770f699100');
  assert.equal(sha(Buffer.concat([checker, Buffer.from(obligationTail(A_CSV, [{ claim: { stat: 'mean', reported: '10.81', column: 'mass_g', filter: [], sub_filter: [] }, outcome: mean.expected.outcomes[0] }]), 'utf8')])), mean.expected.proofSha256);
  const g1 = receipt('genuine-A-mean.json');
  assert.equal(g1.proof_file_sha256, mean.expected.proofSha256);
  assert.equal(kernelRunRefusal(g1, mean.expected), null);
  const sd = pageCheck(A_CSV, ['sd_sample', 'sd_pop'], '1.21');
  const g2 = receipt('genuine-A-sd-two-claims.json');
  assert.deepEqual(sd.expected.outcomes.map((o) => o.verdict), ['consistent', 'inconsistent']);
  assert.equal(kernelRunRefusal(g2, sd.expected), null);
  assert.equal(kernelRunRefusal(g1, sd.expected), R.proof, 'a receipt for another reading of the same data');
  assert.equal(kernelRunRefusal(g2, mean.expected), R.proof);
  const other = pageCheck(Buffer.from('animal,group,mass_g\n1,a,99\n2,a,98\n3,b,NA\n4,b,97\n5,b,96\n6,b,95\n'), ['mean'], '10.81');
  assert.equal(kernelRunRefusal(g1, other.expected), R.data, 'a receipt for the previous data file');
});

test('kernelRunRefusal: every field a genuine receipt always gets right is required (F5)', () => {
  const g = receipt('genuine-A-mean.json'); const e = pageCheck(A_CSV, ['mean'], '10.81').expected;
  const t0 = g.theorems[0];
  const variant = (change) => ({ ...g, ...change });
  const theorem = (change) => variant({ theorems: [{ ...t0, ...change }] });
  const without = (key) => { const copy = { ...g }; delete copy[key]; return copy; };
  const cases = [
    ['schema v1 (withdrawn runner)', variant({ schema: WITHDRAWN_RUN_SCHEMA }), R.withdrawn],
    ['schema v1, everything else right', variant({ schema: WITHDRAWN_RUN_SCHEMA, generated_part_canonical: undefined }), R.withdrawn],
    ['another schema', variant({ schema: 'pcs-claimcheck-kernel-run-v3' }), R.schema],
    ['no schema', without('schema'), R.schema],
    ['accepted false', variant({ accepted: false }), R.notAccepted],
    ['accepted missing', without('accepted'), R.notAccepted],
    ['accepted as a string', variant({ accepted: 'true' }), R.notAccepted],
    ['authority missing', without('authority'), R.authority],
    ['production authority claimed', variant({ authority: 'PCS_V06_AUTHORITY' }), R.authority],
    ['generated part not canonical', variant({ generated_part_canonical: false }), R.notCanonical],
    ['canonical flag missing', without('generated_part_canonical'), R.notCanonical],
    ['checker pin overridden', variant({ checker_pin_overridden: true }), R.pinOverridden],
    ['pin flag missing', without('checker_pin_overridden'), R.pinOverridden],
    ['another checker digest', variant({ reviewed_checker_sha256: 'f'.repeat(64) }), R.checker],
    ['checker digest missing', without('reviewed_checker_sha256'), R.checker],
    ['another data file', variant({ data_sha256: '0'.repeat(64) }), R.data],
    ['data digest missing', without('data_sha256'), R.data],
    ['another proof file', variant({ proof_file_sha256: 'f'.repeat(64) }), R.proof],
    ['proof digest in upper case', variant({ proof_file_sha256: g.proof_file_sha256.toUpperCase() }), R.proof],
    ['proof digest missing', without('proof_file_sha256'), R.proof],
    ['a setting the page never writes', variant({ all_settings_as_the_page_writes: false }), R.settings],
    ['settings flag missing', without('all_settings_as_the_page_writes'), R.settings],
    ['a theorem flags a setting', theorem({ settings_the_page_never_writes: ['the scale is not a ratio of two units'] }), R.settings],
    ['a theorem without its settings notes', theorem({ settings_the_page_never_writes: undefined }), R.settings],
    ['no theorems', variant({ theorems: [] }), R.theorems],
    ['theorems not a list', variant({ theorems: { 0: t0 } }), R.theorems],
    ['theorems missing', without('theorems'), R.theorems],
    ['one theorem too many', variant({ theorems: [t0, { ...t0, theorem: 'pcs_claim_1' }] }), R.theorems],
    ['theorem renamed', theorem({ theorem: 'pcs_claim_1' }), R.theorems],
    ['theorem not a record', variant({ theorems: ['pcs_claim_0'] }), R.theorems],
    ['kernel_accepted false', theorem({ kernel_accepted: false }), R.notKernelAccepted],
    ['kernel_accepted missing', theorem({ kernel_accepted: undefined }), R.notKernelAccepted],
    ['sorryAx', theorem({ axioms: ['propext', 'sorryAx'] }), R.axioms],
    ['Lean.ofReduceBool', theorem({ axioms: ['Lean.ofReduceBool'] }), R.axioms],
    ['axioms missing', theorem({ axioms: undefined }), R.axioms],
    ['axioms as one string', theorem({ axioms: 'propext' }), R.axioms],
    ['outcome sharing only the prefix (review F5)', theorem({ proved_outcome: '.checked .consistent (.rat ((999 : Rat) / 1)) 7 7' }), R.outcomes],
    ['outcome with a trailing space', theorem({ proved_outcome: `${t0.proved_outcome} ` }), R.outcomes],
    ['outcome extended', theorem({ proved_outcome: `${t0.proved_outcome}0` }), R.outcomes],
    ['outcome missing', theorem({ proved_outcome: undefined }), R.outcomes],
  ];
  for (const [what, run, why] of cases) assert.equal(kernelRunRefusal(run, e), why, what);
  assert.equal(kernelRunRefusal(g, e), null, 'the variants above changed one field each');
  // page side: no report is shown without the catalog's pin or without the page's own proof file
  assert.equal(kernelRunRefusal(g, { ...e, checkerSha256: undefined }), R.noCatalog);
  assert.equal(kernelRunRefusal(without('reviewed_checker_sha256'), { ...e, checkerSha256: undefined }), R.noCatalog, 'review F5: no catalog and no checker digest');
  assert.equal(kernelRunRefusal(g, { ...e, proofSha256: undefined }), R.noProofFile);
  assert.equal(kernelRunRefusal(g, { ...e, outcomes: [] }), R.theorems);
  assert.equal(kernelRunRefusal(g, { ...e, outcomes: [{ defined: true }] }), R.unreadable, 'never throws');
  for (const bad of [null, undefined, 'x', 42, true, [g]]) assert.equal(kernelRunRefusal(bad, e), R.unreadable);
  // two claims: one theorem per claim, in order, each with exactly its own outcome
  const sd = pageCheck(A_CSV, ['sd_sample', 'sd_pop'], '1.21').expected; const g2 = receipt('genuine-A-sd-two-claims.json');
  const [s0, s1] = g2.theorems;
  assert.equal(kernelRunRefusal({ ...g2, theorems: [s1, s0] }, sd), R.theorems, 'out of order');
  assert.equal(kernelRunRefusal({ ...g2, theorems: [s0] }, sd), R.theorems, 'a claim missing');
  assert.equal(kernelRunRefusal({ ...g2, theorems: [{ ...s0, proved_outcome: s1.proved_outcome }, { ...s1, proved_outcome: s0.proved_outcome }] }, sd), R.outcomes, 'outcomes swapped');
  assert.equal(kernelRunRefusal({ ...g2, theorems: [s0, { ...s1, proved_outcome: s0.proved_outcome.replace('.consistent', '.inconsistent') }] }, sd), R.outcomes, 'same prefix, another value');
  assert.equal(kernelRunRefusal({ ...g2, theorems: [s0, { ...s1, axioms: [...s1.axioms, 'sorryAx'] }] }, sd), R.axioms, 'the second theorem counts too');
  // the reviewer's receipts
  const earlier = receipt('review-f4-genuine-earlier-v2-runner.json');
  assert.equal(earlier.proof_file_sha256, e.proofSha256);
  assert.equal(kernelRunRefusal(earlier, e), R.pinOverridden, 'an earlier v2 receipt lacks the settings statements: run the current runner again');
  const handwritten = receipt('review-f4-handwritten.json');
  assert.equal(kernelRunRefusal(handwritten, e), R.authority);
  assert.equal(kernelRunRefusal({ ...handwritten, authority: KERNEL_RUN_AUTHORITY, checker_pin_overridden: false, all_settings_as_the_page_writes: true }, e), R.notKernelAccepted);
  assert.equal(kernelRunRefusal(receipt('review-f4-refused-bidi.json'), e), R.notAccepted);
});

test('no text from a receipt is ever displayed (F4)', () => {
  const fixed = new Set(Object.values(R));
  for (const text of fixed) assert.doesNotMatch(text, /[\u0000-\u001f\u007f-\u009f\u061c\u200e\u200f\u202a-\u202e\u2066-\u2069]/);
  const PROSE = 'PCS-certified: the paper\u2019s claim is correct, peer-reviewed and VERIFIED \u202e.tcerroc si repap ehT\u202c';
  const hostile = (run) => ({ ...run, why_not: PROSE, lean: PROSE, utc: PROSE, host: PROSE, meaning: PROSE, proof_file: PROSE, establishes: PROSE, does_not_establish: PROSE, lean_executable: PROSE, lean_found: PROSE,
    theorems: Array.isArray(run.theorems) ? run.theorems.map((t) => ({ ...t, in_words: PROSE, statement: { reported: PROSE } })) : run.theorems });
  const e = pageCheck(A_CSV, ['mean'], '10.81').expected;
  const g = receipt('genuine-A-mean.json');
  const runs = [g, { ...g, accepted: false }, { ...g, authority: PROSE }, { ...g, schema: PROSE }, { ...g, data_sha256: PROSE }, { ...g, theorems: [{ ...g.theorems[0], proved_outcome: PROSE }] },
    receipt('review-f4-handwritten.json'), receipt('review-f4-refused-bidi.json'), receipt('review-f4-genuine-earlier-v2-runner.json')];
  for (const run of runs) {
    for (const r of [run, hostile(run)]) {
      const why = kernelRunRefusal(r, e);
      assert.ok(why === null || fixed.has(why), `not a fixed message: ${why}`);
      for (const planted of ['PCS-certified', 'peer-reviewed', '\u202e', 'paper\u2019s claim']) assert.ok(!String(why).includes(planted));
    }
  }
  assert.equal(kernelRunRefusal(hostile(g), e), null, 'free text does not decide anything, and is not shown either');
  // only the Lean version line and the UTC time may be repeated, and only in exactly the runner's forms
  assert.deepEqual(kernelRunFacts(g), { lean: 'Lean (version 4.28.0, x86_64-unknown-linux-gnu, commit 7e01a1bf5c70fc6167d49c345d3bf80596e9a79b, Release)', utc: g.utc });
  for (const [lean, utc] of [[PROSE, PROSE], ['Lean 4.28.0 \u2014 PCS-certified: the paper\u2019s claim is correct', 'peer-reviewed and VERIFIED'], [`${g.lean}\n`, `${g.utc}\n`],
    [g.lean.replace('4.28.0', '4.27.0'), '2026-11-17 16:10:27Z'], [`\u202e${g.lean}`, `${g.utc} VERIFIED`], [g.lean.replace('Release', 'Release, VERIFIED'), '2026-11-17T16:10:27.5Z'],
    [g.lean.replace('x86_64-unknown-linux-gnu', 'PCS certified'), '\u0662\u0660\u0662\u0666-11-17T16:10:27Z'], [42, 42], [undefined, undefined]]) {
    assert.deepEqual(kernelRunFacts({ ...g, lean, utc }), { lean: null, utc: null }, String(lean));
  }
  assert.deepEqual(kernelRunFacts(null), { lean: null, utc: null });
  // the page reads no field of a report itself: only kernelRunRefusal and kernelRunFacts look inside one
  const js = read('claim-check.mjs').toString('utf8');
  assert.deepEqual([...js.matchAll(/\brun\??\.[A-Za-z_$]/g)].map((m) => m[0]), []);
  assert.doesNotMatch(js, /why_not|in_words|\.slice\(0, (60|30|300)\)/);
  assert.match(js, /const \{ lean, utc \} = kernelRunFacts\(run\);/);
  // the data file's name, which the page does show, is displayed without control or direction-changing characters
  const m = /const shownName = \(name\) => String\(name\)\.replace\(\/(.+)\/gu, '\\uFFFD'\);/.exec(js);
  assert.ok(m, 'shownName');
  assert.equal('\u202egnp.csv\u0007\u2066x\u2028'.replace(new RegExp(m[1], 'gu'), '\uFFFD'), '\uFFFDgnp.csv\uFFFD\uFFFDx\uFFFD');
});

test('a result belongs to the inputs at Check; any change clears it; only the snapshot is used (F3)', () => {
  const js = read('claim-check.mjs').toString('utf8');
  assert.match(js, /\/\/ Every change to the inputs ends here, so every change clears the outdated result\.\nfunction refresh\(\) \{\n  clearResult\(\);/);
  assert.match(js, /\['stat', 'column', 'xColumn', 'numberSelect', 'dataUnit', 'reportedUnit'\]\.forEach\(\(id\) => \$\(id\)\.addEventListener\('input', refresh\)\);/);
  assert.match(js, /\$\('sentence'\)\.addEventListener\('input', readSentence\);/);
  assert.match(js, /\[col, op, val\]\.forEach\(\(x\) => x\.addEventListener\('input', refresh\)\)/);
  assert.match(js, /async function setData\(bytes, name\) \{\n  clearResult\(\);/);
  assert.match(js, /if \(f\) \{ clearResult\(\);/);
  assert.match(js, /if \(!loader\) return;\n  clearResult\(\);/);
  const clear = js.slice(js.indexOf('function clearResult() {'), js.indexOf('// ------------------------------------------------------------------ data'));
  for (const part of ["state.last = null", "$('result').hidden = true", "$('downloadLean').disabled = true", "$('downloadDraft').disabled = true", 'box.hidden = true', 'box.replaceChildren()', "$('kernelRun').value = ''"]) assert.ok(clear.includes(part), part);
  assert.match(js, /const snap = \{ c, bytes: state\.bytes\.slice\(\), sha: state\.sha, name: state\.name, headers: state\.headers, sentence: \$\('sentence'\)\.value \};/);
  // downloads and the report check read the snapshot, never the current inputs
  const handlers = js.slice(js.indexOf('// The checker is used only if'), js.indexOf('// ------------------------------------------------------------------ recorded published examples'));
  assert.ok(handlers.length > 1000);
  assert.doesNotMatch(handlers, /state\.(bytes|sha|name|headers|numbers)\b|\$\('sentence'\)|obligationTail/);
  assert.match(handlers, /const snap = state\.last; if \(!snap\) return;/);
  assert.match(handlers, /if \(state\.last !== snap\) return;/);
  // the checker is used only with the catalog's pinned digest, before any proof file is built
  assert.match(handlers, /if \(await sha256\(raw\) !== pinned\) throw new Refusal\(CHECKER_REFUSALS\.digest\);/);
  assert.equal([...js.matchAll(/proofFile\(/g)].length, 2, 'one proof file builder for checks, one for the recorded examples');
  assert.equal([...js.matchAll(/proofFile\(await reviewedChecker\(\)|proofFile\(checkerBytes, /g)].length, 2);
});

test('the runner digest is shown next to its download link (I3) and the wording is right (5)', () => {
  const html = read('claim-check.html').toString('utf8'); const js = read('claim-check.mjs').toString('utf8');
  assert.match(html, /<a id="runnerLink"[^>]*>Download the runner<\/a><button id="downloadDraft" disabled>Download this result<\/button><\/div><p id="runnerDigest" class="small">/);
  assert.match(js, /showRunnerDigest\(state\.catalog\?\.v1_1\?\.kernel_runner\?\.sha256\);/);
  assert.match(catalog.v1_1.kernel_runner.sha256, /^[0-9a-f]{64}$/);
  const doc = fs.readFileSync(new URL('../docs/CLAIM_CHECK_V1.md', import.meta.url), 'utf8').replace(/\s+/g, ' ');
  for (const [name, text] of [['page', html], ['script', js], ['doc', doc]]) {
    assert.doesNotMatch(text, /exactly the kind of file|not in the generated form|has the generated form|exactly in the form the generator writes/, name);
    assert.match(text, /canonical form of the generator(’|')s grammar/, name);
    assert.match(text, /settings (this|the) page never writes/, name);
  }
  assert.match(html, /This page shows a report only if it is about exactly the proof file built here when you pressed Check/);
  assert.match(doc, /The page accepts only a report about the exact proof file it built when Check was pressed/);
  assert.match(doc, /shows the runner's SHA-256 from the catalog next to the download link/);
  assert.match(catalog.v1_1.kernel_runner.accepts, /canonical form of the generator's grammar/);
  // what a kernel run does and does not verify is still said, and nothing claims scientific correctness
  assert.match(html, /verifies the supplied mathematical obligation and nothing more/);
  assert.match(js, /What no kernel run verifies: that the obligation faithfully represents the sentence in the paper/);
  assert.doesNotMatch(html + js, /scientifically (correct|valid)|certified|peer-reviewed/i);
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
