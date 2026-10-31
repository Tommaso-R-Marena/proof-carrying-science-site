#!/usr/bin/env python3
"""Build the portable local app against exact committed PCS sources.

The generated bundle contains no Python/Lake/Lean installation requirement.
OS code signing is not supplied. SHA-256 manifests identify bytes, not an author.
"""
from __future__ import annotations
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
import platform
import shutil
import subprocess
import sys
import tarfile
import zipfile

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT/'desktop'))
from file_check import CORE_COMMIT, SCOPE, canonical


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
    # Copy from immutable Git objects, excluding caches, working-tree files and
    # untracked module substitutions. The core repository is never rewritten.
    archive = subprocess.check_output(['git','archive',CORE_COMMIT,'formal'],cwd=args.core)
    snapshot = out/'core'
    snapshot.mkdir()
    with tarfile.open(fileobj=io.BytesIO(archive)) as t:
        if any(not (m.name == 'formal' or m.name.startswith('formal/')) or not (m.isfile() or m.isdir()) for m in t.getmembers()):
            raise ValueError('Unexpected core archive member.')
        t.extractall(snapshot,filter='data')
    frontend = out/'frontend'
    frontend.mkdir()
    for name in ['Main.lean','Audit.lean']:
        shutil.copy2(ROOT/'desktop/lean'/name,frontend/name)
    (frontend/'lean-toolchain').write_text('leanprover/lean4:v4.28.0\n')
    (frontend/'lakefile.toml').write_text('name = "PCSFiles"\nversion = "1.0.0"\n\n[[require]]\nname = "PCS"\npath = "../core/formal"\n\n[[lean_exe]]\nname = "pcs-files-checker"\nroot = "Main"\n')
    run(['lake','build','pcs-files-checker'],cwd=frontend)
    audit = subprocess.check_output(['lake','env','lean','Audit.lean'],cwd=frontend,text=True)
    if any(x in audit for x in ['sorryAx','Lean.ofReduceBool','Lean.trustCompiler']):
        raise ValueError('Unexpected axiom in checker audit.')
    names = ['parseCsv_sound','parseCsv_complete','csvTable_unique','csvDisjointB_iff','csvRun_sound']
    if not all(('PCS.V2.Csv.'+n) in audit for n in names):
        raise ValueError('Incomplete checker theorem audit.')
    (out/'axioms.log').write_text(audit)
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
    public = ['check-my-files.html','file-check.css','file-check.mjs','file-check-core.mjs','file-check-local.mjs','logo-mark.svg']
    for name in public:
        shutil.copy2(ROOT/'public'/name,bundle/'public'/name)
    manifest = {'format':'pcs-files-checker-build-v1','version':'1.0.0','scope':SCOPE,
                'core_commit':CORE_COMMIT,'site_commit':site_commit,'development_build':args.development,
                'lean_toolchain':'leanprover/lean4:v4.28.0','binary':binary,
                'binary_sha256':hashlib.sha256((bundle/binary).read_bytes()).hexdigest(),
                'dependent_files_sha256':dependencies,
                'source_sha256':{str(p.relative_to(ROOT)):hashlib.sha256(p.read_bytes()).hexdigest() for p in
                    [ROOT/'desktop/app.py',ROOT/'desktop/file_check.py',ROOT/'desktop/lean/Main.lean',*(ROOT/'public'/x for x in public)]},
                'theorems':['PCS.V2.Csv.'+n for n in names],'code_signed':False,
                'host_refinement_proved':False,'production_scientific_authority':False}
    (bundle/'checker-manifest.json').write_bytes(canonical(manifest))
    (out/'BUILD.json').write_text(json.dumps(manifest,indent=2)+'\n')
    if args.package:
        app_name = 'PCS File Checker'
        run([sys.executable,'-m','PyInstaller','--clean','--noconfirm','--onefile','--name',app_name,
             '--paths',ROOT/'desktop','--distpath',out/'dist','--workpath',out/'pyinstaller','--specpath',out,
             '--add-data',str(bundle)+os.pathsep+'.',ROOT/'desktop/app.py'],cwd=ROOT)
        executable = out/'dist'/(app_name+('.exe' if sys.platform=='win32' else ''))
        clean_env = dict(os.environ)
        for key in ['PYTHONPATH','LD_LIBRARY_PATH','DYLD_LIBRARY_PATH']:
            clean_env.pop(key,None)
        clean_env['PATH'] = (str(Path(os.environ['SystemRoot'])/'System32')+os.pathsep+os.environ['SystemRoot']) if sys.platform=='win32' else '/usr/bin:/bin:/usr/sbin:/sbin'
        run([executable,'--self-test'],cwd=out,env=clean_env)
        os_name = {'win32':'windows','darwin':'macos','linux':'linux'}[sys.platform]
        arch = 'arm64' if platform.machine().lower() in {'arm64','aarch64'} else 'x64'
        package = out/f'PCS-File-Checker-{os_name}-{arch}.zip'
        readme = ('PCS File Checker 1.0.0\n\nExtract this folder, then open PCS File Checker. '
                  'It opens a private local page in your browser. No terminal commands or Python/Lean installation are needed. '
                  'Keep the app window open while checking; close it to stop the local server.\n\n'
                  'The app is not code-signed. Your operating system may request confirmation. '
                  'Do not disable operating-system security protections. Source and byte checksums are on the GitHub release page.\n\n'
                  'CSV files stay on your device. Replay downloads contain file contents only if you explicitly include them. '
                  'The Lean checker checks derived selected ID lists; CSV parsing, compilation and host execution remain implementation assumptions. '
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
