"""Regression-check the opt-in D1/SQLite schema without touching production data."""
from __future__ import annotations

import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SQL = (ROOT / "migrations/0024_countermodel_lab.sql").read_text(encoding="utf-8")


def main() -> int:
    db = sqlite3.connect(":memory:")
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("CREATE TABLE users (id TEXT PRIMARY KEY)")
    db.execute("INSERT INTO users(id) VALUES (?)", ("consenting-fixture",))
    db.executescript(SQL)
    insert = """INSERT INTO countermodel_research_sessions
      (id,user_id,mission_id,game_version,session_digest,session_json,replay_json,
       actions_count,checked_count,found_countermodel,consent_version,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)"""
    row = ("run1", "consenting-fixture", "quantifier-switch", "pcs-countermodel-lab-v1",
           "a" * 64, '{}', '{}', 2, 1, 1, "pcs-countermodel-adult-optin-v1",
           "2026-10-08T00:00:00Z")
    db.execute(insert, row)
    for field, invalid in (("actions_count", 0), ("checked_count", 0),
                           ("found_countermodel", 2), ("session_digest", "bad")):
        candidate = list(row)
        candidate[0] = f"bad_{field}"
        candidate[["id", "user_id", "mission_id", "game_version", "session_digest",
                   "session_json", "replay_json", "actions_count", "checked_count",
                   "found_countermodel", "consent_version", "created_at"].index(field)] = invalid
        try:
            db.execute(insert, candidate)
        except sqlite3.IntegrityError:
            pass
        else:
            raise AssertionError(f"Migration accepted invalid {field}")
    candidate = list(row)
    candidate[0], candidate[1], candidate[4] = "other", "nonexistent", "b" * 64
    try:
        db.execute(insert, candidate)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Migration accepted unknown account")
    candidate = list(row)
    candidate[0] = "duplicate"
    try:
        db.execute(insert, candidate)
    except sqlite3.IntegrityError:
        pass
    else:
        raise AssertionError("Migration accepted duplicate user/session digest")
    db.execute("DELETE FROM users WHERE id=?", ("consenting-fixture",))
    assert db.execute("SELECT COUNT(*) FROM countermodel_research_sessions").fetchone()[0] == 0
    print("COUNTERMODEL_D1_SCHEMA_PASS: constraints, deduplication, cascade deletion")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
