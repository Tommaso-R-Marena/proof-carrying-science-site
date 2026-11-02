#!/usr/bin/env python3
"""Elaborate every preview statement, including false statements, as a type.
This checks translator/Lean syntax compatibility. It proves none of the goals.
"""
import argparse,json,subprocess,tempfile
from pathlib import Path
from export_proof_workbench_catalog import catalog
if __name__=='__main__':
 p=argparse.ArgumentParser(__doc__);p.add_argument('--core',type=Path,required=True);a=p.parse_args();data=catalog(a.core.resolve())
 with tempfile.TemporaryDirectory(prefix='pcs-preview-types-') as folder:
  path=Path(folder)/'PreviewTypes.lean';path.write_text('import Std\n'+'\n'.join('#check ('+e['lean']+')' for e in data['entries'])+'\n')
  result=subprocess.run(['lean',str(path)],capture_output=True,text=True,timeout=90)
  if result.returncode:raise SystemExit(result.stdout+result.stderr)
 print(json.dumps({'statements_elaborated':len(data['entries']),'theorems_proved':0,'core_revision':data['core_revision']}))
