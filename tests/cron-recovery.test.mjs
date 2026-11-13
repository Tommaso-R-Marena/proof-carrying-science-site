import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CRON_SQL, CRON_EXPIRY_LIMIT, CRON_MAIL_LIMIT,
  expireReservationsAtomically, reconcileExpiryArchive,
  cleanupExpiredAuth, queueCronReminder, deliverCronMail,
} from '../src/cron-recovery.mjs';

function mockDb(routes={}) {
  const trace=[];
  const db={
    trace,
    prepare(sql) {
      return {
        bind(...args) {
          return {
            sql,args,
            all:async()=> {
              trace.push({type:'all',sql,args});
              return {results:await (routes.all?.(sql,args)??[])};
            },
            run:async()=> {
              trace.push({type:'run',sql,args});
              return routes.run?.(sql,args)??{success:true};
            },
          };
        }
      };
    },
    async batch(statements) {
      trace.push({type:'batch',statements});
      if(routes.batch) return routes.batch(statements);
      return statements.map(()=>({success:true}));
    }
  };
  return db;
}
const t0='2026-11-13T07:00:00.000Z';

test('expiry atomically batches guarded UPDATE, audit intent, and user notification', async()=>{
  const row={id:'request-1',task_id:'PCS-17',title:'Test science task',user_id:'person-1'};
  const db=mockDb({all:(sql)=>sql===CRON_SQL.stale?[row]:[]});
  assert.equal(await expireReservationsAtomically({COMMONS_DB:db},t0),1);
  const batch=db.trace.find(v=>v.type==='batch');
  assert.equal(batch.statements.length,3);
  assert.deepEqual(batch.statements.map(v=>v.sql),[CRON_SQL.expire,CRON_SQL.audit,CRON_SQL.notice]);
  assert.equal(batch.statements[1].args[0],'cron-expiry:request-1');
  assert.equal(batch.statements[2].args[0],'cron-expiry-note:request-1');
  assert.equal(batch.statements[2].args[4],'request-1');
});

test('expiry reports an injected transactional write error, never claiming success',async()=>{
  const db=mockDb({
    all:sql=>sql===CRON_SQL.stale?[{id:'r1',task_id:'TASK',title:'title'}]:[],
    batch:async()=>{throw new Error('confidential user data');}
  });
  const oldError=console.error;console.error=()=>{};
  try {
    await assert.rejects(expireReservationsAtomically({COMMONS_DB:db},t0),/expiry transaction failure count: 1/);
  } finally {console.error=oldError;}
});

test('expiry detects unprocessed backlog instead of silently claiming all work is done',async()=>{
  const db=mockDb({all:sql=>sql===CRON_SQL.stale
    ?Array.from({length:CRON_EXPIRY_LIMIT+1},(_,i)=>({id:'r'+i,task_id:'task',title:'Test'})):[]});
  await assert.rejects(expireReservationsAtomically({COMMONS_DB:db},t0),/expiry backlog/);
});

test('audit recovery consumes committed legacy intents with exact stable identities',async()=>{
  const event={
    id:'cron-expiry:r1',actor_user_id:null,action:'task_request_expired',
    subject_type:'task_request',subject_id:'r1',
    detail_json:'{"task_id":"TASK"}',created_at:t0
  };
  const db=mockDb({all:sql=>sql===CRON_SQL.unarchived?[event]:[]});
  const calls=[];
  const count=await reconcileExpiryArchive({COMMONS_DB:db},async v=>calls.push(v));
  assert.equal(count,1);
  assert.deepEqual(calls,[{
    eventId:event.id,legacyAuditId:event.id,actorUserId:null,
    action:event.action,subjectType:event.subject_type,subjectId:event.subject_id,
    detailJson:event.detail_json,createdAt:t0
  }]);
});

test('audit archive failure propagates and can be replayed next run',async()=>{
  const event={id:'cron-expiry:r1',actor_user_id:null,action:'task_request_expired',subject_type:'task_request',subject_id:'r1',detail_json:'{}',created_at:t0};
  const db=mockDb({all:sql=>sql===CRON_SQL.unarchived?[event]:[]});
  let attempts=0;
  const oldError=console.error;console.error=()=>{};
  try {
    await assert.rejects(reconcileExpiryArchive({COMMONS_DB:db},async()=>{attempts++;throw new Error('crash');}),/archive reconciliation failure/);
  }finally{console.error=oldError;}
  assert.equal(attempts,1);
  await reconcileExpiryArchive({COMMONS_DB:db},async()=>{attempts++;});
  assert.equal(attempts,2);
});

test('auth cleanup uses one D1 transaction for all five statements',async()=>{
  const db=mockDb();
  await cleanupExpiredAuth({COMMONS_DB:db},t0,'2026-11-11T07:00:00.000Z');
  const batch=db.trace.find(v=>v.type==='batch');
  assert.equal(batch.statements.length,5);
  assert(batch.statements.some(s=>s.sql.includes('admin_sessions')));
  assert(batch.statements.some(s=>s.sql.includes('rate_limits')));
});

test('cron reminders queue a durable notification but never directly send mail',async()=>{
  const db=mockDb();
  await queueCronReminder({COMMONS_DB:db},{kind:'task_request_target_admin:r1',subject:'Review',body:'Please review',now:t0});
  const run=db.trace.find(x=>x.type==='run');
  assert.equal(run.sql,CRON_SQL.reminder);
  assert.equal(run.args[0],'cron-reminder:task_request_target_admin:r1');
});

test('mail outbox claims, dispatches, and records one success in two-statement transaction',async()=>{
  const n={id:'cron-expiry-note:r1',kind:'task_expired',subject:'Task released',body:'Message',
    user_email:'verified@example.test',email_verified:1,user_id:'u1'};
  const db=mockDb({all:(sql)=>{
    if(sql===CRON_SQL.pendingMail)return [n];
    if(sql===CRON_SQL.claimMail)return [{attempt_count:1,lease_id:'one'}];
    return [];
  }});
  const sent=[];
  const result=await deliverCronMail({COMMONS_DB:db},async (env,to,subject,body)=>{
    sent.push({to,subject,body});return {state:'sent'};
  },t0);
  assert.equal(result,1);
  assert.deepEqual(sent,[{to:n.user_email,subject:n.subject,body:n.body}]);
  assert.equal(db.trace.find(x=>x.type==='batch').statements.length,2);
  assert.equal(db.trace.find(x=>x.type==='batch').statements[0].args[0],'sent');
});

test('retryable provider failure is counted and not mislabeled successful',async()=>{
  const n={id:'cron-reminder:abc',kind:'task_request_target_admin:abc',subject:'Admin',body:'Message'};
  const db=mockDb({all:(sql)=>sql===CRON_SQL.pendingMail?[n]
    :sql===CRON_SQL.claimMail?[{attempt_count:1,lease_id:'lease'}]:[]});
  await assert.rejects(deliverCronMail({COMMONS_DB:db,ADMIN_EMAIL:'owner@example.test'},
    async()=>({state:'failed'}),t0),/incomplete delivery count: 1/);
  const batch=db.trace.find(x=>x.type==='batch');
  assert.equal(batch.statements[0].args[0],'failed');
  assert.equal(batch.statements[1].args[2],'provider_failure');
});

test('unverified expired-task email is disabled without sending',async()=>{
  const n={id:'cron-expiry-note:r1',kind:'task_expired',subject:'Task',body:'Message',
    user_email:'unverified@example.test',email_verified:0};
  const db=mockDb({all:sql=>sql===CRON_SQL.pendingMail?[n]:[]});
  let called=false;
  await deliverCronMail({COMMONS_DB:db},async()=>{called=true;return {state:'sent'};},t0);
  assert.equal(called,false);
  assert(db.trace.some(x=>x.type==='run'&&x.args[0]===n.id));
});

test('mail job detects bounded backlog and does not silently drain unbounded work',async()=>{
  const db=mockDb({all:sql=>sql===CRON_SQL.pendingMail
    ?Array.from({length:CRON_MAIL_LIMIT+1},(_,i)=>({id:'n'+i,kind:'task_expired',email_verified:0})):[]});
  await assert.rejects(deliverCronMail({COMMONS_DB:db},async()=>({state:'sent'}),t0),/mail backlog/);
});

test('last failed email attempt is retained for manual intervention',async()=>{
  const n={id:'cron-reminder:final',kind:'task_request_overdue_admin:final',subject:'Admin',body:'Body'};
  const db=mockDb({all:sql=>sql===CRON_SQL.pendingMail?[n]
    :sql===CRON_SQL.claimMail?[{attempt_count:5,lease_id:'lease'}]:[]});
  const reports=[],old=console.error;console.error=(...args)=>reports.push(args);
  try {
    await assert.rejects(deliverCronMail({COMMONS_DB:db,ADMIN_EMAIL:'admin@example.test'},
      async()=>({state:'failed'}),t0),/incomplete delivery count/);
  } finally {console.error=old;}
  assert(db.trace.find(x=>x.type==='batch').statements[0].args[1].includes('manual review'));
  assert(reports.some(x=>x[0]==='PCS cron mail retry limit exhausted'));
});

test('provider accepts before failed D1 acknowledgment: report failure, do not claim exactly-once',async()=>{
  const n={id:'cron-reminder:ambiguous',kind:'task_request_target_admin:ambiguous',subject:'Subject',body:'Text'};
  const db=mockDb({
    all:sql=>sql===CRON_SQL.pendingMail?[n]
      :sql===CRON_SQL.claimMail?[{attempt_count:1,lease_id:'lease'}]:[],
    batch:async()=>{throw new Error('D1 acknowledgment interrupted');}
  });
  const reports=[],old=console.error;console.error=(...args)=>reports.push(args);
  let providerCalls=0;
  try {
    await assert.rejects(deliverCronMail({COMMONS_DB:db,ADMIN_EMAIL:'admin@example.test'},
      async()=>{providerCalls++;return{state:'sent'};},t0),/incomplete delivery count/);
  } finally {console.error=old;}
  assert.equal(providerCalls,1);
  assert(reports.some(x=>x[0]==='PCS cron recovery failure'&&x[1].operation==='complete_mail'));
});

test('temporarily unavailable mail transport remains failed and eligible for retry',async()=>{
  const n={id:'cron-reminder:relay-offline',kind:'task_request_target_admin:relay-offline',
    subject:'Review',body:'Body'};
  const db=mockDb({all:sql=>sql===CRON_SQL.pendingMail?[n]
    :sql===CRON_SQL.claimMail?[{attempt_count:1,lease_id:'lease'}]:[]});
  await assert.rejects(deliverCronMail({COMMONS_DB:db,ADMIN_EMAIL:'owner@example.test'},
    async()=>({state:'disabled'}),t0),/incomplete delivery count/);
  const statements=db.trace.find(x=>x.type==='batch').statements;
  assert.equal(statements[0].args[0],'failed');
  assert.match(statements[0].args[1],/retry scheduled/);
  assert.equal(statements[1].args[2],'transport_unavailable');
});
