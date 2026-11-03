#!/usr/bin/env python3
"""Reproduce a model proposal, then independently replay its exact Lean proof.

Trusted local tools reconstruct commands from typed proof actions. Producer Lean
source is never executed. A matching checksum is not an authority signature.
"""
import argparse,hashlib,json,subprocess,tempfile,sys
from pathlib import Path
from replay_proof_workbench import strict,replay,trusted_source

ROOT=Path(__file__).resolve().parents[1]

def trusted_local_runtime(core):
    # HEAD alone does not identify modified libraries, checkpoints or Lean files.
    trusted_source(core)
    paths=['pcs','formal','research/verified-memory-v1']
    subprocess.run(['git','diff','--exit-code','HEAD','--',*paths],cwd=core,check=True,stdout=subprocess.DEVNULL)
    extras=subprocess.check_output(['git','ls-files','--others','--exclude-standard','--',*paths],cwd=core,text=True).splitlines()
    if extras:raise ValueError('Untracked local proof inputs are not accepted')
    for name in subprocess.check_output(['git','ls-files','--',*paths],cwd=core,text=True).splitlines():
        path=core/name
        if path.is_symlink() or not path.is_file():raise ValueError('Local proof inputs must be regular reviewed files')

def trusted_bridge_sources():
    profile=strict((ROOT/'scripts/model_lean/trust-profile-v1.json').read_bytes())
    if profile.get('format')!='pcs-model-lean-receiver-source-v1' or profile.get('pcs_authority') is not False:
        raise ValueError('Unrecognized model receiver profile')
    for name,digest in profile['sources'].items():
        p=ROOT/name
        if p.is_symlink() or not p.is_file() or hashlib.sha256(p.read_bytes()).hexdigest()!=digest:
            raise ValueError('Model receiver source changed: '+name)
    return profile

def verify(raw,core):
    if not isinstance(raw,bytes) or len(raw)>12*1024*1024:
        raise ValueError('Model evidence exceeds bound')
    value=strict(raw)
    if type(value) is not dict or value.get('format') not in {'pcs-model-lean-chain-v1','pcs-model-local-lean-chain-v1'}:
        raise ValueError('Expected model-to-Lean evidence')
    before=trusted_bridge_sources()
    # Capture once. The verifier never reopens the caller's mutable artifact.
    with tempfile.TemporaryDirectory(prefix='pcs-model-chain-') as folder:
        snapshot=Path(folder)/'input.json';snapshot.write_bytes(raw);snapshot.chmod(0o600)
        checked=json.loads(subprocess.check_output(['node',str(ROOT/'scripts/check_model_lean_chain.mjs'),str(snapshot)],cwd=ROOT,timeout=60))
    if trusted_bridge_sources()!=before:
        raise ValueError('Model receiver changed during reproduction')
    if value['format']=='pcs-model-lean-chain-v1':
        fresh=replay(json.dumps(value['proof_report'],ensure_ascii=False,separators=(',',':')).encode(),core)
    else:
        # A private local result is not converted into fictitious public-job evidence.
        revision=subprocess.check_output(['git','rev-parse','HEAD'],cwd=core,text=True).strip()
        if revision!=value['core_revision']:raise ValueError('Use the exact approved core source')
        trusted_local_runtime(core)
        sys.path.insert(0,str(core))
        from pcs.experimental.prover.induction_language import formalize
        from pcs.experimental.prover.induction_ir import digest
        from pcs.experimental.prover.memory_environment import MemoryEnvironment
        from pcs.experimental.prover.memory_model import MemoryNetwork
        target=value['handoff']['entry'];meaning=formalize(target['statement'])
        if meaning['status']!='supported' or len(meaning['candidates'])!=1:raise ValueError('Unsupported local proof meaning')
        goal=meaning['candidates'][0]
        if goal['lean']!=target['lean'] or digest(goal['ir'])!=checked['goal_sha256']:raise ValueError('Independent local interpretation differs')
        receipt=value['observation']['search']['receipt']
        folder=core/'research/verified-memory-v1';registry=strict((folder/'registry.json').read_bytes());library=strict((folder/'library.json').read_bytes())
        selected=next(m for m in registry['models'] if m['id']==registry['selected_local_experiment'])
        # Check actual checkpoint bytes; generation itself is not physically attested.
        MemoryNetwork.load(folder/selected['checkpoint'],selected['sha256'])
        if value['observation']['checkpoint_sha256']!=selected['sha256'] or receipt.get('library')!=library:raise ValueError('Unreviewed local checkpoint or proof memory')
        env=MemoryEnvironment(library,timeout=30)
        try:proved=env.verify(goal['ir'],receipt['actions'])
        finally:env.close()
        for field in ['proof','library_declarations','library_sha256','adapter_sha256','kernel']:
            if proved.get(field)!=receipt.get(field):raise ValueError('Regenerated local proof differs: '+field)
        trusted_local_runtime(core)
        fresh={'format':'pcs-local-model-proof-independent-replay-v1','status':'proved','goal_sha256':digest(goal['ir']),
               'source_revision':revision,'axioms':proved['kernel']['axioms'],'proof_commands_regenerated':True,
               'producer_Lean_source_executed':False,'pcs_authority':False}
    if trusted_bridge_sources()!=before:raise ValueError('Model receiver changed during proof replay')
    return {'format':'pcs-model-lean-independent-replay-v1','model':checked,'lean':fresh,
            'source_profile_sha256':hashlib.sha256((ROOT/'scripts/model_lean/trust-profile-v1.json').read_bytes()).hexdigest(),
            'producer_Lean_source_executed':False,'physical_neural_execution_independently_attested':False,
            'scientific_validity_established':False,'pcs_authority':False}

if __name__=='__main__':
    p=argparse.ArgumentParser(__doc__);p.add_argument('evidence',type=Path);p.add_argument('--core',type=Path,required=True);a=p.parse_args()
    print(json.dumps(verify(a.evidence.read_bytes(),a.core.resolve()),indent=2))
