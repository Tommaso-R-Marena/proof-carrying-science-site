import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {CRON_SQL,deliverCronMail} from '../src/cron-recovery.mjs';

const source=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const a=source.indexOf('async function sendResendMail(');
const b=source.indexOf('async function notify(',a);
assert(a>=0&&b>a,'Worker mail transport source markers not found');

function harness(fetchFn) {
  return new Function('fetch','emailTransportConfigured','mailRelayConfigured',
    'resendConfigured','sendRelayMail',source.slice(a,b)+
    '\nreturn {sendMail,sendResendMail};')(
      fetchFn,()=>true,()=>false,()=>true,async()=>({state:'failed'})
    );
}

test('Cron Resend request carries exact stable provider idempotency header',async()=>{
  const requests=[];
  const {sendMail}=harness(async(url,options)=>{
    requests.push({url,options});
    return {ok:true,status:200};
  });
  const env={
    RESEND_API_KEY:'SYNTHETIC_TEST_KEY',
    MAIL_FROM:'pcs-fixture@pcs.invalid',
    ADMIN_EMAIL:'admin@pcs.invalid',
  };
  const key='pcs-cron-v1-'+'a'.repeat(64);
  for(let i=0;i<2;i++){
    assert.equal((await sendMail(env,'contributor@pcs.invalid',
      'Review reminder','No personal data',{idempotencyKey:key})).state,'sent');
  }
  assert.equal(requests.length,2);
  for(const request of requests) {
    assert.equal(request.url,'https://api.resend.com/emails');
    assert.equal(request.options.headers['Idempotency-Key'],key);
    assert.equal(JSON.parse(request.options.body).to[0],'contributor@pcs.invalid');
    assert.equal(request.options.headers['Idempotency-Key'].length,76);
  }
});

test('Non-Cron transactional mail does not receive an invented idempotency key',async()=>{
  let headers;
  const {sendMail}=harness(async(url,options)=>{
    headers=options.headers;return {ok:true,status:200};
  });
  const env={RESEND_API_KEY:'SYNTHETIC',MAIL_FROM:'a@pcs.invalid'};
  assert.equal((await sendMail(env,'user@pcs.invalid','Verify','Body')).state,'sent');
  assert.equal(Object.hasOwn(headers,'Idempotency-Key'),false);
});

function mockedDb(notification) {
  return {
    prepare(sql) {
      return {
        bind(...args) {
          return {
            all:async()=>{
              if(sql===CRON_SQL.pendingMail)return {results:[notification]};
              if(sql===CRON_SQL.claimMail)return {results:[{attempt_count:1}]};
              return {results:[]};
            },
            run:async()=>({success:true})
          };
        }
      };
    },
    batch:async q=>q.map(()=>({success:true}))
  };
}

test('same Cron notification ID yields same opaque key on replay; different ID yields different key',async()=>{
  const keys=[];
  const send=async(env,to,subject,body,options)=>{
    assert.equal(options.idempotencyKey.startsWith('pcs-cron-v1-'),true);
    assert.match(options.idempotencyKey,/^pcs-cron-v1-[0-9a-f]{64}$/);
    keys.push(options.idempotencyKey);
    return {state:'sent'};
  };
  const notification={
    id:'cron-reminder:private-uuid-identifier',
    user_id:null,kind:'skill_review_target_admin:opaque',
    subject:'Review',body:'Please review'
  };
  const env={COMMONS_DB:mockedDb(notification),ADMIN_EMAIL:'admin@example.invalid'};
  const now='2026-11-13T07:00:00Z';
  assert.equal(await deliverCronMail(env,send,now),1);
  assert.equal(await deliverCronMail(env,send,now),1);
  assert.equal(keys[0],keys[1]);
  assert.doesNotMatch(keys[0],/private-uuid|admin@|opaque/);
  notification.id='cron-reminder:different';
  assert.equal(await deliverCronMail(env,send,now),1);
  assert.notEqual(keys[0],keys[2]);
});
