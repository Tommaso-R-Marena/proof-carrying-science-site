"""Independent negative controls on genuine native-generated file artifacts; no model/Lean verdicts mocked."""
import json
import shutil
import tempfile
import unittest
from pathlib import Path
from oracle import canonical, csv, digest, plan, read, replay, verify_workspace
from protocol import corpus, first_request, next_request, status, publication_safety

FIXTURE = Path(__file__).resolve().parents[2] / 'evidence/general-file-gate-v1'

class FileOracleTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)/'files'; shutil.copytree(FIXTURE/'native-fixture', self.root)
        self.anchor = read(FIXTURE/'native-fixture-checkpoint.json')

    def test_real_native_fixture_and_protected_cells(self):
        v = verify_workspace(self.root, self.anchor)
        self.assertEqual(v['outcome']['files'][0]['bytes'], 'id,value\nx,42\nkeep,9\n')
        self.assertEqual(v['outcome']['files'][1]['bytes'], 'id,value\ny,5\n')
        self.assertEqual(v['outcome']['executed'], [False, False, True, True])
        self.assertIs(v['nativeLeanExecuted'], False)

    def test_actual_csv_substitution_is_detected(self):
        r = read(self.root/'commit-2.json')
        (self.root/'snapshots'/r['snapshotHash']/'file-0.csv').write_bytes(b'id,value\nx,8\nkeep,9\n')
        with self.assertRaises(AssertionError): verify_workspace(self.root,self.anchor)

    def test_rehashed_false_state_cannot_replace_native_result(self):
        p = self.root/'commit-2.json';v = read(p);v['outcome']['files'][0]['bytes']='id,value\nx,8\nkeep,9\n';v.pop('digest');v['digest']=digest(v);p.write_bytes(canonical(v)+b'\n')
        with self.assertRaises(AssertionError):verify_workspace(self.root,self.anchor)

    def test_rollback_gap_and_boolean_checkpoint(self):
        with self.assertRaises(AssertionError):verify_workspace(self.root,{**self.anchor,'generation':True})
        (self.root/'commit-2.json').unlink()
        with self.assertRaises(AssertionError):verify_workspace(self.root,self.anchor)

    def test_strict_plan_and_csv_profiles(self):
        for text in ['{"actions":[],"actions":[]}', '{"actions":[{"tool":"x","args":{"v":-0}}]}', '{"actions":[{"tool":"x","args":{"v":"\\ud800"}}]}']:
            with self.assertRaises((ValueError,UnicodeError)):plan(text)
        for text in ['id,value\nx,01\n','id,value\nx,-1\n','id,value\nx,1\nx,2\n','id,value\r\nx,1\r\n']:
            with self.assertRaises(ValueError):csv(text)

    def test_safe_wrong_answer_is_distinct_from_task_success(self):
        c = corpus()[0];g = c['goal'];text=json.dumps({'actions':[{'tool':'inspect_file','args':{'fileId':g['fileId']}},{'tool':'set_value','args':{'fileId':g['fileId'],'rowId':g['rowId'],'value':'8'}}]})
        outcome=replay(c['spec'],[text],True)
        self.assertEqual(outcome['executed'],[True,True]);self.assertEqual(status(c,outcome)['logicalPolicyViolations'],0);self.assertFalse(status(c,outcome)['taskCompleted'])

    def test_persistent_notice_and_actual_context_are_preserved(self):
        c=corpus()[8];q=first_request(c,'attack');raw='{"actions":[]}'
        r=next_request(q,raw,None)
        self.assertEqual(r['messages'][:2],q['messages']);self.assertEqual(r['messages'][2],{'role':'assistant','content':raw})
        self.assertIn(c['notices']['attack'],r['messages'][1]['content']);self.assertEqual(len([m for m in r['messages'] if m['role']=='system']),1)

    def test_frozen_split_contains_new_unit_families_and_legal_goals(self):
        cases=corpus();self.assertEqual(len(cases),24)
        dev={(c['unitFrom'],c['unitTo']) for c in cases if c['split']=='development'}
        held={(c['unitFrom'],c['unitTo']) for c in cases if c['split']=='held-out'}
        self.assertFalse(dev&held);self.assertEqual(sum(c['split']=='development' for c in cases),8)
        for c in cases:self.assertLessEqual(c['goal']['value'],c['spec']['policy']['maximum'])

    def test_logical_violations_are_not_mislabeled_as_published_data_changes(self):
        c=corpus()[0];f=c['spec']['files'][0]['id'];r=csv(c['spec']['files'][0]['bytes'])[1][0]
        actions=[{'tool':'set_value','args':{'fileId':f,'rowId':r,'value':v}} for v in ['0','42']]
        outcome=replay(c['spec'],[json.dumps({'actions':actions})],False)
        self.assertEqual(status(c,outcome)['logicalPolicyViolations'],2)
        self.assertFalse(publication_safety(c,c['spec']['files'],outcome['files'])['unsafePublishedVersion'])
        first=replay(c['spec'],[json.dumps({'actions':actions[:1]})],False)
        self.assertTrue(publication_safety(c,c['spec']['files'],first['files'])['unsafePublishedVersion'])
        self.assertEqual(publication_safety(c,first['files'],outcome['files'])['protectedCellChanges'],1)

if __name__=='__main__':unittest.main()
