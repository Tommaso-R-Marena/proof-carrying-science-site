import json,unittest
from study import corpus,first_request,next_request
from intent_oracle import decode,compile_intent
from oracle import replay
from protocol import corpus as old_corpus,status
class IntentTests(unittest.TestCase):
 def test_canonical_profile_and_escaped_equivalence(self):
  for text,n in [('{"value":"0"}',0),('{"value":"1000000"}',1000000),(' {"value":"\\u0031"}\n',1)]:self.assertEqual(decode(text),n)
 def test_ambiguous_and_invalid_intents_fail(self):
  for text in ['{"value":7}','{"value":"01"}','{"value":"-0"}','{"value":"1000001"}','{"value":"1","value":"2"}','{"value":"1","\\u0076alue":"2"}','{"value":"1","verified":true}','{"value":"NaN"}','{"value":"\\ud800"}','{"value":"١"}','{"value":"7"}x']:
   with self.assertRaises((ValueError,UnicodeError)):decode(text)
 def test_compiler_does_not_invent_the_right_answer(self):
  c=corpus()[0];p=compile_intent(c['spec'],c['target'],'{"value":"8"}');self.assertTrue(p['eligible']);self.assertEqual(p['value'],'8')
  result=replay(c['spec'],[json.dumps(p['plan'])],True);self.assertTrue(all(result['executed']));self.assertFalse(status(c,result)['taskCompleted'])
 def test_policy_is_not_weakened(self):
  c=corpus()[0];self.assertFalse(compile_intent(c['spec'],c['target'],'{"value":"100001"}')['eligible'])
  self.assertFalse(compile_intent(c['spec'],{'fileId':c['target']['fileId'],'rowId':'reference'},'{"value":"7"}')['eligible'])
  c['spec']['policy']['inspectable']=[];self.assertFalse(compile_intent(c['spec'],c['target'],'{"value":"7"}')['eligible'])
 def test_new_corpus_and_prospective_unit_split(self):
  cases=corpus();self.assertEqual(len(cases),12);self.assertEqual(sum(c['split']=='development' for c in cases),4)
  old={(c['unitFrom'],c['unitTo']) for c in old_corpus()};new={(c['unitFrom'],c['unitTo']) for c in cases};self.assertFalse(old&new)
  dev={(c['unitFrom'],c['unitTo']) for c in cases if c['split']=='development'};held={(c['unitFrom'],c['unitTo']) for c in cases if c['split']=='held-out'};self.assertFalse(dev&held)
 def test_prompts_preserve_notice_and_do_not_supply_reference(self):
  c=corpus()[0]
  for interface in ['tools','intent']:
   q=first_request(c,'attack',interface);data=json.loads(q['messages'][1]['content']);self.assertNotIn('goal',data);self.assertNotIn('value',data['trustedTarget']);self.assertEqual(data['untrustedNotice'],c['notices']['attack'])
   self.assertIn('SIXTEEN',q['messages'][0]['content'])
   r=next_request(q,'{"value":"8"}',{'outcome':{'files':c['spec']['files']}},False);self.assertEqual(r['messages'][:2],q['messages']);self.assertEqual(len([m for m in r['messages'] if m['role']=='system']),1)
 def test_all_authored_goal_witnesses_are_oracle_legal(self):
  for c in corpus():
   p=compile_intent(c['spec'],c['target'],json.dumps({'value':str(c['goal']['value'])}));self.assertTrue(p['eligible']);self.assertTrue(status(c,replay(c['spec'],[json.dumps(p['plan'])],True))['taskCompleted'])
if __name__=='__main__':unittest.main()
