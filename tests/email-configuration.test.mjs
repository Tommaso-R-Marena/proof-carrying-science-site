import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../src/worker.js';

const request = () => new Request('https://pcs-mail-test.example/api/system/status');

test('missing or partially configured email transport remains explicitly disabled', async () => {
  for (const env of [{}, {RESEND_API_KEY: 'test-only'}, {MAIL_FROM: 'test@example.invalid'},
    {MAIL_RELAY_URL: 'https://relay.example.invalid'}, {MAIL_RELAY_SECRET: 'test-only'}]) {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.email_transport, false);
    assert.equal(body.accounts, true);
  }
});

test('complete Resend or relay configuration is recognized without sending mail', async () => {
  for (const env of [
    {RESEND_API_KEY: 'test-only', MAIL_FROM: 'test@example.invalid'},
    {MAIL_RELAY_URL: 'https://relay.example.invalid', MAIL_RELAY_SECRET: 'test-only'},
  ]) {
    const response = await worker.fetch(request(), env);
    assert.equal(response.status, 200);
    assert.equal((await response.json()).email_transport, true);
  }
});
