"""Independent finite output comparison; no model/label authenticity claim."""
import base64,binascii,hashlib,hmac,re,subprocess,tempfile
from pathlib import Path
from file_check import canonical,sha,parse_csv,ids_for,MAX_BYTES,CORE_COMMIT
from change_review import table_image

SCOPE='original-csv-model-evaluation-v1'
FIELDS=['total','before_matches','after_matches','improvements','regressions']

def provenance(value):
    fields={'baseline_name','candidate_name','baseline_weights_sha256','candidate_weights_sha256','reference_note','source_note'}
    if type(value) is not dict or set(value)!=fields:raise ValueError('Unsupported evaluation provenance.')
    for k in ['baseline_name','candidate_name','reference_note','source_note']:
        if type(value[k]) is not str or len(value[k])>(80 if k.endswith('_name') else 500):raise ValueError('Keep model names and source notes short.')
    for k in ['baseline_weights_sha256','candidate_weights_sha256']:
        if value[k] is not None and (type(value[k]) is not str or not re.fullmatch('[a-f0-9]{64}',value[k])):raise ValueError('Use a SHA-256 digest or leave the weight identity empty.')
    return value

def compare(tables,columns):
    if type(columns) is not list or len(columns)!=3 or any(type(p) is not list or len(p)!=2 or any(type(i) is not int for i in p) or p[0]==p[1] for p in columns):raise ValueError('Choose distinct ID and outcome columns in all three files.')
    maps=[]
    for table,pair in zip(tables,columns):
        if len(table['rows'])>1000 or any(not 0<=i<len(table['header']) for i in pair):raise ValueError('Evaluation supports 1,000 rows per file and valid columns.')
        ids,_=ids_for(table,pair[0])
        if any(len(lines)!=1 for lines in ids.values()):raise ValueError('Every evaluation ID must be unique.')
        maps.append({r[pair[0]]:r[pair[1]] for r in table['rows']})
    if not maps[0].keys()==maps[1].keys()==maps[2].keys():raise ValueError('All three files must contain exactly the same IDs. Missing or extra predictions cannot be ignored.')
    cases=[{'id':r[columns[0][0]],'expected':r[columns[0][1]],'before':maps[1][r[columns[0][0]]],'after':maps[2][r[columns[0][0]]]} for r in tables[0]['rows']]
    old=[c['before']==c['expected'] for c in cases];new=[c['after']==c['expected'] for c in cases]
    summary=dict(zip(FIELDS,[len(cases),sum(old),sum(new),sum(not b and a for b,a in zip(old,new)),sum(b and not a for b,a in zip(old,new))]))
    return {'scope':SCOPE,'summary':summary,'preserved':summary['regressions']==0,'cases':cases}

def evaluate(checker,request):
    if type(request) is not dict or set(request)!={'mode','files','columns','provenance'} or request['mode']!='evaluation' or type(request['files']) is not list or len(request['files'])!=3:raise ValueError('Choose the reference, earlier and new output files.')
    provenance(request['provenance']);raws=[];tables=[]
    for item in request['files']:
        if type(item) is not dict or set(item)!={'name','data_base64','sha256'} or type(item['name']) is not str or len(item['name'])>255 or type(item['data_base64']) is not str or len(item['data_base64'])>((MAX_BYTES+2)//3)*4:raise ValueError('Malformed evaluation snapshot.')
        try:raw=base64.b64decode(item['data_base64'],validate=True)
        except (ValueError,binascii.Error) as e:raise ValueError('Invalid embedded evaluation file.') from e
        if type(item['sha256']) is not str or not re.fullmatch('[a-f0-9]{64}',item['sha256']) or not hmac.compare_digest(sha(raw),item['sha256']) or base64.b64encode(raw).decode()!=item['data_base64']:raise ValueError('Evaluation file identity changed.')
        raws.append(raw);tables.append(parse_csv(raw))
    result=compare(tables,request['columns']);checker.check_pin()
    with tempfile.TemporaryDirectory(prefix='pcs-model-evaluation-') as tmp:
        files=[Path(tmp)/(str(i)+'.csv') for i in range(3)]
        for p,raw in zip(files,raws):p.write_bytes(raw)
        args=['evaluation',*[str(x) for pair in request['columns'] for x in pair],*map(str,files)]
        try:r=subprocess.run([str(checker.binary),*args],stdin=subprocess.DEVNULL,cwd=tmp,capture_output=True,timeout=30)
        except (OSError,subprocess.TimeoutExpired) as e:raise ValueError('Native evaluation did not complete. No confirmation was recorded.') from e
        if any(p.read_bytes()!=raw for p,raw in zip(files,raws)):raise ValueError('Evaluation snapshot changed during checking.')
    checker.check_pin()
    def wire(table):return '\n'.join(['H:'+','.join(x.encode().hex() for x in table['header']),*['R:'+str(line)+':'+','.join(x.encode().hex() for x in row) for line,row in zip(table['lines'],table['rows'])]])
    verdict='PRESERVED' if result['preserved'] else 'REGRESSIONS'
    expected='PCS_EVAL1\nCOLS:'+'|'.join(','.join(map(str,p)) for p in request['columns'])+'\n'+ '\n'.join(name+'\n'+wire(t) for name,t in zip(['GOLD','BEFORE','AFTER'],tables))+'\nCASES\n'+'\n'.join('C:'+','.join(c[k].encode().hex() for k in ['id','expected','before','after']) for c in result['cases'])+'\nCOUNTS:'+','.join(str(result['summary'][k]) for k in FIELDS)+'\nRESULT:'+verdict+'\nEND\n'
    if r.returncode or r.stderr or len(r.stdout)>26_000_000 or r.stdout!=expected.encode('ascii'):raise ValueError('Native evaluation disagreed on original bytes, columns, labels or counts. No confirmation was recorded.')
    return {'format':'pcs-model-evaluation-local-receipt-v1','scope':SCOPE,'authority':'local-lean-original-csv-v2','input_sha256':[sha(x) for x in raws],
            'decoded_sha256':[sha(canonical(table_image(t))) for t in tables],'columns':request['columns'],
            'evaluation_sha256':sha(canonical({'columns':request['columns'],'provenance':request['provenance']})),
            'summary':result['summary'],'preserved':result['preserved'],'lean_verdict':verdict,'checker_sha256':checker.manifest['binary_sha256'],'core_commit':CORE_COMMIT,
            'original_csv_decoding_proved':True,'finite_dataset_only':True,'model_generation_attested':False,'reference_labels_validated':False,
            'host_refinement_proved':False,'signed_receipt':False,'scientific_acceptance':False}
