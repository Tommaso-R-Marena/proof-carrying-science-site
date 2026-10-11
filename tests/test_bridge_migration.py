"""Real SQLite constraints, deduplication and account-deletion cascade."""
import sqlite3
from pathlib import Path
db=sqlite3.connect(":memory:")
db.execute("PRAGMA foreign_keys=ON")
db.execute("CREATE TABLE users(id TEXT PRIMARY KEY)")
sql=(Path(__file__).resolve().parents[1]/"migrations/0025_bridge_research_sessions.sql").read_text()
db.executescript(sql);db.executescript(sql)
db.execute("INSERT INTO users VALUES ('adult')")
values=("row","adult","tutorial","pcs-bridge-builder-v1","a"*64,"{}","{}","pcs-bridge-adult-cc0-optin-v1","2026-10-11")
db.execute("INSERT INTO bridge_research_sessions VALUES(?,?,?,?,?,?,?,?,?)",values)
for index,replacement in [(7,"no-consent"),(5,"x"*20001),(1,"unknown")]:
    bad=list(values);bad[0]="bad";bad[index]=replacement
    try:db.execute("INSERT INTO bridge_research_sessions VALUES(?,?,?,?,?,?,?,?,?)",bad)
    except sqlite3.IntegrityError:pass
    else:raise AssertionError("invalid row accepted")
duplicate=list(values);duplicate[0]="duplicate"
try:db.execute("INSERT INTO bridge_research_sessions VALUES(?,?,?,?,?,?,?,?,?)",duplicate)
except sqlite3.IntegrityError:pass
else:raise AssertionError("duplicate session accepted")
db.execute("DELETE FROM users WHERE id='adult'")
assert db.execute("SELECT COUNT(*) FROM bridge_research_sessions").fetchone()[0]==0
print("Bridge SQLite migration: constraints, deduplication and erasure passed")
