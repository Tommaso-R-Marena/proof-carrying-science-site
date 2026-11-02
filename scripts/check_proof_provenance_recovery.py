#!/usr/bin/env python3
"""Required full-history integration test: actual archive, no producer execution."""
import hashlib,json,subprocess,tempfile
from pathlib import Path
from check_proof_search_artifacts import ROOT,check,restore_provenance
if __name__=='__main__':
 check()
 with tempfile.TemporaryDirectory(prefix='pcs-receiving-git-') as folder:
  repo=Path(folder);subprocess.run(['git','init','--bare','-q',str(repo)],check=True)
  subprocess.run(['git','fetch','--depth=1',str(ROOT),'7ee63e4b99a332330d3b94d6ce00f83dde7bebfb'],cwd=repo,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
  original='e7197109331cd6f3e55ccd8a04d4d1704edaff2f:scripts/run_proof_search_evaluation.py'
  missing=subprocess.run(['git','cat-file','-e',original],cwd=repo,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
  if missing.returncode==0:raise ValueError('Fixture already has original objects')
  restore_provenance(repo)
  source=subprocess.check_output(['git','show',original],cwd=repo)
  if hashlib.sha256(source).hexdigest()!='937190fa43b848abbcb5fb16a54e457a50b6918ee12ab28ffb4c2b40c148248f':raise ValueError('Original evaluator bytes differ')
 print(json.dumps({'actual_original_objects_initially_absent':True,'original_source_recovered_exactly':True,'producer_code_executed':False}))
