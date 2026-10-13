"""Bounded, schema-only production D1 preflight. Never applies migrations.

Credentials stay in environment bindings. The only SQL statements are fixed
SELECTs over sqlite_master and the migration ledger; account/game rows are not
read. A matching schema does not prove historical data migrations executed.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import sqlite3
import urllib.error
import urllib.request
from pathlib import Path

from d1_reconcile import canonical, inventory, migration_inventory


SCHEMA_QUERY = "SELECT type,name,tbl_name AS table_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY type,name LIMIT 257"
LEDGER_QUERY = "SELECT name FROM d1_migrations ORDER BY id LIMIT 201"
HEX_ID = re.compile(r"^[0-9a-f]{32}$|^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$")


def fixed_query(account, database, token, sql, *, opener=urllib.request.urlopen):
    if sql not in {SCHEMA_QUERY, LEDGER_QUERY}:
        raise ValueError("Only fixed schema/ledger queries are authorized")
    if not HEX_ID.fullmatch(account) or not HEX_ID.fullmatch(database):
        raise ValueError("Invalid provider identifier")
    request = urllib.request.Request(
        f"https://api.cloudflare.com/client/v4/accounts/{account}/d1/database/{database}/query",
        data=json.dumps({"sql": sql}).encode(),
        headers={"Authorization": "Bearer " + token,
                 "Content-Type": "application/json", "User-Agent": "PCS-Schema-Preflight/1"},
        method="POST",
    )
    try:
        with opener(request, timeout=30) as response:
            raw = response.read(1_048_577)
    except (urllib.error.HTTPError, urllib.error.URLError, TimeoutError) as error:
        raise RuntimeError("Production schema preflight unavailable") from error
    if len(raw) > 1_048_576:
        raise ValueError("Provider metadata exceeds bound")
    payload = json.loads(raw)
    if payload.get("success") is not True or len(payload.get("result", [])) != 1:
        raise ValueError("Provider did not confirm read-only query")
    result = payload["result"][0]
    if result.get("success") is not True or type(result.get("results")) is not list:
        raise ValueError("Incomplete provider query result")
    # Provider metadata is diagnostic, never authority to perform a write.
    if result.get("meta", {}).get("changed_db") is True or result.get("meta", {}).get("rows_written", 0) != 0:
        raise ValueError("Unexpected database mutation metadata")
    return result["results"]


def sha(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def structural_schema(objects):
    """Inspect empty local schema, not production rows or historical effects."""
    connection = sqlite3.connect(":memory:")
    try:
        for kind in ("table", "index", "view", "trigger"):
            for obj in objects:
                if obj["type"] != kind or obj["sql"] is None:
                    continue
                if not re.match(r"^CREATE\s+(?:UNIQUE\s+)?" + kind + r"\b", obj["sql"], re.I):
                    raise ValueError("Unexpected schema statement")
                connection.execute(obj["sql"])
        result = {}
        for obj in objects:
            quoted = '"' + obj["name"].replace('"', '""') + '"'
            if obj["type"] == "table":
                result[obj["name"]] = {
                    "columns": list(connection.execute("PRAGMA table_xinfo(" + quoted + ")")),
                    "foreign_keys": list(connection.execute("PRAGMA foreign_key_list(" + quoted + ")")),
                }
            elif obj["type"] == "index":
                result[obj["name"]] = {"columns": list(connection.execute("PRAGMA index_xinfo(" + quoted + ")"))}
        return result
    finally:
        connection.close()


def assess(schema, ledger, folder):
    if len(schema) > 256 or len(ledger) > 200:
        raise ValueError("Schema or ledger exceeds bounded inventory")
    if any(set(row) != {"type", "name", "table_name", "sql"} for row in schema):
        raise ValueError("Malformed schema metadata")
    names = [row["name"] for row in schema]
    if len(names) != len(set(names)):
        raise ValueError("Duplicate schema object")
    if any(set(row) != {"name"} or type(row["name"]) is not str for row in ledger):
        raise ValueError("Malformed migration ledger")
    migrations = migration_inventory(folder)
    with canonical(folder) as reference:
        expected = inventory(reference)["objects"]
    actual = {r["name"]: {"type": r["type"], "name": r["name"], "table": r["table_name"], "sql": r["sql"]} for r in schema}
    targets = {r["name"]: r for r in expected}
    missing = sorted(targets.keys() - actual.keys())
    extra = sorted(actual.keys() - targets.keys())
    exact = sorted(n for n in actual.keys() & targets.keys() if actual[n] == targets[n])
    different = sorted(n for n in actual.keys() & targets.keys() if actual[n] != targets[n])
    actual_structure = structural_schema(actual.values())
    target_structure = structural_schema(targets.values())
    structural_matches = sorted(n for n in different if n in actual_structure and actual_structure[n] == target_structure.get(n))
    structural_differences = sorted(n for n in actual_structure.keys() & target_structure.keys() if actual_structure[n] != target_structure[n])
    column_changes = {}
    for name in structural_differences:
        if "columns" not in actual_structure[name] or actual[name]["type"] != "table":
            continue
        ac = {row[1]: row[2:] for row in actual_structure[name]["columns"]}
        tc = {row[1]: row[2:] for row in target_structure[name]["columns"]}
        column_changes[name] = {
            "missing_columns": sorted(tc.keys() - ac.keys()), "extra_columns": sorted(ac.keys() - tc.keys()),
            "changed_column_metadata": [{"name": key, "actual": ac[key], "source": tc[key]} for key in sorted(ac.keys() & tc.keys()) if ac[key] != tc[key]],
            "foreign_keys_equal": actual_structure[name]["foreign_keys"] == target_structure[name]["foreign_keys"],
            "column_order_equal": list(ac) == list(tc),
        }
    recorded = {row["name"] for row in ledger}
    if len(recorded) != len(ledger):
        raise ValueError("Duplicate migration names")
    return {
        "format": "pcs-d1-production-schema-preflight-v1",
        "schema_sha256": sha(schema), "object_count": len(schema),
        "objects": [{"name": r["name"], "type": r["type"], "definition_sha256": sha(r)} for r in schema],
        "missing_objects": missing, "extra_objects": extra,
        "exact_definition_matches": exact, "different_definitions": different,
        "different_sql_matching_columns_or_index_layout": structural_matches,
        "column_or_foreign_key_or_index_layout_differences": structural_differences,
        "table_layout_details": column_changes,
        "structural_matches_prove_all_constraints_equal": False,
        "recorded_migrations": sorted(recorded),
        "unrecorded_source_migrations": [m for m in migrations if m["name"] not in recorded],
        "unknown_recorded_migrations": sorted(recorded - {m["name"] for m in migrations}),
        "schema_match_is_historical_execution_proof": False,
        "historical_ledger_backfill_authorized": False,
        "production_migration_authorized": False, "database_mutated": False,
        "account_or_game_rows_read": False, "backup_restore_exercised": False,
        "next_step": "Review definition differences and every historical data effect on an isolated backup before any operator-approved ledger reconciliation.",
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--database", required=True)
    parser.add_argument("--migrations", type=Path, default=Path(__file__).resolve().parents[1] / "migrations")
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()
    account = os.environ["CLOUDFLARE_ACCOUNT_ID"]
    token = os.environ["CLOUDFLARE_API_TOKEN"]
    schema = fixed_query(account, args.database, token, SCHEMA_QUERY)
    has_ledger = any(row.get("name") == "d1_migrations" and row.get("type") == "table" for row in schema)
    ledger = fixed_query(account, args.database, token, LEDGER_QUERY) if has_ledger else []
    result = assess(schema, ledger, args.migrations)
    result["migration_ledger_present"] = has_ledger
    args.output.write_text(json.dumps(result, indent=2) + "\n")
    print(json.dumps({k: result[k] for k in ["object_count", "missing_objects", "different_definitions", "migration_ledger_present", "database_mutated"]}))


if __name__ == "__main__":
    main()
