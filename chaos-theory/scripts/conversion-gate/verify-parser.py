import json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'file-intent'))
from intent_oracle import decode
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'file-gate'))
from oracle import csv
records=json.load(open(sys.argv[1]))
for r in records:
 q=r['request'];v=None
 try:v=decode(q['raw'])
 except (ValueError,UnicodeError,RecursionError):pass
 if v is None:assert r['response']=={'ok':False}
 else:
  source=dict(csv(q['sourceCsv']))[q['rowId']];expected=source*int(q['factor'])
  assert r['response']=={'ok':True,'result':{'request':q,'sourceValue':str(source),'expectedValue':str(expected),'matches':v==expected}}
print(json.dumps({'passed':True,'cases':len(records),'nativeLeanExecutedByThisPythonProcess':False}))
