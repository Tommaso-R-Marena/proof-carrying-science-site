"""An authored, actual-Lean numeric-intent demo. No model calls; never label these plans as model output."""
import argparse,json
from pathlib import Path
from run import IntentBridge

def run(output):
 out=Path(output).resolve();out.mkdir()
 spec={'files':[{'id':'measurements','bytes':'id,value\nsample,7\nreference,42\n'}],
       'policy':{'inspectable':['measurements'],'editable':[{'fileId':'measurements','rowId':'sample'}],'minimum':0,'maximum':1000000,'requireInspection':True}}
 with IntentBridge(out) as bridge:
  info=bridge.request({'command':'info'});assert info['ok']
  r=bridge.request({'command':'create','id':'authored-demo','interface':'intent','spec':spec,'target':{'fileId':'measurements','rowId':'sample'}});assert r['ok'];current=r['snapshot'];turns=[]
  for answer in ['{"value":"8"}','{"value":"0","rowId":"reference"}','{"value":"7000"}']:
   r=bridge.request({'command':'submit','id':'authored-demo','checkpoint':current['checkpoint'],'content':answer});assert r['ok'];current=r['snapshot'];turns.append({'authoredAnswer':answer,**r})
  assert [t['acceptedProfile'] for t in turns]==[True,False,True]
  assert current['outcome']['files'][0]['bytes']=='id,value\nsample,7000\nreference,42\n'
  assert bridge.request({'command':'replay','id':'authored-demo','checkpoint':current['checkpoint']})['ok']
  assert bridge.request({'command':'records'})['ok']
 result={'label':'authored demonstration, not model performance','actualLean':True,'modelCalls':0,'safeWrongAnswerAccepted':True,'modelCannotChooseProtectedTarget':True,'final':current,'turns':turns}
 (out/'demo.json').write_text(json.dumps(result,indent=2)+'\n')
 return result
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('output');a=p.parse_args();print(json.dumps(run(a.output),indent=2))
