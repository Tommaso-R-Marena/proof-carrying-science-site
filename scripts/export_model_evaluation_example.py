#!/usr/bin/env python3
"""Derive evaluation CSVs from recorded real proof-search observations.

Reference targets distinguish positive tasks from negative controls. An unknown
search result is not a false theorem. This export runs no inference or training.
The historical source is read from its raw Git blob, independently of OS checkout
newline conversion. The four generated public snapshots disable that conversion.
"""
import argparse,csv,hashlib,io,json,subprocess
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]

def example():
    source=ROOT/'research/proof-search-prospective-v1/run-1/summary.json'
    source_raw=subprocess.check_output(['git','cat-file','blob','HEAD:'+source.relative_to(ROOT).as_posix()],cwd=ROOT)
    run=json.loads(source_raw);rows=run['rows'];cases=sorted({r['case'] for r in rows})
    groups={method:{r['case']:r for r in rows if r['method']==method and r['case'] in cases} for method in ['std_then_structural','frozen_neural']}
    def verified(r):return r['search_status']=='verified' and r.get('independent_replay',{}).get('status')=='verified'
    controls={r['case']:r['authored_control'] for r in rows}
    if (len(cases),sum(v=='positive' for v in controls.values()),sum(v=='negative' for v in controls.values()),*[sum(verified(r) for r in groups[m].values()) for m in groups])!=(14,11,3,11,8):
        raise ValueError('The frozen recorded experiment no longer matches its stated tasks and outcomes.')
    tables=[[(c,'verified' if controls[c]=='positive' else 'not_verified') for c in cases],*[[ (c,'verified' if verified(groups[m][c]) else 'not_verified') for c in cases] for m in groups]]
    result={}
    for name,table in zip(['evaluation-reference.csv','evaluation-baseline.csv','evaluation-candidate.csv'],tables):
        out=io.StringIO(newline='');w=csv.writer(out,lineterminator='\n');w.writerow(['id','outcome']);w.writerows(table);result[name]=out.getvalue().encode()
    checkpoint=next(r['checkpoint_sha256'] for r in rows if r['method']=='frozen_neural')
    meta={'format':'pcs-recorded-model-evaluation-example-v1','new_inference_executed':False,'physical_model_generation_independently_attested':False,
          'input_sha256':[hashlib.sha256(v).hexdigest() for v in result.values()],
          'source_path':source.relative_to(ROOT).as_posix(),'source_sha256':hashlib.sha256(source_raw).hexdigest(),
          'original_proof_success_counts':{'baseline':11,'candidate':8,'cases':14},'positive_cases':11,'negative_controls':3,'core_revision':run['core_revision'],'protocol_sha256':run['protocol_sha256'],
          'provenance':{'baseline_name':'Ordinary Lean tactics + structural search','candidate_name':'Frozen PCS learned memory policy',
                        'baseline_weights_sha256':None,'candidate_weights_sha256':checkpoint,
                        'reference_note':'Authored expectations for 14 cases: verified on 11 positive tasks; not_verified on three negative controls. An unknown result is not a disproof; these targets are not axioms.',
                        'source_note':'Recorded prospective proof-search run 1, source '+run['core_revision']+'. Authored inspectable tasks, not a blind benchmark; no inference ran when exporting these files.'},'pcs_authority':False}
    result['evaluation-example.json']=(json.dumps(meta,indent=2)+'\n').encode();return result

if __name__=='__main__':
    p=argparse.ArgumentParser(__doc__);p.add_argument('--write',action='store_true');a=p.parse_args()
    for name,raw in example().items():
        target=ROOT/'public'/name
        if a.write:target.write_bytes(raw)
        elif target.read_bytes()!=raw:raise ValueError('Recorded evaluation example changed: '+name)
    print(json.dumps({'status':'matched','recorded_cases':14,'new_inference':False,'pcs_authority':False}))
