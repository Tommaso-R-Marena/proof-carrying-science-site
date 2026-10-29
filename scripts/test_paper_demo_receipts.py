"""Metadata/overwrite refusal tests only, not kernel verification.

The real Lean and package receiving checks run separately. No verifier is mocked.
"""
import copy
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
SITE=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('paper_demo_receipts',SITE/'scripts/run_paper_demos_kernel.py')
demo=importlib.util.module_from_spec(spec)
spec.loader.exec_module(demo)
FIXTURE=json.loads((SITE/'public/paper-demos/penguins-package-receipt.json').read_text())

class ReceiptMetadataTests(unittest.TestCase):
    def receipt(self):return copy.deepcopy(FIXTURE)
    def test_archived_fixture_passes_metadata_only(self):demo.require_package_receipt(self.receipt())
    def test_package_invalid_refuses(self):
        r=self.receipt();r['pcs_package_valid']=False
        with self.assertRaises(ValueError):demo.require_package_receipt(r)
    def test_replay_inconsistent_refuses(self):
        r=self.receipt();r['independent_replay_consistent']=False
        with self.assertRaises(ValueError):demo.require_package_receipt(r)
    def test_missing_or_negative_authority_flag_refuses(self):
        for value in [None,False,'true']:
            with self.subTest(value=value):
                r=self.receipt();r['lean_authority_accepted']=value
                with self.assertRaises(ValueError):demo.require_package_receipt(r)
    def test_integer_boolean_aliases_refuse(self):
        for key in ['pcs_package_valid','independent_replay_consistent','lean_authority_accepted']:
            with self.subTest(key=key):
                r=self.receipt();r[key]=1
                with self.assertRaises(ValueError):demo.require_package_receipt(r)
    def test_scientific_acceptance_stays_exactly_false(self):
        for value in [True,0,None,'false']:
            with self.subTest(value=value):
                r=self.receipt();r['scientific_acceptance']=value
                with self.assertRaises(ValueError):demo.require_package_receipt(r)
    def test_failed_or_missing_domain_checks_refuse(self):
        for value in [None,[],[{'id':'fake','outcome':'FAIL'}]]:
            with self.subTest(value=value):
                r=self.receipt();r['domain_checks']=value
                with self.assertRaises(ValueError):demo.require_package_receipt(r)
    def test_scientific_obligation_must_be_a_typed_open_list(self):
        for value in [None,[],['other'],'population_or_causal_validity']:
            with self.subTest(value=value):
                r=self.receipt();r['open_obligations']=value
                with self.assertRaises(ValueError):demo.require_package_receipt(r)
    def test_goal_identity_mismatch_and_absence_refuse(self):
        for checked,mission in [({},{}),({'goal_sha256':'actual'},{'goal_sha256':'other'})]:
            with self.subTest(checked=checked):
                with self.assertRaises(ValueError):demo.require_goal_identity(checked,mission)
    def test_existing_receipt_is_never_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'receipt.json';path.write_bytes(b'historical evidence')
            with self.assertRaises(FileExistsError):demo.write_json(path,{'changed':True})
            self.assertEqual(path.read_bytes(),b'historical evidence')
    def test_existing_output_directory_refuses_before_any_checker_runs(self):
        with tempfile.TemporaryDirectory() as tmp:
            with patch.object(sys,'argv',['run_paper_demos_kernel.py','--output',tmp]):
                with self.assertRaises(FileExistsError):demo.main()
            self.assertEqual(list(Path(tmp).iterdir()),[])
if __name__=='__main__':unittest.main()
