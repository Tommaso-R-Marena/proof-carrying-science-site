"""Actual isolated SQLite over captured schema metadata; no network or private rows."""
import copy
import json
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from d1_schema_recovery_v2 import (SCHEMA_QUERY, sha, restore_schema, schema_rows, safe_authorizer,
    exercise_constraints, exercise_atomic_admission, analyze_historical_migrations,
    future_candidate, FUTURE_SUCCESS, FUTURE_FAILURE, statements, validate_capture, campaign, write_fresh_json)

CAPTURE = json.loads((ROOT / 'docs/evidence/production-d1-recovery-v2/captured-schema.json').read_text())
PRIOR = json.loads((ROOT / 'docs/evidence/production-d1-preflight-v1/schema-preflight.json').read_text())


def altered(index, **changes):
    value = copy.deepcopy(CAPTURE)
    value['objects'][index].update(changes)
    value['schema_sha256'] = sha(value['objects'])
    return value


class SchemaRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix='pcs-schema-recovery-tests-')
        self.folder = Path(self.temporary.name)

    def tearDown(self):
        self.temporary.cleanup()

    def fresh(self):
        path = self.folder / 'restored.sqlite'
        result = restore_schema(CAPTURE, path)
        return path, result

    def test_exact_actual_schema_restores_with_zero_application_rows(self):
        path, report = self.fresh()
        self.assertEqual(report['objects'], 96)
        self.assertTrue(report['capture_identity_equal'])
        self.assertEqual(report['restored_application_rows'], 0)
        self.assertFalse(report['production_recovery_proven'])
        with sqlite3.connect(path) as db:
            self.assertEqual(schema_rows(db), CAPTURE['objects'])
        self.assertEqual(report['exact_schema_sha256'], PRIOR['schema_sha256'])
        self.assertEqual(report['layout']['users']['columns'][5][4], '250000')

    def test_existing_destination_is_never_overwritten(self):
        target = self.folder / 'existing.sqlite'
        target.write_bytes(b'existing-operator-data')
        with self.assertRaises(FileExistsError):
            restore_schema(CAPTURE, target)
        self.assertEqual(target.read_bytes(), b'existing-operator-data')
        link = self.folder / 'symlink.sqlite'
        link.symlink_to(target)
        with self.assertRaises(FileExistsError):
            restore_schema(CAPTURE, link)
        self.assertEqual(target.read_bytes(), b'existing-operator-data')

    def test_capture_digest_query_names_and_resource_bounds_reject(self):
        variants = []
        digest = copy.deepcopy(CAPTURE); digest['schema_sha256'] = '0' * 64; variants.append(digest)
        query = copy.deepcopy(CAPTURE); query['query'] = 'SELECT * FROM users'; variants.append(query)
        many = copy.deepcopy(CAPTURE); many['objects'] *= 3; many['schema_sha256'] = sha(many['objects']); variants.append(many)
        variants.append(altered(0, sql='CREATE INDEX injected; ' + 'x' * 65537))
        variants.append(altered(0, name='../operator-file'))
        duplicate = copy.deepcopy(CAPTURE); duplicate['objects'].append(duplicate['objects'][0]); duplicate['schema_sha256'] = sha(duplicate['objects']); variants.append(duplicate)
        for value in variants:
            with self.subTest(object_count=len(value['objects'])):
                with self.assertRaises(ValueError):
                    validate_capture(value)

    def test_object_identity_mismatch_rolls_back_every_prior_table(self):
        index = next(i for i, obj in enumerate(CAPTURE['objects']) if obj['type'] == 'index')
        target = self.folder / 'wrong-identity.sqlite'
        obj = CAPTURE['objects'][index]
        bad = altered(index, sql='CREATE INDEX pcs_wrong_restored_identity ON users(id)')
        with self.assertRaises(ValueError):
            restore_schema(bad, target)
        with sqlite3.connect(target) as db:
            self.assertEqual(schema_rows(db), [])

    def test_invalid_late_index_rolls_back_all_table_creation(self):
        index = next(i for i, obj in enumerate(CAPTURE['objects']) if obj['type'] == 'index')
        bad = altered(index, sql='CREATE INDEX ' + CAPTURE['objects'][index]['name'] + ' ON pcs_absent_table(id)')
        target = self.folder / 'failed.sqlite'
        with self.assertRaises(sqlite3.DatabaseError):
            restore_schema(bad, target)
        with sqlite3.connect(target) as db:
            self.assertEqual(schema_rows(db), [])

    def test_dangling_schema_foreign_key_rolls_back_and_future_candidate_is_not_accepted(self):
        index = next(i for i, obj in enumerate(CAPTURE['objects']) if obj['name']=='bridge_research_sessions')
        bad = altered(index, sql=CAPTURE['objects'][index]['sql'].replace('REFERENCES users(id)', 'REFERENCES pcs_missing_user(id)'))
        target = self.folder / 'dangling.sqlite'
        with self.assertRaises(ValueError):
            restore_schema(bad, target)
        with sqlite3.connect(target) as db:
            self.assertEqual(schema_rows(db), [])
        path, _ = self.fresh()
        result = future_candidate(path,self.folder/'future-dangling.sqlite','CREATE TABLE pcs_dangling(id INTEGER REFERENCES pcs_missing_user(id));')
        self.assertTrue(result['candidate_failed'])
        self.assertTrue(result['rollback_exact_state_equal'])

    def test_non_schema_or_multiple_statements_and_external_access_reject(self):
        table_index = next(i for i, obj in enumerate(CAPTURE['objects']) if obj['type'] == 'table')
        bad = altered(table_index, sql='CREATE TABLE injected AS SELECT 1 AS private_row')
        with self.assertRaises(ValueError):
            validate_capture(bad)
        index = next(i for i, obj in enumerate(CAPTURE['objects']) if obj['type'] == 'index')
        multiple = altered(index, sql='CREATE INDEX pcs_first ON users(id); DELETE FROM users;')
        with self.assertRaises(sqlite3.DatabaseError):
            restore_schema(multiple, self.folder / 'multiple.sqlite')
        with sqlite3.connect(':memory:') as db:
            db.set_authorizer(safe_authorizer)
            with self.assertRaises(sqlite3.DatabaseError):
                db.execute("ATTACH DATABASE '/tmp/pcs-never-authorized-schema-target' AS private")
            with self.assertRaises(sqlite3.DatabaseError):
                db.execute('PRAGMA writable_schema=ON')
            with self.assertRaises(sqlite3.DatabaseError):
                db.execute("SELECT load_extension('private')")

    def test_restored_application_constraints_execute_24_real_controls(self):
        path, _ = self.fresh()
        report = exercise_constraints(path)
        self.assertEqual(report['passed'], 24)
        self.assertTrue(all(r['passed'] for r in report['controls']))
        self.assertEqual(report['integrity'], ['ok'])
        self.assertEqual(report['foreign_key_violations'], 0)
        self.assertTrue(report['schema_does_not_verify_replay_or_human_consent'])

    def test_source_extracted_atomic_sql_runs_actual_60_client_race(self):
        path, _ = self.fresh()
        report = exercise_atomic_admission(path, ROOT / 'src/lean-admission.js')
        self.assertEqual(report['attempts'], 60)
        self.assertEqual(report['admitted'], 12)
        self.assertEqual(report['denied'], 48)
        self.assertEqual(report['partial_client_charges'], 0)

    def test_future_additive_candidate_preserves_synthetic_state_and_failed_ddl_rolls_back(self):
        path, _ = self.fresh()
        exercise_constraints(path)
        before = path.read_bytes()
        good = future_candidate(path, self.folder / 'good.sqlite', FUTURE_SUCCESS)
        self.assertFalse(good['candidate_failed'])
        self.assertTrue(good['all_existing_table_rows_and_layout_preserved'])
        self.assertEqual(good['added_objects'], ['pcs_schema_recovery_v2_future_probe'])
        bad = future_candidate(path, self.folder / 'bad.sqlite', FUTURE_FAILURE)
        self.assertTrue(bad['candidate_failed'])
        self.assertTrue(bad['rollback_exact_state_equal'])
        self.assertEqual(bad['added_objects'], [])
        self.assertEqual(path.read_bytes(), before)
        for sql in ['DROP TABLE users;', 'UPDATE users SET level=6;', 'ATTACH DATABASE \'private\' AS private;', 'CREATE TABLE bad AS SELECT * FROM users;']:
            with self.assertRaises(ValueError):
                future_candidate(path, self.folder / 'must-not-be-created.sqlite', sql)
        self.assertFalse((self.folder / 'must-not-be-created.sqlite').exists())

    def test_historical_effect_review_never_executes_source_migrations(self):
        report = analyze_historical_migrations(ROOT / 'migrations', set(PRIOR['recorded_migrations']))
        self.assertEqual(len(report), 25)
        self.assertEqual(sum(not r['recorded_in_prior_observed_ledger'] for r in report), 23)
        self.assertTrue(all(not r['historical_sql_executed_by_this_tool'] for r in report))
        affected = {e['table'] for migration in report for e in migration['data_effects']}
        self.assertIn('tasks', affected)
        self.assertIn('task_dependencies', affected)
        self.assertTrue(any(e['replace_may_delete_then_insert'] for m in report for e in m['data_effects']))
        with tempfile.TemporaryDirectory(dir=self.folder) as temporary:
            folder = Path(temporary)
            (folder / 'future.sql').write_text("-- UPDATE ignored\nCREATE TABLE not_executed(id TEXT); INSERT INTO not_executed VALUES('DELETE FROM users;');")
            effect = analyze_historical_migrations(folder, set())
            self.assertEqual(len(effect[0]['data_effects']), 1)
            self.assertEqual(effect[0]['data_effects'][0]['operation'], 'INSERT')
            self.assertEqual(effect[0]['data_effects'][0]['table'], 'not_executed')

    def test_trigger_statement_parser_does_not_split_internal_semicolons(self):
        commands = statements("CREATE TABLE t(id); CREATE TRIGGER x BEFORE DELETE ON t BEGIN SELECT RAISE(ABORT,'synthetic; fixture'); END;")
        self.assertEqual(len(commands), 2)
        with self.assertRaises(ValueError):
            statements('CREATE TABLE unfinished(id)')

    def test_evidence_output_is_fresh_only_and_does_not_follow_symlinks(self):
        target = self.folder / 'report.json'
        write_fresh_json(target, {'historical': True})
        before = target.read_bytes()
        with self.assertRaises(FileExistsError):
            write_fresh_json(target, {'replace': True})
        link = self.folder / 'report-link.json'
        link.symlink_to(target)
        with self.assertRaises(FileExistsError):
            write_fresh_json(link, {'replace': True})
        self.assertEqual(target.read_bytes(), before)

    def test_complete_campaign_keeps_production_data_recovery_open(self):
        report = campaign(CAPTURE, ROOT / 'migrations', ROOT / 'src/lean-admission.js', PRIOR)
        self.assertFalse(report['production_modified'])
        self.assertFalse(report['production_application_rows_read'])
        self.assertFalse(report['production_backup_restore_exercised'])
        self.assertFalse(report['historical_ledger_backfill_authorized'])
        self.assertEqual(report['failed_schema_restoration_fixture']['partial_objects_remaining'], 0)
        self.assertEqual(report['financial_actions'], 0)


if __name__ == '__main__':
    unittest.main()
