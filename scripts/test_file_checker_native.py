#!/usr/bin/env python3
"""Actual native authorization, live loopback boundary, and hostile requests.

Every positive verdict below executes the bundled Lean checker. No mock verifier
is used for a positive case. Tests deliberately fail if the bundle is absent.
"""
import base64,hashlib,http.client,itertools,json,os,random,shutil,subprocess,sys,tempfile,threading,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'desktop'))
from file_check import LocalChecker,canonical,SCOPE
from app import AppServer


def request(a,b,columns=None):
    return {'columns':columns or [0,0],'files':[{'name':f'{i}.csv','data_base64':base64.b64encode(raw).decode(),'sha256':hashlib.sha256(raw).hexdigest()} for i,raw in enumerate([a,b])]}


def main():
    assets=Path(sys.argv[1]).resolve();checker=LocalChecker(assets);positive=negative=0
    started=time.monotonic()
    universe=['001','1','é','😀']
    subsets=[list(x) for size in range(1,5) for x in itertools.combinations(universe,size)]
    for a in subsets:
        for b in subsets:
            left=('id\n'+'\n'.join(a)+'\n').encode();right=('other\n'+'\n'.join(b)+'\n').encode()
            r=checker.verify(request(left,right));expected='DISJOINT' if set(a).isdisjoint(b) else 'OVERLAP'
            assert r['lean_verdict']==expected and r['scientific_acceptance'] is False
            positive+=1
    quoted=request(b'id,note\r\n"a,b","one\r\ntwo"\r\n001,ok\r\n',b'other\n"a,b"\n001\n')
    assert checker.verify(quoted)['summary']['shared_ids']==2;positive+=1
    for bad in [b'',b'\xff',b'id\n',b'id,id\na,b',b'id\nx,y',b'id\n"x',b'id\nx"y',b'id\na\0',b'id\rfoo',b'id\n \n']:
        try:checker.verify(request(bad,b'id\ny\n'))
        except (ValueError,UnicodeError):negative+=1
        else:raise AssertionError('Malformed CSV accepted')
    valid=request(b'id\na\n',b'id\nb\n')
    attacks=[dict(valid,verifier='/tmp/substitute'),dict(valid,columns=[True,0]),dict(valid,columns=[9,0])]
    changed=json.loads(json.dumps(valid));changed['files'][0]['sha256']='f'*64;attacks.append(changed)
    changed=json.loads(json.dumps(valid));changed['files'][0]['sha256']='é'*64;attacks.append(changed)
    for attack in attacks:
        try:checker.verify(attack)
        except ValueError:negative+=1
        else:raise AssertionError('Caller substitution accepted')
    with tempfile.TemporaryDirectory(prefix='pcs-pin-attack-') as tmp:
        damaged=Path(tmp);shutil.copy2(assets/'checker-manifest.json',damaged/'checker-manifest.json')
        binary=damaged/checker.manifest['binary'];binary.write_bytes(b'not the checker')
        try:LocalChecker(damaged)
        except ValueError:negative+=1
        else:raise AssertionError('Changed checker accepted')
    with AppServer(assets) as server:
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        def call(method,path,body=None,headers=None):
            c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=40)
            c.request(method,path,body=body,headers=headers or {});r=c.getresponse();data=r.read();c.close();return r.status,data
        token={'X-PCS-Session':server.token,'Content-Type':'application/json','Origin':server.origin}
        status,data=call('POST','/api/check-files',canonical(valid),token);assert status==200 and json.loads(data)['lean_verdict']=='DISJOINT';positive+=1
        for headers in [{},{**token,'Origin':'https://attacker.invalid'},{**token,'Host':'attacker.invalid'},{**token,'X-PCS-Session':'f'*64}]:
            status,_=call('POST','/api/check-files',canonical(valid),headers);assert status==403;negative+=1
        assert call('OPTIONS','/api/check-files',headers={'Origin':'https://attacker.invalid'})[0]==403;negative+=1
        assert call('GET','/../../checker-manifest.json')[0]==404;negative+=1
        assert call('GET','/api/session')[0]==403;negative+=1
        assert call('GET','/api/session',headers={'X-PCS-Session':server.token})[0]==200
        assert call('GET','/check-my-files.html')[0]==200
        status,_=call('POST','/api/check-files',b'{"columns":[0,0],"columns":[0,0]}',token);assert status==400;negative+=1
        server.check_slot.acquire()
        try:assert call('POST','/api/check-files',canonical(valid),token)[0]==429;negative+=1
        finally:server.check_slot.release()
        server.shutdown();thread.join(5)
    print(json.dumps({'format':'pcs-file-check-native-tests-v1','actual_lean_positive_checks':positive,'negative_controls':negative,'seconds':round(time.monotonic()-started,3),'mock_positive_verdicts':0,'immutable_host_security_proved':False}))


if __name__=='__main__':main()
