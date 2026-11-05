import json,sys
from intent_oracle import compile_intent
vectors=json.load(open(sys.argv[1]))
for v in vectors:
 q=v['request'];expected=None
 try:expected=compile_intent({'policy':q['policy']},q['target'],q['raw'])
 except (ValueError,UnicodeError,RecursionError):pass
 assert v['response']['ok']==(expected is not None)
 if expected is not None:
  r=v['response']['result'];assert r['request']==q
  assert {'value':r['value'],'eligible':r['eligible'],'plan':json.loads(r['plan']) if r['plan'] is not None else None}==expected
print(json.dumps({'passed':True,'cases':len(vectors),'nativeLeanExecutedByThisPythonProcess':False}))
