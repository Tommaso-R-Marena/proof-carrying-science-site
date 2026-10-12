import importlib.util, sqlite3, tempfile, unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('reconcile',Path(__file__).resolve().parents[1]/'scripts/d1_reconcile.py'); mod=importlib.util.module_from_spec(spec);spec.loader.exec_module(mod)
class Reconciliation(unittest.TestCase):
 def test_all_historical_migrations_and_recovery_preserve_user_state(self):
  folder=Path(__file__).resolve().parents[1]/'migrations'
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'local.sqlite'
   with mod.canonical(folder) as source,sqlite3.connect(path) as target:source.backup(target)
   before=path.read_bytes(); report=mod.reconcile(path,folder)
   self.assertEqual(report['missing_objects'],[]); self.assertEqual(report['different_definitions'],[])
   self.assertFalse(report['historical_execution_proven']); self.assertFalse(report['ledger_backfill_authorized'])
   self.assertTrue(any(m['data_effect_review_required'] for m in report['migrations']))
   recovery=mod.recovery(path,folder);self.assertTrue(recovery['backup_restore_equal']);self.assertTrue(recovery['corrupted_migration_rolled_back']);self.assertEqual(path.read_bytes(),before)
 def test_schema_presence_does_not_hide_data_mutation_or_missing_column(self):
  with tempfile.TemporaryDirectory() as temp:
   folder=Path(temp)/'migrations';folder.mkdir();(folder/'0001.sql').write_text('CREATE TABLE tasks(id TEXT PRIMARY KEY, title TEXT); INSERT INTO tasks VALUES ("a","original");')
   path=Path(temp)/'db.sqlite'
   with mod.canonical(folder) as source,sqlite3.connect(path) as target:source.backup(target)
   with sqlite3.connect(path) as db:db.execute('UPDATE tasks SET title="changed"')
   r=mod.reconcile(path,folder);self.assertEqual(r['different_definitions'],[]);self.assertNotEqual(r['actual']['tables']['tasks']['data_sha256'],r['canonical']['tables']['tasks']['data_sha256'])
   with sqlite3.connect(path) as db:db.execute('ALTER TABLE tasks ADD COLUMN extra TEXT')
   self.assertIn('tasks',mod.reconcile(path,folder)['different_definitions'])
 def test_pending_addition_and_duplicate_alter_execute_only_on_clone(self):
  with tempfile.TemporaryDirectory() as temp:
   path=Path(temp)/'db.sqlite'
   with sqlite3.connect(path) as db:db.execute('CREATE TABLE users (id TEXT, email TEXT)')
   before=path.read_bytes();candidate=Path(temp)/'new.sql';candidate.write_text('CREATE TABLE safe_new_table(id INTEGER);')
   r=mod.dry_run_pending(path,[candidate]);self.assertIsNone(r['failure']);self.assertIn('safe_new_table',r['changed_tables']);self.assertFalse(r['production_authorized']);self.assertEqual(path.read_bytes(),before)
   duplicate=Path(temp)/'historical.sql';duplicate.write_text('ALTER TABLE users ADD COLUMN email TEXT;')
   failed=mod.dry_run_pending(path,[duplicate]);self.assertIn('duplicate column',failed['failure']['error']);self.assertEqual(path.read_bytes(),before)
if __name__=='__main__':unittest.main()
