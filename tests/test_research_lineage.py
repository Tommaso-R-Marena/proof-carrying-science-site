import importlib.util,json,sqlite3,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('lineage',Path(__file__).resolve().parents[1]/'scripts/research_lineage.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Lineage(unittest.TestCase):
 def test_export_dataset_model_withdrawal_quarantines_future_use(self):
  id='12345678-1234-1234-1234-123456789012';session={'catalog_sha256':'a'*64,'events':[]}
  entry={'id':id,'session':session,'license':'CC0-1.0','adult_consented':True,'training_consented':True}
  membership=[{'id':id,'session_sha256':m.digest(session),'goal_sha256':None}]
  document={'format':'pcs-bridge-consented-export-v1','eligible_for_training':False,'entries':[entry],'manifest':{'format':'pcs-research-lineage-v1','catalog_sha256':'a'*64,'membership':membership,'membership_sha256':m.digest(membership),'export_sha256':m.digest([entry])}}
  with tempfile.TemporaryDirectory() as t,m.connect(':memory:') as db:
   export=m.register_export(db,document,'c'*40);file=Path(t)/'data.json';file.write_text('{"synthetic":true}')
   dataset=m.register_derived(db,file,'dataset',[export],'c'*40);file.write_text('{"testweights":[1]}');model=m.register_derived(db,file,'model',[dataset],'c'*40)
   result=m.withdraw(db,{'format':'pcs-research-withdrawal-v1','withdrawn_entry_ids':[id],'model_unlearning':False})
   self.assertTrue(all(a['future_use']=='quarantined' for a in result['artifacts']))
   self.assertRaises(ValueError,m.preflight,db,model);self.assertFalse(m.status(db,model)['model_unlearned']);file.write_text('new');self.assertRaises(ValueError,m.register_derived,db,file,'model',[dataset],'c'*40)
   self.assertRaises(sqlite3.IntegrityError,db.execute,'DELETE FROM events')
 def test_export_content_tamper_rejected(self):
  with m.connect(':memory:') as db:self.assertRaises(ValueError,m.register_export,db,{'format':'pcs-bridge-consented-export-v1','eligible_for_training':False,'entries':[],'manifest':{'format':'pcs-research-lineage-v1','export_sha256':'forged'}},'c'*40)
if __name__=='__main__':unittest.main()
