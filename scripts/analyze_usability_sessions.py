#!/usr/bin/env python3
"""Summarize opt-in records without inventing human participation or trusted clocks.
Observer attestations are separate empirical claims; this program cannot verify
an identity or prove that a task was performed without help.
"""
import argparse,json,math
from pathlib import Path
TASKS={'choose-id':1,'interpret':0,'correct':0,'review':0,'repeat':0}
EVENTS={'file-chosen','id-column-chosen','comparison-chosen','rules-chosen','overlap-complete','review-complete','local-check-complete','settings-saved','report-downloaded','replay-downloaded','hint-opened'}

def load(path):
 if path.stat().st_size>65536:raise ValueError('Study file too large.')
 def unique(pairs):
  out={}
  for k,v in pairs:
   if k in out:raise ValueError('Duplicate study fields.')
   out[k]=v
  return out
 return json.loads(path.read_text(),object_pairs_hook=unique,parse_constant=lambda _:(_ for _ in ()).throw(ValueError('Nonfinite study value.')))

def validate(s):
 keys={'format','session_id','participant_kind','consent','started_at','events','answers','human_origin_verified','timing_trusted'}
 if type(s) is not dict or set(s)!=keys or s['format']!='pcs-usability-session-v1' or s['participant_kind'] not in {'automated','unverified-volunteer'} or s['consent'] is not True or s['human_origin_verified'] is not False or s['timing_trusted'] is not False or type(s['session_id']) is not str or len(s['session_id'])!=36 or type(s['started_at']) not in {int,float} or not math.isfinite(s['started_at']) or s['started_at']<0:raise ValueError('Malformed study session.')
 if type(s['events']) is not list or len(s['events'])>300 or type(s['answers']) is not list or len(s['answers'])>5:raise ValueError('Study bounds exceeded.')
 seen=set()
 for a in s['answers']:
  if type(a) is not dict or set(a)!={'task','choice','elapsed_ms'} or a['task'] not in TASKS or a['task'] in seen or type(a['choice']) is not int or not 0<=a['choice']<3 or type(a['elapsed_ms']) is not int or not 0<=a['elapsed_ms']<=86400000:raise ValueError('Malformed task answer.')
  seen.add(a['task'])
 for e in s['events']:
  if type(e) is not dict or set(e)!={'event','elapsed_ms'} or e['event'] not in EVENTS or type(e['elapsed_ms']) is not int or not 0<=e['elapsed_ms']<=86400000:raise ValueError('Malformed study event.')
 return s

def analyze(sessions,attestations=None):
 seen=set();rows=[]
 for s in sessions:
  validate(s)
  if s['session_id'] in seen:raise ValueError('Duplicate session ID. Choose one final export per session.')
  seen.add(s['session_id']);rows.append({'session_id':s['session_id'],'participant_kind':s['participant_kind'],'answered':len(s['answers']),'correct':sum(a['choice']==TASKS[a['task']] for a in s['answers']),'hints':sum(e['event']=='hint-opened' for e in s['events']),'last_answer_elapsed_ms':max([a['elapsed_ms'] for a in s['answers']],default=0)})
 attested=[]
 if attestations is not None:
  if type(attestations) is not dict or set(attestations)!={'format','sessions'} or attestations['format']!='pcs-usability-observer-attestations-v1' or type(attestations['sessions']) is not list:raise ValueError('Malformed observer attestations.')
  ids=set()
  for a in attestations['sessions']:
   if type(a) is not dict or set(a)!={'session_id','observed_human','assisted'} or a['observed_human'] is not True or type(a['assisted']) is not bool or a['session_id'] in ids:raise ValueError('Malformed observer claim.')
   ids.add(a['session_id']);r=next((r for r in rows if r['session_id']==a['session_id']),None)
   if r is None or r['participant_kind']!='unverified-volunteer':raise ValueError('An unknown or automated session cannot be attested as a human session.')
   attested.append({**r,'observer_reported_assistance':a['assisted']})
 return {'format':'pcs-usability-analysis-v1','sessions':len(rows),'automated_sessions_excluded':sum(r['participant_kind']=='automated' for r in rows),'unverified_volunteer_sessions':sum(r['participant_kind']=='unverified-volunteer' for r in rows),'observer_attested_human_sessions':len(attested),'human_identities_verified_by_software':0,'observer_attestations_are_unverified_empirical_claims':True,'client_clocks_and_answers_are_untrusted':True,'rows':rows,'observer_attested_rows':attested}

def main():
 p=argparse.ArgumentParser(__doc__);p.add_argument('sessions',nargs='*',type=Path);p.add_argument('--observer-attestations',type=Path);a=p.parse_args();print(json.dumps(analyze([load(f) for f in a.sessions],load(a.observer_attestations) if a.observer_attestations else None),indent=2))
if __name__=='__main__':main()
