import importlib.util
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))
spec = importlib.util.spec_from_file_location("preflight", SCRIPTS / "d1_production_preflight.py")
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)


class ProductionPreflight(unittest.TestCase):
    def test_only_fixed_readonly_metadata_queries_and_no_secret_output(self):
        seen = []
        def opener(request, timeout):
            seen.append(json.loads(request.data)["sql"])
            self.assertEqual(timeout, 30)
            return io.BytesIO(json.dumps({"success": True, "result": [{"success": True, "results": [], "meta": {"rows_written": 0, "changed_db": False}}]}).encode())
        result = mod.fixed_query("a" * 32, "b" * 32, "test-private-credential", mod.SCHEMA_QUERY, opener=opener)
        self.assertEqual(result, [])
        self.assertEqual(seen, [mod.SCHEMA_QUERY])
        with self.assertRaisesRegex(ValueError, "fixed"):
            mod.fixed_query("a" * 32, "b" * 32, "credential", "DELETE FROM users", opener=opener)

    def test_provider_mutation_and_incomplete_result_fail_closed(self):
        for payload in [{"success": False}, {"success": True, "result": [{"success": False}]},
                        {"success": True, "result": [{"success": True, "results": [], "meta": {"rows_written": 1}}]}]:
            with self.assertRaises(ValueError):
                mod.fixed_query("a" * 32, "b" * 32, "credential", mod.SCHEMA_QUERY, opener=lambda *a, **k: io.BytesIO(json.dumps(payload).encode()))

    def test_matching_schema_never_authorizes_historical_replay(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / "0001.sql").write_text("CREATE TABLE tasks(id TEXT PRIMARY KEY, title TEXT); INSERT INTO tasks VALUES ('seed','initial');")
            with mod.canonical(folder) as db:
                schema = [{"type": r["type"], "name": r["name"], "table_name": r["table"], "sql": r["sql"]} for r in mod.inventory(db)["objects"]]
            result = mod.assess(schema, [], folder)
            self.assertEqual(result["missing_objects"], [])
            self.assertFalse(result["historical_ledger_backfill_authorized"])
            self.assertFalse(result["schema_match_is_historical_execution_proof"])
            self.assertTrue(result["unrecorded_source_migrations"][0]["data_effect_review_required"])
            self.assertNotIn("initial", json.dumps(result))

    def test_real_default_and_order_drift_are_distinguished(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / "0001.sql").write_text("CREATE TABLE users(id TEXT, iterations INTEGER NOT NULL DEFAULT 100000);")
            result = mod.assess([{"type": "table", "name": "users", "table_name": "users", "sql": "CREATE TABLE users(iterations INTEGER NOT NULL DEFAULT 250000, id TEXT)"}], [], folder)
            change = result["table_layout_details"]["users"]
            self.assertFalse(change["column_order_equal"])
            self.assertEqual(change["changed_column_metadata"][0]["name"], "iterations")
            self.assertFalse(result["production_migration_authorized"])

    def test_schema_statement_and_duplicate_boundaries(self):
        with self.assertRaisesRegex(ValueError, "Unexpected schema statement"):
            mod.structural_schema([{"type": "table", "name": "evil", "sql": "ATTACH DATABASE '/tmp/other' AS other"}])
        with self.assertRaisesRegex(ValueError, "bounded inventory"):
            mod.assess([{}] * 257, [], SCRIPTS.parent / "migrations")


if __name__ == "__main__":
    unittest.main()
