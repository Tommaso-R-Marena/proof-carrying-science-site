import copy,hashlib,importlib.util,json,subprocess,tempfile,unittest,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
def module(name):
 spec=importlib.util.spec_from_file_location(name,ROOT/'scripts'/(name+'.py'));m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m);return m
pilot=module('analyze_proof_workbench_pilot');sync=module('propose_core_sync');replay=module('replay_proof_workbench')
def session(kind='automated'):
 return {'format':'pcs-proof-workbench-pilot-v1','session_id':'00000000-0000-4000-8000-000000000001','participant_kind':kind,'experience':'none','adult_consent':True,'consent':True,'started_at':1000,'events':[{'event':'recorded-result-opened','case_id':'reuse','elapsed_ms':500}],'answers':[{'task':'meaning','choice':0,'elapsed_ms':800}],'completion':'completed','human_origin_verified':False,'timing_trusted':False}
class PilotTests(unittest.TestCase):
 def test_automation_does_not_become_human_evidence(self):
  r=pilot.analyze([session()]);self.assertEqual(r['automated_sessions_excluded_from_human_metrics'],1);self.assertIsNone(r['observer_reported_completion_rate']);self.assertEqual(r['human_identities_verified_by_software'],0)
  observer={'format':'pcs-proof-workbench-observer-v1','sessions':[{'session_id':session()['session_id'],'observed_human':True,'observed_beginner':True,'assisted':False,'completed':True,'elapsed_seconds':300}]}
  with self.assertRaises(ValueError):pilot.analyze([session()],observer)
  r=pilot.analyze([session('unverified-volunteer')],observer);self.assertEqual(r['observer_reported_human_sessions'],1);self.assertTrue(r['observer_claims_are_unverified_empirical_evidence'])
 def test_malformed_consent_duplicates_and_private_fields_rejected(self):
  for k,v in [('human_origin_verified',True),('consent',False),('email','private@example.test')]:
   s=session();s[k]=v
   with self.assertRaises(ValueError):pilot.validate(s)
  with self.assertRaises(ValueError):pilot.analyze([session(),session()])
  s=session();s['answers'][0]['choice']=True
  with self.assertRaises(ValueError):pilot.validate(s)
class EnvelopeTests(unittest.TestCase):
 def test_actual_recorded_proof_and_serialization_boundary(self):
  raw=(ROOT/'public/proof-workbench-example.json').read_bytes();r=replay.envelope(raw);self.assertEqual(r['outcome'],'proved');self.assertFalse(r['physical_neural_execution_independently_attested'])
  bad=json.loads(raw);bad['outcome']='refuted'
  with self.assertRaises(ValueError):replay.envelope(json.dumps(bad))
  self.assertFalse(replay.equal_json(True,1));self.assertTrue(replay.equal_json(1.0,1))
  with self.assertRaises(ValueError):replay.strict('{"a":1,"a":2}')
  with self.assertRaises(ValueError):replay.strict('{"a":NaN}')
class ReceivingStatusTests(unittest.TestCase):
 def test_only_an_independently_replayed_proof_can_be_successful(self):
  study=module('verify_proof_search_study')
  self.assertEqual(study.final_status({'status':'verified'},None),'invalid_search_record')
  self.assertEqual(study.final_status({'search_status':'verified'},None),'replay_failed')
  self.assertEqual(study.final_status({'search_status':'unknown'},{'status':'verified'}),'unknown')

class ProvenanceTests(unittest.TestCase):
 def test_data_only_git_object_restore_without_repository_history(self):
  archive=module('check_proof_search_artifacts')
  with tempfile.TemporaryDirectory() as tmp:
   folder=Path(tmp);source=folder/'source';repo=folder/'receiver';source.mkdir()
   subprocess.run(['git','init','-q',str(source)],check=True);(source/'base.txt').write_text('explicit Git fixture, no authority verdicts\n')
   def commit():
    subprocess.run(['git','add','.'],cwd=source,check=True)
    subprocess.run(['git','-c','user.name=Synthetic Git fixture','-c','user.email=fixture@example.test','commit','-qm','data-only provenance fixture'],cwd=source,check=True)
    return subprocess.check_output(['git','rev-parse','HEAD'],cwd=source,text=True).strip()
   base=commit();subprocess.run(['git','init','--bare','-q',str(repo)],check=True)
   subprocess.run(['git','fetch','--depth=1',str(source),base],cwd=repo,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
   original=b'raise RuntimeError("producer archive must never be executed")\n';(source/'evaluator.py').write_bytes(original);head=commit();ref='refs/pcs-provenance/test-data'
   subprocess.run(['git','update-ref',ref,head],cwd=source,check=True);bundle=folder/'test.bundle'
   subprocess.run(['git','bundle','create',str(bundle),ref,'^'+base],cwd=source,check=True)
   missing=subprocess.run(['git','cat-file','-e',head+':evaluator.py'],cwd=repo,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE);self.assertNotEqual(missing.returncode,0)
   archive.restore_git_bundle(repo,bundle,head+' '+ref)
   self.assertEqual(subprocess.check_output(['git','show',head+':evaluator.py'],cwd=repo),original)
 def test_missing_trusted_parent_fails_closed(self):
  archive=module('check_proof_search_artifacts')
  with tempfile.TemporaryDirectory() as tmp:
   subprocess.run(['git','init','--bare','-q',tmp],check=True)
   with self.assertRaises(subprocess.CalledProcessError):archive.restore_provenance(Path(tmp))

class SyncTests(unittest.TestCase):
 def fixture(self,folder):
  core=folder/'core';site=folder/'site';core.mkdir();site.mkdir()
  subprocess.run(['git','init','-q',str(core)],check=True);subprocess.run(['git','-C',str(core),'config','user.email','fixture@example.test'],check=True);subprocess.run(['git','-C',str(core),'config','user.name','Synthetic fixture'],check=True)
  (core/'README.md').write_text('fixture\n');(core/'pcs').mkdir();(core/'pcs/module.py').write_text('SOURCE=1\n');self.commit(core)
  old=sync.git(core,'rev-parse','HEAD')
  for name in ['src/lean-research.js','public/status.json','public/research-release-20261017/SOURCE_MANIFEST.json','.github/workflows/site-public-verification.yml','public/model-capabilities.json','public/proof-workbench-catalog.json']:
   p=site/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_bytes((ROOT/name).read_bytes())
   s=p.read_text().replace('f20f3cab2938f2e085f137185e88f4700d5da2ed',old);p.write_text(s)
  (site/'frozen-evidence.json').write_text('must remain unchanged\n');return core,site,old
 def commit(self,core):
  subprocess.run(['git','-C',str(core),'add','.'],check=True);subprocess.run(['git','-C',str(core),'commit','-qm','explicit non-protected Git fixture'],check=True)
 def test_real_git_mechanical_proposal_preserves_frozen_evidence_and_semantics(self):
  with tempfile.TemporaryDirectory() as tmp:
   core,site,old=self.fixture(Path(tmp));self.assertEqual(sync.plan(core,site)['state'],'current')
   catalog=json.loads((site/'public/proof-workbench-catalog.json').read_text());semantic=catalog['catalog_sha256'];before=(site/'frozen-evidence.json').read_bytes()
   (core/'README.md').write_text('updated docs\n');self.commit(core);p=sync.plan(core,site);self.assertEqual(p['state'],'source_identical_pin_update');sync.apply(p,site)
   self.assertEqual(sync.current(site),p['candidate_source']);self.assertIn('PREVIOUS_CORE_SHA = "'+old+'"',(site/'src/lean-research.js').read_text());self.assertEqual(json.loads((site/'public/proof-workbench-catalog.json').read_text())['catalog_sha256'],semantic);self.assertEqual((site/'frozen-evidence.json').read_bytes(),before)
 def test_model_startup_hooks_unknown_paths_and_newlines_require_manual_review(self):
  for path in ['pcs/module.py','sitecustomize.py','requirements-new.lock','formal/Proof.lean','research/new-experiment/data.json','pcs/weird\nmodule.py']:
   with tempfile.TemporaryDirectory() as tmp:
    core,site,old=self.fixture(Path(tmp));p=core/path;p.parent.mkdir(parents=True,exist_ok=True);p.write_text('unreviewed fixture data\n');self.commit(core);plan=sync.plan(core,site);self.assertEqual(plan['state'],'manual_integration_required',path);changed=sync.apply(plan,site);self.assertEqual(changed,['docs/core-sync-proposal.json']);self.assertEqual(sync.current(site),old)
 def test_document_symlink_or_executable_requires_manual_review(self):
  for mode in ['symlink','executable']:
   with tempfile.TemporaryDirectory() as tmp:
    core,site,old=self.fixture(Path(tmp));p=core/'README.md'
    if mode=='symlink':p.unlink();p.symlink_to('pcs/module.py')
    else:p.chmod(0o755)
    self.commit(core);self.assertEqual(sync.plan(core,site)['state'],'manual_integration_required')
if __name__=='__main__':unittest.main()
