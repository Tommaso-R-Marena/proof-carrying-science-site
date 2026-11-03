import sys,unittest,json,subprocess,random
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'desktop'))
from file_check import parse_csv
from model_evaluation import compare,provenance

class EvaluationTests(unittest.TestCase):
    def test_gain_is_not_preservation(self):
        raw=[b'id,label\na,y\nb,y\nc,y\n',b'id,label\na,y\nb,n\nc,n\n',b'id,label\nb,y\nc,y\na,n\n']
        r=compare(list(map(parse_csv,raw)),[[0,1]]*3)
        self.assertEqual(r['summary'],dict(total=3,before_matches=1,after_matches=2,improvements=2,regressions=1));self.assertFalse(r['preserved'])
    def test_random_permutations_match_independent_per_ID_oracle(self):
        rng=random.Random(117)
        for n in [1,2,17,100]:
            labels={str(i):str(rng.randrange(3)) for i in range(n)};old={i:str(rng.randrange(3)) for i in labels};new={i:str(rng.randrange(3)) for i in labels}
            tables=[]
            for m in [labels,old,new]:
                rows=list(m.items());rng.shuffle(rows);tables.append(parse_csv(('id,label\n'+''.join(k+','+v+'\n' for k,v in rows)).encode()))
            r=compare(tables,[[0,1]]*3)
            self.assertEqual(r['summary']['regressions'],sum(old[k]==labels[k] and new[k]!=labels[k] for k in labels))
            self.assertEqual(r['summary']['after_matches']+r['summary']['regressions'],r['summary']['before_matches']+r['summary']['improvements'])
    def test_coverage_duplicates_and_schema_fail_closed(self):
        a=parse_csv(b'id,label\na,y\nb,n\n')
        for b in [b'id,label\na,y\na,n\n',b'id,label\na,y\nx,n\n',b'id,label\na,y\n']:
            with self.assertRaises(ValueError):compare([a,a,parse_csv(b)],[[0,1]]*3)
        with self.assertRaises(ValueError):compare([a,a,a],[[False,1]]*3)
    def test_no_extra_authority_fields(self):
        p=dict(baseline_name='old',candidate_name='new',baseline_weights_sha256=None,candidate_weights_sha256=None,reference_note='',source_note='',authority=True)
        with self.assertRaises(ValueError):provenance(p)

if __name__=='__main__':unittest.main()
