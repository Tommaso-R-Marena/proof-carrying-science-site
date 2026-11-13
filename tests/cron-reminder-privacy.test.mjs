import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Run the exact real source implementation with inert injected database and
// notification interfaces; do not load the actual Worker bundle or credentials.
const worker=readFileSync(new URL('../src/worker.js',import.meta.url),'utf8');
const start=worker.indexOf('async function remindPendingReviews(env) {');
const end=worker.indexOf('async function expireStaleWork(env) {',start);
assert(start>=0&&end>start,'Scheduled reminder implementation not found');
const source=worker.slice(start,end);

function fixture() {
  const adminNotices=[],queries=[];
  const task={
    id:'request-privacy-fixture',
    task_id:'pcs-fixture-task',title:'A synthetic scientific review',
    requested_at:'2020-01-01T00:00:00Z',decision_due_at:'2020-01-03T00:00:00Z',
    email:'private+task@fixture.invalid',display_name:'SECRET_TASK_NAME',
    level:6
  };
  const skill={
    user_id:'skill-privacy-fixture',skill:'lean',
    requested_at:'2020-01-01T00:00:00Z',review_due_at:'2020-01-03T00:00:00Z',
    email:'private+skill@fixture.invalid',display_name:'SECRET_SKILL_NAME',
    level:5,source:'private portfolio'
  };
  const db={
    prepare(sql) {
      queries.push(sql);
      return {
        all:async()=>({results:sql.includes('FROM task_requests r')?[task]:[skill]}),
        bind:()=>({first:async()=>null})
      };
    }
  };
  const queueCronReminder=async(env,item)=>adminNotices.push(item);
  const addBusinessDaysIso=(date,count)=>{
    const d=new Date(date);d.setUTCDate(d.getUTCDate()+count);return d.toISOString();
  };
  const nowIso=()=>new Date().toISOString();
  const remind=new Function('queueCronReminder','addBusinessDaysIso','nowIso',
    source+'\nreturn remindPendingReviews;')(
    queueCronReminder,addBusinessDaysIso,nowIso);
  return {remind,env:{COMMONS_DB:db,PUBLIC_ORIGIN:'https://pcs-fixture.invalid'},adminNotices,queries};
}

test('admin review notices do not persist names, addresses, levels, or private source',async()=>{
  const {remind,env,adminNotices}=fixture();
  assert.equal(await remind(env),2);
  assert.equal(adminNotices.length,2);
  const rendered=JSON.stringify(adminNotices);
  for(const secret of ['private+task@fixture.invalid','private+skill@fixture.invalid',
      'SECRET_TASK_NAME','SECRET_SKILL_NAME','private portfolio',
      'Verified level: L6','Verified level: L5']) {
    assert(!rendered.includes(secret),'reminder leaked synthetic private data');
  }
  assert(adminNotices.every(n=>n.subject.includes('PCS')&&n.body.includes('/admin.html#')));
  assert(adminNotices.some(n=>n.kind.startsWith('task_request_')));
  assert(adminNotices.some(n=>n.kind.startsWith('skill_review_')));
});

test('reminder SELECT queries do not fetch unnecessary personal profile columns',async()=>{
  const {remind,env,queries}=fixture();
  await remind(env);
  for(const sql of queries.filter(v=>v.includes('FROM task_requests r')||v.includes('FROM skills sk'))) {
    assert.doesNotMatch(sql,/\bu\.(?:email|display_name|level)\b/);
  }
});

test('admin reminders do not send directly or create public notifications',async()=>{
  const {remind,env,adminNotices}=fixture();
  await remind(env);
  assert(adminNotices.every(n=>!Object.hasOwn(n,'email')));
  assert(adminNotices.every(n=>!Object.hasOwn(n,'userId')));
  assert(adminNotices.every(n=>typeof n.kind==='string'&&n.kind.length));
});
