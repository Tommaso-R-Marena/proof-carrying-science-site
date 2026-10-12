"""Read-only SQLite/D1-export reconciliation and isolated recovery; never contacts production."""
from __future__ import annotations
import argparse, hashlib, json, re, sqlite3, tempfile
from pathlib import Path


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def readonly(path):
    return sqlite3.connect(Path(path).resolve().as_uri() + '?mode=ro', uri=True)


def inventory(db):
    objects = [dict(zip(('type','name','table','sql'), row)) for row in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' ORDER BY type,name")]
    tables = {}
    for obj in objects:
        if obj['type'] != 'table': continue
        name = obj['name']; quoted = '"' + name.replace('"','""') + '"'
        columns = [list(row) for row in db.execute('PRAGMA table_info(' + quoted + ')')]
        # Hash only; never emit account rows or personal identifiers.
        ordering=','.join('"'+col[1].replace('"','""')+'"' for col in columns)
        hasher=hashlib.sha256();count=0
        for row in db.execute('SELECT * FROM '+quoted+(' ORDER BY '+ordering if ordering else '')):
            values=[{'sqlite_blob_hex':v.hex()} if isinstance(v,bytes) else v for v in row]
            encoded=json.dumps(values,sort_keys=True,separators=(',',':'),ensure_ascii=False,allow_nan=False).encode()
            hasher.update(len(encoded).to_bytes(8,'big'));hasher.update(encoded);count+=1
        tables[name] = {'columns': columns, 'row_count': count, 'data_sha256': hasher.hexdigest()}
    return {'schema_sha256': digest(objects), 'objects': objects, 'tables': tables, 'integrity': [r[0] for r in db.execute('PRAGMA integrity_check')], 'foreign_key_violations': len(list(db.execute('PRAGMA foreign_key_check')))}


def migration_inventory(folder):
    result=[]
    for file in sorted(Path(folder).glob('*.sql')):
        text=file.read_text(); clean=re.sub(r'--[^\n]*','',text)
        mutations=sorted(set(re.findall(r'\b(INSERT|UPDATE|DELETE|REPLACE|ALTER|DROP)\b',clean,re.I)))
        result.append({'name':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'mutations':mutations,'data_effect_review_required':any(x in mutations for x in ('INSERT','UPDATE','DELETE','REPLACE')),'replay_unsafe_without_review':bool(mutations)})
    return result


def canonical(folder):
    db=sqlite3.connect(':memory:')
    for file in sorted(Path(folder).glob('*.sql')): db.executescript(file.read_text())
    return db



def historical_effects(folder):
    """Actual migration effects on a fresh local reference, not on historical production."""
    db=sqlite3.connect(':memory:');effects=[]
    for file in sorted(Path(folder).glob('*.sql')):
        before=inventory(db);writes=set()
        def authorize(action,table,column,database,trigger):
            if action in (sqlite3.SQLITE_INSERT,sqlite3.SQLITE_UPDATE,sqlite3.SQLITE_DELETE) and table and not table.startswith('sqlite_'):
                writes.add((table,trigger or 'top-level'))
            return sqlite3.SQLITE_OK
        db.set_authorizer(authorize);db.executescript(file.read_text());db.set_authorizer(None);after=inventory(db)
        changed=sorted(n for n in set(before['tables'])|set(after['tables']) if before['tables'].get(n)!=after['tables'].get(n))
        effects.append({'name':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest(),'reference_writes':[{'table':t,'context':c} for t,c in sorted(writes)],'changed_reference_tables':changed,'before_schema_sha256':before['schema_sha256'],'after_schema_sha256':after['schema_sha256']})
    db.close();return effects


def reconcile(path,folder):
    with readonly(path) as actual, canonical(folder) as expected:
        a,b=inventory(actual),inventory(expected)
    amap={o['name']:o for o in a['objects']}; bmap={o['name']:o for o in b['objects']}
    return {'format':'pcs-d1-readonly-reconciliation-v1','database_mutated':False,'production_authorized':False,'actual':a,'canonical':b,'missing_objects':sorted(bmap.keys()-amap.keys()),'extra_objects':sorted(amap.keys()-bmap.keys()),'different_definitions':sorted(n for n in amap.keys()&bmap.keys() if amap[n]!=bmap[n]),'migrations':migration_inventory(folder),'fresh_reference_effects':historical_effects(folder),'historical_execution_proven':False,'ledger_backfill_authorized':False,'data_effect_boundary':'Current row hashes and seed reference do not prove that historical updates ran. Every data-changing migration needs explicit effect review; divergence may be legitimate ongoing user state.'}


def recovery(path,folder):
    before=reconcile(path,folder)
    with tempfile.TemporaryDirectory(prefix='pcs-isolated-recovery-') as temp:
        backup=Path(temp)/'backup.sqlite'; target=Path(temp)/'restored.sqlite'
        with readonly(path) as original, sqlite3.connect(backup) as saved: original.backup(saved)
        with readonly(backup) as saved, sqlite3.connect(target) as restored: saved.backup(restored)
        with sqlite3.connect(target) as db:
            baseline=inventory(db)
            # Transactional corrupted migration: create, then reference missing table. Rollback must remove create.
            try:
                db.execute('BEGIN IMMEDIATE'); db.execute('CREATE TABLE pcs_recovery_probe (id INTEGER)'); db.execute('INSERT INTO pcs_missing_table VALUES (1)')
            except sqlite3.Error: db.rollback()
            after=inventory(db)
            assert after==baseline, 'Corrupted migration changed restored state'
        with readonly(path) as original: assert inventory(original)==before['actual'],'Original source changed'
    return {'format':'pcs-d1-isolated-recovery-v1','backup_restore_equal':baseline==before['actual'],'corrupted_migration_rolled_back':after==baseline,'source_unchanged':True,'schema_sha256':baseline['schema_sha256'],'data_sha256':digest(baseline['tables']),'scope':'Local SQLite online backup/restore and transactional DDL. Does not establish Cloudflare time-travel/remote restore behavior.','financial_spend':0}



def dry_run_pending(path,files):
    """Execute candidate files only on an online-backup clone; original is opened read-only."""
    with readonly(path) as original:
        before=inventory(original)
        with tempfile.TemporaryDirectory(prefix='pcs-migration-dry-run-') as temp:
            target=Path(temp)/'candidate.sqlite'
            with sqlite3.connect(target) as clone: original.backup(clone)
            applied=[];failure=None
            with sqlite3.connect(target) as clone:
                for file in files:
                    file=Path(file)
                    try:
                        clone.executescript(file.read_text())
                        applied.append({'name':file.name,'sha256':hashlib.sha256(file.read_bytes()).hexdigest()})
                    except sqlite3.Error as error:
                        failure={'name':file.name,'error':str(error)};break
                after=inventory(clone)
        assert inventory(original)==before,'Read-only source changed'
    changed=sorted(name for name in set(before['tables'])|set(after['tables']) if before['tables'].get(name)!=after['tables'].get(name))
    return {'format':'pcs-migration-isolated-dry-run-v1','source_unchanged':True,'applied_to_clone':applied,'failure':failure,'clone_integrity':after['integrity'],'clone_foreign_key_violations':after['foreign_key_violations'],'changed_tables':changed,'before_schema_sha256':before['schema_sha256'],'after_schema_sha256':after['schema_sha256'],'production_authorized':False,'clone_discarded':True}


def main():
    p=argparse.ArgumentParser();p.add_argument('database',type=Path);p.add_argument('--migrations',type=Path,default=Path(__file__).resolve().parents[1]/'migrations');p.add_argument('--output',required=True,type=Path);p.add_argument('--exercise-recovery',action='store_true');p.add_argument('--pending',action='append',type=Path,default=[]);args=p.parse_args()
    result=reconcile(args.database,args.migrations)
    if args.exercise_recovery: result['recovery']=recovery(args.database,args.migrations)
    if args.pending: result['dry_run']=dry_run_pending(args.database,args.pending)
    args.output.write_text(json.dumps(result,indent=2)+'\n')
if __name__=='__main__':main()
