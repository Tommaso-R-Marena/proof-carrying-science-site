#!/usr/bin/env python3
"""Install a SHA-256-pinned official Lean release for the packaging matrix."""
import hashlib,json,os,platform,stat,sys,urllib.request,zipfile
from pathlib import Path

DIGESTS={
 'linux-x64':('linux','b02b74bb23e93e5b05f03f51ad06274814337d107718a02b6f89dc4db1387416'),
 'windows-x64':('windows','faa0a8213ec81035d1ff3745d6d28e55b9d80de63fb9cd33380cd51b23cfc1aa'),
 'macos-x64':('darwin','47010e6040ab2441dc96c1d9a3aca1721576fdbe4da566d938b29a26502fd378'),
 'macos-arm64':('darwin_aarch64','d63a34d12978b035f871c8448d7243eb16711b8f5b27d7e9b093a210c1117e8d')}


def main():
    os_name={'linux':'linux','darwin':'macos','win32':'windows'}[sys.platform]
    arch='arm64' if platform.machine().lower() in {'arm64','aarch64'} else 'x64'
    flavor,digest=DIGESTS[os_name+'-'+arch]
    dest=Path(os.environ.get('RUNNER_TEMP','/tmp'))/'pcs-file-checker-toolchain'
    dest.mkdir(parents=True,exist_ok=False)
    archive=dest/'lean.zip'
    url=f'https://github.com/leanprover/lean4/releases/download/v4.28.0/lean-4.28.0-{flavor}.zip'
    h=hashlib.sha256()
    with urllib.request.urlopen(url,timeout=120) as r,archive.open('wb') as f:
        while chunk:=r.read(1024*1024):h.update(chunk);f.write(chunk)
    if h.hexdigest()!=digest:raise ValueError('Official Lean release digest differs.')
    with zipfile.ZipFile(archive) as z:
        for item in z.infolist():
            target=(dest/item.filename).resolve()
            if not target.is_relative_to(dest):raise ValueError('Unsafe SDK archive path.')
            mode=item.external_attr>>16
            if item.is_dir():target.mkdir(parents=True,exist_ok=True);continue
            target.parent.mkdir(parents=True,exist_ok=True)
            if stat.S_ISLNK(mode):
                link=z.read(item).decode()
                if not (target.parent/link).resolve().is_relative_to(dest):raise ValueError('Unsafe SDK symlink.')
                target.symlink_to(link)
            else:
                target.write_bytes(z.read(item))
                if sys.platform!='win32' and mode:target.chmod(mode&0o777)
    archive.unlink()
    bin_dir=dest/f'lean-4.28.0-{flavor}'/'bin'
    with open(os.environ['GITHUB_PATH'],'a',encoding='utf-8') as f:f.write(str(bin_dir)+'\n')
    print(json.dumps({'platform':os_name+'-'+arch,'official_release_sha256':digest,'bin':str(bin_dir)}))


if __name__=='__main__':main()
