#!/usr/bin/env python3
"""Fail closed before deployment if advertised desktop downloads are unavailable.

This checks public GitHub release metadata, not signatures, Lean verdicts or
archive contents. The separate release publisher qualifies all four archives.
"""
import json
from pathlib import Path
import re
import urllib.error
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
REPO = 'Tommaso-R-Marena/proof-carrying-science-site'


def validate_release(release, version):
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version):
        raise ValueError('Invalid desktop release version.')
    tag = 'pcs-files-v' + version
    if (type(release) is not dict or release.get('tag_name') != tag
            or release.get('draft') is not False or release.get('prerelease') is not False
            or not release.get('published_at') or type(release.get('assets')) is not list):
        raise ValueError('The advertised desktop release is not publicly published.')
    names = set()
    expected = {f'PCS-File-Checker-{platform}.zip{suffix}'
                for platform in ['linux-x64', 'windows-x64', 'macos-arm64', 'macos-x64']
                for suffix in ['', '.sha256']}
    for asset in release['assets']:
        if type(asset) is not dict or type(asset.get('name')) is not str or asset['name'] in names:
            raise ValueError('Ambiguous desktop release assets.')
        name = asset['name']
        names.add(name)
        if name in expected and (asset.get('state') != 'uploaded'
                or type(asset.get('size')) is not int or asset['size'] <= 0
                or asset.get('browser_download_url') != f'https://github.com/{REPO}/releases/download/{tag}/{name}'):
            raise ValueError('A desktop release download is incomplete or has an unexpected location.')
    if not expected <= names:
        raise ValueError('All four desktop ZIPs and their checksum files must be published before website deployment.')
    return {'format': 'pcs-desktop-download-availability-v1', 'tag': tag,
            'required_downloads': len(expected), 'public_metadata_complete': True,
            'archive_contents_or_signatures_verified_by_this_check': False}


def advertised_version():
    version = (ROOT / 'desktop/VERSION').read_text(encoding='ascii').strip()
    if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version):
        raise ValueError('Invalid desktop release version.')
    for name in ['check-my-files.html', 'review-changes.html']:
        text = (ROOT / 'public' / name).read_text(encoding='utf-8')
        versions = set(re.findall(r'/releases/(?:download|tag)/pcs-files-v([^/\"<>]+)', text))
        if versions != {version}:
            raise ValueError('Advertised app links do not match desktop/VERSION.')
    return version


def main():
    version = advertised_version()
    request = urllib.request.Request(f'https://api.github.com/repos/{REPO}/releases/tags/pcs-files-v{version}',
                                     headers={'User-Agent': 'PCS-Desktop-Release-Availability/1.0', 'Accept': 'application/vnd.github+json'})
    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            raw = response.read(1_000_001)
            if len(raw) > 1_000_000:
                raise ValueError('Unexpected release metadata size.')
            result = validate_release(json.loads(raw), version)
    except (ValueError, OSError, urllib.error.URLError) as exc:
        raise SystemExit('Website deployment held: advertised desktop downloads are not ready. '
                         'Publish the qualified release first, then retry the same source. ' + str(exc)) from None
    print(json.dumps(result))


if __name__ == '__main__':
    main()
