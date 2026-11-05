"""Independent exact relation and physical receipt-chain checks. No native verdict or new model inference."""
import argparse,json,sys
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'file-intent'))
from intent_oracle import compile_intent,decode
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'file-gate'))
from oracle import read,csv,verify_workspace,checkpoint,digest

def verify(directory,study):
 if not __debug__:raise RuntimeError('Do not disable assertions')
 root=Path(directory);records=json.loads((root/'records.json').read_text());valid=invalid=0;checked=0;owners={}
 for folder in sorted(root.iterdir()):
  if not folder.is_dir() or not (folder/'owner.json').exists():continue
  owner=read(folder/'owner.json');job=owner['job'];spec=job['spec'];target=job['target'];factor=int(job['factor']);owners[digest(owner)]=job
  source=dict(csv(next(f['bytes'] for f in spec['files'] if f['id']==target['fileId'])))[target['rowId']];answer=source*factor
  data=folder/'data';d=read(data/'session.json');commits=sorted(data.glob('commit-*.json'));last=read(commits[-1]) if commits else d
  assert d['spec']==spec and d['authorityHash']==owner['implementation']['authority']['hash']
  cp=checkpoint(d,len(commits),last['digest'],last['snapshotHash']);v=verify_workspace(data,cp);assert v['mode']=='guarded'
  expected=compile_intent(spec,target,json.dumps({'value':str(answer)}))
  good=all(json.loads(text)==expected['plan'] for text in v['texts'])
  if folder.name=='bypass-negative':assert not good;invalid+=1
  else:assert good;valid+=1
  for record in records:
   if record.get('id')!=folder.name:continue
   assert record['receipt']['jobHash']==digest({'job':job,'implementation':owner['implementation']})
  checked+=1
 # Independently check every saved semantic computation, including malformed actual model strings.
 archive=json.loads((Path(study)/'report.json').read_text())['report'] if study else None
 proposed=0
 for record in records:
  q=record['check']['request'];value=None
  job=owners[record['receipt']['jobHash']];assert q['sourceCsv']==next(f['bytes'] for f in job['spec']['files'] if f['id']==job['target']['fileId']) and q['rowId']==job['target']['rowId'] and q['factor']==job['factor']
  try:value=decode(q['raw'])
  except (ValueError,UnicodeError,RecursionError):pass
  if value is None:assert record['check']['response']=={'ok':False}
  else:
   source=dict(csv(q['sourceCsv']))[q['rowId']];answer=source*int(q['factor'])
   assert record['check']['response']=={'ok':True,'result':{'request':q,'sourceValue':str(source),'expectedValue':str(answer),'matches':value==answer}}
   if record['accepted']:assert value==answer
  if 'call' in record:
   assert archive is not None
   assert q['raw']==archive['calls'][record['call']]['response']['choices'][0]['message']['content'];proposed+=1
 assert invalid==1 and valid==checked-1
 return {'passed':True,'physicalWorkspaces':checked,'validRefinedHistories':valid,'intentionalLowerLevelCounterexamples':invalid,'semanticComputations':len(records),'archivedModelProposals':proposed,'newInferenceCalls':0,'nativeLeanExecutedByPython':False}
if __name__=='__main__':
 p=argparse.ArgumentParser(description=__doc__);p.add_argument('directory',nargs='?');p.add_argument('--summary');p.add_argument('--study');a=p.parse_args();root=a.directory or json.loads(Path(a.summary).read_text())['output'];print(json.dumps(verify(root,a.study),indent=2))
