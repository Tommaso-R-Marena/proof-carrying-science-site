"""Schema-only D1 recovery into fresh isolated SQLite; never applies production migrations.

Optional capture uses one fixed sqlite_master SELECT. No application rows or
migration ledger are read remotely. All writes and fixtures are local/synthetic.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import re
import sqlite3
import tempfile
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone, timedelta
from pathlib import Path

from d1_production_preflight import SCHEMA_QUERY, fixed_query, sha
from d1_reconcile import inventory

MAX_OBJECTS = 256
MAX_SCHEMA_BYTES = 1_048_576
FIXTURE_TIME = '2026-10-13T00:00:00.000Z'
NAME = re.compile(r'^[A-Za-z_][A-Za-z0-9_]{0,127}$')
KINDS = ('table', 'index', 'view', 'trigger')
FUTURE_SUCCESS = 'CREATE INDEX pcs_schema_recovery_v2_future_probe ON bridge_research_sessions(user_id,created_at,id);'
FUTURE_FAILURE = 'CREATE TABLE pcs_schema_recovery_v2_rollback_probe(id INTEGER); CREATE INDEX pcs_schema_recovery_v2_bad_index ON bridge_research_sessions(missing_recovery_column);'


def digest_bytes(value):
    return hashlib.sha256(value).hexdigest()


def sql_tokens(text):
    """Lex comments/quoted strings separately so review doesn't mistake literals for writes."""
    pattern = re.compile(r"--[^\n]*(?:\n|$)|/\*.*?\*/|'(?:''|[^'])*'|\"(?:\"\"|[^\"])*\"|`(?:``|[^`])*`|\[[^\]]*\]|[A-Za-z_][A-Za-z0-9_]*|[^\s]", re.S)
    result = []
    for match in pattern.finditer(text):
        token = match.group()
        if token.startswith(('--', '/*', "'")):
            continue
        if token.startswith(('"', '`', '[')):
            result.append(token[1:-1].replace(token[0] * 2, token[0]))
        else:
            result.append(token)
    return result


def statements(text):
    # sqlite3.complete_statement handles trigger BEGIN/END and quoted semicolons.
    pending = ''
    result = []
    for character in text:
        pending += character
        if character == ';' and sqlite3.complete_statement(pending):
            if sql_tokens(pending):
                result.append(pending.strip())
            pending = ''
    if sql_tokens(pending):
        raise ValueError('Incomplete SQL statement')
    return result


def validate_capture(capture):
    if type(capture) is not dict:
        raise ValueError('Malformed schema capture')
    if capture.get('format') != 'pcs-schema-only-capture-v2' or capture.get('query') != SCHEMA_QUERY:
        raise ValueError('Only the fixed schema-only capture format is supported')
    objects = capture.get('objects')
    if type(objects) is not list or not 1 <= len(objects) <= MAX_OBJECTS:
        raise ValueError('Schema object bound')
    if len(json.dumps(objects).encode()) > MAX_SCHEMA_BYTES:
        raise ValueError('Schema byte bound')
    if capture.get('schema_sha256') != sha(objects):
        raise ValueError('Captured schema digest mismatch')
    names = set()
    for obj in objects:
        if type(obj) is not dict or set(obj) != {'type', 'name', 'table_name', 'sql'} or obj['type'] not in KINDS:
            raise ValueError('Malformed schema object')
        if type(obj['name']) is not str or type(obj['table_name']) is not str or not NAME.fullmatch(obj['name']) or not NAME.fullmatch(obj['table_name']) or obj['name'] in names:
            raise ValueError('Schema name bound or duplicate')
        names.add(obj['name'])
        sql = obj['sql']
        if type(sql) is not str or len(sql.encode()) > 65536:
            raise ValueError('Missing or oversized executable DDL')
        if not re.match(r'^CREATE\s+(?:UNIQUE\s+)?' + obj['type'] + r'\b', sql, re.I):
            raise ValueError('Unsupported schema statement')
        tokens = [t.upper() for t in sql_tokens(sql)]
        if any(tokens[i:i + 2] == ['AS', 'SELECT'] for i in range(len(tokens) - 1)) and obj['type'] == 'table':
            raise ValueError('CREATE TABLE AS SELECT is not schema-only')
    return objects


def safe_authorizer(action, arg1, arg2, database, trigger):
    if action in {sqlite3.SQLITE_ATTACH, sqlite3.SQLITE_DETACH}:
        return sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_FUNCTION and str(arg2).lower() in {'load_extension', 'readfile', 'writefile'}:
        return sqlite3.SQLITE_DENY
    if action == sqlite3.SQLITE_PRAGMA and str(arg1).lower() in {'writable_schema', 'trusted_schema'}:
        return sqlite3.SQLITE_DENY
    return sqlite3.SQLITE_OK


def schema_rows(db):
    return [dict(zip(('type', 'name', 'table_name', 'sql'), row)) for row in db.execute(SCHEMA_QUERY)]


def schema_layout(db, objects):
    result = {}
    for obj in objects:
        quoted = '"' + obj['name'].replace('"', '""') + '"'
        if obj['type'] == 'table':
            result[obj['name']] = {'columns': [list(r) for r in db.execute('PRAGMA table_xinfo(' + quoted + ')')],
                                   'foreign_keys': [list(r) for r in db.execute('PRAGMA foreign_key_list(' + quoted + ')')],
                                   'indexes': [list(r) for r in db.execute('PRAGMA index_list(' + quoted + ')')]}
        elif obj['type'] == 'index':
            result[obj['name']] = {'columns': [list(r) for r in db.execute('PRAGMA index_xinfo(' + quoted + ')')]}
    return result


def verify_foreign_key_targets(db):
    tables = {row['name']: row for row in schema_rows(db) if row['type'] == 'table'}
    names = {name.lower(): name for name in tables}
    for name in tables:
        quoted = '"' + name.replace('"', '""') + '"'
        for foreign in db.execute('PRAGMA foreign_key_list(' + quoted + ')'):
            target = names.get(foreign[2].lower())
            if target is None:
                raise ValueError('Foreign key references a missing local table')
            if foreign[4] is not None:
                quoted_target = '"' + target.replace('"', '""') + '"'
                columns = {r[1].lower() for r in db.execute('PRAGMA table_xinfo(' + quoted_target + ')')}
                if foreign[4].lower() not in columns:
                    raise ValueError('Foreign key references a missing local column')


def restore_schema(capture, target):
    objects = validate_capture(capture)
    target = Path(target)
    # Never overwrite an operator's existing database or follow a destination symlink.
    descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    db = sqlite3.connect(target)
    try:
        db.execute('PRAGMA foreign_keys=ON')
        db.set_authorizer(safe_authorizer)
        db.execute('BEGIN IMMEDIATE')
        for kind in KINDS:
            for obj in objects:
                if obj['type'] == kind:
                    db.execute(obj['sql'])
        restored = schema_rows(db)
        if restored != objects:
            raise ValueError('Restored object identity differs from capture')
        verify_foreign_key_targets(db)
        state = inventory(db)
        if state['integrity'] != ['ok'] or state['foreign_key_violations'] != 0:
            raise ValueError('Restored schema integrity failure')
        if any(r['row_count'] for r in state['tables'].values()):
            raise ValueError('Schema-only reconstruction created application rows')
        layout = schema_layout(db, restored)
        db.commit()
        return {'format': 'pcs-d1-schema-restoration-v2', 'objects': len(objects),
                'exact_schema_sha256': sha(restored), 'capture_identity_equal': True,
                'layout_sha256': sha(layout), 'layout': layout,
                'foreign_keys_enabled': bool(db.execute('PRAGMA foreign_keys').fetchone()[0]),
                'integrity': state['integrity'], 'foreign_key_violations': 0,
                'restored_application_rows': 0, 'historical_migrations_executed': 0,
                'production_rows_restored': 0, 'production_recovery_proven': False}
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def insert(db, table, values):
    if not NAME.fullmatch(table) or any(not NAME.fullmatch(k) for k in values):
        raise ValueError('Fixture identifier bound')
    db.execute('INSERT INTO ' + table + '(' + ','.join(values) + ') VALUES(' + ','.join('?' for _ in values) + ')', list(values.values()))


def expect_rejection(db, name, operation):
    db.execute('SAVEPOINT pcs_recovery_negative')
    try:
        operation()
    except sqlite3.DatabaseError:
        db.execute('ROLLBACK TO pcs_recovery_negative')
        db.execute('RELEASE pcs_recovery_negative')
        return {'control': name, 'expected_rejection': True, 'passed': True}
    db.execute('ROLLBACK TO pcs_recovery_negative')
    db.execute('RELEASE pcs_recovery_negative')
    raise AssertionError('Restored schema accepted forbidden fixture: ' + name)


def synthetic_user(db, identifier, *, owner=0, explicit_iterations=True):
    values = {'id': identifier, 'email': identifier + '@pcs-fixture.invalid', 'display_name': 'Synthetic recovery fixture',
              'password_hash': 'SYNTHETIC_NON_CREDENTIAL', 'password_salt': 'SYNTHETIC_NON_CREDENTIAL',
              'recovery_hash': 'SYNTHETIC_NON_CREDENTIAL', 'level': 4, 'is_owner': owner,
              'created_at': FIXTURE_TIME, 'updated_at': FIXTURE_TIME}
    if explicit_iterations:
        values['password_iterations'] = 100000
    insert(db, 'users', values)


def exercise_constraints(path):
    db = sqlite3.connect(path)
    db.execute('PRAGMA foreign_keys=ON')
    controls = []
    try:
        synthetic_user(db, 'fixture-owner', owner=1)
        synthetic_user(db, 'fixture-user')
        synthetic_user(db, 'fixture-other')
        synthetic_user(db, 'fixture-default', explicit_iterations=False)
        controls.append({'control': 'captured_auth_default_preserved', 'passed': db.execute("SELECT password_iterations FROM users WHERE id='fixture-default'").fetchone()[0] == 250000,
                         'scope': 'Synthetic omitted-field insert; no existing credential read or login attempted.'})
        controls.append({'control': 'current_explicit_auth_iterations_preserved', 'passed': db.execute("SELECT password_iterations FROM users WHERE id='fixture-user'").fetchone()[0] == 100000})
        controls.append(expect_rejection(db, 'case_insensitive_email_unique', lambda: synthetic_user(db, 'FIXTURE-USER')))
        controls.append(expect_rejection(db, 'single_owner', lambda: synthetic_user(db, 'fixture-second-owner', owner=1)))
        controls.append(expect_rejection(db, 'user_level_check', lambda: db.execute("UPDATE users SET level=7 WHERE id='fixture-user'")))
        bridge = {'id': 'fixture-donation', 'user_id': 'fixture-user', 'mission_id': 'synthetic', 'version': 'synthetic-only-v2',
                  'session_digest': 'a' * 64, 'session_json': '{}', 'replay_json': '{}',
                  'consent_version': 'pcs-bridge-adult-cc0-optin-v1', 'created_at': FIXTURE_TIME}
        insert(db, 'bridge_research_sessions', bridge)
        for name, updates in [('bridge_duplicate_membership', {'id': 'fixture-duplicate'}),
                              ('bridge_invalid_consent', {'id': 'fixture-consent', 'session_digest': 'b' * 64, 'consent_version': 'forged'}),
                              ('bridge_missing_actor', {'id': 'fixture-orphan', 'session_digest': 'c' * 64, 'user_id': 'fixture-missing'}),
                              ('bridge_bad_digest_length', {'id': 'fixture-digest', 'session_digest': 'short'}),
                              ('bridge_oversized_session', {'id': 'fixture-size', 'session_digest': 'd' * 64, 'session_json': 'x' * 20001})]:
            controls.append(expect_rejection(db, name, lambda u=updates: insert(db, 'bridge_research_sessions', {**bridge, **u})))
        audit = {'id': 'fixture-audit', 'actor_user_id': 'fixture-user', 'action': 'synthetic_recovery', 'subject_type': 'synthetic',
                 'subject_id': 'synthetic', 'detail_json': '{}', 'created_at': FIXTURE_TIME}
        insert(db, 'audit_log', audit)
        archive = {'event_id': 'fixture-archive', 'actor_user_id': 'fixture-user', 'action': 'synthetic_recovery', 'subject_type': 'synthetic',
                   'subject_id': 'synthetic', 'detail_json': '{}', 'created_at': FIXTURE_TIME, 'prev_hash': 'SYNTHETIC_GENESIS', 'event_hash': 'a' * 64}
        insert(db, 'audit_archive', archive)
        controls.append(expect_rejection(db, 'audit_archive_immutable_update', lambda: db.execute("UPDATE audit_archive SET detail_json='forged'")))
        controls.append(expect_rejection(db, 'audit_archive_immutable_delete', lambda: db.execute('DELETE FROM audit_archive')))
        controls.append(expect_rejection(db, 'audit_log_immutable_delete', lambda: db.execute('DELETE FROM audit_log')))
        for index in range(4):
            insert(db, 'tasks', {'id': f'fixture-task-{index}', 'title': 'Synthetic fixture', 'summary': 'No real contributor task',
                                'claim_mode': 'approval', 'expected_hours': 1, 'created_at': FIXTURE_TIME, 'updated_at': FIXTURE_TIME})
        def request(index, user='fixture-other', **extra):
            return {'id': f'fixture-request-{index}-{user}', 'task_id': f'fixture-task-{index}', 'user_id': user,
                    'requested_at': FIXTURE_TIME, 'decision_due_at': FIXTURE_TIME, **extra}
        insert(db, 'task_requests', request(0)); insert(db, 'task_requests', request(1))
        controls.append(expect_rejection(db, 'pending_high_trust_cap', lambda: insert(db, 'task_requests', request(2))))
        controls.append(expect_rejection(db, 'active_request_unique', lambda: insert(db, 'task_requests', {**request(0), 'id': 'fixture-request-duplicate'})))
        db.execute("UPDATE task_requests SET status='approved',reservation_key=task_id WHERE user_id='fixture-other'")
        insert(db, 'task_requests', request(2))
        controls.append(expect_rejection(db, 'approved_reservation_cap', lambda: db.execute("UPDATE task_requests SET status='approved' WHERE task_id='fixture-task-2'")))
        insert(db, 'task_requests', request(0, 'fixture-owner'))
        controls.append(expect_rejection(db, 'exclusive_reservation_unique', lambda: db.execute("UPDATE task_requests SET status='approved',reservation_key=task_id WHERE user_id='fixture-owner'")))
        evaluation = {'id': 'fixture-evaluation-0', 'user_id': 'fixture-owner', 'skill': 'lean', 'variant_token': 'synthetic',
                      'challenge_json': '{}', 'answer_key_json': '{}', 'created_at': FIXTURE_TIME, 'expires_at': FIXTURE_TIME}
        insert(db, 'competency_evaluations', evaluation)
        controls.append(expect_rejection(db, 'single_open_evaluation', lambda: insert(db, 'competency_evaluations', {**evaluation, 'id': 'fixture-evaluation-duplicate'})))
        db.execute("UPDATE competency_evaluations SET status='submitted'")
        for index in (1, 2):
            insert(db, 'competency_evaluations', {**evaluation, 'id': 'fixture-evaluation-' + str(index), 'status': 'submitted'})
        controls.append(expect_rejection(db, 'daily_evaluation_attempt_cap', lambda: insert(db, 'competency_evaluations', {**evaluation, 'id': 'fixture-evaluation-over-cap', 'status': 'submitted'})))
        insert(db, 'sessions', {'token_hash': 'SYNTHETIC_SESSION', 'user_id': 'fixture-user',
                               'created_at': FIXTURE_TIME, 'expires_at': FIXTURE_TIME, 'last_seen_at': FIXTURE_TIME})
        db.execute("DELETE FROM users WHERE id='fixture-user'")
        controls.append({'control': 'account_cascade_donation_erasure', 'passed': db.execute('SELECT count(*) FROM bridge_research_sessions').fetchone()[0] == 0})
        controls.append({'control': 'account_cascade_session_erasure', 'passed': db.execute('SELECT count(*) FROM sessions').fetchone()[0] == 0})
        controls.append({'control': 'legacy_audit_actor_nulling', 'passed': db.execute('SELECT actor_user_id FROM audit_log').fetchone()[0] is None})
        controls.append({'control': 'archive_actor_snapshot_retained', 'passed': db.execute('SELECT actor_user_id FROM audit_archive').fetchone()[0] == 'fixture-user'})
        controls.append({'control': 'migration_ledger_not_backfilled', 'passed': db.execute('SELECT count(*) FROM d1_migrations').fetchone()[0] == 0})
        if any(c['passed'] is not True for c in controls):
            raise AssertionError('A schema recovery control failed')
        db.commit()
        state = inventory(db)
        return {'format': 'pcs-restored-schema-synthetic-controls-v2', 'controls': controls, 'passed': len(controls),
                'fixtures': 'Explicitly synthetic, no real people, credentials or production records.',
                'populated_tables': {k: r['row_count'] for k, r in state['tables'].items() if r['row_count']},
                'fixture_data_sha256': sha(state['tables']), 'integrity': state['integrity'],
                'foreign_key_violations': state['foreign_key_violations'],
                'application_meaning_or_consent_authorized_by_schema': False,
                'schema_does_not_verify_replay_or_human_consent': True}
    finally:
        db.close()


def atomic_query(source):
    raw = Path(source).read_text()
    queries = re.findall(r'\.prepare\(`(.*?)`\)\.bind', raw, re.S)
    if len(queries) != 1 or '${' in queries[0] or 'AS MATERIALIZED' not in queries[0]:
        raise ValueError('Unsupported source-bound atomic admission SQL extraction')
    return queries[0], digest_bytes(Path(source).read_bytes())


def quota_key(scope, ip):
    digest = hashlib.sha256(('SYNTHETIC_RECOVERY_SALT:' + scope + ':' + ip).encode()).digest()
    return base64.urlsafe_b64encode(digest).decode().rstrip('=')


def exercise_atomic_admission(path, source):
    sql, source_hash = atomic_query(source)
    now = FIXTURE_TIME
    cutoff = (datetime.fromisoformat(now.replace('Z', '+00:00')) - timedelta(days=1)).isoformat(timespec='milliseconds').replace('+00:00', 'Z')
    global_key = quota_key('public-lean-global', 'PCS_PUBLIC_LEAN_GLOBAL')
    def attempt(index):
        ip_key = quota_key('public-lean-submit', f'198.51.100.{index}')
        with sqlite3.connect(path, timeout=10) as db:
            rows = db.execute(sql, (ip_key, global_key, cutoff, ip_key, cutoff, global_key, ip_key, now, global_key, now, cutoff, cutoff)).fetchall()
        return len(rows)
    with ThreadPoolExecutor(max_workers=8) as pool:
        outcomes = list(pool.map(attempt, range(60)))
    with sqlite3.connect(path) as db:
        rows = list(db.execute('SELECT key,count FROM rate_limits'))
    if outcomes.count(2) != 12 or outcomes.count(0) != 48 or len(rows) != 13:
        raise AssertionError('Captured schema failed source-SQL admission race')
    if dict(rows)[global_key] != 12 or any(count != 1 for key, count in rows if key != global_key):
        raise AssertionError('Atomic admission produced partial or excess charges')
    return {'format': 'pcs-restored-schema-atomic-admission-v2', 'source_sha256': source_hash,
            'sql_sha256': digest_bytes(sql.encode()), 'attempts': 60, 'threads': 8, 'admitted': 12,
            'denied': 48, 'partial_client_charges': 0, 'scope': 'Exact extracted JavaScript SQL, local SQLite synthetic keys; not full Worker execution or a language-refinement proof.'}


def analyze_historical_migrations(folder, recorded):
    result = []
    for path in sorted(Path(folder).glob('*.sql')):
        text = path.read_text()
        effects = []
        for statement in statements(text):
            tokens = sql_tokens(statement)
            upper = [t.upper() for t in tokens]
            if not tokens or upper[0] not in {'INSERT', 'UPDATE', 'DELETE', 'REPLACE'}:
                continue
            kind = upper[0]
            if kind in {'INSERT', 'REPLACE'}:
                position = upper.index('INTO') + 1 if 'INTO' in upper else 1
            elif kind == 'DELETE':
                position = upper.index('FROM') + 1
            else:
                position = 1
            effects.append({'operation': kind, 'table': tokens[position],
                            'statement_sha256': digest_bytes(statement.encode()),
                            'replace_may_delete_then_insert': 'REPLACE' in upper[:position],
                            'insert_conflict_policy': upper[2] if len(upper)>2 and upper[0]=='INSERT' and upper[1]=='OR' else 'plain_or_explicit_upsert',
                            'contains_upsert_update': any(upper[i:i+2]==['DO','UPDATE'] for i in range(len(upper)-1)),
                            'where_clause_present': 'WHERE' in upper,
                            'unconditional_update': kind=='UPDATE' and 'WHERE' not in upper,
                            'production_effect_proven': False,
                            'review_required': 'Compare intended historical effect with authorized backup/operator records; never infer execution from schema presence.'})
        result.append({'name': path.name, 'source_sha256': digest_bytes(path.read_bytes()),
                       'recorded_in_prior_observed_ledger': path.name in recorded,
                       'historical_sql_executed_by_this_tool': False, 'data_effects': effects,
                       'future_schema_default_effects_require_review': any(t.upper() in {'ALTER', 'DEFAULT'} for t in sql_tokens(text)),
                       'replay_or_ledger_backfill_authorized': False})
    return result


def future_candidate(source, target, sql):
    # Additive local DDL only; no historical migration files or row-changing SQL.
    if type(sql) is not str or len(sql.encode())>65536:
        raise ValueError('Future candidate byte bound')
    commands = statements(sql)
    if not commands or len(commands) > 16:
        raise ValueError('Future candidate statement bound')
    for command in commands:
        tokens = [t.upper() for t in sql_tokens(command)]
        offset = 2 if len(tokens) > 2 and tokens[1] == 'UNIQUE' else 1
        if tokens[0] != 'CREATE' or tokens[offset] not in {'INDEX', 'TABLE'}:
            raise ValueError('Only additive local table/index candidates are supported')
        if any(tokens[i:i + 2] == ['AS', 'SELECT'] for i in range(len(tokens) - 1)):
            raise ValueError('Data-producing DDL is not supported')
    # Online backup of synthetic restored local database, never production data.
    descriptor = os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(descriptor)
    with sqlite3.connect(Path(source).resolve().as_uri() + '?mode=ro', uri=True) as original:
        before = inventory(original)
        with sqlite3.connect(target) as clone:
            original.backup(clone)
            clone.execute('PRAGMA foreign_keys=ON')
            clone.set_authorizer(safe_authorizer)
            failure = None
            try:
                clone.execute('BEGIN IMMEDIATE')
                for command in commands:
                    clone.execute(command)
                verify_foreign_key_targets(clone)
                clone.commit()
            except (sqlite3.DatabaseError, ValueError) as error:
                clone.rollback()
                failure = type(error).__name__
            after = inventory(clone)
        unchanged = inventory(original) == before
    if not unchanged:
        raise AssertionError('Future candidate changed read-only source')
    preserved_data = all(after['tables'].get(name) == info for name, info in before['tables'].items())
    return {'format': 'pcs-local-future-schema-candidate-v2', 'candidate_sha256': digest_bytes(sql.encode()),
            'candidate_failed': failure is not None, 'error_category': failure,
            'source_unchanged': unchanged, 'all_existing_table_rows_and_layout_preserved': preserved_data,
            'rollback_exact_state_equal': after == before if failure else None,
            'added_objects': sorted(set(o['name'] for o in after['objects']) - set(o['name'] for o in before['objects'])),
            'before_schema_sha256': before['schema_sha256'], 'after_schema_sha256': after['schema_sha256'],
            'integrity': after['integrity'], 'foreign_key_violations': after['foreign_key_violations'],
            'scope': 'Isolated clone of synthetic fixtures reconstructed from production schema metadata.',
            'production_change_authorized': False}


def campaign(capture, migrations, admission_source, ledger_report):
    with tempfile.TemporaryDirectory(prefix='pcs-schema-only-recovery-v2-') as temporary:
        root = Path(temporary)
        restored = root / 'schema.sqlite'
        restoration = restore_schema(capture, restored)
        controls = exercise_constraints(restored)
        admission = exercise_atomic_admission(restored, admission_source)
        successful = future_candidate(restored, root / 'future.sqlite', FUTURE_SUCCESS)
        negative = future_candidate(restored, root / 'rollback.sqlite', FUTURE_FAILURE)
        if successful['candidate_failed'] or not successful['all_existing_table_rows_and_layout_preserved']:
            raise AssertionError('Additive future candidate lost existing fixture state')
        if not negative['candidate_failed'] or not negative['rollback_exact_state_equal']:
            raise AssertionError('Failing future candidate did not restore exact state')
        # Corrupt a captured index to force a failure after table creation.
        malformed = json.loads(json.dumps(capture))
        index = next(o for o in malformed['objects'] if o['type'] == 'index')
        index['sql'] = 'CREATE INDEX ' + index['name'] + ' ON pcs_missing_restoration_table(id)'
        malformed['schema_sha256'] = sha(malformed['objects'])
        failed_path = root / 'failed.sqlite'
        failure = None
        try:
            restore_schema(malformed, failed_path)
        except sqlite3.DatabaseError as error:
            failure = type(error).__name__
        with sqlite3.connect(failed_path) as failed:
            residual_objects = len(schema_rows(failed))
        if not failure or residual_objects != 0:
            raise AssertionError('Failed schema restoration retained partial objects')
    prior_recorded = ledger_report.get('recorded_migrations', [])
    historical = analyze_historical_migrations(migrations, set(prior_recorded))
    return {'format': 'pcs-production-schema-only-recovery-campaign-v2', 'schema_capture_sha256': capture['schema_sha256'],
            'sqlite_version': sqlite3.sqlite_version, 'restoration': restoration,
            'synthetic_constraints': controls, 'atomic_admission': admission,
            'future_additive_candidate': successful, 'future_negative_candidate': negative,
            'failed_schema_restoration_fixture': {'failure': failure, 'partial_objects_remaining': residual_objects,
                                                   'mutated_capture': malformed, 'negative_control': True},
            'historical_migration_analysis': historical,
            'ledger_reference_scope': 'Prior public metadata preflight; no new remote ledger read and no inference of present ledger/data state.',
            'ledger_reference_sha256': sha(ledger_report),
            'production_application_rows_read': False, 'production_modified': False,
            'production_backup_restore_exercised': False, 'historical_ledger_backfill_authorized': False,
            'local_schema_only_and_synthetic_recovery_exercised': True,
            'real_data_recovery_boundary': 'Production row contents, application history, actual account/game/audit preservation, point-in-time RPO/RTO, remote restore/cutover and operator-approved ledger reconciliation remain untested.',
            'financial_actions': 0}


def write_fresh_json(path, value):
    descriptor = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(descriptor, 'w') as stream:
        json.dump(value, stream, indent=2)
        stream.write('\n')


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--capture', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    parser.add_argument('--database', help='Only with --capture-production; fixed schema SELECT only')
    parser.add_argument('--capture-production', action='store_true')
    parser.add_argument('--migrations', type=Path, default=Path(__file__).resolve().parents[1] / 'migrations')
    parser.add_argument('--admission-source', type=Path, default=Path(__file__).resolve().parents[1] / 'src/lean-admission.js')
    parser.add_argument('--prior-preflight', type=Path, default=Path(__file__).resolve().parents[1] / 'docs/evidence/production-d1-preflight-v1/schema-preflight.json')
    args = parser.parse_args()
    if os.path.lexists(args.output):
        parser.error('Use a fresh output path; historical evidence is never overwritten')
    if args.capture_production:
        if not args.database or os.path.lexists(args.capture):
            parser.error('A database ID and fresh capture path are required')
        objects = fixed_query(os.environ['CLOUDFLARE_ACCOUNT_ID'], args.database, os.environ['CLOUDFLARE_API_TOKEN'], SCHEMA_QUERY)
        write_fresh_json(args.capture, {'format': 'pcs-schema-only-capture-v2', 'captured_at': datetime.now(timezone.utc).isoformat(),
                              'query': SCHEMA_QUERY, 'schema_sha256': sha(objects), 'objects': objects,
                              'production_rows_read': False, 'production_written': False})
    capture = json.loads(args.capture.read_text())
    result = campaign(capture, args.migrations, args.admission_source, json.loads(args.prior_preflight.read_text()))
    write_fresh_json(args.output, result)
    print(json.dumps({'objects': result['restoration']['objects'], 'controls': result['synthetic_constraints']['passed'],
                      'atomic_admitted': result['atomic_admission']['admitted'], 'production_recovery_proven': False}))


if __name__ == '__main__':
    main()
