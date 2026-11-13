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

    def test_retry_ledger_is_deletable_with_user_notification(self):
        self.seed()
        self.expire()
        self.db.execute(self.sql["claimMail"],("cron-expiry-note:cron-fixture-request",
                         "lease","2026-11-13T07:05:00Z",NOW,NOW,NOW,NOW))
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM cron_delivery_attempts").fetchone()[0],1)
        self.db.execute("DELETE FROM users WHERE id='cron-fixture-user'")
        self.assertEqual(self.db.execute(
            "SELECT COUNT(*) FROM cron_delivery_attempts").fetchone()[0],0)
        self.assertEqual(self.db.execute("PRAGMA foreign_key_check").fetchall(),[])

if __name__=="__main__":
    unittest.main()
