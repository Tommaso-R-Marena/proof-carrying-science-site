"""Offline private D1 backup restoration and 0026-migration integrity rehearsal.

ZERO Cloudflare API use. Does not create, fetch, export, mutate, or upload a
production database. Source is opened read-only, cloned in a 0700 temporary
directory, migration is run only on that clone, which is then destroyed.

No database rows, values, backup hashes or identifiers are printed in reports.
An independently provided private backup with a trusted SHA-256 is required
for any meaningful future production-data rehearsal.

This is a technical preflight, NOT an authorization to deploy, run migrations,
alter a historical ledger, or accept a new source qualification.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sqlite3
import sys
import tempfile
from urllib.parse import quote

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/"scripts"))
from d1_schema_recovery_v2 import validate_capture, schema_rows

FORMAT="pcs-d1-private-restore-offline-preflight-v1"
EXPECTED_PRE0026_LEDGER=frozenset({
    "0024_countermodel_lab.sql", "0025_bridge_research_sessions.sql"
})
EXPECTED_NEW=frozenset({"cron_delivery_attempts","idx_cron_delivery_due"})
MAX_SOURCE_BYTES=2_000_000_000
MAX_ROWS=10_000_000

class PreflightRejected(ValueError):
    pass

def digest_file(path):
    result=hashlib.sha256()
    with path.open("rb") as fp:
        while True:
            piece=fp.read(1024*1024)
            if not piece:break
            result.update(piece)
    return result.hexdigest()

def integrity(conn):
    rows=conn.execute("PRAGMA integrity_check").fetchall()
    if rows!=[("ok",)]:
        raise PreflightRejected("Offline SQLite integrity check failed")
    if conn.execute("PRAGMA foreign_key_check").fetchone() is not None:
        raise PreflightRejected("Offline foreign-key check failed")

def read_ledger(conn):
    names=[r[0] for r in conn.execute("SELECT name FROM d1_migrations")]
    if len(names)!=len(set(names)) or frozenset(names)!=EXPECTED_PRE0026_LEDGER:
        raise PreflightRejected("Migration ledger does not match captured reviewed pre-0026 state")
    return True

def cell_hash(hasher,value):
    if value is None:kind,payload=b"N",b""
    elif type(value) is bytes:kind,payload=b"B",value
    elif type(value) is int:kind,payload=b"I",str(value).encode()
    elif type(value) is float:kind,payload=b"F",value.hex().encode()
    elif type(value) is str:kind,payload=b"T",value.encode("utf-8","surrogatepass")
    else:raise PreflightRejected("Unrecognized SQLite cell type")
    hasher.update(kind)
    hasher.update(len(payload).to_bytes(8,"big"))
    hasher.update(payload)

def table_fingerprint(conn,name):
    # Names must originate only from the validated captured source schema.
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]{0,127}",name):
        raise PreflightRejected("Untrusted table name")
    quoted='"'+name+'"'
    columns=[x[1] for x in conn.execute("PRAGMA table_info("+quoted+")")]
    if not columns:raise PreflightRejected("Captured table no longer has columns")
    try:
        records=conn.execute("SELECT * FROM "+quoted+" ORDER BY rowid")
    except sqlite3.OperationalError:
        # WITHOUT ROWID tables: deterministic order by all exposed columns.
        records=conn.execute("SELECT * FROM "+quoted+" ORDER BY "+
                             ",".join(str(i) for i in range(1,len(columns)+1)))
    h=hashlib.sha256()
    h.update(name.encode())
    for col in columns:cell_hash(h,col)
    count=0
    for row in records:
        count+=1
        if count>MAX_ROWS:
            raise PreflightRejected("Offline table exceeds bounded review size")
        for value in row:cell_hash(h,value)
    h.update(count.to_bytes(8,"big"))
    return (count,h.digest())

def fingerprint_tables(conn,objects):
    names=sorted(item["name"] for item in objects if item["type"]=="table")
    return {name:table_fingerprint(conn,name) for name in names}

def sqlite_readonly(path):
    # file URI is local only. The connection may not mutate input.
    uri="file:"+quote(str(path),safe="/")+ "?mode=ro"
    conn=sqlite3.connect(uri,uri=True,timeout=3)
    conn.execute("PRAGMA query_only=ON")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn

def rehearse(input_backup,*,expected_backup_sha256,expected_migration_sha256,
             capture_path=None,migration_path=None):
    backup=Path(input_backup)
    if not backup.is_file() or backup.is_symlink():
        raise PreflightRejected("Input must be an existing regular local backup file")
    if not 1<=backup.stat().st_size<=MAX_SOURCE_BYTES:
        raise PreflightRejected("Backup size outside bounded offline qualification")
    expected_pattern=r"[0-9a-f]{64}"
    if not re.fullmatch(expected_pattern,expected_backup_sha256):
        raise PreflightRejected("An exact trusted backup SHA-256 is required")
    if not re.fullmatch(expected_pattern,expected_migration_sha256):
        raise PreflightRejected("An exact reviewed migration SHA-256 is required")
    if digest_file(backup)!=expected_backup_sha256:
        raise PreflightRejected("Input backup checksum mismatch")
    capture_path=Path(capture_path or ROOT/"docs/evidence/production-d1-recovery-v2/captured-schema.json")
    migration_path=Path(migration_path or ROOT/"migrations/0026_cron_mail_outbox.sql")
    capture=json.loads(capture_path.read_text())
    before_objects=validate_capture(capture)
    if digest_file(migration_path)!=expected_migration_sha256:
        raise PreflightRejected("Proposed migration checksum mismatch")

    with tempfile.TemporaryDirectory(prefix="pcs-private-restore-") as dirname:
        private_copy=Path(dirname)/"rehearsal.sqlite"
        source=sqlite_readonly(backup)
        try:
            if schema_rows(source)!=before_objects:
                raise PreflightRejected("Backup schema differs from exact captured schema")
            integrity(source)
            read_ledger(source)
            initial=fingerprint_tables(source,before_objects)
            dest=sqlite3.connect(private_copy)
            os.chmod(private_copy,0o600)
            try:
                source.backup(dest)
                dest.execute("PRAGMA foreign_keys=ON")
                if schema_rows(dest)!=before_objects:
                    raise PreflightRejected("Cloned snapshot schema differs from source")
                if fingerprint_tables(dest,before_objects)!=initial:
                    raise PreflightRejected("Local restoration altered historical table rows")

                # On a PRIVATE, disposable copy only. Never the source file.
                statements=migration_path.read_text()
                dest.executescript(statements)
                after_objects=schema_rows(dest)
                old={obj["name"]:obj for obj in before_objects}
                newer={obj["name"]:obj for obj in after_objects}
                if {k:v for k,v in newer.items() if k in old}!=old:
                    raise PreflightRejected("Migration modified or removed captured objects")
                if set(newer)-set(old)!=EXPECTED_NEW:
                    raise PreflightRejected("Migration created unexpected objects")
                if fingerprint_tables(dest,before_objects)!=initial:
                    raise PreflightRejected("Migration altered preexisting application rows")
                if dest.execute("SELECT COUNT(*) FROM cron_delivery_attempts").fetchone()[0]!=0:
                    raise PreflightRejected("New mail ledger unexpectedly contains existing rows")
                read_ledger(dest)
                integrity(dest)
            finally:
                dest.close()
        finally:
            source.close()

    # Explicitly verify that the original backup was not modified.
    if digest_file(backup)!=expected_backup_sha256:
        raise PreflightRejected("Input backup changed during offline rehearsal")
    return {
        "format":FORMAT,
        "offline_rehearsal_passed":True,
        "preexisting_tables_same_rows":True,
        "captured_schema_objects_preserved":len(before_objects),
        "new_schema_object_count":len(EXPECTED_NEW),
        "foreign_keys_and_integrity_checked":True,
        "original_backup_not_mutated":True,
        "migration_ledger_not_backfilled":True,
        "input_checksum_pin_verified":True,
        "migration_checksum_pin_verified":True,
        "production_data_not_exported_or_logged":True,
        "cloudflare_network_access_used":False,
        "protected_source_admitted":False,
        "production_deployment_authorized":False,
        "production_migration_authorized":False,
        "backup_authenticity_independently_proven":False,
    }

def main():
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input-backup",type=Path,required=True,
                   help="Owner-supplied PRIVATE SQLite restore, never production D1")
    p.add_argument("--backup-sha256",required=True)
    p.add_argument("--migration-sha256",required=True)
    p.add_argument("--output",type=Path,required=True)
    args=p.parse_args()
    try:
        result=rehearse(args.input_backup,
            expected_backup_sha256=args.backup_sha256,
            expected_migration_sha256=args.migration_sha256)
        # No overwrites: evidence from a previous run remains immutable.
        with args.output.open("x",encoding="utf-8") as fp:
            json.dump(result,fp,sort_keys=True,indent=2)
            fp.write("\n")
        print("Offline private-copy migration rehearsal PASS; no production action")
    except (PreflightRejected,sqlite3.Error,OSError,ValueError):
        # Do not print sensitive paths, SQL errors, source rows, or backup hashes.
        print("Offline private-copy migration rehearsal BLOCKED",file=sys.stderr)
        raise SystemExit(1)

if __name__=="__main__":
    main()
