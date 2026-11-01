"""Independent exact export comparison and original-byte native transport."""
import hashlib
import re
import subprocess
import tempfile
from pathlib import Path
from file_check import canonical,ids_for,sha,parse_csv,CORE_COMMIT

SCOPE='original-csv-change-review-v2'
RULE_KEYS={'allow_added','allow_removed','allow_changed'}


def validate_rules(rules):
    if type(rules) is not dict or set(rules)!=RULE_KEYS or any(type(x) is not bool for x in rules.values()):
        raise ValueError('Choose the three record-change rules.')
    return rules


def compare(old,new,columns,headers,rules):
    validate_rules(rules)
    if type(columns) is not list or len(columns)!=2:raise ValueError('Choose both ID columns.')
    a,_=ids_for(old,columns[0]);b,_=ids_for(new,columns[1])
    if any(len(lines)!=1 for lines in [*a.values(),*b.values()]):
        raise ValueError('Change review needs one row per ID. Fix repeated IDs before comparing; the shared-ID tool can help find them.')
    if type(headers) is not list or len(headers)>127 or any(type(h) is not str or len(h.encode('utf-8'))>1024 for h in headers) or len(set(headers))!=len(headers):
        raise ValueError('Choose distinct columns to compare.')
    pairs=[]
    for h in headers:
        if h not in old['header'] or h not in new['header']:raise ValueError('A compared heading is missing from one file.')
        pair=[old['header'].index(h),new['header'].index(h)]
        if any(i==c for i,c in zip(pair,columns)):raise ValueError('The ID column is matched separately. Choose other columns for value comparisons.')
        pairs.append(pair)
    left={row[columns[0]]:(row,line) for row,line in zip(old['rows'],old['lines'])}
    right={row[columns[1]]:(row,line) for row,line in zip(new['rows'],new['lines'])}
    order=lambda xs:sorted(xs,key=lambda x:x.encode('utf-8'))
    added=[{'id':k,'line':right[k][1]} for k in order(right.keys()-left.keys())]
    removed=[{'id':k,'line':left[k][1]} for k in order(left.keys()-right.keys())]
    changed=[]
    for k in order(left.keys()&right.keys()):
        diffs=[{'column':h,'before':left[k][0][p[0]],'after':right[k][0][p[1]]} for h,p in zip(headers,pairs) if left[k][0][p[0]]!=right[k][0][p[1]]]
        if diffs:changed.append({'id':k,'before_line':left[k][1],'after_line':right[k][1],'differences':diffs})
    summary={'old_rows':len(old['rows']),'new_rows':len(new['rows']),'added':len(added),'removed':len(removed),'changed':len(changed),'same':len(left.keys()&right.keys())-len(changed),'compared_columns':len(headers)}
    accepted=all(rules['allow_'+kind] or summary[kind]==0 for kind in ['added','removed','changed'])
    old_names=set(old['header'])-{old['header'][columns[0]]};new_names=set(new['header'])-{new['header'][columns[1]]}
    return {'scope':SCOPE,'summary':summary,'accepted':accepted,'added':added,'removed':removed,'changed':changed,'columns_added':order(new_names-old_names),'columns_removed':order(old_names-new_names),'pairs':pairs}


def table_image(table):
    return {'header':[h.encode().hex() for h in table['header']],'rows':[[v.encode().hex() for v in row] for row in table['rows']],'lines':table['lines']}


def native_original(checker,raws,tables,columns,headers=None,rules=None):
    """Only fixed bundled code receives fresh original-file snapshots."""
    review=headers is not None
    if review:
        result=compare(*tables,columns,headers,rules)
        pairs=result['pairs'];bits=sum((1<<i) for i,k in enumerate(['allow_added','allow_removed','allow_changed']) if rules[k])
        args=['changes',*[str(x) for x in columns],*[','.join(str(p[i]) for p in pairs) or '-' for i in [0,1]],str(bits)]
    else:args=['original',*[str(x) for x in columns]]
    checker.check_pin()
    with tempfile.TemporaryDirectory(prefix='pcs-original-csv-') as tmp:
        paths=[Path(tmp)/'old.csv',Path(tmp)/'new.csv']
        for p,raw in zip(paths,raws):p.write_bytes(raw)
        try:r=subprocess.run([str(checker.binary),*args,*map(str,paths)],stdin=subprocess.DEVNULL,cwd=tmp,capture_output=True,timeout=30)
        except (OSError,subprocess.TimeoutExpired) as exc:raise ValueError('The original-file Lean check did not complete. No confirmation was recorded.') from exc
        if any(p.read_bytes()!=raw for p,raw in zip(paths,raws)):raise ValueError('Original file snapshots changed during checking.')
    checker.check_pin()
    if r.returncode or r.stderr or len(r.stdout)>9_000_000:raise ValueError('Lean declined the original CSV files. No confirmation was recorded.')
    try:
        def require(ok):
            if not ok:raise ValueError('Invalid native correspondence')
        wire=r.stdout.decode('ascii').split('\n');require(wire.pop()=='')
        require(wire[:3]==['PCS_CSV2','MODE:'+('changes' if review else 'overlap'),'COLS:'+','.join(map(str,columns))]);wire=wire[3:]
        parsed=[]
        for marker in ['LEFT','RIGHT']:
            require(wire.pop(0)==marker)
            line=wire.pop(0);require(line.startswith('H:'));head=line[2:].split(',')
            rows=[];lines=[]
            while wire and wire[0].startswith('R:'):
                _,line,fields=wire.pop(0).split(':');require(re.fullmatch('[1-9][0-9]*',line))
                rows.append(fields.split(','));lines.append(int(line))
            table={'header':head,'rows':rows,'lines':lines}
            require(table==table_image(tables[len(parsed)]));parsed.append(table)
        if review:
            require(wire.pop(0)=='PROJECT:'+','.join(str(p[0]) for p in pairs)+'|'+','.join(str(p[1]) for p in pairs))
            require(wire.pop(0)=='POLICY:'+','.join('1' if rules[k] else '0' for k in ['allow_added','allow_removed','allow_changed']))
            counts=','.join(str(result['summary'][k]) for k in ['added','removed','changed','same'])
            require(wire.pop(0)=='COUNTS:'+counts)
            verdict='PASS' if result['accepted'] else 'REVIEW'
        else:
            from file_check import analyze
            verdict='DISJOINT' if analyze(*tables,columns)['disjoint'] else 'OVERLAP'
        require(wire==['RESULT:'+verdict,'END'])
    except (ValueError,AssertionError,IndexError,UnicodeError) as exc:
        raise ValueError('The native original-file decoder disagreed with the independent reader. No confirmation was recorded.') from exc
    return {'lean_verdict':verdict,'decoded_sha256':[sha(canonical(t)) for t in parsed],'original_csv_decoding_proved':True}
