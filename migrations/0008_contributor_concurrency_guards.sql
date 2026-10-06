-- Concurrency guards for contributor applications, reservations, and generated evaluations.
-- These move policy-critical cardinality limits into D1 so simultaneous requests cannot race past them.

CREATE UNIQUE INDEX IF NOT EXISTS idx_task_requests_one_active_per_user_task
ON task_requests(task_id,user_id)
WHERE status IN ('pending','approved');

CREATE TRIGGER IF NOT EXISTS task_requests_pending_cap
BEFORE INSERT ON task_requests
WHEN NEW.status='pending'
 AND COALESCE((SELECT claim_mode FROM tasks WHERE id=NEW.task_id),'open')!='open'
 AND (
   SELECT COUNT(*)
   FROM task_requests r
   JOIN tasks t ON t.id=r.task_id
   WHERE r.user_id=NEW.user_id
     AND r.status='pending'
     AND t.claim_mode!='open'
 ) >= 2
BEGIN
  SELECT RAISE(ABORT,'PCS pending high-tier application limit');
END;

CREATE TRIGGER IF NOT EXISTS task_requests_reserved_cap
BEFORE UPDATE OF status ON task_requests
WHEN NEW.status='approved'
 AND OLD.status!='approved'
 AND COALESCE((SELECT claim_mode FROM tasks WHERE id=NEW.task_id),'open')!='open'
 AND (
   SELECT COUNT(*)
   FROM task_requests r
   JOIN tasks t ON t.id=r.task_id
   WHERE r.user_id=NEW.user_id
     AND r.status='approved'
     AND t.claim_mode!='open'
 ) >= (
   CASE
     WHEN COALESCE((SELECT level FROM users WHERE id=NEW.user_id),0) < 2 THEN 0
     WHEN COALESCE((SELECT level FROM users WHERE id=NEW.user_id),0) < 4 THEN 1
     ELSE 2
   END
 )
BEGIN
  SELECT RAISE(ABORT,'PCS active reserved task limit');
END;

CREATE TRIGGER IF NOT EXISTS competency_evaluations_daily_cap
BEFORE INSERT ON competency_evaluations
WHEN (
  SELECT COUNT(*)
  FROM competency_evaluations e
  WHERE e.user_id=NEW.user_id
    AND e.skill=NEW.skill
    AND unixepoch(e.created_at) >= unixepoch(NEW.created_at)-86400
) >= 3
BEGIN
  SELECT RAISE(ABORT,'PCS daily evaluation attempt limit');
END;
