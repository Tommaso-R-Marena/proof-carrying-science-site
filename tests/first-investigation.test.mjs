import test from 'node:test';
import assert from 'node:assert/strict';
import {makeWorld, inspectWorld, checkPrediction, witnessFor, proofFor, readWitness,
  PREDICTIONS, MAX_WITNESS_BYTES} from '../public/first-investigation-core.mjs';

const rows = [
  [false, false, true, true, 'neither'],
  [false, true, true, false, 'proposal'],
  [true, false, false, true, 'intended'],
  [true, true, true, true, 'neither'],
];
test('all four worlds and all sixteen predictions match an independent truth table', () => {
  for (const [used, permission, left, right, failing] of rows) {
    const w = makeWorld(used, permission), result = inspectWorld(w);
    assert.equal(result.left, left); assert.equal(result.right, right);
    assert.equal(result.counterexample, left !== right); assert.equal(result.failing, failing);
    for (const prediction of PREDICTIONS)
      assert.equal(checkPrediction(w, prediction).prediction_correct, prediction === failing);
    assert.equal(result.kernel_executed, false); assert.equal(result.pcs_authority, false);
    assert.equal(result.scientific_acceptance, false);
  }
});
test('both genuine counterexamples round-trip in the existing PCS witness format', () => {
  for (const [used, permission] of [[true, false], [false, true]]) {
    const w = makeWorld(used, permission), witness = witnessFor(w);
    assert.equal(witness.format, 'pcs-countermodel-witness-v1');
    assert.deepEqual(readWitness(JSON.stringify(witness)).world, w);
    const proof = proofFor(w);
    assert.equal(proof.lean_kernel_checked, false); assert.equal(proof.pcs_authoritative, false);
    assert.match(proof.lean_source, /import Std/);
    assert.match(proof.lean_source, /theorem exhibited_meaning_difference/);
    assert.doesNotMatch(proof.lean_source, /sorry|native_decide|admit/);
  }
});
test('agreement is never exported or imported as evidence of a difference', () => {
  for (const b of [true, false]) {
    const w = makeWorld(b, b);
    assert.throws(() => witnessFor(w)); assert.throws(() => proofFor(w));
    const raw = witnessFor(makeWorld(true, false)); raw.world = w;
    assert.throws(() => readWitness(JSON.stringify(raw)), /do not show a difference/);
  }
});
test('witness export snapshots the facts without aliasing the editor', () => {
  const w = makeWorld(true, false), witness = witnessFor(w); w.P[0] = false;
  assert.equal(readWitness(JSON.stringify(witness)).world.P[0], true);
});
test('unknown versions, missions, authority labels and nested fields fail closed', () => {
  for (const mutate of [
    x => {x.version = 'unknown';}, x => {x.mission_id = 'negation-drop';},
    x => {x.format = 'pcs-package-v06';}, x => {x.verified = true;},
    x => {x.pcs_authority = false;}, x => {x.world.P[0] = 1;},
    x => {x.world.extra = true;}, x => {x.world.n = 2;},
    x => {x.world.R = [];}, x => {x.world.Q = ['false'];},
  ]) {
    const x = witnessFor(makeWorld(true, false)); mutate(x);
    assert.throws(() => readWitness(JSON.stringify(x)));
  }
});
test('duplicate, escaped duplicate, prototype and oversized JSON are refused', () => {
  for (const raw of ['{"world":1,"world":2}', '{"world":1,"worl\\u0064":2}',
    '{"__proto__":{}}', '{"x":NaN}', 'null', '[]', '{"x":1} trailing',
    ' '.repeat(MAX_WITNESS_BYTES + 1)]) assert.throws(() => readWitness(raw));
});
test('invalid editor inputs and unsupported worlds do not become claims', () => {
  for (const value of [1, 0, 'yes', null, undefined, new Boolean(true)])
    assert.throws(() => makeWorld(value, false));
  assert.throws(() => checkPrediction(makeWorld(true, false), 'safe'));
  assert.throws(() => inspectWorld({...makeWorld(true, false), n: 3}));
});
