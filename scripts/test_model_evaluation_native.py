#!/usr/bin/env python3
"""Cross-language finite evaluation against the actual pinned Lean executable.

All affirmative receipts run the real checker. Tampering controls alter only
responses or snapshots of completed genuine calls, never invent authorizations.
"""
import base64,copy,csv,hashlib,http.client,io,itertools,json,random,subprocess,sys,tempfile,threading,time
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'desktop'))
from app import AppServer
from file_check import LocalChecker,canonical
from model_evaluation import evaluate
from handoff import capture_handoff

PROVENANCE={'baseline_name':'Earlier','candidate_name':'New','baseline_weights_sha256':None,'candidate_weights_sha256':None,'reference_note':'Authored test targets','source_note':'No model inference claimed.'}
def request(raws,columns=None):
    return {'mode':'evaluation','files':[{'name':str(i)+'.csv','data_base64':base64.b64encode(raw).decode(),'sha256':hashlib.sha256(raw).hexdigest()} for i,raw in enumerate(raws)],'columns':columns or [[0,1]]*3,'provenance':dict(PROVENANCE)}
def csv_bytes(rows):
    stream=io.StringIO(newline='');writer=csv.writer(stream,lineterminator='\r\n');writer.writerow(['id','label','ignored']);writer.writerows([i,v,'extra'] for i,v in rows);return stream.getvalue().encode()
def oracle(refs,old,new):
    b=dict(old);a=dict(new);pairs=[(b[i]==v,a[i]==v) for i,v in refs]
    return dict(zip(['total','before_matches','after_matches','improvements','regressions'],[len(pairs),sum(x for x,y in pairs),sum(y for x,y in pairs),sum(not x and y for x,y in pairs),sum(x and not y for x,y in pairs)]))
def main():
    start=time.monotonic();assets=Path(sys.argv[1]).resolve();checker=LocalChecker(assets);positive=negative=0;vectors=[]
    # Exhaustive all three-case binary targets and both sets of predictions.
    choices=list(itertools.product(['yes','no'],repeat=3))
    for targets,old,new in itertools.product(choices,repeat=3):
        refs=list(zip(['001','1','é'],targets));before=list(zip(['001','1','é'],old));after=list(zip(['001','1','é'],new))
        raws=[csv_bytes(refs),csv_bytes(before[::-1]),csv_bytes(after[1:]+after[:1])]
        expected=oracle(refs,before,after);r=evaluate(checker,request(raws));assert r['summary']==expected and r['preserved']==(expected['regressions']==0);positive+=1
        vectors.append({'raws':[base64.b64encode(x).decode() for x in raws],'summary':expected})
    rng=random.Random(20261103)
    for n in [1,2,17,100,1000]:
        ids=['😀'+str(i)+'\u00a0' for i in range(n)]
        labels=['','0','-0','001','yes','café','line\r\nbreak','comma,quote"']
        refs=[(i,rng.choice(labels)) for i in ids];before=[(i,rng.choice(labels)) for i in ids];after=[(i,rng.choice(labels)) for i in ids];rng.shuffle(before);rng.shuffle(after)
        raws=list(map(csv_bytes,[refs,before,after]));expected=oracle(refs,before,after);r=evaluate(checker,request(raws));assert r['summary']==expected;positive+=1
        vectors.append({'raws':[base64.b64encode(x).decode() for x in raws],'summary':expected})
    # Independent JavaScript decoding, alignment and counts, using the same bytes.
    js="import fs from 'node:fs';import {parseCSV} from './public/file-check-core.mjs';import {evaluateTables} from './public/model-evaluation-core.mjs';const vs=JSON.parse(fs.readFileSync(0,'utf8'));console.log(JSON.stringify(vs.map(v=>evaluateTables(v.raws.map(b=>parseCSV(new Uint8Array(Buffer.from(b,'base64')))),[[0,1],[0,1],[0,1]]).summary)));"
    run=subprocess.run(['node','--input-type=module','-e',js],cwd=ROOT,input=canonical(vectors),capture_output=True,timeout=30,check=True)
    assert json.loads(run.stdout)==[v['summary'] for v in vectors]
    valid=request([b'id,label\na,yes\nb,yes\nc,yes\n',b'id,label\na,yes\nb,no\nc,no\n',b'id,label\na,no\nb,yes\nc,yes\n'])
    gain=evaluate(checker,valid);positive+=1
    assert gain['summary']['after_matches']>gain['summary']['before_matches'] and gain['preserved'] is False and gain['summary']['regressions']==1
    attacks=[dict(valid,verifier='substitute'),dict(valid,columns=[[True,1],[0,1],[0,1]]),dict(valid,columns=[[0,0]]*3),dict(valid,provenance={**PROVENANCE,'authority':True})]
    for raw in [b'id,label\na,yes\na,no',b'id,label\na,yes',b'id,label\na,yes\nb,yes\nc,yes\nd,no',b'id,label\n ,yes',b'id,label\na,"bad',b'id,label\na,\xff',csv_bytes([(str(i),'yes') for i in range(1001)])]:
        bad=copy.deepcopy(valid);bad['files'][1]=request([raw]*3)['files'][1];attacks.append(bad)
    bad=copy.deepcopy(valid);bad['files'][0]['sha256']='f'*64;attacks.append(bad)
    for attack in attacks:
        try:evaluate(checker,attack)
        except (ValueError,UnicodeError):negative+=1
        else:raise AssertionError('Ambiguous or substituted evaluation accepted')
    # Invoke the native decoder directly for host-independent malformed controls.
    with tempfile.TemporaryDirectory() as tmp:
        paths=[Path(tmp)/(str(i)+'.csv') for i in range(3)]
        for p in paths:p.write_bytes(b'id,label\na,yes\n')
        for raw in [b'id,label\na,"bad',b'id,label\na,\xff',b'id,label\na,yes\na,no',b'id,label\nother,yes']:
            paths[1].write_bytes(raw)
            r=subprocess.run([str(checker.binary),'evaluation','0','1','0','1','0','1',*map(str,paths)],capture_output=True,timeout=30)
            assert r.returncode==2 and r.stdout.startswith(b'REJECT:');negative+=1
    actual_run=subprocess.run
    for target in ['snapshot','wire','stderr','exit']:
        def tamper(args,**kwargs):
            r=actual_run(args,**kwargs);assert r.returncode==0 and b'RESULT:REGRESSIONS' in r.stdout
            if target=='snapshot':Path(args[-1]).write_bytes(b'changed')
            elif target=='wire':r.stdout=r.stdout.replace(b'COUNTS:3,1,2,2,1',b'COUNTS:3,1,2,2,0')
            elif target=='stderr':r.stderr=b'error'
            else:r.returncode=2
            return r
        try:
            with patch('model_evaluation.subprocess.run',side_effect=tamper):evaluate(checker,valid)
        except ValueError:negative+=1;positive+=1
        else:raise AssertionError('Altered native run confirmed')
    # Captured replay is not reopened; one-shot retrieval requires the capability.
    with tempfile.TemporaryDirectory() as tmp:
        p=Path(tmp)/'private.json';raw=canonical({'format':'pcs-model-evaluation-replay-v1'})+b'\n';p.write_bytes(raw);captured=capture_handoff(p);p.write_bytes(b'changed');assert captured==raw
        for bad in [raw.rstrip(),b'{"format":"pcs-model-evaluation-replay-v1", "extra":1}\n',b'{"format":"exec"}\n',b'{"format":1,"format":2}\n']:
            p.write_bytes(bad)
            try:capture_handoff(p)
            except ValueError:negative+=1
            else:raise AssertionError('Noncanonical handoff captured')
    with AppServer(assets,handoff=captured) as server:
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        def call(method,path,body=None,extra=None):
            c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=40);c.putrequest(method,path,skip_host=True);c.putheader('Host',server.origin.removeprefix('http://'))
            if extra:
                for k,v in extra:c.putheader(k,v)
            if body is not None:c.putheader('Content-Type','application/json');c.putheader('Content-Length',str(len(body)))
            c.endheaders(body);r=c.getresponse();result=(r.status,r.read());c.close();return result
        auth=[('X-PCS-Session',server.token),('Origin',server.origin)]
        try:
            for extra in [[],auth+[('Host','attacker.invalid')],auth+[('Origin',server.origin)],auth+[('X-PCS-Session',server.token)],auth+[('Origin','https://attacker.invalid')]]:
                assert call('GET','/api/handoff',extra=extra)[0]==403;negative+=1
            assert json.loads(call('GET','/api/session',extra=auth)[1])['has_handoff'] is True
            assert call('GET','/api/handoff',extra=auth)==(200,captured);assert call('GET','/api/handoff',extra=auth)[0]==404;negative+=1
            status,body=call('POST','/api/check-files',canonical(valid),auth);assert status==200 and json.loads(body)==gain;positive+=1
            for attack in attacks:
                assert call('POST','/api/check-files',canonical(attack),auth)[0]==400;negative+=1
        finally:server.shutdown();thread.join(5)
    print(json.dumps({'format':'pcs-model-evaluation-native-tests-v1','exhaustive_three_case_binary_configurations':512,'cross_language_vectors':len(vectors),'actual_native_checks':positive,'negative_controls':negative,'aggregate_gain_regression_counterexample':gain['summary'],'seconds':round(time.monotonic()-start,3),'mock_affirmative_verdicts':0,'human_participants':0}))
if __name__=='__main__':main()
