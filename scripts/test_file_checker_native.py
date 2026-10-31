#!/usr/bin/env python3
"""Actual native authorization, live loopback boundary, and hostile requests.

Every positive verdict below executes the bundled Lean checker. No mock verifier
is used for a positive case. Tests deliberately fail if the bundle is absent.
"""
import errno
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
    started=time.monotonic(); scaling=[]
    # Exercise the native image boundary directly, independently of the host
    # reader. Reject unsupported images and missing arguments without a verdict.
    with tempfile.TemporaryDirectory(prefix='pcs-native-images-') as tmp:
        left,right=Path(tmp)/'left.csv',Path(tmp)/'right.csv';right.write_bytes(b'id\n62\n')
        malformed=[b'id\nzz\n',b'id\nA1\n',b'id\n0\n',b'other\n61\n',b'id\n\n',
                   b'id\n'+b'61'*257+b'\n',b'id\n'+b'61\n'*5001,b'id\n61,62\n',
                   b'id\n61\0\n',b'id\n"61"\n',b'id\n'+b'61\n'*866668]
        for raw in malformed:
            left.write_bytes(raw);r=subprocess.run([str(checker.binary),str(left),str(right)],capture_output=True,timeout=30)
            assert r.returncode==2 and r.stdout.startswith(b'REJECT:') and not r.stderr;negative+=1
        r=subprocess.run([str(checker.binary)],capture_output=True,timeout=30)
        assert r.returncode==2 and r.stdout==b'REJECT:bad_arity\n';negative+=1
    universe=['001','1','é','😀']
    subsets=[list(x) for size in range(1,5) for x in itertools.combinations(universe,size)]
    for a in subsets:
        for b in subsets:
            left=('id\n'+'\n'.join(a)+'\n').encode();right=('other\n'+'\n'.join(b)+'\n').encode()
            r=checker.verify(request(left,right));expected='DISJOINT' if set(a).isdisjoint(b) else 'OVERLAP'
            assert r['lean_verdict']==expected and r['scientific_acceptance'] is False
            positive+=1
    # Reproduce the recursive-parser stack failure and worst common-prefix
    # comparisons at the public row/ID limits. All successful cases run Lean.
    for n,width in [(500,256),(5000,50),(5000,256)]:
        a=('id\n'+'\n'.join('a'*(width-6)+str(i).zfill(6) for i in range(n))+'\n').encode()
        b=('id\n'+'\n'.join('a'*(width-6)+str(i+n).zfill(6) for i in range(n))+'\n').encode()
        t=time.monotonic();r=checker.verify(request(a,b));assert r['lean_verdict']=='DISJOINT';positive+=1
        scaling.append({'rows_per_file':n,'id_bytes':width,'seconds':round(time.monotonic()-t,3),'verdict':r['lean_verdict']})
    # A match late in the second file must still be found at maximum size.
    b=('id\n'+'\n'.join('b'*250+str(i).zfill(6) for i in range(4999))+'\n'+'a'*250+'004999\n').encode()
    assert checker.verify(request(a,b))['lean_verdict']=='OVERLAP';positive+=1
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
        try:
            duplicate=AppServer(assets,port=server.server_port)
        except OSError as exc:
            assert exc.errno==errno.EADDRINUSE;negative+=1
        else:
            duplicate.server_close();raise AssertionError('Conflicting app address accepted')
        thread=threading.Thread(target=server.serve_forever,daemon=True);thread.start()
        def call(method,path,body=None,headers=None):
            c=http.client.HTTPConnection('127.0.0.1',server.server_port,timeout=40)
            c.request(method,path,body=body,headers=headers or {});r=c.getresponse();data=r.read();c.close();return r.status,data
        token={'X-PCS-Session':server.token,'Content-Type':'application/json','Origin':server.origin}
        status,data=call('POST','/api/check-files',canonical(valid),token);assert status==200 and json.loads(data)['lean_verdict']=='DISJOINT';positive+=1
        for headers in [{},{**token,'Origin':'https://attacker.invalid'},{**token,'Host':'attacker.invalid'},{**token,'X-PCS-Session':'f'*64},{**token,'X-PCS-Session':'é'*64}]:
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
    print(json.dumps({'format':'pcs-file-check-native-tests-v1','actual_lean_positive_checks':positive,'negative_controls':negative,'seconds':round(time.monotonic()-started,3),'scaling':scaling,'mock_positive_verdicts':0,'immutable_host_security_proved':False}))


if __name__=='__main__':main()
