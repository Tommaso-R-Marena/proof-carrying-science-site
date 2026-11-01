import sys,unittest,itertools
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'desktop'))
from file_check import parse_csv
from change_review import compare
RULES={'allow_added':True,'allow_removed':False,'allow_changed':False}
class ReviewTests(unittest.TestCase):
 def test_changes_and_lines(self):
  a=parse_csv(b'id,v\r\nx,1\r\ny,2\r\n');b=parse_csv(b'who,v\ny,3\nz,4\n');r=compare(a,b,[0,0],['v'],RULES);self.assertEqual([r['summary'][k] for k in ['added','removed','changed','same']],[1,1,1,0]);self.assertFalse(r['accepted']);self.assertEqual(r['changed'][0]['before_line'],3)
 def test_adversarial_inputs(self):
  a=parse_csv(b'id,v\nx,1\n');b=parse_csv(b'id,v\nx,2\n')
  for cols,hs,rs in [([True,0],['v'],RULES),([0,0],['v','v'],RULES),([0,0],['id'],RULES),([0,0],['missing'],RULES),([0,0],['v'],dict(RULES,allow_added=1)),([0,0],['v'],dict(RULES,verifier='fake'))]:
   with self.assertRaises(ValueError):compare(a,b,cols,hs,rs)
  with self.assertRaises(ValueError):compare(parse_csv(b'id,v\nx,1\nx,2'),b,[0,0],['v'],RULES)
 def test_exhaustive_small_updates(self):
  models=[]
  for state in itertools.product(range(3),repeat=3):
   rows=[[str(i),str(v-1)] for i,v in enumerate(state) if v]
   if rows:models.append(rows)
  def table(rows):return {'header':['id','v'],'rows':rows,'lines':list(range(2,len(rows)+2))}
  count=0
  for a,b in itertools.product(models,repeat=2):
   ak={x[0] for x in a};bk={x[0] for x in b}
   for hs in [[],['v']]:
    sig=lambda r:tuple(r if hs else r[:1]);aset={sig(x) for x in a};bs={sig(x) for x in b}
    added=len(bk-ak);removed=len(ak-bk);changed=sum(x[0] in ak and sig(x) not in aset for x in b)
    for mask in range(8):
     rules={k:bool(mask&(1<<i)) for i,k in enumerate(['allow_added','allow_removed','allow_changed'])};r=compare(table(a),table(b),[0,0],hs,rules);self.assertEqual([r['summary'][k] for k in ['added','removed','changed']],[added,removed,changed]);self.assertEqual(r['accepted'],(rules['allow_added'] or not added) and (rules['allow_removed'] or not removed) and (rules['allow_changed'] or not changed))
     if mask==1 and r['accepted']:self.assertTrue(aset<=bs)
     count+=1
  self.assertEqual(count,10816)
if __name__=='__main__':unittest.main()
