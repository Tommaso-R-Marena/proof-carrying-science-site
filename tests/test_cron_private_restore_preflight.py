"""No-network real SQLite recovery adversarial tests for private backup preflight."""
from __future__ import annotations
import hashlib
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from cron_private_restore_preflight import rehearse,digest_file,PreflightRejected,cron_migration_authorizer,vetted_migration_sql
from d1_schema_recovery_v2 import restore_schema,synthetic_user

CAPTURE=ROOT/"docs/evidence/production-d1-recovery-v2/captured-schema.json"
MIGRATION=ROOT/"migrations/0026_cron_mail_outbox.sql"

class PrivateD1RestorePreflightTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix="pcs-offline-test-")
        self.root=Path(self.temp.name)
        self.backup=self.root/"private-fixture.sqlite"
        import json
        restore_schema(json.loads(CAPTURE.read_text()),self.backup)
        with sqlite3.connect(self.backup) as db:
            db.execute("PRAGMA foreign_keys=ON")
            synthetic_user(db,"fixture-user")
            db.execute("INSERT INTO d1_migrations(name) VALUES('0024_countermodel_lab.sql')")
            db.execute("INSERT INTO d1_migrations(name) VALUES('0025_bridge_research_sessions.sql')")
            db.commit()
        self.backup_sha=digest_file(self.backup)
        self.migration_sha=digest_file(MIGRATION)

    def tearDown(self):
        self.temp.cleanup()

    def go(self,**updates):
        params={
            "expected_backup_sha256":self.backup_sha,
            "expected_migration_sha256":self.migration_sha,
            "capture_path":CAPTURE,
            "migration_path":MIGRATION,
        }
        params.update(updates)
        return rehearse(self.backup,**params)

    def test_real_offline_backup_clone_and_migration_preserve_source(self):
        result=self.go()
        self.assertTrue(result["offline_rehearsal_passed"])
        self.assertTrue(result["preexisting_tables_same_rows"])
        self.assertTrue(result["original_backup_not_mutated"])
        self.assertFalse(result["production_migration_authorized"])
        self.assertFalse(result["protected_source_admitted"])
        self.assertFalse(result["backup_authenticity_independently_proven"])
        self.assertEqual(result["captured_schema_objects_preserved"],96)
        self.assertEqual(result["new_schema_object_count"],2)
        self.assertEqual(digest_file(self.backup),self.backup_sha)
        with sqlite3.connect(self.backup) as db:
            self.assertFalse(db.execute(
                "SELECT 1 FROM sqlite_master WHERE name='cron_delivery_attempts'").fetchone())
            self.assertEqual(db.execute("SELECT display_name FROM users WHERE id='fixture-user'").fetchone()[0],
                             "Synthetic recovery fixture")

    def test_wrong_backup_digest_rejected_before_sqlite_clone(self):
        with self.assertRaises(PreflightRejected):
            self.go(expected_backup_sha256="0"*64)
        self.assertEqual(digest_file(self.backup),self.backup_sha)

    def test_wrong_migration_digest_rejected(self):
        with self.assertRaises(PreflightRejected):
            self.go(expected_migration_sha256="1"*64)

    def test_missing_ledger_entry_fails_closed_and_does_not_backfill(self):
        with sqlite3.connect(self.backup) as db:
            db.execute("DELETE FROM d1_migrations WHERE name='0024_countermodel_lab.sql'")
            db.commit()
        changed=digest_file(self.backup)
        with self.assertRaises(PreflightRejected):
            self.go(expected_backup_sha256=changed)
        with sqlite3.connect(self.backup) as db:
            self.assertEqual([v[0] for v in db.execute("SELECT name FROM d1_migrations")],
                             ["0025_bridge_research_sessions.sql"])

    def test_unreviewed_schema_object_rejected(self):
        with sqlite3.connect(self.backup) as db:
            db.execute("CREATE TABLE unreviewed_data(id INTEGER)")
            db.commit()
        with self.assertRaises(PreflightRejected):
            self.go(expected_backup_sha256=digest_file(self.backup))

    def test_migration_that_alters_existing_private_data_is_rejected(self):
        malicious=self.root/"bad_migration.sql"
        malicious.write_text(MIGRATION.read_text()+
            "\nUPDATE users SET display_name='CHANGED' WHERE id='fixture-user';\n")
        badsha=digest_file(malicious)
        with self.assertRaises(PreflightRejected):
            self.go(migration_path=malicious,expected_migration_sha256=badsha)
        # Even the deliberately malicious migration ran on the temporary clone.
        with sqlite3.connect(self.backup) as db:
            self.assertEqual(db.execute("SELECT display_name FROM users WHERE id='fixture-user'").fetchone()[0],
                             "Synthetic recovery fixture")
        self.assertEqual(digest_file(self.backup),self.backup_sha)

    def test_unreviewed_additional_schema_object_is_rejected(self):
        malicious=self.root/"unexpected_migration.sql"
        malicious.write_text(MIGRATION.read_text()+"\nCREATE TABLE unexpected_admin(id INTEGER);\n")
        with self.assertRaises(PreflightRejected):
            self.go(migration_path=malicious,expected_migration_sha256=digest_file(malicious))
        self.assertEqual(digest_file(self.backup),self.backup_sha)

    def test_malicious_attach_never_creates_an_external_database(self):
        outside=self.root/"outside-attached.sqlite"
        malicious=self.root/"attach_migration.sql"
        malicious.write_text(
            MIGRATION.read_text()+
            "\nATTACH DATABASE '"+str(outside)+"' AS outside;\n"
            "CREATE TABLE outside.compromised(id INTEGER);\n")
        with self.assertRaises(PreflightRejected):
            self.go(migration_path=malicious,
                    expected_migration_sha256=digest_file(malicious))
        self.assertFalse(outside.exists())
        self.assertEqual(digest_file(self.backup),self.backup_sha)

    def test_malicious_vacuum_into_never_creates_an_external_file(self):
        outside=self.root/"exfiltration.sqlite"
        malicious=self.root/"vacuum_migration.sql"
        malicious.write_text(
            MIGRATION.read_text()+"\nVACUUM INTO '"+str(outside)+"';\n")
        with self.assertRaises(PreflightRejected):
            self.go(migration_path=malicious,
                    expected_migration_sha256=digest_file(malicious))
        self.assertFalse(outside.exists())
        self.assertEqual(digest_file(self.backup),self.backup_sha)

    def test_direct_sql_authorizer_denies_side_effects_and_external_files(self):
        outside=self.root/"forged-attached.sqlite"
        with sqlite3.connect(":memory:") as db:
            db.execute("CREATE TABLE users(id TEXT PRIMARY KEY,name TEXT)")
            db.execute("INSERT INTO users VALUES('fixture','unchanged')")
            db.set_authorizer(cron_migration_authorizer)
            for sql in (
                "UPDATE users SET name='compromised'",
                "DELETE FROM users",
                "CREATE TABLE unauthorized(id INTEGER)",
                "CREATE TRIGGER unauthorized AFTER INSERT ON users BEGIN "
                "UPDATE users SET name='compromised'; END",
                "ATTACH DATABASE '"+str(outside)+"' AS outside",
                "VACUUM INTO '"+str(outside)+"'",
                "PRAGMA writable_schema=ON",
            ):
                with self.subTest(sql=sql),self.assertRaises(sqlite3.DatabaseError):
                    db.execute(sql)
            db.set_authorizer(None)
            self.assertEqual(db.execute(
                "SELECT name FROM users WHERE id='fixture'").fetchone()[0],
                "unchanged")
        self.assertFalse(outside.exists())

    def test_migration_precheck_cannot_admit_renamed_table_or_third_statement(self):
        direct=MIGRATION.read_text()
        self.assertEqual(vetted_migration_sql(MIGRATION),direct)
        for name,sql in {
            "renamed":direct.replace("cron_delivery_attempts","unauthorized_table"),
            "third_statement":direct+"\nDELETE FROM users;\n",
            "pragma":direct+"\nPRAGMA writable_schema=ON;\n",
        }.items():
            path=self.root/(name+".sql")
            path.write_text(sql)
            with self.subTest(name=name),self.assertRaises(PreflightRejected):
                vetted_migration_sql(path)

    def test_symlink_input_not_accepted(self):
        link=self.root/"backup-alias.sqlite"
        link.symlink_to(self.backup)
        with self.assertRaises(PreflightRejected):
            rehearse(link,expected_backup_sha256=self.backup_sha,
                     expected_migration_sha256=self.migration_sha,
                     capture_path=CAPTURE,migration_path=MIGRATION)

    def test_corrupted_backup_fails_before_processing(self):
        self.backup.write_bytes(b"not a database")
        with self.assertRaises((PreflightRejected,sqlite3.DatabaseError)):
            self.go(expected_backup_sha256=digest_file(self.backup))

if __name__=="__main__":
    unittest.main()
