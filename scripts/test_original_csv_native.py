#!/usr/bin/env python3
"""Exhaustive short byte grammars and deterministic RFC-style CSV oracles.
All native results come from the actual compiled decoder; no mock authority.
"""
import csv,io,itertools,json,random,subprocess,sys,tempfile,time
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'desktop'))
from file_check import parse_csv
from change_review import table_image


def decode_wire(line):
    if line=='REJECT':return None
    assert line.startswith('OK:');lines=line[3:].split('|');assert lines[0].startswith('H:')
    out={'header':lines[0][2:].split(','),'rows':[],'lines':[]}
    for s in lines[1:]:
        _,n,fields=s.split(':');out['lines'].append(int(n));out['rows'].append(fields.split(','))
    return out


def main():
    exe=Path(sys.argv[1]).resolve();cases=[]
    for length in range(7):
        cases.extend(b'key\n'+bytes(t) for t in itertools.product(b'a,"\r\n',repeat=length))
    rng=random.Random(20261101)
    atoms=['001','1','é','e\u0301','😀',' x ','a,b','a"b','a\nb','a\r\nb','\ufeff','<svg onload=1>','=A1','']
    for _ in range(1000):
        out=io.StringIO(newline='');w=csv.writer(out,lineterminator=rng.choice(['\n','\r\n']));w.writerow(['id','note']);w.writerows([[rng.choice(atoms),rng.choice(atoms)] for i in range(rng.randint(1,8))]);raw=out.getvalue().encode();cases.append((b'\xef\xbb\xbf' if rng.randrange(3)==0 else b'')+raw)
    cases.extend([b'',b'\xff',b'key\n\x80',b'key\n\xc0\xaf',b'key\n\xed\xa0\x80',b'key\na\0',b'\xef\xbb\xbfkey\na',b'\xef\xbb\xbf\xef\xbb\xbfkey\na',b'id,id\na,b',b'id,n\n"",x\n'])
    started=time.monotonic()
    with tempfile.TemporaryDirectory() as d:
        path=Path(d)/'cases.txt';path.write_bytes(('\n'.join(x.hex() or '-' for x in cases)+'\n').encode('ascii'))
        r=subprocess.run([str(exe),'decode-batch',str(path)],capture_output=True,timeout=120,check=True)
    assert not r.stderr;runs=r.stdout.decode().splitlines();assert len(runs)==len(cases)
    node=subprocess.run(['node',str(ROOT/'scripts/original_csv_javascript.mjs')],input=json.dumps([raw.hex() for raw in cases]).encode(),capture_output=True,timeout=60,check=True)
    javascript=json.loads(node.stdout);assert len(javascript)==len(cases)
    accepted=0
    for i,(raw,line) in enumerate(zip(cases,runs)):
        try:expected=table_image(parse_csv(raw))
        except (ValueError,UnicodeError,csv.Error):expected=None
        got=decode_wire(line)
        assert expected==got and expected==javascript[i],(i,raw,expected,got,javascript[i])
        accepted+=got is not None
    report={'format':'pcs-original-csv-native-differential-v2','seed':20261101,'cases':len(cases),'accepted':accepted,'rejected':len(cases)-accepted,'exhaustive_suffix_lengths':[0,6],'alphabet_hex':b'a,"\r\n'.hex(),'full_table_and_physical_lines_equal':True,'implementations':['Lean','Python','JavaScript'],'native_mock_verdicts':0,'seconds':round(time.monotonic()-started,3)}
    print(json.dumps(report))


if __name__=='__main__':main()
