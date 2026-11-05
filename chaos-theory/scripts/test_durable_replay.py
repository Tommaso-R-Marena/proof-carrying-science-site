"""Independent negative controls using a saved journal produced by actual Lean checks."""
import shutil
import tempfile
import unittest
from pathlib import Path
from replay_durable_journal import canonical, digest, read, verify

FIXTURE = Path(__file__).resolve().parents[1] / 'evidence/durable-recovery-v1'


class DurableReplayTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / 'journal'
        shutil.copytree(FIXTURE / 'temporal', self.path)
        self.anchor = read(FIXTURE / 'temporal-checkpoint.json')

    def rewrite(self, name, mutate):
        p = self.path / name
        v = read(p)
        mutate(v)
        v.pop('digest', None)
        v['digest'] = digest(v)
        p.write_bytes(canonical(v) + b'\n')

    def test_genuine_receipts_and_temporal_order(self):
        self.assertEqual(verify(self.path, self.anchor)['commits'], 3)
        s = read(self.path / 'commit-3.json')['snapshot']
        self.assertEqual([t['executed'] for t in s['result']['trace']], [False, True, True])

    def test_retained_checkpoint_detects_truncation(self):
        (self.path / 'commit-3.json').unlink()
        with self.assertRaises(AssertionError): verify(self.path, self.anchor)

    def test_rehashed_false_state(self):
        self.rewrite('commit-3.json', lambda v: v['snapshot']['result']['state']['repairedEquipment'].clear())
        with self.assertRaises(AssertionError): verify(self.path, self.anchor)

    def test_rehashed_equivalent_text_changes_identity(self):
        self.rewrite('commit-3.json', lambda v: v.update(content=' ' + v['content']))
        with self.assertRaises(AssertionError): verify(self.path, self.anchor)

    def test_initial_boolean_generation_is_not_zero(self):
        self.rewrite('session.json', lambda v: v['initial'].update(generation=False))
        with self.assertRaises(AssertionError): verify(self.path, self.anchor)

    def test_duplicate_and_noncanonical_bytes(self):
        p = self.path / 'session.json'
        original = p.read_bytes()
        for data in [original.replace(b'{', b'{"format":"lean-recovery-journal-v1",', 1), original + b' ', b'\xff']:
            p.write_bytes(data)
            with self.assertRaises((ValueError, UnicodeError)): read(p)

    def test_checkpoint_substitution_and_boolean_generation(self):
        for changes in [{'generation': True}, {'recordDigest': '0' * 64}, {'sessionId': 'other'}]:
            with self.assertRaises(AssertionError): verify(self.path, {**self.anchor, **changes})

    def test_utf16_key_sorting_matches_javascript_profile(self):
        v = {'\ue000': 'bmp', '\U00010000': 'astral'}
        self.assertEqual(canonical(v), '{"\U00010000":"astral","\ue000":"bmp"}'.encode())


if __name__ == '__main__': unittest.main()
