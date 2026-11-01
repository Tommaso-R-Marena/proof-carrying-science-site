"""Study analysis must keep automated runs separate from human observations."""
import copy
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('analysis', Path(__file__).resolve().parents[1] / 'scripts/analyze_usability_sessions.py')
analysis = importlib.util.module_from_spec(spec)
spec.loader.exec_module(analysis)


def session(kind='automated'):
    return {'format': 'pcs-usability-session-v1', 'session_id': '00000000-0000-4000-8000-000000000001',
            'participant_kind': kind, 'consent': True, 'started_at': 1000,
            'events': [{'event': 'hint-opened', 'elapsed_ms': 10}],
            'answers': [{'task': 'choose-id', 'choice': 1, 'elapsed_ms': 20}],
            'human_origin_verified': False, 'timing_trusted': False}


def attest(s):
    return {'format': 'pcs-usability-observer-attestations-v1', 'sessions': [
        {'session_id': s['session_id'], 'observed_human': True, 'assisted': False}]}


class StudyAnalysisTests(unittest.TestCase):
    def test_automated_never_becomes_human_evidence(self):
        s = session()
        r = analysis.analyze([s])
        self.assertEqual(r['automated_sessions_excluded'], 1)
        self.assertEqual(r['unverified_volunteer_sessions'], 0)
        self.assertEqual(r['observer_attested_human_sessions'], 0)
        self.assertEqual(r['human_identities_verified_by_software'], 0)
        with self.assertRaises(ValueError):
            analysis.analyze([s], attest(s))

    def test_observer_reports_stay_empirical_and_deduplicated(self):
        s = session('unverified-volunteer')
        r = analysis.analyze([s], attest(s))
        self.assertEqual(r['observer_attested_human_sessions'], 1)
        self.assertTrue(r['observer_attestations_are_unverified_empirical_claims'])
        self.assertEqual(r['human_identities_verified_by_software'], 0)
        with self.assertRaises(ValueError):
            analysis.analyze([s, copy.deepcopy(s)])
        claim = attest(s)
        claim['sessions'] *= 2
        with self.assertRaises(ValueError):
            analysis.analyze([s], claim)

    def test_no_extra_private_fields_or_revised_answers(self):
        for key, value in [('filename', 'private.csv'), ('human_origin_verified', True), ('timing_trusted', True), ('consent', False)]:
            s = session()
            s[key] = value
            with self.assertRaises(ValueError):
                analysis.validate(s)
        s = session()
        s['answers'] *= 2
        with self.assertRaises(ValueError):
            analysis.validate(s)
        for event in [{'event': 'private.csv', 'elapsed_ms': 0}, {'event': 'hint-opened', 'elapsed_ms': True}, {'event': 'hint-opened', 'elapsed_ms': 0, 'id': '123'}]:
            s = session()
            s['events'] = [event]
            with self.assertRaises(ValueError):
                analysis.validate(s)

    def test_duplicate_json_and_nonfinite_values_reject(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / 'study.json'
            for text in ['{"a":1,"a":2}', '{"started_at":NaN}', '{"started_at":Infinity}']:
                p.write_text(text)
                with self.assertRaises(ValueError):
                    analysis.load(p)


if __name__ == '__main__':
    unittest.main()
