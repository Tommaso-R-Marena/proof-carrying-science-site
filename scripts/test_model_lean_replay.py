#!/usr/bin/env python3
"""Adversarial replay of rechecksummed evidence; no producer code is executed."""
import argparse,hashlib,json
from pathlib import Path
from replay_model_lean_chain import verify,ROOT

def main(core):
    value=json.loads((ROOT/'docs/evidence/runtime-wiring-v1/local-model-lean-chain.json').read_text())
    # The envelope is internally consistent and passes the browser binding check.
    # The receiver must still reconstruct typed proof commands and detect a lie.
    value['observation']['search']['receipt']['proof']+='\n-- producer changed this proof'
    payload={k:v for k,v in value.items() if k!='chain_sha256'}
    canonical=lambda x:json.dumps(x,sort_keys=True,ensure_ascii=False,separators=(',',':'))
    value['chain_sha256']=hashlib.sha256(canonical(payload).encode()).hexdigest()
    try:verify(canonical(value).encode(),core)
    except ValueError as error:
        if str(error)!='Regenerated local proof differs: proof':raise
    else:raise AssertionError('Rechecksummed producer proof was accepted')
    print(json.dumps({'status':'PASS','rechecksummed_producer_proof_rejected':True,'typed_proof_regenerated_in_Lean':True,'producer_Lean_source_executed':False,'pcs_authority':False}))

if __name__=='__main__':
    p=argparse.ArgumentParser(__doc__);p.add_argument('--core',type=Path,required=True);a=p.parse_args();main(a.core.resolve())
