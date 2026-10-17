"""Bind website research documents and current dispatch/CI pins to protected source."""
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

ROOT=Path(__file__).resolve().parents[1]

def verify(core):
    public=ROOT/'public/research-release-20261017'
    manifest=json.loads((public/'SOURCE_MANIFEST.json').read_text())
    if manifest.get('format')!='pcs-protected-research-site-sync-v1' or manifest.get('scientific_acceptance') is not False or manifest.get('pcs_authority') is not False or manifest.get('website_copy_is_independent_review') is not False or manifest.get('excluded_draft_prs')!=[117]:
        raise ValueError('Research release scope changed')
    expected=set(manifest['documents'])|{'SOURCE_MANIFEST.json'}
    if {p.name for p in public.iterdir()}!=expected:
        raise ValueError('Uninventoried research document')
    for name,entry in manifest['documents'].items():
        raw=(public/name).read_bytes()
        if hashlib.sha256(raw).hexdigest()!=entry['sha256'] or raw!=(core/entry['core_path']).read_bytes():
            raise ValueError('Protected research document source mismatch: '+name)
    admission=(ROOT/'src/lean-research.js').read_text()
    current=re.search(r'export const CORE_SHA = "([0-9a-f]{40})";',admission)[1]
    status=json.loads((ROOT/'public/status.json').read_text())
    if manifest.get('current_verification_core_sha')!=current or status['research_platform_v3'].get('current_verification_core_sha')!=current:
        raise ValueError('Published verification revision differs from the dispatch revision')
    if subprocess.check_output(['git','-C',str(core),'rev-parse','HEAD'],text=True).strip()!=current:
        raise ValueError('Independent checkout differs from the public dispatch revision')
    workflow=(ROOT/'.github/workflows/site-public-verification.yml').read_text()
    refs=re.findall(r'repository: Tommaso-R-Marena/proof-carrying-science\s+fetch-depth: 0\s+ref: ([0-9a-f]{40})',workflow)
    if refs!=[current,current]:
        raise ValueError('Independent core CI pins differ')
    # Qualified capability commit may precede a source-identical dependency update.
    capability=manifest['capability_source_sha']
    subprocess.run(['git','-C',str(core),'merge-base','--is-ancestor',capability,current],check=True)
    qualification=json.loads((ROOT/'docs/evidence/d1-present-state-baseline-v1/clone-boundary-qualification.json').read_text())
    browser=json.loads((ROOT/'docs/evidence/website-research-sync-v1/calibration-browser.json').read_text())
    for receipt in [qualification,browser]:
        for name,expected_sha in receipt['source_sha256'].items():
            if hashlib.sha256((ROOT/name).read_bytes()).hexdigest()!=expected_sha:
                raise ValueError('Executed local qualification source differs: '+name)
    print(json.dumps({'format':'pcs-site-protected-source-check-v1','core_sha':current,
                      'documents':len(manifest['documents']),'draft_117_excluded':True,
                      'scientific_acceptance':False}))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--core',required=True,type=Path)
    verify(parser.parse_args().core.resolve())
