import copy
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import d1_forward_migrations as mod

class ForwardMigrations(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.folder=self.root/'migrations';self.folder.mkdir()
        (self.folder/'0001_state.sql').write_text('CREATE TABLE users(id TEXT PRIMARY KEY, secret TEXT NOT NULL); CREATE TABLE tasks(id TEXT PRIMARY KEY,state TEXT);')
        (self.folder/'0002_seed.sql').write_text("INSERT INTO tasks VALUES('seed','fresh');")
        self.database=self.root/'private.sqlite'
        with mod.sqlite3.connect(self.database) as db:
            for f in sorted(self.folder.glob('*.sql')):db.executescript(f.read_text())
            db.execute('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT NOT NULL UNIQUE,applied_at TEXT)')
            db.execute("INSERT INTO users VALUES('fixture-person','never-publish-this-fixture')")
            db.execute("UPDATE tasks SET state='legitimate-live-progress'")
        schema,_,_=mod.capture(self.database)
        self.record=mod.baseline(self.database,self.folder,remote_schema_sha256=mod.sha(schema),backup_sha256='a'*64,source_revision='b'*40)
        self.original=self.database.read_bytes()

    def future(self,sql='CREATE TABLE new_research(id TEXT PRIMARY KEY);'):
        p=self.folder/'0003_future.sql';p.write_text(sql);return p

    def test_legacy_schema_and_data_are_baselined_without_claiming_execution(self):
        self.assertEqual(self.record['actual_ledger_names'],[])
        self.assertEqual(len(self.record['legacy_excluded_names']),2)
        self.assertFalse(self.record['historical_execution_inferred'])
        self.assertFalse(self.record['ledger_backfill_authorized'])
        self.assertEqual(self.record['historical_data_effects'][0]['reference_top_level_write_tables'],['tasks'])
        self.assertNotIn('never-publish',json.dumps(self.record))
        self.assertNotIn('fixture-person',json.dumps(self.record))
        self.assertEqual(mod.forward_plan(self.database,self.folder,self.record)['pending'],[])
        self.assertEqual(self.database.read_bytes(),self.original)

    def test_only_forward_sql_is_staged_and_current_accounts_and_task_state_survive(self):
        self.future();plan=mod.forward_plan(self.database,self.folder,self.record)
        self.assertEqual(plan['changed_tables_on_clone'],['new_research'])
        self.assertEqual(plan['legacy_migrations_staged'],0)
        out=self.root/'stage'
        mod.stage(plan,self.folder,self.record,out,expected_plan_sha256=mod.digest(plan))
        self.assertEqual([f.name for f in (out/'pending').iterdir()],['0003_future.sql'])
        self.assertEqual(json.loads((out/'wrangler.jsonc').read_text())['d1_databases'][0]['migrations_dir'],'./pending')
        self.assertEqual(self.database.read_bytes(),self.original)
        with mod.readonly(self.database) as db:
            self.assertEqual(db.execute('SELECT state FROM tasks').fetchone()[0],'legitimate-live-progress')
            self.assertEqual(db.execute('SELECT count(*) FROM users').fetchone()[0],1)
            self.assertEqual(db.execute('SELECT count(*) FROM d1_migrations').fetchone()[0],0)

    def test_duplicate_alter_or_broken_forward_sql_fails_without_staging_or_source_mutation(self):
        for sql in ['ALTER TABLE users ADD COLUMN secret TEXT;', 'CREATE TABLE probe(id); INSERT INTO missing VALUES(1);']:
            self.future(sql)
            with self.assertRaisesRegex(ValueError,'Forward migration failed'):mod.forward_plan(self.database,self.folder,self.record)
            self.assertEqual(self.database.read_bytes(),self.original)

    def test_history_edit_source_sequence_gap_and_symlinks_fail_closed(self):
        p=self.folder/'0001_state.sql';p.write_text(p.read_text()+'\n-- changed source')
        with self.assertRaisesRegex(ValueError,'Historical migration source changed'):mod.forward_plan(self.database,self.folder,self.record)
        (self.folder/'0004_gap.sql').write_text('SELECT 1;')
        with self.assertRaisesRegex(ValueError,'contiguous'):mod.migrations(self.folder)
        (self.folder/'0004_gap.sql').unlink()
        self.future().unlink();(self.folder/'0003_future.sql').symlink_to(p)
        with self.assertRaisesRegex(ValueError,'linked'):mod.migrations(self.folder)

    def test_schema_or_ledger_drift_requires_explicit_baseline_advancement(self):
        with sqlite3.connect(self.database) as db:db.execute("INSERT INTO d1_migrations VALUES(1,'0002_seed.sql','fixture')")
        with self.assertRaisesRegex(ValueError,'ledger drift'):mod.forward_plan(self.database,self.folder,self.record)
        with sqlite3.connect(self.database) as db:db.execute('DELETE FROM d1_migrations');db.execute('ALTER TABLE users ADD COLUMN extra TEXT')
        with self.assertRaisesRegex(ValueError,'ledger drift'):mod.forward_plan(self.database,self.folder,self.record)

    def test_forged_legacy_pending_list_is_rejected_even_with_recomputed_plan_digest(self):
        self.future();plan=mod.forward_plan(self.database,self.folder,self.record)
        plan['pending']=self.record['source_migrations']+plan['pending']
        with self.assertRaisesRegex(ValueError,'SQL bytes changed'):mod.stage(plan,self.folder,self.record,self.root/'unsafe',expected_plan_sha256=mod.digest(plan))
        self.assertFalse((self.root/'unsafe').exists())

    def test_changed_future_sql_stale_digest_and_existing_stage_reject(self):
        file=self.future();plan=mod.forward_plan(self.database,self.folder,self.record)
        with self.assertRaisesRegex(ValueError,'digest'):mod.stage(plan,self.folder,self.record,self.root/'out',expected_plan_sha256='0'*64)
        file.write_text('CREATE TABLE substituted(id);')
        with self.assertRaisesRegex(ValueError,'SQL bytes changed'):mod.stage(plan,self.folder,self.record,self.root/'out',expected_plan_sha256=mod.digest(plan))
        plan=mod.forward_plan(self.database,self.folder,self.record)
        out=self.root/'out';out.mkdir()
        with self.assertRaises(FileExistsError):mod.stage(plan,self.folder,self.record,out,expected_plan_sha256=mod.digest(plan))

    def test_baseline_cannot_relabel_history_as_executed_or_authorize_backfill(self):
        for key in ['historical_execution_inferred','ledger_backfill_authorized','production_mutated']:
            bad=copy.deepcopy(self.record);bad[key]=True
            with self.assertRaises(ValueError):mod.forward_plan(self.database,self.folder,bad)
        bad=copy.deepcopy(self.record);bad['legacy_excluded_names']=[]
        with self.assertRaises(ValueError):mod.forward_plan(self.database,self.folder,bad)

    def test_authenticated_schema_and_private_restore_must_agree(self):
        with self.assertRaisesRegex(ValueError,'schema differ'):
            mod.baseline(self.database,self.folder,remote_schema_sha256='0'*64,backup_sha256='a'*64,source_revision='b'*40)

    def test_foreign_key_violation_in_new_sql_rejects_on_clone(self):
        self.future("CREATE TABLE linked(id TEXT REFERENCES users(id)); INSERT INTO linked VALUES('absent');")
        with self.assertRaisesRegex(ValueError,'foreign keys'):mod.forward_plan(self.database,self.folder,self.record)
        self.assertEqual(self.database.read_bytes(),self.original)

    def test_candidate_sql_cannot_attach_or_export_to_files_outside_clone(self):
        escaped=self.root/'outside.sqlite'
        for sql in [f"ATTACH DATABASE '{self.database}' AS outside; DELETE FROM outside.users;",
                    f"VACUUM INTO '{escaped}';",'PRAGMA writable_schema=ON;']:
            self.future(sql)
            with self.assertRaisesRegex(ValueError,'Forward migration failed'):mod.forward_plan(self.database,self.folder,self.record)
            self.assertEqual(self.database.read_bytes(),self.original)
            self.assertFalse(escaped.exists())

if __name__=='__main__':unittest.main()
