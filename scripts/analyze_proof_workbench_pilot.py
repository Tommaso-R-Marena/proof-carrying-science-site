#!/usr/bin/env python3
"""Analyze consented local pilot records. Human/observer claims remain unverified."""
import argparse,json,re
from pathlib import Path
TASKS={'meaning':0,'publication':1,'unknown':2,'recorded':1,'replay':2}
EVENTS={'claim-chosen','meaning-confirmed','public-request-submitted','recorded-result-opened','fresh-result-received','request-ended-without-result','service-interrupted','cancellation-requested','report-exported','evidence-exported','proof-exported','replay-instructions-opened'}
def load(path):
 if path.stat().st_size>65536:raise ValueError('Study record exceeds bound')
 def unique(pairs):
  out={}
  for k,v in pairs:
   if k in out:raise ValueError('Duplicate study field')
   out[k]=v
  return out
 return json.loads(path.read_text(),object_pairs_hook=unique,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Nonfinite study value')))
def validate(s):
 fields={'format','session_id','participant_kind','experience','adult_consent','consent','started_at','events','answers','completion','human_origin_verified','timing_trusted'}
 if type(s) is not dict or set(s)!=fields or s['format']!='pcs-proof-workbench-pilot-v1' or type(s['session_id']) is not str or not re.fullmatch('[a-f0-9-]{36}',s['session_id']) or s['participant_kind'] not in {'automated','unverified-volunteer'} or s['experience'] not in {'none','some','undisclosed'} or s['adult_consent'] is not True or s['consent'] is not True or s['human_origin_verified'] is not False or s['timing_trusted'] is not False or type(s['started_at']) is not int or s['started_at']<0:raise ValueError('Invalid consented pilot scope')
 if s['completion'] not in {'not-finished','completed','declined-publication','service-unavailable','unsupported-claim'} or type(s['events']) is not list or len(s['events'])>300 or type(s['answers']) is not list or len(s['answers'])>5:raise ValueError('Pilot bounds exceeded')
 last=0
 for e in s['events']:
  if type(e) is not dict or set(e)!={'event','case_id','elapsed_ms'} or e['event'] not in EVENTS or not (e['case_id'] is None or type(e['case_id']) is str and re.fullmatch('(combine|reuse|chain|insufficient|length|reverse|offset-[0-8]-[0-8])',e['case_id'])) or type(e['elapsed_ms']) is not int or not last<=e['elapsed_ms']<=86400000:raise ValueError('Malformed bounded pilot event')
  last=e['elapsed_ms']
 seen=set()
 for a in s['answers']:
  if type(a) is not dict or set(a)!={'task','choice','elapsed_ms'} or a['task'] not in TASKS or a['task'] in seen or type(a['choice']) is not int or not 0<=a['choice']<=2 or type(a['elapsed_ms']) is not int or not 0<=a['elapsed_ms']<=86400000:raise ValueError('Malformed comprehension answer')
  seen.add(a['task'])
 return s

def analyze(sessions,observer=None):
 rows=[];seen=set()
 for s in sessions:
  validate(s)
  if s['session_id'] in seen:raise ValueError('Choose one final export per session; duplicate session rejected')
  seen.add(s['session_id']);names=[e['event'] for e in s['events']]
  rows.append({'session_id':s['session_id'],'participant_kind':s['participant_kind'],'self_reported_experience':s['experience'],'self_reported_completion':s['completion'],'answers':len(s['answers']),'correct_answers':sum(a['choice']==TASKS[a['task']] for a in s['answers']),'recorded_example_opened':'recorded-result-opened' in names,'fresh_public_result_received':'fresh-result-received' in names,'report_exported':'report-exported' in names,'client_elapsed_ms':max([e['elapsed_ms'] for e in s['events']]+[a['elapsed_ms'] for a in s['answers']],default=0)})
 claims=[]
 if observer is not None:
  if type(observer) is not dict or set(observer)!={'format','sessions'} or observer['format']!='pcs-proof-workbench-observer-v1' or type(observer['sessions']) is not list:raise ValueError('Malformed observer claims')
  ids=set()
  for a in observer['sessions']:
   if type(a) is not dict or set(a)!={'session_id','observed_human','observed_beginner','assisted','completed','elapsed_seconds'} or a['observed_human'] is not True or any(type(a[k]) is not bool for k in ['observed_beginner','assisted','completed']) or type(a['elapsed_seconds']) is not int or not 0<=a['elapsed_seconds']<=7200 or a['session_id'] in ids:raise ValueError('Malformed observer row')
   ids.add(a['session_id']);row=next((r for r in rows if r['session_id']==a['session_id']),None)
   if row is None or row['participant_kind']=='automated':raise ValueError('Unknown/automated sessions cannot be elevated into human results')
   claims.append({**row,'observer_claim':a})
 n=len(claims)
 return {'format':'pcs-proof-workbench-pilot-analysis-v1','sessions':len(rows),'automated_sessions_excluded_from_human_metrics':sum(r['participant_kind']=='automated' for r in rows),'unverified_volunteer_sessions':sum(r['participant_kind']=='unverified-volunteer' for r in rows),'observer_reported_human_sessions':n,'observer_reported_beginner_sessions':sum(r['observer_claim']['observed_beginner'] for r in claims),'observer_reported_completion_rate':sum(r['observer_claim']['completed'] for r in claims)/n if n else None,'observer_reported_unassisted_completion_rate':sum(r['observer_claim']['completed'] and not r['observer_claim']['assisted'] for r in claims)/n if n else None,'human_identities_verified_by_software':0,'observer_claims_are_unverified_empirical_evidence':True,'client_clocks_and_answers_are_untrusted':True,'training_authorized':False,'rows':rows,'observer_reported_rows':claims}
if __name__=='__main__':
 p=argparse.ArgumentParser(__doc__);p.add_argument('sessions',type=Path,nargs='*');p.add_argument('--observer-claims',type=Path);a=p.parse_args();print(json.dumps(analyze([load(f) for f in a.sessions],load(a.observer_claims) if a.observer_claims else None),indent=2))
