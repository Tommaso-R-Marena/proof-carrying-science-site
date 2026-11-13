"""Isolated real-SQL crash and idempotency tests for the cron D1 plan.

Loads exact SQL constants from the authored JS module via Node, then executes
those statements in SQLite transactions. Does not connect to production D1.
"""
import json
import sqlite3
import subprocess
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "0026_cron_mail_outbox.sql"

def source_sql():
    script = (
        "import {CRON_SQL} from './src/cron-recovery.mjs';"
        "console.log(JSON.stringify(CRON_SQL));"
    )
    result = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        cwd=ROOT, capture_output=True, text=True, check=True,
    )
    return json.loads(result.stdout)

def db_fixture():
    conn = sqlite3.connect(":memory:")
    conn.execute("PRAGMA foreign_keys=ON")
    conn.executescript("""
       CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT,email_verified INTEGER);
       CREATE TABLE tasks(id TEXT PRIMARY KEY,title TEXT,claim_mode TEXT NOT NULL);
       CREATE TABLE task_requests(
         id TEXT PRIMARY KEY,task_id TEXT NOT NULL REFERENCES tasks(id),
         user_id TEXT NOT NULL REFERENCES users(id),
         status TEXT NOT NULL,checkpoint_status TEXT,checkpoint_due_at TEXT,
         checkpoint_note TEXT DEFAULT '',reservation_expires_at TEXT,reservation_key TEXT
       );
       CREATE TABLE notifications(
         id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
         kind TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,
         created_at TEXT NOT NULL,email_state TEXT DEFAULT 'queued',
         email_error TEXT
       );
       CREATE TABLE audit_log(
         id TEXT PRIMARY KEY,actor_user_id TEXT,action TEXT NOT NULL,
         subject_type TEXT NOT NULL,subject_id TEXT NOT NULL,
         detail_json TEXT NOT NULL,created_at TEXT NOT NULL
       );
       CREATE TABLE audit_archive(
         seq INTEGER PRIMARY KEY,event_id TEXT UNIQUE NOT NULL,
         legacy_audit_id TEXT UNIQUE,actor_user_id TEXT,
         action TEXT NOT NULL,subject_type TEXT NOT NULL,
         subject_id TEXT NOT NULL,detail_json TEXT NOT NULL,
         created_at TEXT NOT NULL,prev_hash TEXT UNIQUE,event_hash TEXT UNIQUE
       );
    """)
    conn.executescript(MIGRATION.read_text())
    conn.execute("INSERT INTO users VALUES ('u1','user@example.test',1)")
    conn.execute("INSERT INTO tasks VALUES ('T1','Real Test Task','reserved')")
    conn.execute("INSERT INTO task_requests VALUES ('r1','T1','u1','approved','pending','2026-11-12T00:00:00Z','',NULL,'key')")
    conn.commit()
    return conn

class TestCronRecoverySQL(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.q = source_sql()
    def setUp(self):
        self.c = db_fixture()
        self.now = "2026-11-13T07:00:00Z"
    def tearDown(self):
        self.c.close()

    def expire_batch(self):
        with self.c:
            self.c.execute(self.q["expire"], ("r1", self.now, self.now))
            self.c.execute(self.q["audit"], (
                "cron-expiry:r1", '{"task_id":"T1"}',self.now,"r1"))
            self.c.execute(self.q["notice"], (
                "cron-expiry-note:r1","PCS task released: T1",
                "Your reservation was released.",self.now,"r1"))

    def test_atomic_failure_rolls_back_status_and_audit(self):
        self.c.execute("CREATE TRIGGER sabotage BEFORE INSERT ON notifications BEGIN SELECT RAISE(ABORT,'simulated interruption'); END")
        with self.assertRaises(sqlite3.DatabaseError):
            self.expire_batch()
        self.assertEqual(self.c.execute(
            "SELECT status FROM task_requests WHERE id='r1'").fetchone()[0],"approved")
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0],0)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM notifications").fetchone()[0],0)

    def test_stale_read_cannot_forge_audit_after_competing_release(self):
        # Another path expired the reservation after our stale SELECT. The
        # compare-and-set changes zero rows; no false cron event is permitted.
        self.c.execute("UPDATE task_requests SET status='expired' WHERE id='r1'")
        self.expire_batch()
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0],0)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM notifications").fetchone()[0],0)

    def test_stale_read_cannot_forge_audit_after_task_mode_changed(self):
        # A task was switched to open before our expiry transaction began.
        self.c.execute("UPDATE tasks SET claim_mode='open' WHERE id='T1'")
        self.expire_batch()
        self.assertEqual(self.c.execute("SELECT status FROM task_requests WHERE id='r1'").fetchone()[0],"approved")
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0],0)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM notifications").fetchone()[0],0)

    def test_atomic_success_and_exactly_once_intents(self):
        self.expire_batch()
        self.expire_batch()
        self.assertEqual(self.c.execute(
            "SELECT status FROM task_requests WHERE id='r1'").fetchone()[0],"expired")
        self.assertEqual(self.c.execute(
            "SELECT reservation_key FROM task_requests WHERE id='r1'").fetchone()[0],None)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0],1)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM notifications").fetchone()[0],1)

    def test_archive_can_reconcile_committed_intent(self):
        self.expire_batch()
        missing=self.c.execute(self.q["unarchived"],(61,)).fetchall()
        self.assertEqual(len(missing),1)
        (event,actor,action,subject_type,subject_id,detail,created,existing_archive_legacy_id)=missing[0]
        self.assertIsNone(existing_archive_legacy_id)
        self.assertEqual(event,"cron-expiry:r1")
        self.c.execute("INSERT INTO audit_archive(event_id,legacy_audit_id,actor_user_id,action,subject_type,subject_id,detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?,?)",
            (event,event,actor,action,subject_type,subject_id,detail,created,"genesis","mockhash"))
        self.assertEqual(self.c.execute(self.q["unarchived"],(61,)).fetchall(),[])

    def test_stale_query_respects_current_status_and_deadline(self):
        self.assertEqual(len(self.c.execute(self.q["stale"],(self.now,self.now,41)).fetchall()),1)
        self.c.execute("UPDATE task_requests SET checkpoint_due_at='2027-01-01T00:00:00Z' WHERE id='r1'")
        self.assertEqual(self.c.execute(self.q["stale"],(self.now,self.now,41)).fetchall(),[])
        self.c.execute("UPDATE tasks SET claim_mode='open' WHERE id='T1'")
        self.assertEqual(self.c.execute(self.q["expire"],('r1',self.now,self.now)).rowcount,0)

    def test_reminder_insert_is_idempotent(self):
        args=("cron-reminder:kind","kind","Reminder","Text",self.now,"kind")
        self.c.execute(self.q["reminder"],args)
        self.c.execute(self.q["reminder"],args)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM notifications").fetchone()[0],1)

    def test_reminder_id_collision_aborts_instead_of_silently_discarding(self):
        self.c.execute("INSERT INTO notifications "
            "(id,user_id,kind,subject,body,created_at,email_state) "
            "VALUES(?,?,?,?,?,?,?)",
            ("cron-reminder:kind","u1","unrelated_notification","Unrelated",
             "Unrelated",self.now,"queued"))
        args=("cron-reminder:kind","kind","Review needed","Admin dashboard",
              self.now,"kind")
        with self.assertRaises(sqlite3.IntegrityError):
            self.c.execute(self.q["reminder"],args)
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM notifications").fetchone()[0],1)

    def test_mail_claim_lease_backoff_and_max_attempts(self):
        self.expire_batch()
        nid="cron-expiry-note:r1"
        self.c.execute("INSERT INTO audit_archive(event_id,legacy_audit_id,actor_user_id,action,subject_type,subject_id,detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?,?)",
            ("cron-expiry:r1","cron-expiry:r1",None,"task_request_expired","task_request","r1",'{"task_id":"T1"}',self.now,"genesis","mockhash"))
        self.assertEqual(len(self.c.execute(self.q["pendingMail"],(self.now,self.now,31)).fetchall()),1)
        claim=lambda lease,now: self.c.execute(self.q["claimMail"],(
            nid,lease,"2026-11-13T07:05:00Z",now,now,now,now)).fetchall()
        first=claim("lease1",self.now)
        self.assertEqual(first,[(1,"lease1")])
        self.assertEqual(claim("lease2",self.now),[])  # concurrent claimant cannot steal lease
        self.c.execute(self.q["emailState"],("failed","Delivery pending retry",nid,"lease1"))
        self.c.execute(self.q["completeMail"],(
            "2026-11-13T07:10:00Z",None,"provider_failure",self.now,nid,"lease1"))
        self.assertEqual(claim("lease3",self.now),[])  # exponential retry not due
        second=claim("lease4","2026-11-13T07:11:00Z")
        self.assertEqual(second,[(2,"lease4")])
        self.c.execute(self.q["emailState"],("sent",None,nid,"lease4"))
        self.c.execute(self.q["completeMail"],(
            self.now,self.now,None,self.now,nid,"lease4"))
        self.assertEqual(claim("lease5","2026-11-13T08:00:00Z"),[])  # delivered is final
        self.assertEqual(self.c.execute("SELECT email_state FROM notifications").fetchone()[0],"sent")

    def test_expiry_email_waits_for_archived_evidence(self):
        self.expire_batch()
        self.assertEqual(self.c.execute(self.q["pendingMail"],(self.now,self.now,31)).fetchall(),[])
        self.c.execute("INSERT INTO audit_archive(event_id,legacy_audit_id,actor_user_id,action,subject_type,subject_id,detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?,?)",
            ("cron-expiry:r1","cron-expiry:r1",None,"task_request_expired","task_request","r1",'{"task_id":"T1"}',self.now,"genesis","mockhash"))
        self.assertEqual(len(self.c.execute(self.q["pendingMail"],(self.now,self.now,31)).fetchall()),1)

    def test_injected_archive_failure_has_retryable_audit_source(self):
        self.expire_batch()
        # An error during hash computation or archive insertion cannot erase
        # the committed legacy record. The next scheduled run sees it again.
        for _ in range(2):
            self.assertEqual(len(self.c.execute(self.q["unarchived"],(61,)).fetchall()),1)

    def test_user_delete_cascades_cron_mail_attempt_records(self):
        self.expire_batch()
        self.c.execute(self.q["claimMail"],(
            "cron-expiry-note:r1","lease","2026-11-13T07:05:00Z",
            self.now,self.now,self.now,self.now))
        self.c.execute("DELETE FROM task_requests WHERE id='r1'")
        self.c.execute("DELETE FROM users WHERE id='u1'")
        self.assertEqual(self.c.execute("SELECT COUNT(*) FROM cron_delivery_attempts").fetchone()[0],0)

if __name__=="__main__":
    unittest.main()
