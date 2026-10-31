"""Bounded independent CSV reader and pinned native Lean transport.

This is a scoped local tool, not the PCS production scientific authority.
No requester can select a checker program or supply a verification verdict.
"""
from __future__ import annotations
import base64
import binascii
import csv
import hashlib
import hmac
import io
import json
import re
from pathlib import Path
import subprocess
import tempfile

SCOPE = 'exact-utf8-id-overlap-v1'
MAX_BYTES = 2_097_152
MAX_ROWS = 5000
MAX_COLUMNS = 128
csv.field_size_limit(MAX_BYTES)
CORE_COMMIT = 'f20f3cab2938f2e085f137185e88f4700d5da2ed'


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False).encode('utf-8')


def sha(raw):
    return hashlib.sha256(raw).hexdigest()


def strict_json(raw):
    def unique(pairs):
        d = {}
        for k, v in pairs:
            if k in d:
                raise ValueError('Duplicate JSON fields are not supported.')
            d[k] = v
        return d
    value = json.loads(raw, object_pairs_hook=unique, parse_constant=lambda _: (_ for _ in ()).throw(ValueError('Nonfinite JSON number.')))
    if canonical(value) != raw:
        raise ValueError('The request is not canonical JSON.')
    return value


def parse_csv(raw):
    if not isinstance(raw, bytes) or not 0 < len(raw) <= MAX_BYTES:
        raise ValueError('Choose a nonempty CSV file smaller than 2 MB.')
    text = raw.decode('utf-8-sig', errors='strict')
    if '\0' in text:
        raise ValueError('NUL characters are not supported.')
    # Validate RFC-style quote boundaries independently of csv.reader, which
    # otherwise accepts quotes inside an unquoted field and bare CR records.
    quoted = closed = content = False
    i = 0
    while i < len(text):
        c = text[i]
        if quoted:
            if c == '\r' and (i+1 == len(text) or text[i+1] != '\n'):
                raise ValueError('Use LF or CRLF line endings.')
            if c == '"':
                if i+1 < len(text) and text[i+1] == '"':
                    i += 2
                    continue
                quoted, closed = False, True
        elif c == '"':
            if content or closed:
                raise ValueError('Unexpected quote in CSV field.')
            quoted, content = True, True
        elif c in ',\n\r':
            if c == '\r':
                if i+1 == len(text) or text[i+1] != '\n':
                    raise ValueError('Use LF or CRLF line endings.')
                i += 1
            content = closed = False
        elif closed:
            raise ValueError('Unexpected text after a closing quote.')
        else:
            content = True
        i += 1
    if quoted:
        raise ValueError('Unclosed quoted field.')
    reader = csv.reader(io.StringIO(text, newline=''), strict=True)
    header = next(reader, None)
    if not header or len(header) > MAX_COLUMNS or any(not x.strip(' \t\r\n\v\f') or len(x.encode('utf-8')) > 1024 for x in header) or len(set(header)) != len(header):
        raise ValueError('Column headings must be nonempty and unique; use at most 128 columns.')
    rows, lines = [], []
    start = reader.line_num + 1
    for row in reader:
        if not row:
            raise ValueError(f'Blank data line {start}; export a rectangular table.')
        if len(row) != len(header):
            raise ValueError(f'Line {start} has a different number of fields from the heading.')
        rows.append(row)
        lines.append(start)
        start = reader.line_num + 1
        if len(rows) > MAX_ROWS:
            raise ValueError('This version supports up to 5,000 data rows per file.')
    if not rows:
        raise ValueError('This file has headings but no data rows.')
    return {'header': header, 'rows': rows, 'lines': lines}


def ids_for(table, column):
    if type(column) is not int or not 0 <= column < len(table['header']):
        raise ValueError('Choose a valid ID column in each file.')
    ids, spaced = {}, 0
    for row, line in zip(table['rows'], table['lines']):
        value = row[column]
        if not value.strip(' \t\r\n\v\f'):
            raise ValueError(f'The ID on line {line} is blank.')
        if len(value.encode('utf-8')) > 256:
            raise ValueError(f'The ID on line {line} exceeds 256 UTF-8 bytes.')
        ids.setdefault(value, []).append(line)
        spaced += value != value.strip(' \t\r\n\v\f')
    return ids, spaced


def analyze(left, right, columns):
    if type(columns) is not list or len(columns) != 2:
        raise ValueError('Choose exactly two ID columns.')
    a, spaced_a = ids_for(left, columns[0])
    b, spaced_b = ids_for(right, columns[1])
    shared = [{'id': k, 'left': a[k], 'right': b[k]} for k in sorted(a.keys() & b.keys(), key=lambda x: x.encode('utf-8'))]
    return {'scope': SCOPE, 'disjoint': not shared, 'shared': shared, 'summary': {
        'left_rows': len(left['rows']), 'right_rows': len(right['rows']),
        'left_unique': len(a), 'right_unique': len(b),
        'left_repeated_rows': len(left['rows'])-len(a), 'right_repeated_rows': len(right['rows'])-len(b),
        'shared_ids': len(shared), 'left_affected_rows': sum(len(x['left']) for x in shared),
        'right_affected_rows': sum(len(x['right']) for x in shared),
        'left_spaced_ids': spaced_a, 'right_spaced_ids': spaced_b}}


def extracted_csv(table, column):
    ids_for(table, column)
    # Injective UTF-8-to-lowercase-hex mapping prevents CSV quoting ambiguities.
    # The native checker receives and parses these exact derived CSV bytes.
    return ('id\n'+'\n'.join(r[column].encode('utf-8').hex() for r in table['rows'])+'\n').encode('ascii')


class LocalChecker:
    def __init__(self, assets: Path):
        self.assets = assets.resolve()
        raw = (self.assets/'checker-manifest.json').read_bytes()
        self.manifest = json.loads(raw)
        name = self.manifest.get('binary')
        if name not in {'pcs-files-checker', 'pcs-files-checker.exe'}:
            raise ValueError('The bundled checker manifest is invalid.')
        self.binary = self.assets/name
        if self.manifest.get('format') != 'pcs-files-checker-build-v1' or self.manifest.get('core_commit') != CORE_COMMIT:
            raise ValueError('The bundled checker has an unsupported source identity.')
        self.check_pin()

    def check_pin(self):
        if self.binary.is_symlink() or not self.binary.is_file() or sha(self.binary.read_bytes()) != self.manifest.get('binary_sha256'):
            raise ValueError('The bundled checker is missing or changed. Download a fresh app.')
        for name, digest in self.manifest.get('dependent_files_sha256', {}).items():
            path = self.assets/name
            if Path(name).name != name or not name.endswith('.dll') or path.is_symlink() or sha(path.read_bytes()) != digest:
                raise ValueError('A bundled checker dependency is missing or changed.')

    def verify(self, request):
        if type(request) is not dict or set(request) != {'files', 'columns'} or type(request['files']) is not list or len(request['files']) != 2:
            raise ValueError('The local checker accepts exactly two file snapshots and two ID columns.')
        tables, identities, extracted = [], [], []
        for item in request['files']:
            if type(item) is not dict or set(item) != {'name', 'data_base64', 'sha256'} or not isinstance(item['name'], str) or len(item['name']) > 255 or not isinstance(item['data_base64'], str) or len(item['data_base64']) > ((MAX_BYTES+2)//3)*4:
                raise ValueError('Malformed file snapshot.')
            try:
                raw = base64.b64decode(item['data_base64'], validate=True)
            except (binascii.Error, ValueError) as exc:
                raise ValueError('Malformed embedded file data.') from exc
            if base64.b64encode(raw).decode('ascii') != item['data_base64']:
                raise ValueError('Noncanonical embedded file data.')
            digest = sha(raw)
            if type(item['sha256']) is not str or not re.fullmatch('[a-f0-9]{64}', item['sha256']) or not hmac.compare_digest(digest, item['sha256']):
                raise ValueError('A file changed before checking. Choose it again.')
            tables.append(parse_csv(raw))
            identities.append(digest)
        result = analyze(*tables, request['columns'])
        for t, c in zip(tables, request['columns']):
            extracted.append(extracted_csv(t, c))
        self.check_pin()
        with tempfile.TemporaryDirectory(prefix='pcs-file-check-') as temporary:
            folder = Path(temporary)
            paths = [folder/'left.csv', folder/'right.csv']
            for path, raw in zip(paths, extracted):
                path.write_bytes(raw)
            try:
                done = subprocess.run([str(self.binary), *(str(x) for x in paths)], cwd=folder,
                                      stdin=subprocess.DEVNULL, capture_output=True, timeout=30, check=False)
            except (OSError, subprocess.TimeoutExpired) as exc:
                raise ValueError('The local Lean checker did not complete. No confirmation was recorded.') from exc
            for path, raw in zip(paths, extracted):
                if path.read_bytes() != raw:
                    raise ValueError('The extracted ID bytes changed during checking.')
        self.check_pin()
        expected = b'DISJOINT\n' if result['disjoint'] else b'OVERLAP\n'
        if done.returncode != 0 or done.stderr or done.stdout != expected:
            raise ValueError('The Lean result did not match the independent CSV calculation. No confirmation was recorded.')
        return {'format': 'pcs-file-check-local-receipt-v1', 'scope': SCOPE,
                'authority': 'local-lean-derived-id-lists', 'input_sha256': identities,
                'columns': request['columns'], 'summary': result['summary'],
                'extracted_sha256': [sha(x) for x in extracted],
                'lean_verdict': expected.decode().strip(), 'checker_sha256': self.manifest['binary_sha256'],
                'core_commit': CORE_COMMIT, 'scientific_acceptance': False,
                'host_refinement_proved': False, 'signed_receipt': False}
