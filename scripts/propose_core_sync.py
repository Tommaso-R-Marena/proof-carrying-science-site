#!/usr/bin/env python3
"""Detect protected-core drift and create review-only proposals. Never merge.
Candidate source is compared as Git data; no candidate code is executed with a
write credential. Runtime/model/formal changes produce a blocked draft report.
"""
import argparse,hashlib,json,os,re,subprocess,urllib.request
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
REPO='Tommaso-R-Marena/proof-carrying-science-site';CORE_REPO='Tommaso-R-Marena/proof-carrying-science'
WORKFLOWS=['site-public-verification.yml','site-check.yml','site-contract.yml','countermodel-lean.yml','first-investigation.yml','world-builder.yml']
def git(core,*args):return subprocess.check_output(['git',*args],cwd=core,text=True).strip()
def current(root):return re.search(r'export const CORE_SHA = "([0-9a-f]{40})"',(root/'src/lean-research.js').read_text())[1]
def critical(path,documents):
 # Closed documentation-only allowance: new startup hooks, scripts, dependencies,
 # symlinks, model data and unknown paths always require manual integration.
 if path in documents:return True
 safe_root=re.fullmatch(r'(README|CHANGELOG|CONTRIBUTING)(?:[A-Za-z0-9_.-]*)\.(md|rst|txt)',path)
 safe_doc=path.startswith(('docs/','research/')) and path.endswith(('.md','.rst','.txt'))
 return not (safe_root or safe_doc)

def plan(core,root=ROOT):
 old=current(root);new=git(core,'rev-parse','HEAD');git(core,'merge-base','--is-ancestor',old,new)
 manifest=json.loads((root/'public/research-release-20261017/SOURCE_MANIFEST.json').read_text());documents={d['core_path'] for d in manifest['documents'].values()}
 changes=[x for x in git(core,'diff','--name-only','-z',old,new).split('\0') if x] if old!=new else []
 sensitive=[p for p in changes if critical(p,documents)]
 # A textual suffix cannot qualify a symlink or executable as documentation.
 for path in changes:
  for revision in [old,new]:
   entry=git(core,'ls-tree',revision,'--',path)
   if entry and not entry.startswith('100644 ') and path not in sensitive:sensitive.append(path)
 return {'format':'pcs-core-sync-proposal-v1','approved_source':old,'candidate_source':new,'state':'current' if old==new else 'manual_integration_required' if sensitive else 'source_identical_pin_update','changed_paths':changes,'sensitive_paths':sensitive,'candidate_code_executed':False,'automatic_merge':False,'automatic_model_promotion':False,'pcs_authority':False}

def apply(p,root=ROOT):
 if p['state']=='current':return []
 report=root/'docs/core-sync-proposal.json';report.parent.mkdir(parents=True,exist_ok=True)
 if p['state']=='manual_integration_required':report.write_text(json.dumps(p,indent=2)+'\n');return [report.relative_to(root).as_posix()]
 old,new=p['approved_source'],p['candidate_source'];changed=[]
 def write(name,text):
  path=root/name
  if path.read_text()!=text:path.write_text(text);changed.append(name)
 path=root/'src/lean-research.js';text=path.read_text();text=re.sub(r'export const PREVIOUS_CORE_SHA = "[0-9a-f]{40}";',f'export const PREVIOUS_CORE_SHA = "{old}";',text);text=text.replace(f'export const CORE_SHA = "{old}";',f'export const CORE_SHA = "{new}";');write('src/lean-research.js',text)
 for name in ['public/status.json','public/research-release-20261017/SOURCE_MANIFEST.json']:
  text=(root/name).read_text();needle='"current_verification_core_sha": "'+old+'"'
  if text.count(needle)!=1:raise ValueError('Current-pointer schema mismatch')
  write(name,text.replace(needle,'"current_verification_core_sha": "'+new+'"'))
 name='.github/workflows/site-public-verification.yml';text=(root/name).read_text()
 if text.count('ref: '+old)!=2:raise ValueError('Independent checkout pin schema mismatch')
 write(name,text.replace('ref: '+old,'ref: '+new))
 name='public/model-capabilities.json';text=(root/name).read_text();data=json.loads(text)
 if data['core_revision']!=old:raise ValueError('Model inventory revision mismatch')
 data['core_revision']=new;write(name,json.dumps(data,indent=2,sort_keys=True)+'\n')
 name='public/proof-workbench-catalog.json';data=json.loads((root/name).read_text())
 if data['core_revision']!=old:raise ValueError('Preview revision mismatch')
 data['core_revision']=new;write(name,json.dumps(data,indent=2,ensure_ascii=False)+'\n')
 # The semantic catalog digest and all frozen evidence/model bytes stay intact.
 report.write_text(json.dumps(p,indent=2)+'\n');changed.append(report.relative_to(root).as_posix());return changed

def api(method,path,data=None,repo=REPO):
 token=os.environ.get('GH_TOKEN')
 if not token:raise ValueError('GH_TOKEN required only for publication')
 request=urllib.request.Request('https://api.github.com/repos/'+repo+path,method=method,data=None if data is None else json.dumps(data).encode(),headers={'Authorization':'Bearer '+token,'User-Agent':'PCS-Source-Sync','Accept':'application/vnd.github+json','Content-Type':'application/json'})
 with urllib.request.urlopen(request,timeout=30) as response:raw=response.read();return json.loads(raw) if raw else None

def publish(core):
 if os.environ.get('GITHUB_REF')!='refs/heads/main' or os.environ.get('GITHUB_REPOSITORY')!=REPO:raise ValueError('Publication runs only from protected site main')
 protected=api('GET','/branches/main',repo=CORE_REPO)
 if protected.get('protected') is not True or protected['commit']['sha']!=git(core,'rev-parse','HEAD'):raise ValueError('Candidate is not the current protected core head')
 if git(ROOT,'status','--porcelain','--','.',':(exclude).ci-components/source-candidate'):raise ValueError('Clean site checkout required')
 p=plan(core)
 if p['state']=='current':print(json.dumps(p));return
 branch='automation/core-source-'+p['candidate_source'][:12]
 existing=api('GET','/pulls?state=open&head=Tommaso-R-Marena:'+branch+'&base=main')
 if existing:print(json.dumps({'status':'existing_proposal','url':existing[0]['html_url']}));return
 subprocess.run(['git','checkout','-b',branch],cwd=ROOT,check=True)
 files=apply(p);subprocess.run(['git','add','--',*files],cwd=ROOT,check=True)
 subprocess.run(['git','-c','user.name=PCS Source Sync','-c','user.email=pcs-source-sync@users.noreply.github.com','commit','-m','Propose reviewed core source reconciliation '+p['candidate_source'][:12]],cwd=ROOT,check=True)
 # Checkout uses persist-credentials:false. Keep the token out of argv/output.
 import base64
 env=dict(os.environ,GIT_CONFIG_COUNT='2',GIT_CONFIG_KEY_0='credential.helper',GIT_CONFIG_VALUE_0='',GIT_CONFIG_KEY_1='http.https://github.com/.extraheader',GIT_CONFIG_VALUE_1='Authorization: Basic '+base64.b64encode(('x-access-token:'+os.environ['GH_TOKEN']).encode()).decode())
 import urllib.error
 try:remote=api('GET','/git/ref/heads/'+branch)
 except urllib.error.HTTPError as error:
  if error.code!=404:raise
  remote=None
 if remote:
  subprocess.run(['git','fetch','origin','refs/heads/'+branch],cwd=ROOT,env=env,check=True)
  if git(ROOT,'rev-parse','FETCH_HEAD^{tree}')!=git(ROOT,'rev-parse','HEAD^{tree}'):
   raise ValueError('Existing proposal branch differs from the exact intended tree; manual reconciliation required')
 else:subprocess.run(['git','push','origin','HEAD:refs/heads/'+branch],cwd=ROOT,env=env,check=True)
 body='Protected core has advanced from `'+p['approved_source']+'` to `'+p['candidate_source']+'`. '+('Runtime/model/formal or frozen-document changes require manual integration. This draft deliberately leaves execution pins and model bytes unchanged. See docs/core-sync-proposal.json.' if p['sensitive_paths'] else 'Protected runtime, model, formal, dependency and workflow bytes are identical. This proposal updates current-service pointers only and preserves all frozen reports, model bytes and semantic catalog identities.')+' No automatic merge or model promotion is authorized. Required compatibility workflows are dispatched explicitly because GITHUB_TOKEN-created PRs do not trigger pull_request workflows.'
 result=api('POST','/pulls',{'title':'Reconcile protected core source '+p['candidate_source'][:12],'head':branch,'base':'main','body':body,'draft':True})
 for workflow in WORKFLOWS:api('POST','/actions/workflows/'+workflow+'/dispatches',{'ref':branch})
 print(json.dumps({'status':'draft_proposed','url':result['html_url'],'source':p['candidate_source'],'compatibility_workflows_dispatched':WORKFLOWS,'automatic_merge':False}))
if __name__=='__main__':
 p=argparse.ArgumentParser(__doc__);p.add_argument('--core',type=Path,required=True);p.add_argument('--publish',action='store_true');p.add_argument('--write',action='store_true');a=p.parse_args()
 if a.publish:publish(a.core.resolve())
 else:
  result=plan(a.core.resolve());print(json.dumps(result,indent=2))
  if a.write:apply(result)
