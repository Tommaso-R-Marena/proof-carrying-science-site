"""Verify every publishable archive, its source closure, tag and checksum bytes."""
import argparse, hashlib, json, re, zipfile
from pathlib import Path

def require(condition, message):
    if not condition:raise ValueError(message)

def main():
    p = argparse.ArgumentParser()
    p.add_argument('folder', type=Path)
    p.add_argument('--commit', required=True)
    p.add_argument('--version', required=True)
    a = p.parse_args()
    root = Path(__file__).resolve().parents[1]
    expected = {f'PCS-File-Checker-{os}.zip' for os in ['linux-x64', 'windows-x64', 'macos-arm64', 'macos-x64']}
    files = list(a.folder.rglob('*.zip'))
    require(len(files) == 4 and {f.name for f in files} == expected, 'Release archive qualification failed.')
    source_files = {'desktop/VERSION','desktop/app.py','desktop/file_check.py','desktop/change_review.py',
                    *('desktop/lean/'+n+'.lean' for n in ['Main','StackSafe','Audit','OriginalCsv','Review']),
                    *('public/'+n for n in ['check-my-files.html','file-check.css','file-check.mjs',
                    'file-check-core.mjs','file-check-local.mjs','change-review-core.mjs','review-changes.html',
                    'review-changes.mjs','usability-core.mjs','usability-study.html','usability-study.mjs',
                    'example-iris-previous.csv','example-iris-new.csv','logo-mark.svg'])}
    for f in files:
        sidecar = f.with_name(f.name + '.sha256')
        text = sidecar.read_bytes().decode('ascii')
        require(re.fullmatch('[a-f0-9]{64}  ' + re.escape(f.name) + r'\r?\n', text), 'Release archive qualification failed.')
        require(hashlib.sha256(f.read_bytes()).hexdigest() == text[:64], 'Release archive qualification failed.')
        with zipfile.ZipFile(f) as z:
            m = json.loads(z.read('BUILD.json'))
            require(m['version'] == a.version and m['site_commit'] == a.commit and (m['core_commit'] == 'f20f3cab2938f2e085f137185e88f4700d5da2ed') and (m['development_build'] is False) and (m['source_snapshot'] == 'git-archive'), 'Release archive qualification failed.')
            require(m['production_scientific_authority'] is False and m['host_refinement_proved'] is False and (m['code_signed'] is False), 'Release archive qualification failed.')
            require({'original-csv-decoding-v2', 'original-csv-change-review-v2'} <= set(m['capabilities']), 'Release archive qualification failed.')
            require('PCSFiles.Review.original_conservative_extension' in m['theorems'] and 'PCSFiles.OriginalCsv.decode_iff' in m['theorems'], 'Release archive qualification failed.')
            audit = z.read('axioms.log').decode('utf-8')
            require('sorryAx' not in audit and 'Lean.ofReduceBool' not in audit and ('Lean.trustCompiler' not in audit), 'Release archive qualification failed.')
            require(set(m['source_sha256']) == source_files, 'Incomplete source closure')
            for name, digest in m['source_sha256'].items():
                require(not Path(name).is_absolute() and '..' not in Path(name).parts and name==Path(name).as_posix(), 'Unsafe source path')
                require(hashlib.sha256((root / name).read_bytes()).hexdigest() == digest, (f.name, name))
    print(json.dumps({'format': 'pcs-four-platform-release-qualification-v2', 'archives': 4, 'exact_git_source_hashes_match_on_all_platforms': True, 'source_commit': a.commit, 'version': a.version}))
if __name__ == '__main__':
    main()
