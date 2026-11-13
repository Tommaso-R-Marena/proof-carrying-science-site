/**
 * Crash-recoverable scheduled maintenance for PCS Commons.
 * D1 batch is one transaction; a failed write rolls all statements back.
 * Receipt archive reconciliation is idempotent through archiveLeanEvent.
 * Email delivery is at-least-once, NEVER guaranteed exactly-once.
 */
export const CRON_EXPIRY_LIMIT = 40;
export const CRON_ARCHIVE_LIMIT = 60;
export const CRON_MAIL_LIMIT = 30;
export const CRON_MAIL_MAX_ATTEMPTS = 5;
export const CRON_SQL = Object.freeze({
  stale: "SELECT r.id,r.user_id,t.id AS task_id,t.title,u.email_verified FROM task_requests r JOIN tasks t ON t.id=r.task_id JOIN users u ON u.id=r.user_id WHERE r.status='approved' AND t.claim_mode!='open' AND ((r.checkpoint_status='pending' AND r.checkpoint_due_at IS NOT NULL AND r.checkpoint_due_at<=? AND COALESCE(r.checkpoint_note,'')='') OR (r.reservation_expires_at IS NOT NULL AND r.reservation_expires_at<=?)) ORDER BY COALESCE(r.reservation_expires_at,r.checkpoint_due_at),r.id LIMIT ?",
  expire: "UPDATE task_requests SET status='expired',checkpoint_status=CASE WHEN checkpoint_status='pending' THEN 'missed' ELSE checkpoint_status END,reservation_key=NULL WHERE id=? AND status='approved' AND EXISTS(SELECT 1 FROM tasks t WHERE t.id=task_requests.task_id AND t.claim_mode!='open') AND ((checkpoint_status='pending' AND checkpoint_due_at IS NOT NULL AND checkpoint_due_at<=? AND COALESCE(checkpoint_note,'')='') OR (reservation_expires_at IS NOT NULL AND reservation_expires_at<=?))",
  audit: "INSERT OR IGNORE INTO audit_log(id,actor_user_id,action,subject_type,subject_id,detail_json,created_at) SELECT ?,NULL,'task_request_expired','task_request',r.id,?,? FROM task_requests r WHERE r.id=? AND r.status='expired'",
  notice: "INSERT OR IGNORE INTO notifications(id,user_id,kind,subject,body,created_at,email_state) SELECT ?,r.user_id,'task_expired',?,?,?,'queued' FROM task_requests r WHERE r.id=? AND r.status='expired'",
  unarchived: "SELECT l.id,l.actor_user_id,l.action,l.subject_type,l.subject_id,l.detail_json,l.created_at FROM audit_log l LEFT JOIN audit_archive a ON a.legacy_audit_id=l.id WHERE l.action='task_request_expired' AND l.id LIKE 'cron-expiry:%' AND a.legacy_audit_id IS NULL ORDER BY l.created_at,l.id LIMIT ?",
  reminder: "INSERT OR IGNORE INTO notifications(id,user_id,kind,subject,body,created_at,email_state) SELECT ?,NULL,?,?,?,?,'queued' WHERE NOT EXISTS(SELECT 1 FROM notifications WHERE kind=?)",
  pendingMail: "SELECT n.id,n.user_id,n.kind,n.subject,n.body,n.email_state,u.email AS user_email,u.email_verified FROM notifications n LEFT JOIN users u ON u.id=n.user_id LEFT JOIN cron_delivery_attempts a ON a.notification_id=n.id WHERE n.id LIKE 'cron-%' AND n.email_state IN ('queued','failed') AND COALESCE(a.attempt_count,0)<5 AND (a.next_attempt_at IS NULL OR a.next_attempt_at<=?) AND (a.lease_until IS NULL OR a.lease_until<=?) ORDER BY n.created_at,n.id LIMIT ?",
  claimMail: "INSERT INTO cron_delivery_attempts(notification_id,attempt_count,lease_id,lease_until,next_attempt_at,updated_at) VALUES(?,1,?,?,?,?) ON CONFLICT(notification_id) DO UPDATE SET attempt_count=cron_delivery_attempts.attempt_count+1,lease_id=excluded.lease_id,lease_until=excluded.lease_until,updated_at=excluded.updated_at WHERE cron_delivery_attempts.attempt_count<5 AND cron_delivery_attempts.delivered_at IS NULL AND cron_delivery_attempts.next_attempt_at<=? AND (cron_delivery_attempts.lease_until IS NULL OR cron_delivery_attempts.lease_until<=?) RETURNING attempt_count,lease_id",
  emailState: "UPDATE notifications SET email_state=?,email_error=? WHERE id=? AND EXISTS(SELECT 1 FROM cron_delivery_attempts a WHERE a.notification_id=notifications.id AND a.lease_id=?)",
  completeMail: "UPDATE cron_delivery_attempts SET lease_id=NULL,lease_until=NULL,next_attempt_at=?,delivered_at=?,last_error_class=?,updated_at=? WHERE notification_id=? AND lease_id=?",
});

function errorType(error) {
  return typeof error?.name === 'string' && /^[A-Za-z][A-Za-z0-9_]{0,39}$/.test(error.name) ? error.name : 'Error';
}
function report(operation,error) {
  // Do not log provider/SQLite error messages: they may include user data.
  console.error('PCS cron recovery failure',{operation,error_type:errorType(error)});
}
function addMillis(iso,millis) {
  return new Date(new Date(iso).getTime()+millis).toISOString();
}

export async function expireReservationsAtomically(env,now=new Date().toISOString()) {
  const db=env.COMMONS_DB;
  const found=(await db.prepare(CRON_SQL.stale).bind(now,now,CRON_EXPIRY_LIMIT+1).all()).results||[];
  let errors=0,committed=0;
  for(const row of found.slice(0,CRON_EXPIRY_LIMIT)) {
    const id=String(row.id);
    try {
      const outcome=await db.batch([
        db.prepare(CRON_SQL.expire).bind(id,now,now),
        db.prepare(CRON_SQL.audit).bind('cron-expiry:'+id,JSON.stringify({task_id:row.task_id}),now,id),
        db.prepare(CRON_SQL.notice).bind(
          'cron-expiry-note:'+id,
          'PCS task released: '+row.task_id,
          'Your reservation for '+row.task_id+' — '+row.title+
          ' was released because its checkpoint or reservation deadline passed. You may apply again later.\n',
          now,id
        ),
      ]);
      // D1 exposes changes on each transactional result. A concurrent
      // status transition that no longer qualifies must not count as ours.
      if(Number(outcome?.[0]?.meta?.changes ?? 1)>0) committed++;
    } catch(error) {
      errors++;
      report('expire_transaction',error);
    }
  }
  if(found.length>CRON_EXPIRY_LIMIT) throw new Error('PCS cron expiry backlog exceeds bounded per-run limit');
  if(errors) throw new Error('PCS cron expiry transaction failure count: '+errors);
  return committed;
}

/** Replay durable audit intents after interrupted archive hashing/appends. */
export async function reconcileExpiryArchive(env,archiveEvent) {
  const rows=(await env.COMMONS_DB.prepare(CRON_SQL.unarchived).bind(CRON_ARCHIVE_LIMIT+1).all()).results||[];
  let errors=0;
  for(const row of rows.slice(0,CRON_ARCHIVE_LIMIT)) {
    try {
      await archiveEvent({
        eventId:row.id,legacyAuditId:row.id,actorUserId:row.actor_user_id,
        action:row.action,subjectType:row.subject_type,subjectId:row.subject_id,
        detailJson:row.detail_json,createdAt:row.created_at,
      });
    } catch(error) {errors++;report('archive_reconciliation',error);}
  }
  if(rows.length>CRON_ARCHIVE_LIMIT) throw new Error('PCS cron archive reconciliation backlog');
  if(errors) throw new Error('PCS cron archive reconciliation failure count: '+errors);
  return rows.length;
}

export async function cleanupExpiredAuth(env,now,expiredRateWindow) {
  const db=env.COMMONS_DB;
  return db.batch([
    db.prepare("UPDATE competency_evaluations SET status='expired' WHERE status='open' AND expires_at<=?").bind(now),
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').bind(now),
    db.prepare('DELETE FROM admin_sessions WHERE expires_at<=?').bind(now),
    db.prepare('DELETE FROM email_verification_tokens WHERE expires_at<=? OR used_at IS NOT NULL').bind(now),
    db.prepare('DELETE FROM rate_limits WHERE window_start<?').bind(expiredRateWindow),
  ]);
}

/** A unique, repeatable notification intent precedes any external send. */
export async function queueCronReminder(env,{kind,subject,body,now=new Date().toISOString()}) {
  return env.COMMONS_DB.prepare(CRON_SQL.reminder)
    .bind('cron-reminder:'+kind,kind,subject,body,now,kind).run();
}

/** Limited retries with a claim lease. External delivery can still duplicate
 * if the provider accepts before D1 commits the acknowledgment. */
export async function deliverCronMail(env,sendMail,now=new Date().toISOString()) {
  const db=env.COMMONS_DB;
  const selected=(await db.prepare(CRON_SQL.pendingMail).bind(now,now,CRON_MAIL_LIMIT+1).all()).results||[];
  let sent=0,failed=0;
  for(const n of selected.slice(0,CRON_MAIL_LIMIT)) {
    const adminMail=n.kind.startsWith('task_request_')||n.kind.startsWith('skill_review_');
    const address=adminMail?env.ADMIN_EMAIL
      :(n.kind==='task_expired'&&Number(n.email_verified)===1?n.user_email:null);
    if(!address) {
      await db.prepare("UPDATE notifications SET email_state='disabled',email_error='No verified recipient' WHERE id=? AND email_state IN ('queued','failed')").bind(n.id).run();
      continue;
    }
    const leaseId=crypto.randomUUID();
    let claimed;
    try {
      claimed=await db.prepare(CRON_SQL.claimMail)
        .bind(n.id,leaseId,addMillis(now,5*60*1000),now,now,now,now).all();
    } catch(error) {failed++;report('claim_mail',error);continue;}
    if(!(claimed.results||[]).length) continue;
    const count=Number(claimed.results[0].attempt_count);
    let state='failed';
    try {
      const outcome=await sendMail(env,address,n.subject,n.body);
      state=outcome?.state==='sent'?'sent':outcome?.state==='disabled'?'disabled':'failed';
    } catch(error) {report('provider_mail',error);}
    const delivered=state==='sent';
    const retryAt=addMillis(now,delivered?0:Math.min(86400,300*Math.pow(2,count-1))*1000);
    const exhausted=!delivered && state!=='disabled' && count>=CRON_MAIL_MAX_ATTEMPTS;
    if(exhausted) console.error('PCS cron mail retry limit exhausted',{error_type:'delivery_failed'});
    try {
      await db.batch([
        db.prepare(CRON_SQL.emailState).bind(state,delivered?null:(state==='disabled'?'Transport disabled':exhausted?'Retry limit exhausted; manual review required':'Delivery pending retry'),n.id,leaseId),
        db.prepare(CRON_SQL.completeMail).bind(retryAt,delivered?now:null,delivered?null:(state==='disabled'?'disabled':'provider_failure'),now,n.id,leaseId),
      ]);
      if(delivered) sent++;else failed++;
    } catch(error) {failed++;report('complete_mail',error);}
  }
  if(selected.length>CRON_MAIL_LIMIT) throw new Error('PCS cron mail backlog exceeds bounded per-run limit');
  if(failed) throw new Error('PCS cron mail incomplete delivery count: '+failed);
  return sent;
}
