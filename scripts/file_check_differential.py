#!/usr/bin/env python3
"""CSV implementations and exact extraction images, including hostile encodings."""
import base64,csv,io,itertools,json,random,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'desktop'))
from file_check import parse_csv,analyze,extracted_csv


def main():
    rng=random.Random(20261031)
    ids=['001','1','A','a','é','😀',' x ','a,b','a"b','line\nnext','line\r\nnext','\ufeff','=A1','<img src=x>']
    cases=[]
    def encoded(rows,ending):
        out=io.StringIO(newline='');writer=csv.writer(out,lineterminator=ending);writer.writerow(['id','note']);writer.writerows(rows);return out.getvalue().encode()
    def add(a,b):cases.append({'left':base64.b64encode(a).decode(),'right':base64.b64encode(b).decode(),'columns':[0,0]})
    for _ in range(240):
        a=encoded([[rng.choice(ids),str(i)] for i in range(rng.randint(1,15))],rng.choice(['\n','\r\n']))
        b=encoded([[rng.choice(ids),str(i)] for i in range(rng.randint(1,15))],rng.choice(['\n','\r\n']))
        if rng.randrange(3)==0:a=b'\xef\xbb\xbf'+a
        add(a,b)
    for bad in [b'',b'\xff',b'id\n',b'id,id\na,b',b'id\nx,y',b'id\n"x',b'id\nx"y',b'id\n"x"z',b'id\ra',b'id\na\0',b'id\n"a\rb"',b'id\n \n',b'id\n'+b'x'*257]:add(bad,b'id\na\n')
    actual=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/file_check_differential.mjs')],input=json.dumps(cases).encode(),cwd=ROOT))
    positives=0
    for i,(c,j) in enumerate(zip(cases,actual)):
        try:
            a,b=[parse_csv(base64.b64decode(c[k])) for k in ['left','right']]
            p={'accepted':True,'result':analyze(a,b,c['columns']),'extracted':[base64.b64encode(extracted_csv(t,x)).decode() for t,x in zip([a,b],c['columns'])]}
        except (ValueError,UnicodeError,csv.Error):p={'accepted':False}
        assert p==j,(i,p,j)
        positives+=p['accepted']
    print(json.dumps({'format':'pcs-file-check-differential-v1','seed':20261031,'cases':len(cases),'valid_pairs':positives,'all_python_javascript_results_and_extraction_bytes_equal':True,'kernel_proof_of_host_refinement':False}))


if __name__=='__main__':main()
