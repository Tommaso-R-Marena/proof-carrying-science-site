import test from 'node:test';
import assert from 'node:assert/strict';
import { runScheduledDuties } from '../src/scheduled-duties.mjs';

test('successful scheduled duties run once in order', async () => {
  const calls = [];
  const env = { label: 'bound-env' };
  await runScheduledDuties(env, [
    ['expiry', async got => { assert.equal(got, env); calls.push('expiry'); }],
    ['reminders', async got => { assert.equal(got, env); calls.push('reminders'); }],
  ], () => { throw new Error('unexpected error log'); });
  assert.deepEqual(calls, ['expiry', 'reminders']);
});

test('expiry failure does not block reminders and propagates after both', async () => {
  const calls = [], reports = [];
  await assert.rejects(runScheduledDuties({}, [
    ['expiry', async () => { calls.push('expiry'); throw new Error('SECRET_PII_1234'); }],
    ['reminders', async () => { calls.push('reminders'); }],
  ], (...args) => reports.push(args)), /scheduled maintenance failed: expiry/);
  assert.deepEqual(calls, ['expiry', 'reminders']);
  assert.deepEqual(reports, [['PCS Commons scheduled duty failed', {duty:'expiry',error_type:'Error'}]]);
  assert.doesNotMatch(JSON.stringify(reports), /SECRET_PII_1234/);
});

test('reminder failure also propagates', async () => {
  const calls=[];
  await assert.rejects(runScheduledDuties({}, [
    ['expiry', async()=>calls.push('expiry')],
    ['reminders', async()=>{calls.push('reminders');throw new TypeError('private content');}],
  ], ()=>{}), /scheduled maintenance failed: reminders/);
  assert.deepEqual(calls,['expiry','reminders']);
});

test('two independent failures are surfaced without leaking raw provider exceptions', async () => {
  const reports=[];
  await assert.rejects(runScheduledDuties({}, [
    ['expiry', async()=>{throw new Error('private database value');}],
    ['reminders', async()=>{throw new RangeError('secret address');}],
  ], (...args)=>reports.push(args)), /maintenance failed: expiry, reminders/);
  assert.equal(reports.length,2);
  assert.deepEqual(reports.map(x=>x[1].error_type),['Error','RangeError']);
  assert.doesNotMatch(JSON.stringify(reports), /private database value|secret address/);
});
