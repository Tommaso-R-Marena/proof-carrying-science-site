"""Offline compatibility of staged Cron migration against captured production D1 DDL.

No Cloudflare credentials, production rows, remote DB or backup bytes are used.
This is not an authentic production-data restore or production authorization.
"""
from __future__ import annotations

import json
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from d1_schema_recovery_v2 import restore_schema, schema_rows, synthetic_user, insert

CAPTURE=json.loads((ROOT/"docs/evidence/production-d1-recovery-v2/captured-schema.json").read_text())
MIGRATION=ROOT/"migrations/0026_cron_mail_outbox.sql"
SOURCE=ROOT/"src/cron-recovery.mjs"
NOW="2026-11-13T07:00:00Z"

def javascript_sql():
    code="import {CRON_SQL} from './src/cron-recovery.mjs';console.log(JSON.stringify(CRON_SQL))"
    completed=subprocess.run(["node","--input-type=module","-e",code],
                             capture_output=True,text=True,check=True,cwd=ROOT,timeout=10)
    return json.loads(completed.stdout)

class CronCapturedSchemaRecovery(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.sql=javascript_sql()

    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix="pcs-captured-cron-")
        self.path=Path(self.tmp.name)/"schema.sqlite"
        report=restore_schema(CAPTURE,self.path)
        self.assertTrue(report["capture_identity_equal"])
        self.db=sqlite3.connect(self.path)
        self.db.execute("PRAGMA foreign_keys=ON")
        self.before=schema_rows(self.db)
        self.db.executescript(MIGRATION.read_text())
        self.after=schema_rows(self.db)

    def tearDown(self):
        self.db.close()
        self.tmp.cleanup()

    def seed(self):
        synthetic_user(self.db,"cron-fixture-user")
        insert(self.db,"tasks",{"id":"cron-fixture-task",
            "title":"Synthetic expiration test","summary":"No real user or task",
            "claim_mode":"approval","expected_hours":1,
            "created_at":NOW,"updated_at":NOW})
        insert(self.db,"task_requests",{"id":"cron-fixture-request",
            "task_id":"cron-fixture-task","user_id":"cron-fixture-user",
            "status":"approved","requested_at":"2026-11-10T00:00:00Z",
            "decision_due_at":"2026-11-12T00:00:00Z",
            "checkpoint_status":"pending","checkpoint_due_at":"2026-11-12T01:00:00Z",
            "checkpoint_note":"","reservation_key":"cron-fixture-key"})
        self.db.commit()

    def expire(self):
        with self.db:
            self.db.execute(self.sql["expire"],("cron-fixture-request",NOW,NOW))
            self.db.execute(self.sql["audit"],("cron-expiry:cron-fixture-request",
                           '{"task_id":"cron-fixture-task"}',NOW,"cron-fixture-request"))
            self.db.execute(self.sql["notice"],("cron-expiry-note:cron-fixture-request",
                           "PCS task released: synthetic","Synthetic release",NOW,
                           "cron-fixture-request"))

    def test_only_additive_schema_and_zero_existing_data(self):
        before={v["name"]:v for v in self.before}
        after={v["name"]:v for v in self.after}
        self.assertEqual({k:v for k,v in after.items() if k in before},before)
        self.assertEqual(set(after)-set(before),
            {"cron_delivery_attempts","idx_cron_delivery_due"})
        self.assertEqual(self.db.execute("PRAGMA integrity_check").fetchone(),("ok",))
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(),[])
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM d1_migrations").fetchone()[0],0)

    def test_expiry_and_audit_on_captured_production_constraints(self):
        self.seed()
        self.expire()
        self.assertEqual(self.db.execute(
            "SELECT status,reservation_key FROM task_requests WHERE id='cron-fixture-request'"
        ).fetchone(),("expired",None))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM audit_log WHERE id='cron-expiry:cron-fixture-request'").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM notifications WHERE id='cron-expiry-note:cron-fixture-request'").fetchone()[0],1)
        self.expire()
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM audit_log WHERE action='task_request_expired'").fetchone()[0],1)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(),[])

    def test_failed_notification_insert_rolls_back_every_write(self):
        self.seed()
        self.db.executescript("CREATE TRIGGER cron_test_abort BEFORE INSERT ON notifications "
                              "BEGIN SELECT RAISE(ABORT, 'synthetic write fault'); END;")
        with self.assertRaises(sqlite3.DatabaseError):
            self.expire()
        self.assertEqual(self.db.execute(
            "SELECT status FROM task_requests WHERE id='cron-fixture-request'"
        ).fetchone(),("approved",))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM audit_log WHERE action='task_request_expired'").fetchone()[0],0)

    def test_existing_deterministic_audit_id_rolls_back_expiry(self):
        self.seed()
        # A pre-existing but non-equivalent audit ID is a security collision.
        # INSERT OR IGNORE would let the status change proceed without recording
        # a fresh event. Plain INSERT fails the D1 transaction instead.
        self.db.execute(
            "INSERT INTO audit_log(id,action,subject_type,subject_id,detail_json,created_at) "
            "VALUES(?,?,?,?,?,?)",
            ("cron-expiry:cron-fixture-request","forged_event","task_request",
             "cron-fixture-request","{}",NOW))
        self.db.commit()
        with self.assertRaises(sqlite3.IntegrityError):
            self.expire()
        self.assertEqual(self.db.execute(
            "SELECT status FROM task_requests WHERE id='cron-fixture-request'"
        ).fetchone(),("approved",))
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM notifications WHERE id='cron-expiry-note:cron-fixture-request'"
        ).fetchone()[0],0)

    def test_existing_deterministic_notice_id_rolls_back_expiry_and_audit(self):
        self.seed()
        self.db.execute(
            "INSERT INTO notifications(id,user_id,kind,subject,body,created_at,email_state) "
            "VALUES(?,?,?,?,?,?,?)",
            ("cron-expiry-note:cron-fixture-request","cron-fixture-user",
             "task_expired","Forged notice","Not from expiry",NOW,"queued"))
        self.db.commit()
        with self.assertRaises(sqlite3.IntegrityError):
            self.expire()
        self.assertEqual(self.db.execute(
            "SELECT status FROM task_requests WHERE id='cron-fixture-request'"
        ).fetchone(),("approved",))
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM audit_log WHERE id='cron-expiry:cron-fixture-request'"
        ).fetchone()[0],0)

    def test_stale_read_does_not_forge_legacy_audit(self):
        self.seed()
        self.db.execute("UPDATE tasks SET claim_mode='open' WHERE id='cron-fixture-task'")
        self.expire()
        self.assertEqual(self.db.execute(
            "SELECT status FROM task_requests WHERE id='cron-fixture-request'"
        ).fetchone(),("approved",))
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM audit_log WHERE action='task_request_expired'").fetchone()[0],0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM notifications WHERE kind='task_expired'").fetchone()[0],0)

    def test_expired_task_external_mail_requires_archival_evidence(self):
        self.seed()
        self.expire()
        pending=lambda: self.db.execute(self.sql["pendingMail"],(NOW,NOW,31)).fetchall()
        self.assertEqual(pending(),[])
        self.db.execute("INSERT INTO audit_archive("
                        "event_id,legacy_audit_id,action,subject_type,subject_id,"
                        "detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)",
                        ("cron-expiry:cron-fixture-request",
                         "cron-expiry:cron-fixture-request","task_request_expired",
                         "task_request","cron-fixture-request",
                         '{"task_id":"cron-fixture-task"}',NOW,
                         "SYNTHETIC_GENESIS_HASH","a"*64))
        self.assertEqual(len(pending()),1)
        # The archived event is immutable and cannot be retroactively faked by
        # mutating content after the mail has become eligible.
        with self.assertRaises(sqlite3.DatabaseError):
            self.db.execute("UPDATE audit_archive SET subject_id='forged'")

    def test_wrong_archived_event_action_does_not_enable_external_mail(self):
        self.seed()
        self.expire()
        self.db.execute("INSERT INTO audit_archive("
                        "event_id,legacy_audit_id,action,subject_type,subject_id,"
                        "detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)",
                        ("cron-expiry:cron-fixture-request",
                         "cron-expiry:cron-fixture-request","unrelated_event",
                         "task_request","cron-fixture-request",
                         '{"task_id":"cron-fixture-task"}',NOW,
                         "SYNTHETIC_GENESIS_HASH","b"*64))
        self.assertEqual(self.db.execute(
            self.sql["pendingMail"],(NOW,NOW,31)).fetchall(),[])

    def test_archive_with_correct_id_but_wrong_detail_cannot_release_mail(self):
        self.seed()
        self.expire()
        self.db.execute("INSERT INTO audit_archive("
                        "event_id,legacy_audit_id,action,subject_type,subject_id,"
                        "detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)",
                        ("cron-expiry:cron-fixture-request",
                         "cron-expiry:cron-fixture-request",
                         "task_request_expired","task_request","cron-fixture-request",
                         '{"task_id":"WRONG-TASK"}',NOW,
                         "SYNTHETIC_GENESIS_HASH","d"*64))
        self.assertEqual(self.db.execute(
            self.sql["pendingMail"],(NOW,NOW,31)).fetchall(),[])

    def test_archive_with_correct_id_but_wrong_timestamp_cannot_release_mail(self):
        self.seed()
        self.expire()
        self.db.execute("INSERT INTO audit_archive("
                        "event_id,legacy_audit_id,action,subject_type,subject_id,"
                        "detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)",
                        ("cron-expiry:cron-fixture-request",
                         "cron-expiry:cron-fixture-request",
                         "task_request_expired","task_request","cron-fixture-request",
                         '{"task_id":"cron-fixture-task"}',"2026-01-01T00:00:00Z",
                         "SYNTHETIC_GENESIS_HASH","e"*64))
        self.assertEqual(self.db.execute(
            self.sql["pendingMail"],(NOW,NOW,31)).fetchall(),[])

    def test_archive_with_correct_id_but_wrong_actor_cannot_release_mail(self):
        self.seed()
        self.expire()
        self.db.execute("INSERT INTO audit_archive("
                        "event_id,legacy_audit_id,actor_user_id,action,"
                        "subject_type,subject_id,detail_json,created_at,prev_hash,event_hash)"
                        " VALUES(?,?,?,?,?,?,?,?,?,?)",
                        ("cron-expiry:cron-fixture-request",
                         "cron-expiry:cron-fixture-request","cron-fixture-user",
                         "task_request_expired","task_request","cron-fixture-request",
                         '{"task_id":"cron-fixture-task"}',NOW,
                         "SYNTHETIC_GENESIS_HASH","b"*64))
        self.assertEqual(self.db.execute(
            self.sql["pendingMail"],(NOW,NOW,31)).fetchall(),[])

    def test_conflicting_immutable_archive_does_not_suppress_recovery(self):
        self.seed()
        self.expire()
        # The legacy audit ID alone cannot establish provenance. A conflicting
        # archived event must still be selected for fail-closed reconciliation.
        self.db.execute("INSERT INTO audit_archive("
                        "event_id,legacy_audit_id,action,subject_type,subject_id,"
                        "detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)",
                        ("cron-expiry:cron-fixture-request",
                         "cron-expiry:cron-fixture-request",
                         "task_request_expired","task_request","cron-fixture-request",
                         '{"task_id":"FORGED"}',NOW,
                         "SYNTHETIC_GENESIS_HASH","f"*64))
        rows=self.db.execute(self.sql["unarchived"],(61,)).fetchall()
        self.assertEqual(len(rows),1)
        self.assertEqual(rows[0][0],"cron-expiry:cron-fixture-request")
        self.assertEqual(rows[0][7],"cron-expiry:cron-fixture-request")

    def test_valid_archival_exact_postcondition_can_be_verified(self):
        self.seed()
        self.expire()
        self.db.execute("INSERT INTO audit_archive("
                        "event_id,legacy_audit_id,action,subject_type,subject_id,"
                        "detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)",
                        ("cron-expiry:cron-fixture-request",
                         "cron-expiry:cron-fixture-request",
                         "task_request_expired","task_request","cron-fixture-request",
                         '{"task_id":"cron-fixture-task"}',NOW,
                         "SYNTHETIC_GENESIS_HASH","a"*64))
        identity=("cron-expiry:cron-fixture-request",
                  "cron-expiry:cron-fixture-request",
                  "task_request_expired","task_request","cron-fixture-request",
                  '{"task_id":"cron-fixture-task"}',NOW,None)
        self.assertEqual(self.db.execute(self.sql["verifyArchive"],identity).fetchone(),(1,))
        bad=(*identity[:5], '{"task_id":"FORGED"}',*identity[6:])
        self.assertIsNone(self.db.execute(self.sql["verifyArchive"],bad).fetchone())
        self.assertEqual(self.db.execute(self.sql["unarchived"],(61,)).fetchall(),[])

    def test_outbox_rejects_forged_notification_kinds_and_mismatched_identities(self):
        self.seed()
        self.expire()
        self.db.execute("INSERT INTO audit_archive("
                        "event_id,legacy_audit_id,action,subject_type,subject_id,"
                        "detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)",
                        ("cron-expiry:cron-fixture-request",
                         "cron-expiry:cron-fixture-request",
                         "task_request_expired","task_request","cron-fixture-request",
                         '{"task_id":"cron-fixture-task"}',NOW,
                         "SYNTHETIC_GENESIS_HASH","a"*64))
        notices=[
            ("cron-reminder:task_request_target_admin:r-good",None,
             "task_request_target_admin:r-good",True),
            ("cron-reminder:skill_review_overdue_admin:r-good",None,
             "skill_review_overdue_admin:r-good",True),
            ("cron-reminder:task_request_target_admin:r-user","cron-fixture-user",
             "task_request_target_admin:r-user",False),
            ("cron-reminder:task_request_target_admin:r-bad",None,
             "task_request_target_admin:r-other",False),
            ("cron-reminder:unapproved_kind:ID",None,
             "unapproved_kind:ID",False),
            ("cron-reminder:skill_review_target_admin:",None,
             "skill_review_target_admin:",False),
            ("cron-generic:task_request_overdue_admin:id",None,
             "task_request_overdue_admin:id",False),
            ("cron-expiry-note:forged-admin",None,"task_expired",False),
            ("cron-expiry-note:unknown-user","cron-fixture-user",
             "task_expired",False),
            ("cron-expiry-note:cron-fixture-request","cron-fixture-user",
             "task_request_overdue_admin:cron-fixture-request",False),
        ]
        # Do not duplicate the legitimate expiry notice ID; its original
        # kind must remain unchanged. That conflicting kind is checked via
        # a temporary UPDATE after testing other records.
        for uid,user_id,kind,allowed in notices[:-1]:
            self.db.execute(
                "INSERT INTO notifications(id,user_id,kind,subject,body,created_at,email_state) "
                "VALUES(?,?,?,?,?,?,?)",
                (uid,user_id,kind,"Synthetic", "Offline",NOW,"queued"))
        visible={r[0] for r in self.db.execute(
            self.sql["pendingMail"],(NOW,NOW,40)).fetchall()}
        self.assertEqual(visible,{
            "cron-expiry-note:cron-fixture-request",
            "cron-reminder:task_request_target_admin:r-good",
            "cron-reminder:skill_review_overdue_admin:r-good",
        })
        self.db.execute("UPDATE notifications SET kind='task_request_overdue_admin:forged'"
                        " WHERE id='cron-expiry-note:cron-fixture-request'")
        visible={r[0] for r in self.db.execute(
            self.sql["pendingMail"],(NOW,NOW,40)).fetchall()}
        self.assertNotIn("cron-expiry-note:cron-fixture-request",visible)

    def test_expiry_mail_never_targets_a_different_verified_account(self):
        self.seed()
        synthetic_user(self.db,"unrelated-verified-user")
        self.db.execute("UPDATE users SET email_verified=1 WHERE id='unrelated-verified-user'")
        self.expire()
        self.db.execute("INSERT INTO audit_archive("
                        "event_id,legacy_audit_id,action,subject_type,subject_id,"
                        "detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)",
                        ("cron-expiry:cron-fixture-request",
                         "cron-expiry:cron-fixture-request",
                         "task_request_expired","task_request","cron-fixture-request",
                         '{"task_id":"cron-fixture-task"}',NOW,
                         "SYNTHETIC_GENESIS_HASH","a"*64))
        before=self.db.execute(self.sql["pendingMail"],(NOW,NOW,31)).fetchall()
        self.assertEqual(len(before),1)
        self.db.execute("UPDATE notifications SET user_id='unrelated-verified-user' "
                        "WHERE id='cron-expiry-note:cron-fixture-request'")
        after=self.db.execute(self.sql["pendingMail"],(NOW,NOW,31)).fetchall()
        self.assertEqual(after,[])

    def test_mail_claim_rechecks_current_account_and_notification_after_selection(self):
        self.seed()
        self.expire()
        self.db.execute("INSERT INTO audit_archive("
                        "event_id,legacy_audit_id,action,subject_type,subject_id,"
                        "detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)",
                        ("cron-expiry:cron-fixture-request",
                         "cron-expiry:cron-fixture-request","task_request_expired",
                         "task_request","cron-fixture-request",
                         '{"task_id":"cron-fixture-task"}',NOW,
                         "SYNTHETIC_GENESIS_HASH","a"*64))
        row=self.db.execute(self.sql["pendingMail"],(NOW,NOW,31)).fetchone()
        self.assertIsNotNone(row)
        original=(row[0],row[2],row[1],row[3],row[4])
        # Passing an old selected row to the lease claim must not override
        # a notification edit, account suspension, ownership change, or
        # deleted audit eligibility during the scheduling gap.
        cases={
            "disabled_mail":"UPDATE notifications SET email_state='disabled' WHERE id='cron-expiry-note:cron-fixture-request'",
            "altered_kind":"UPDATE notifications SET kind='unrelated' WHERE id='cron-expiry-note:cron-fixture-request'",
            "altered_subject":"UPDATE notifications SET subject='tampered' WHERE id='cron-expiry-note:cron-fixture-request'",
            "altered_body":"UPDATE notifications SET body='tampered' WHERE id='cron-expiry-note:cron-fixture-request'",
            "suspended_account":"UPDATE users SET status='suspended' WHERE id='cron-fixture-user'",
            "unverified_account":"UPDATE users SET email_verified=0 WHERE id='cron-fixture-user'",
            "revoked_reservation":"UPDATE task_requests SET status='approved' WHERE id='cron-fixture-request'",
        }
        for name,mutation in cases.items():
            with self.subTest(name=name):
                self.db.execute("SAVEPOINT claim_race")
                try:
                    self.db.execute(mutation)
                    claimed=self.db.execute(self.sql["claimMail"],(
                        row[0],"race-lease","2026-11-13T07:05:00Z",
                        NOW,NOW,*original,row[6],NOW,NOW)).fetchall()
                    self.assertEqual(claimed,[])
                    self.assertEqual(self.db.execute(
                        "SELECT COUNT(*) FROM cron_delivery_attempts").fetchone()[0],0)
                finally:
                    self.db.execute("ROLLBACK TO claim_race")
                    self.db.execute("RELEASE claim_race")
        claimed=self.db.execute(self.sql["claimMail"],(
            row[0],"valid-lease","2026-11-13T07:05:00Z",
            NOW,NOW,*original,row[6],NOW,NOW)).fetchall()
        self.assertEqual(claimed,[(1,"valid-lease")])

    def test_retry_ledger_is_deletable_with_user_notification(self):
        self.seed()
        self.expire()
        self.db.execute("INSERT INTO audit_archive("
                        "event_id,legacy_audit_id,action,subject_type,subject_id,"
                        "detail_json,created_at,prev_hash,event_hash) VALUES(?,?,?,?,?,?,?,?,?)",
                        ("cron-expiry:cron-fixture-request",
                         "cron-expiry:cron-fixture-request",
                         "task_request_expired","task_request","cron-fixture-request",
                         '{"task_id":"cron-fixture-task"}',NOW,
                         "SYNTHETIC_GENESIS_HASH","a"*64))
        notice=self.db.execute(
            "SELECT id,kind,user_id,subject,body FROM notifications WHERE id=?",
            ("cron-expiry-note:cron-fixture-request",)).fetchone()
        claimed=self.db.execute(self.sql["claimMail"],(
            notice[0],"lease","2026-11-13T07:05:00Z",NOW,NOW,
            *notice,"synthetic-cron-fixture-user@pcs.invalid",NOW,NOW)).fetchall()
        self.assertEqual(claimed,[(1,"lease")])
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM cron_delivery_attempts").fetchone()[0],1)
        self.db.execute("DELETE FROM users WHERE id='cron-fixture-user'")
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM cron_delivery_attempts").fetchone()[0],0)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(),[])

if __name__=="__main__":
    unittest.main()
