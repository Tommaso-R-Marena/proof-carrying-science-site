"""Recorded byte provenance survives checkout newline conversion."""
import importlib.util,hashlib,json,subprocess,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('evaluation_example',ROOT/'scripts/export_model_evaluation_example.py')
example=importlib.util.module_from_spec(spec);spec.loader.exec_module(example)
class ExampleTests(unittest.TestCase):
    def test_historical_git_blob_not_mutable_checkout_defines_recorded_identity(self):
        name='research/proof-search-prospective-v1/run-1/summary.json'
        raw=subprocess.check_output(['git','cat-file','blob','HEAD:'+name],cwd=ROOT)
        expected=example.example()
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp);source=root/name;source.parent.mkdir(parents=True);source.write_bytes(raw)
            def git(*args):return subprocess.run(['git',*args],cwd=root,capture_output=True,check=True)
            git('init');git('config','user.name','PCS test fixture');git('config','user.email','test@example.invalid');git('config','core.autocrlf','false');git('add',name);git('commit','-m','Frozen test source')
            source.write_bytes(raw.replace(b'\n',b'\r\n'))
            self.assertNotEqual(hashlib.sha256(source.read_bytes()).digest(),hashlib.sha256(raw).digest())
            with patch.object(example,'ROOT',root):actual=example.example()
            self.assertEqual(actual,expected)
            meta=json.loads(actual['evaluation-example.json']);self.assertEqual(meta['source_sha256'],hashlib.sha256(raw).hexdigest());self.assertFalse(meta['new_inference_executed'])
if __name__=='__main__':unittest.main()
