import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { Q, obligationTail, unitFactor, evaluate } from '../public/claim-check-core.mjs';
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
