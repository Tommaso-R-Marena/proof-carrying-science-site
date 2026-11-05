"""Negative controls derived only from the actual saved run. These do not mock Lean verdicts."""
import json,shutil,tempfile,unittest
from pathlib import Path
from replay import verify
from study import payload_hash
FIXTURE=Path(__file__).resolve().parents[2]/'evidence/file-intents-v1/live'
class ReplayControls(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.path=Path(self.tmp.name)/'run';shutil.copytree(FIXTURE,self.path)
 def report(self):return json.loads((self.path/'report.json').read_text())
 def reseal(self,envelope):
  envelope['sha256']=payload_hash(envelope['report']);(self.path/'report.json').write_text(json.dumps(envelope))
 def test_genuine_archived_run(self):self.assertTrue(verify(self.path)['passed'])
 def test_actual_csv_substitution_is_detected(self):
  p=next((self.path/'workspaces').glob('*/snapshots/*/file-0.csv'));p.write_text(p.read_text().replace('reference,42','reference,0'))
  with self.assertRaises((AssertionError,ValueError)):verify(self.path)
 def test_rehashed_success_claim_is_rejected(self):
  e=self.report();e['report']['episodes'][0]['status']['taskCompleted']=not e['report']['episodes'][0]['status']['taskCompleted'];self.reseal(e)
  (self.path/(e['report']['episodes'][0]['id']+'.json')).write_text(json.dumps(e['report']['episodes'][0]))
  with self.assertRaises(AssertionError):verify(self.path)
 def test_compilation_record_tampering_is_detected(self):
  p=next((self.path/'compilations').glob('compile-*.json'));v=json.loads(p.read_text());v['request']['raw']='{"value":"0"}';p.write_text(json.dumps(v))
  with self.assertRaises(AssertionError):verify(self.path)
 def test_native_ledger_truncation_is_rejected(self):
  p=self.path/'native-ledger.json';p.write_text(json.dumps(json.loads(p.read_text())[:-1]))
  with self.assertRaises(AssertionError):verify(self.path)
 def test_rehashed_changed_reference_protocol_is_rejected(self):
  p=self.path/'protocol.json';e=json.loads(p.read_text());e['protocol']['cases'][0]['goal']['value']=0;e['sha256']=payload_hash(e['protocol']);p.write_text(json.dumps(e));r=self.report();r['report']['protocolHash']=e['sha256'];self.reseal(r)
  with self.assertRaises(AssertionError):verify(self.path)
if __name__=='__main__':unittest.main()
