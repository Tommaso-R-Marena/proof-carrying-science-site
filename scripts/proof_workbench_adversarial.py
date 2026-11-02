#!/usr/bin/env python3
"""Actual trusted-source receiver attacks; no fake affirmative Lean verdicts."""
import argparse,copy,hashlib,json,tempfile,subprocess
from pathlib import Path
from replay_proof_workbench import envelope,replay
ROOT=Path(__file__).resolve().parents[1]
def wrap(data):
 raw=json.dumps(data,sort_keys=True,separators=(',',':'),ensure_ascii=False)
 return json.dumps({**data,'canonical_payload':raw,'report_sha256':hashlib.sha256(raw.encode()).hexdigest()}).encode()
def run(core):
 original=envelope((ROOT/'public/proof-workbench-example.json').read_bytes());rows=[]
 with tempfile.TemporaryDirectory(prefix='pcs-workbench-attack-') as temp:
  folder=Path(temp);marker=folder/'PRODUCER_SOURCE_WAS_EXECUTED'
  # Retain the real typed proof, but append an untrusted producer command.
  bad=copy.deepcopy(original);bad['evidence']['result']['search']['receipt']['proof']+='\n#eval IO.FS.writeFile '+json.dumps(str(marker))+' "bad"\n'
  try:replay(wrap(bad),core)
  except ValueError:pass
  else:raise AssertionError('Altered producer proof was accepted')
  assert not marker.exists();rows.append({'attack':'producer_Lean_command','rejected':True,'side_effect_executed':False})
  bad=copy.deepcopy(original);bad['evidence']['result']['search']['receipt']['library_declarations']+='\n#eval IO.FS.writeFile '+json.dumps(str(marker))+' "bad"\n'
  try:replay(wrap(bad),core)
  except ValueError:pass
  else:raise AssertionError('Altered producer declarations accepted')
  assert not marker.exists();rows.append({'attack':'producer_library_source','rejected':True,'side_effect_executed':False})
  evil=folder/'fake-core';(evil/'pcs').mkdir(parents=True);(evil/'pcs/__init__.py').write_text('from pathlib import Path\nPath('+repr(str(marker))+').touch()\n')
  subprocess.run(['git','init','-q',str(evil)],check=True);subprocess.run(['git','-C',str(evil),'add','.'],check=True);subprocess.run(['git','-C',str(evil),'-c','user.name=Synthetic attack fixture','-c','user.email=fixture@example.test','commit','-qm','untrusted verifier fixture'],check=True)
  sha=subprocess.check_output(['git','-C',str(evil),'rev-parse','HEAD'],text=True).strip();bad=copy.deepcopy(original);bad['source_revision']=sha;bad['evidence']['core_sha']=sha
  try:replay(wrap(bad),evil)
  except ValueError:pass
  else:raise AssertionError('Producer-selected Python verifier accepted')
  assert not marker.exists();rows.append({'attack':'producer_selected_verifier','rejected':True,'side_effect_executed':False})
 return {'format':'pcs-workbench-receiver-adversarial-v1','actual_trusted_core':str(core),'cases':rows,'affirmative_verifier_substitutions':0,'pcs_authority':False}
if __name__=='__main__':
 p=argparse.ArgumentParser(__doc__);p.add_argument('--core',type=Path,required=True);a=p.parse_args();print(json.dumps(run(a.core.resolve()),indent=2))
