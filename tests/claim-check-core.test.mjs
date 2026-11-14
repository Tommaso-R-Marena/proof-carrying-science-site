import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { Q, evaluate, obligationTail, parseCsv, parseDecimal, halfUnit, unitFactor, describe, sqrtInInterval } from '../public/claim-check-core.mjs';

const cases = JSON.parse(fs.readFileSync(new URL('./fixtures/claim-check-differential.json', import.meta.url), 'utf8'));
const bytes = (hex) => Uint8Array.from(hex.match(/../g) || [], (h) => parseInt(h, 16));

test('browser core agrees with the Python oracle and renders byte-identical Lean obligations', () => {
  assert.ok(cases.length >= 400);
  const seen = new Set();
  for (const c of cases) {
    const scale = new Q(BigInt(c.scale[0]), BigInt(c.scale[1]));
    const claim = { ...c.spec, scale };
    const data = bytes(c.data_hex);
    const o = evaluate(data, claim, ['', 'NA']);
    assert.equal(o.defined, c.outcome.defined, JSON.stringify(c.spec));
    if (!o.defined) { assert.equal(o.reason, c.outcome.reason); seen.add(o.reason); } else {
      seen.add(o.verdict);
      assert.equal(o.verdict, c.outcome.verdict, JSON.stringify(c.spec));
      assert.equal(o.kind, c.outcome.kind);
      assert.equal(o.value.n.toString(), c.outcome.value[0]);
      assert.equal(o.value.d.toString(), c.outcome.value[1]);
      assert.equal(o.used, c.outcome.used);
      assert.equal(o.missing, c.outcome.missing);
      if (o.kind === 'sqrt') assert.equal(o.sign, c.outcome.sign);
    }
    assert.equal(obligationTail(data, [{ claim, outcome: o }], ['', 'NA']), c.tail);
  }
  for (const k of ['consistent', 'inconsistent', 'csvMalformed', 'columnNotFound', 'nonNumericCell', 'emptySelection']) assert.ok(seen.has(k), k);
});

test('strict CSV dialect and literals', () => {
  const enc = new TextEncoder();
  const rows = parseCsv(enc.encode('a,b\r\n"x, y","say ""hi"""\r\n'));
  assert.deepEqual(rows.map((r) => r.map((f) => new TextDecoder().decode(f))), [['a', 'b'], ['x, y', 'say "hi"']]);
  assert.equal(parseCsv(enc.encode('a,b\n\n1,2\n')), null);
  assert.equal(parseCsv(enc.encode('a\n"x"y\n')), null);
  assert.equal(parseCsv(enc.encode('a,b\r1,2\r')).length, 2);
  assert.equal(parseDecimal('1.2e-3').toString(), '3/2500');
  assert.equal(parseDecimal('abc'), null);
  assert.equal(parseDecimal('1e401'), null);
  assert.equal(halfUnit('12.50').toString(), '1/200');
  assert.equal(halfUnit('7').toString(), '1/2');
  assert.equal(unitFactor('g', 'kg').toString(), '1/1000');
  assert.equal(unitFactor('fraction', '%').toString(), '100');
  assert.equal(unitFactor('g', 'mm'), null);
  assert.equal(unitFactor(null, 'kg'), null);
  assert.equal(sqrtInInterval(new Q(141n, 100n), new Q(142n, 100n), 1, new Q(2n)), true);
  assert.equal(sqrtInInterval(new Q(141n, 100n), new Q(142n, 100n), -1, new Q(2n)), false);
});

test('hostile names never become Lean syntax', () => {
  const data = new TextEncoder().encode('x\n1\n');
  const claim = { stat: 'mean', reported: '1', column: 'x" }\ntheorem t : False := by sorry --', filter: [], sub_filter: [], scale: new Q(1n) };
  const tail = obligationTail(data, [{ claim, outcome: evaluate(data, claim) }]);
  assert.ok(!tail.includes('sorry'));
  assert.ok(!tail.includes('theorem t'));
  assert.match(describe({ stat: 'mean', reported: '1', column: 'x', filter: [] }), /arithmetic mean of x over all rows/);
});
