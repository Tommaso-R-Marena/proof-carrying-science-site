"""Materialize exact Git blobs, without checkout, archive, filters or EOL changes."""
from __future__ import annotations
import hashlib
import io
from pathlib import Path, PurePosixPath
import re
import subprocess


def materialize(repo: Path, commit: str, roots: list[str], destination: Path):
    if (not re.fullmatch(r'[a-f0-9]{40}', commit) or not roots
            or len(set(roots)) != len(roots)
            or any(not re.fullmatch(r'[A-Za-z0-9_-]+', root) for root in roots)):
        raise ValueError('Expected an exact commit and distinct top-level source directories.')
    listing = subprocess.check_output(['git', 'ls-tree', '-rz', '--full-tree', commit, '--', *roots], cwd=repo)
    entries = []
    names = set()
    for record in listing.split(b'\0'):
        if not record:
            continue
        meta, raw_path = record.split(b'\t', 1)
        mode, kind, oid = meta.decode('ascii').split(' ')
        name = raw_path.decode('utf-8')
        path = PurePosixPath(name)
        if (mode not in {'100644', '100755'} or kind != 'blob'
                or not re.fullmatch(r'[a-f0-9]{40}', oid)
                or len(path.parts) < 2 or path.is_absolute() or '..' in path.parts or '\\' in name or ':' in name
                or any(ord(c) < 32 for c in name) or path.parts[0] not in roots
                or name != path.as_posix() or any(part.endswith(('.', ' ')) for part in path.parts)
                or any(part.split('.')[0].upper() in {'CON','PRN','AUX','NUL',*(f'COM{i}' for i in range(1,10)),*(f'LPT{i}' for i in range(1,10))} for part in path.parts)
                or name.casefold() in names):
            raise ValueError('Unsupported Git source entry.')
        names.add(name.casefold())
        entries.append((mode, oid, path))
    if not entries or {path.parts[0] for _, _, path in entries} != set(roots):
        raise ValueError('A requested source directory is missing or empty.')
    # --batch accepts object IDs, never source paths or command text. Unlike
    # archive/checkout, plain cat-file returns the committed blob bytes without
    # applying core.autocrlf, eol, export-subst or working-tree filters.
    data = subprocess.check_output(['git', 'cat-file', '--batch'], cwd=repo,
                                   input=('\n'.join(oid for _, oid, _ in entries)+'\n').encode('ascii'))
    stream = io.BytesIO(data)
    destination.mkdir(parents=True, exist_ok=False)
    hashes = {}
    for mode, oid, path in entries:
        header = stream.readline().decode('ascii').strip().split(' ')
        if len(header) != 3 or header[:2] != [oid, 'blob'] or not header[2].isdigit():
            raise ValueError('Unexpected Git object response.')
        size = int(header[2])
        raw = stream.read(size)
        if (len(raw) != size or stream.read(1) != b'\n'
                or hashlib.sha1(b'blob '+str(size).encode()+b'\0'+raw).hexdigest() != oid):
            raise ValueError('Git object bytes do not match their recorded identity.')
        target = destination.joinpath(*path.parts)
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(raw)
        target.chmod(0o755 if mode == '100755' else 0o644)
        hashes[path.as_posix()] = hashlib.sha256(raw).hexdigest()
    if stream.read(1):
        raise ValueError('Unexpected trailing Git object data.')
    return hashes
