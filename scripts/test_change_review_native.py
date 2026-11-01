#!/usr/bin/env python3
"""Exhaustive compiled policy decisions against independent set semantics."""
import itertools,subprocess,tempfile,json,time,sys
from pathlib import Path

def main():
 exe=Path(sys.argv[1]).resolve();models=[]
 for state in itertools.product(range(3),repeat=3):
  rows=[[str(i),str(v-1)] for i,v in enumerate(state) if v]
  if rows:models.append(rows)
 cases=[];expected=[];count=0
 def encoded(rows):return ('id,v\n'+'\n'.join(','.join(r) for r in rows)+'\n').encode()
 for a,b in itertools.product(models,repeat=2):
  ak={r[0] for r in a};bk={r[0] for r in b}
  for selected in [False,True]:
   sig=lambda r:tuple(r if selected else r[:1]);aset={sig(r) for r in a};bset={sig(r) for r in b};added=len(bk-ak);removed=len(ak-bk);changed=sum(r[0] in ak and sig(r) not in aset for r in b);same=len(ak&bk)-changed
   decisions=[]
   for mask in range(8):
    accept=bool((mask&1 or not added) and (mask&2 or not removed) and (mask&4 or not changed));decisions.append('1' if accept else '0')
    if mask==1 and accept:assert aset<=bset
    count+=1
   col='1' if selected else '-';cases.append('|'.join([encoded(a).hex(),encoded(b).hex(),'0','0',col,col]));expected.append(','.join(map(str,[added,removed,changed,same]))+';'+''.join(decisions))
 started=time.monotonic()
 with tempfile.TemporaryDirectory() as tmp:
  p=Path(tmp)/'cases';p.write_bytes(('\n'.join(cases)+'\n').encode('ascii'));r=subprocess.run([exe,'review-batch',p],capture_output=True,timeout=90,check=True)
 assert not r.stderr;actual=r.stdout.decode().splitlines();assert len(actual)==len(expected)
 for i,(a,b) in enumerate(zip(actual,expected)):assert a==b,(i,a,b)
 print(json.dumps({'format':'pcs-change-native-policy-v2','table_pairs_and_scopes':len(cases),'policy_configurations':count,'all_compiled_counts_and_rules_match_independent_sets':True,'conservative_extension_controls':True,'seconds':round(time.monotonic()-started,3),'mock_affirmative_verdicts':0}))
if __name__=='__main__':main()
