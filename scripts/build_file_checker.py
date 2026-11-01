#!/usr/bin/env python3
"""Build the portable local app against exact committed PCS sources.

The generated bundle contains no Python/Lake/Lean installation requirement.
OS code signing is not supplied. SHA-256 manifests identify bytes, not an author.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import platform
import re
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'desktop'))
from file_check import CORE_COMMIT, SCOPE, canonical
from git_snapshot import materialize


def run(args, cwd=None, **kw):
    return subprocess.run([str(x) for x in args], cwd=cwd, check=True, **kw)


def main():
    p = argparse.ArgumentParser(__doc__)
    p.add_argument('--core', type=Path, required=True)
    p.add_argument('--output', type=Path, required=True)
    p.add_argument('--package', action='store_true')
    p.add_argument('--development', action='store_true', help='Label an unpublished working-tree build; never use for release.')
    args = p.parse_args()
    out = args.output.resolve()
    out.mkdir(parents=True, exist_ok=False)
    version = subprocess.check_output(['lean', '--version'], text=True)
    if 'version 4.28.0' not in version:
        raise ValueError('Use the pinned Lean 4.28.0 toolchain.')
    site_commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    if not args.development:
        tracked = subprocess.check_output(['git','diff','--name-only','HEAD'],cwd=ROOT)
        extra = subprocess.check_output(['git','ls-files','--others','--exclude-standard','--','desktop','public/file-check*','public/check-my-files.html','scripts/*file_check*'],cwd=ROOT)
        if tracked or extra:
            raise ValueError('Release builds require clean committed website sources.')
    source = ROOT
    if not args.development:
        # Read raw committed blobs. Even git archive applies core.autocrlf,
        # so an archive is not an exact byte snapshot on every host.
        source = out/'site-source'
        materialize(ROOT, site_commit, ['desktop', 'public'], source)
    release_version=(source/'desktop/VERSION').read_text(encoding='ascii').strip()
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+',release_version):raise ValueError('Invalid app release version.')
    # The core repository is never rewritten or read through its working tree.
    snapshot = out/'core'
    materialize(args.core, CORE_COMMIT, ['formal'], snapshot)
    frontend = out/'frontend'
    frontend.mkdir()
    for name in ['Main.lean','Audit.lean','StackSafe.lean','OriginalCsv.lean','Review.lean']:
        shutil.copy2(source/'desktop/lean'/name,frontend/name)
    (frontend/'lean-toolchain').write_text('leanprover/lean4:v4.28.0\n')
    (frontend/'lakefile.toml').write_text('name = "PCSFiles"\nversion = "1.0.0"\n\n[[lean_lib]]\nname = "StackSafe"\n\n[[lean_lib]]\nname = "OriginalCsv"\n\n[[lean_lib]]\nname = "Review"\n\n[[require]]\nname = "PCS"\npath = "../core/formal"\n\n[[lean_exe]]\nname = "pcs-files-checker"\nroot = "Main"\n')
    run(['lake','build','pcs-files-checker'],cwd=frontend)
    audit = subprocess.check_output(['lake','env','lean','Audit.lean'],cwd=frontend,text=True,encoding='utf-8')
    axiom_sets=re.findall(r'depends on axioms: \[([^]]*)\]',audit)
    if any(set(x.strip() for x in group.split(',') if x.strip())-{'propext','Classical.choice','Quot.sound'} for group in axiom_sets) or any(x in audit for x in ['sorryAx','Lean.ofReduceBool','Lean.trustCompiler']):
        raise ValueError('Unexpected axiom in checker audit.')
    names = ['PCS.V2.Csv.'+n for n in ['parseCsv_sound','parseCsv_complete','csvTable_unique','csvDisjointB_iff','csvRun_sound']]
    names += ['PCSFiles.'+n for n in ['splitSafe_eq','mapOptSafe_eq','parseSafe_eq','disjointSafe_eq','disjointSafe_iff']]
    names += ['PCSFiles.OriginalCsv.'+n for n in ['step_iff','run_iff','decode_iff','decodes_unique','hexSafe_eq','hexSafe_injective']]
    names += ['PCSFiles.'+n for n in ['distinctWith_iff','distinctB_iff']]
    names += ['PCSFiles.Review.'+n for n in ['entries_unique','added_iff','removed_iff','changed_iff','accepts_iff','overlap_iff','reviewCheck_iff','unique_id_eq','conservative_extension','original_conservative_extension']]
    if not all(n in audit for n in names):
        raise ValueError('Incomplete checker theorem audit.')
    (out/'axioms.log').write_text(audit,encoding='utf-8')
    bundle = out/'bundle'
    (bundle/'public').mkdir(parents=True)
    binary = 'pcs-files-checker.exe' if sys.platform=='win32' else 'pcs-files-checker'
    shutil.copy2(frontend/'.lake/build/bin'/binary,bundle/binary)
    dependencies = {}
    if sys.platform == 'win32':
        # Native SDK runtime DLLs must travel with the child executable. They
        # are data, not rewritten by PyInstaller, so their pins remain exact.
        for dll in Path(shutil.which('lean')).resolve().parent.glob('*.dll'):
            shutil.copy2(dll,bundle/dll.name)
            dependencies[dll.name] = hashlib.sha256(dll.read_bytes()).hexdigest()
    public = ['check-my-files.html', 'file-check.css', 'file-check.mjs', 'file-check-core.mjs', 'file-check-local.mjs', 'change-review-core.mjs', 'review-changes.html', 'review-changes.mjs', 'usability-core.mjs', 'usability-study.html', 'usability-study.mjs', 'example-iris-previous.csv', 'example-iris-new.csv', 'logo-mark.svg']
    for name in public:
        shutil.copy2(source/'public'/name,bundle/'public'/name)
    manifest = {'format':'pcs-files-checker-build-v1','version':release_version,'scope':SCOPE,
                'capabilities':[SCOPE,'original-csv-change-review-v2','original-csv-decoding-v2'],
                'core_commit':CORE_COMMIT,'site_commit':site_commit,'development_build':args.development,'source_snapshot':'working-tree-development' if args.development else 'git-blobs',
                'lean_toolchain':'leanprover/lean4:v4.28.0','binary':binary,
                'binary_sha256':hashlib.sha256((bundle/binary).read_bytes()).hexdigest(),
                'dependent_files_sha256':dependencies,
                'source_sha256':{p.relative_to(source).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in
                    [source/'desktop/VERSION',source/'desktop/app.py',source/'desktop/file_check.py',source/'desktop/change_review.py',source/'desktop/lean/Main.lean',source/'desktop/lean/StackSafe.lean',source/'desktop/lean/Audit.lean',source/'desktop/lean/OriginalCsv.lean',source/'desktop/lean/Review.lean',*(source/'public'/x for x in public)]},
                'theorems':names,'code_signed':False,
                'host_refinement_proved':False,'production_scientific_authority':False}
    (bundle/'checker-manifest.json').write_bytes(canonical(manifest))
    (out/'BUILD.json').write_text(json.dumps(manifest,indent=2)+'\n')
    if args.package:
        packaged = out/'packaged-assets'
        packaged.mkdir()
        shutil.copy2(bundle/'checker-manifest.json',packaged/'checker-manifest.json')
        shutil.copytree(bundle/'public',packaged/'public')
        # Prevent PyInstaller's Mach-O rewriting from changing the exact native
        # executable bytes. The runtime extracts and checks every original pin.
        with zipfile.ZipFile(packaged/'native-payload.zip','w',compression=zipfile.ZIP_DEFLATED) as z:
            for name in [binary,*dependencies]:
                z.write(bundle/name,name)
        app_name = 'PCS File Checker'
        run([sys.executable,'-m','PyInstaller','--clean','--noconfirm','--onefile','--name',app_name,
             '--paths',source/'desktop','--distpath',out/'dist','--workpath',out/'pyinstaller','--specpath',out,
             '--add-data',str(packaged)+os.pathsep+'.',source/'desktop/app.py'],cwd=ROOT)
        executable = out/'dist'/(app_name+('.exe' if sys.platform=='win32' else ''))
        clean_env = dict(os.environ)
        for key in ['PYTHONPATH','LD_LIBRARY_PATH','DYLD_LIBRARY_PATH']:
            clean_env.pop(key,None)
        clean_env['PATH'] = (str(Path(os.environ['SystemRoot'])/'System32')+os.pathsep+os.environ['SystemRoot']) if sys.platform=='win32' else '/usr/bin:/bin:/usr/sbin:/sbin'
        run([executable,'--self-test'],cwd=out,env=clean_env)
        os_name = {'win32':'windows','darwin':'macos','linux':'linux'}[sys.platform]
        arch = 'arm64' if platform.machine().lower() in {'arm64','aarch64'} else 'x64'
        package = out/f'PCS-File-Checker-{os_name}-{arch}.zip'
        readme = (f'PCS File Checker {release_version}\n\nExtract this folder, then open PCS File Checker. '
                  'It opens a private local page in your browser. No terminal commands or Python/Lean installation are needed. '
                  'Keep the app window open while checking; close it to stop the local server.\n\n'
                  'The app is not code-signed. Your operating system may request confirmation. '
                  'Do not disable operating-system security protections. Source and byte checksums are on the GitHub release page.\n\n'
                  'CSV files stay on your device. Replay downloads contain file contents only if you explicitly include them. '
                  'The Lean checker decodes the original CSV bytes and checks selected IDs or records. Compilation, file-to-process binding and host execution remain implementation assumptions. '
                  'This is not a signed scientific certificate or proof of an immutable host.\n')
        with zipfile.ZipFile(package,'w',compression=zipfile.ZIP_DEFLATED) as z:
            z.write(executable,executable.name)
            z.writestr('START HERE.txt',readme)
            z.write(out/'BUILD.json','BUILD.json')
            z.write(out/'axioms.log','axioms.log')
        (out/(package.name+'.sha256')).write_text(hashlib.sha256(package.read_bytes()).hexdigest()+'  '+package.name+'\n')
        print(package)
    print(json.dumps({'bundle':str(bundle),'core_commit':CORE_COMMIT,'binary_sha256':manifest['binary_sha256'],'actual_lean_build':True}))


if __name__=='__main__':
    main()
