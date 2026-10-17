"""Reproduce the public calibration view from the exact qualified CI archive.

The ZIP is retained byte-for-byte. This exporter independently checks its sealed
receipts and compares the receiving sources with the supplied protected checkout.
It does not run Lean and cannot confer scientific or verification authority.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
from pathlib import Path, PurePosixPath
import zipfile
from fractions import Fraction

REPO = Path(__file__).resolve().parents[1]
ARTIFACT_SHA = '4b53e9a38d283da4e60577b031ceb9ebfd5b6b844308b0956696eb80aa965924'
QUALIFIED_MAIN = '68d8351a326565496908bf76c8a8daf082b94ff9'
TESTED_MERGE = '4e8a4cb420204649e2b1dd50cd681a2c9725cd76'

def sha(raw):
    return hashlib.sha256(raw).hexdigest()

def encode(obj):
    return (json.dumps(obj, indent=2, sort_keys=True, allow_nan=False)+'\n').encode()

def export(raw, core):
    if sha(raw) != ARTIFACT_SHA:
        raise ValueError('Qualified CI archive digest mismatch')
    files = {}
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        if len(entries)>2000 or sum(x.file_size for x in entries)>32*1024*1024:
            raise ValueError('Archive exceeds fixed bounds')
        for entry in entries:
            path = PurePosixPath(entry.filename)
            if path.is_absolute() or '..' in path.parts or '\\' in entry.filename or entry.filename in files:
                raise ValueError('Unsafe or duplicate archive entry')
            if not entry.is_dir():
                files[entry.filename] = archive.read(entry)
    def read(name):
        return files[name]
    def doc(name):
        return json.loads(read(name))
    summary = doc('experimental-calibration/SUMMARY.json')
    if not summary['passed'] or summary['hulls']!=22 or summary['fit_certificates']!=132:
        raise ValueError('Incomplete qualified experiment')
    import sys
    sys.path.insert(0, str(core.resolve()))
    from pcs import calibration_kernel_v1 as receiver
    source_bytes = receiver.sources()
    original=(core/'examples/experimental_calibration_v1/yacht_hydrodynamics.data').read_bytes()
    if sha(original)!='00dfecc0fc01ddd4c90b558a3ac11b246df8ebcfea130724223475a9a67f0ea1':
        raise ValueError('Original measurement source bytes differ')
    groups={}
    for row_number,line in enumerate(original.decode('ascii').splitlines(),1):
        if not line.strip():
            continue
        values=list(map(Fraction,line.split()))
        if len(values)!=7:
            raise ValueError('Original measurement column shape differs')
        groups.setdefault(tuple(values[:5]),[]).append((values[5],values[6],row_number))
    if len(groups)!=22 or sum(map(len,groups.values()))!=308:
        raise ValueError('Original observation inventory differs')
    original_groups=list(groups.items())
    cases = []
    for index in range(22):
        prefix=f'experimental-calibration/hull-{index:02d}/receiving/'
        seal=doc(prefix+'SHA256.json')
        if any(sha(read(prefix+name))!=expected for name,expected in seal.items()):
            raise ValueError('Receiving seal mismatch')
        report=doc(prefix+'report.json')
        if not report['accepted'] or not report['mathematical_support'] or report['scientific_acceptance'] is not False or report['pcs_authority'] is not False:
            raise ValueError('Recorded scope mismatch')
        prepared=receiver.prepare(read(prefix+'data.csv'),read(prefix+'contract.json'),read(prefix+'certificate.json'))
        hull,rows=original_groups[index]
        rows.sort()
        expected_data=('x,y\n'+''.join(f'{40*x},{y}\n' for x,y,_ in rows)).encode()
        retained=summary['receivers'][index]
        if len(rows)!=14 or retained['hull']!=list(map(str,hull)) or retained['source_rows']!=[r[2] for r in rows] or retained['training_source_rows']!=[r[2] for r in rows[::2]] or retained['heldout_source_rows']!=[r[2] for r in rows[1::2]] or read(prefix+'data.csv')!=expected_data:
            raise ValueError('Original observations or split substituted')
        if prepared!=report['prepared']:
            raise ValueError('Prepared literals differ from exact archived inputs')
        proof,names=receiver.render(prepared)
        kernel=report['kernel']
        if not kernel['kernel_checked'] or set(kernel['kernel_theorems'])!=set(receiver.GENERAL+names) or len(kernel['kernel_theorems'])!=386:
            raise ValueError('Incomplete theorem inventory')
        if any(set(a)-{'propext','Classical.choice','Quot.sound'} for a in kernel['kernel_theorems'].values()):
            raise ValueError('Unapproved recorded axioms')
        if read(prefix+'Replay.lean')!=proof or kernel['proof_sha256']!=sha(proof):
            raise ValueError('Regenerated proof differs')
        units=receiver.render_units(prepared)
        if kernel['proof_units_sha256']!={n:sha(b) for n,b,_ in units} or len(kernel['executions'])!=7 or any(x['returncode']!=0 for x in kernel['executions']):
            raise ValueError('Incomplete actual proof processes')
        if any(read(prefix+'proof-units/'+n)!=b for n,b,_ in units):
            raise ValueError('Compiled proof-unit substitution')
        if kernel['source_sha256']!={n:sha(b) for n,b in source_bytes.items()}:
            raise ValueError('Receiving source is not the protected capability source')
        if any(read(prefix+'receiving-source/'+n)!=b for n,b in source_bytes.items()):
            raise ValueError('Receiving source snapshot mismatch')
        cases.append({'id':f'hull-{index:02d}','hull':summary['receivers'][index]['hull'],
                      'models':prepared['models'],'recorded_receipt_sha256':sha(read(prefix+'report.json'))})
    result={'format':'pcs-calibration-public-view-v1','source_core_sha':QUALIFIED_MAIN,
            'tested_merge_sha':TESTED_MERGE,'artifact_sha256':ARTIFACT_SHA,
            'scientific_acceptance':False,'pcs_authority':False,'recorded_result_not_live_verification':True,
            'hull_groups':22,'distinct_response_curves':21,'observations':308,'heldout_observations':154,
            'pooled_heldout_sse':summary['pooled_heldout_sse'],
            'minimax_pooled_heldout_sse':summary['minimax_pooled_heldout_sse'],'cases':cases}
    output={'view.json':encode(result),'protected-ci-calibration.zip':raw,
            'REPORT.md':(core/'docs/PCS_EXPERIMENTAL_CALIBRATION_V1_REPORT.md').read_bytes(),
            'CAPABILITY.md':(core/'docs/PCS_EXPERIMENTAL_CALIBRATION_V1.md').read_bytes(),
            'Calibration.lean':source_bytes['PCSReal/Calibration.lean'],
            'ATTRIBUTION.md':read('calibration-data-rights/ATTRIBUTION.md'),
            'UPSTREAM_LICENSE.txt':read('calibration-data-rights/UPSTREAM_LICENSE.txt'),
            'provenance.json':read('calibration-data-rights/provenance.json'),
            'yacht_hydrodynamics.data':original,
            'numeric-axioms.json':read('calibration-numeric-axioms.json'),
            'static-axioms.json':read('calibration-static-axioms.json')}
    output['SHA256.json']=encode({'format':'pcs-calibration-public-assets-v1','files':{n:sha(b) for n,b in output.items()}})
    return output

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--core',type=Path,required=True)
    parser.add_argument('--artifact',type=Path)
    parser.add_argument('--output',type=Path,default=REPO/'public/calibration-v1')
    parser.add_argument('--verify',action='store_true')
    args=parser.parse_args()
    raw=(args.artifact or args.output/'protected-ci-calibration.zip').read_bytes()
    outputs=export(raw,args.core)
    if args.verify:
        if {p.name for p in args.output.iterdir()}!=set(outputs) or any((args.output/n).read_bytes()!=b for n,b in outputs.items()):
            raise ValueError('Public export differs from its exact source archive and protected code')
    else:
        args.output.mkdir(parents=True,exist_ok=False)
        for name,body in outputs.items():
            (args.output/name).write_bytes(body)
    print(json.dumps({'verified':args.verify,'hulls':22,'receipts':22,'names_per_receipt':386,
                      'artifact_sha256':ARTIFACT_SHA,'scientific_acceptance':False}))

if __name__=='__main__':
    main()
