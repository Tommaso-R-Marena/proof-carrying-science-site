"""Capture a user-chosen replay once. Imports never authorize a result."""
from pathlib import Path
from file_check import strict_json,canonical

def capture_handoff(path):
    if path is None:return None
    with Path(path).open('rb') as stream:raw=stream.read(9_000_001)
    if len(raw)>9_000_000 or not raw.endswith(b'\n'):raise ValueError('Choose a canonical PCS replay up to 9 MB.')
    value=strict_json(raw[:-1])
    if type(value) is not dict or value.get('format') not in {'pcs-change-replay-v2','pcs-model-evaluation-replay-v1'}:raise ValueError('Open a PCS change-review or model-evaluation replay. No program or proof source can be imported.')
    # The appropriate trusted frontend independently validates the full schema,
    # input digests, columns and recorded counts before any fresh check.
    return raw
