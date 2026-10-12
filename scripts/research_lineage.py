"""Local research custody ledger. No network, training, scientific acceptance or model promotion."""
from __future__ import annotations
import argparse, hashlib, json, sqlite3
from pathlib import Path


def canonical(value):return json.dumps(value,sort_keys=True,separators=(',',':'),ensure_ascii=False)
def digest(value):return hashlib.sha256(canonical(value).encode()).hexdigest()

def connect(path):
 db=sqlite3.connect(path);db.execute('PRAGMA foreign_keys=ON')
 db.executescript('''CREATE TABLE IF NOT EXISTS artifacts(sha TEXT PRIMARY KEY,kind TEXT NOT NULL CHECK(kind IN ('export','dataset','model')),source_sha TEXT NOT NULL CHECK(length(source_sha)=40));
 CREATE TABLE IF NOT EXISTS members(artifact_sha TEXT NOT NULL REFERENCES artifacts(sha),entry_id TEXT NOT NULL,PRIMARY KEY(artifact_sha,entry_id));
 CREATE TABLE IF NOT EXISTS parents(child_sha TEXT NOT NULL REFERENCES artifacts(sha),parent_sha TEXT NOT NULL REFERENCES artifacts(sha),PRIMARY KEY(child_sha,parent_sha));
 CREATE TABLE IF NOT EXISTS withdrawals(entry_id TEXT PRIMARY KEY,receipt_sha TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS events(seq INTEGER PRIMARY KEY,event_json TEXT NOT NULL,event_sha TEXT NOT NULL);
 CREATE TRIGGER IF NOT EXISTS withdrawals_no_update BEFORE UPDATE ON withdrawals BEGIN SELECT RAISE(ABORT,'Immutable withdrawals'); END;
 CREATE TRIGGER IF NOT EXISTS withdrawals_no_delete BEFORE DELETE ON withdrawals BEGIN SELECT RAISE(ABORT,'Immutable withdrawals'); END;
 CREATE TRIGGER IF NOT EXISTS events_no_update BEFORE UPDATE ON events BEGIN SELECT RAISE(ABORT,'Immutable events'); END;
 CREATE TRIGGER IF NOT EXISTS events_no_delete BEFORE DELETE ON events BEGIN SELECT RAISE(ABORT,'Immutable events'); END;''')
 return db

def record(db,event):
 previous=db.execute('SELECT event_sha FROM events ORDER BY seq DESC LIMIT 1').fetchone()
 wrapped={'previous':previous[0] if previous else None,'event':event};text=canonical(wrapped)
 db.execute('INSERT INTO events(event_json,event_sha) VALUES (?,?)',(text,digest(wrapped)))

def source(value):
 if len(value)!=40 or any(c not in '0123456789abcdef' for c in value):raise ValueError('Exact source commit required')

def register_export(db,document,source_sha):
 source(source_sha)
 if document.get('format')!='pcs-bridge-consented-export-v1' or document.get('eligible_for_training') is not False:raise ValueError('Expected bounded unapproved Bridge/Memory export')
 manifest=document.get('manifest',{});entries=document.get('entries',[])
 if manifest.get('format')!='pcs-research-lineage-v1' or manifest.get('export_sha256')!=digest(entries):raise ValueError('Export content binding failed')
 if manifest.get('membership_sha256')!=digest(manifest.get('membership')):raise ValueError('Membership digest failed')
 membership={m['id']:m for m in manifest['membership']}
 if len(membership)!=len(entries) or len(entries)>25:raise ValueError('Invalid bounded membership')
 for e in entries:
  m=membership.get(e.get('id'))
  if not m or m['session_sha256']!=digest(e['session']) or e.get('license')!='CC0-1.0' or e.get('adult_consented') is not True or e.get('training_consented') is not True:raise ValueError('Consent or session binding failed')
  if e['session'].get('catalog_sha256')!=manifest.get('catalog_sha256'):raise ValueError('Catalog mismatch')
 sha=manifest['export_sha256']
 with db:
  db.execute('INSERT INTO artifacts VALUES (?,?,?)',(sha,'export',source_sha))
  db.executemany('INSERT INTO members VALUES (?,?)',[(sha,e['id']) for e in entries]);record(db,{'action':'register-export','sha':sha,'members':len(entries)})
 return sha

def register_derived(db,path,kind,parents,source_sha):
 source(source_sha)
 if kind not in ('dataset','model') or not parents:raise ValueError('Dataset/model requires parent lineage')
 for parent in parents:
  if db.execute('SELECT 1 FROM artifacts WHERE sha=?',(parent,)).fetchone() is None:raise ValueError('Unknown parent')
  if status(db,parent)['withdrawn_members']:raise ValueError('Withdrawn data quarantined; cannot register new derived artifacts')
 sha=hashlib.sha256(Path(path).read_bytes()).hexdigest()
 with db:
  db.execute('INSERT INTO artifacts VALUES (?,?,?)',(sha,kind,source_sha))
  for parent in sorted(set(parents)):
   db.execute('INSERT INTO parents VALUES (?,?)',(sha,parent))
   db.execute('INSERT OR IGNORE INTO members SELECT ?,entry_id FROM members WHERE artifact_sha=?',(sha,parent))
  record(db,{'action':'register-'+kind,'sha':sha,'parents':sorted(set(parents))})
 return sha

def withdraw(db,receipt):
 if receipt.get('format')!='pcs-research-withdrawal-v1' or receipt.get('model_unlearning') is not False:raise ValueError('Expected explicit withdrawal receipt without unlearning claim')
 ids=receipt.get('withdrawn_entry_ids');
 if not isinstance(ids,list) or len(ids)>1000 or len(ids)!=len(set(ids)) or any(not isinstance(x,str) or len(x)!=36 for x in ids):raise ValueError('Invalid withdrawal entries')
 sha=digest(receipt)
 with db:
  db.executemany('INSERT OR IGNORE INTO withdrawals VALUES (?,?)',[(x,sha) for x in ids]);record(db,{'action':'withdraw','receipt_sha':sha,'entries':len(ids)})
 return report(db)

def status(db,sha):
 row=db.execute('SELECT kind FROM artifacts WHERE sha=?',(sha,)).fetchone()
 if not row:raise ValueError('Unknown artifact')
 count=db.execute('SELECT COUNT(*) FROM members m JOIN withdrawals w ON w.entry_id=m.entry_id WHERE artifact_sha=?',(sha,)).fetchone()[0]
 return {'sha256':sha,'kind':row[0],'withdrawn_members':count,'future_use':'quarantined' if count else 'requires-independent-intake-and-approval','prior_copies_erased':False,'model_unlearned':False,'scientific_authority':False}

def preflight(db,sha):
 item=status(db,sha)
 if item['withdrawn_members']:raise ValueError('Withdrawn data quarantined; future training/use denied')
 report(db)
 return item

def report(db):
 previous=None
 for text,sha in db.execute('SELECT event_json,event_sha FROM events ORDER BY seq'):
  event=json.loads(text)
  if digest(event)!=sha or event.get('previous')!=previous:raise ValueError('Lineage event hash chain corrupted')
  previous=sha
 return {'format':'pcs-research-lineage-ledger-v1','artifacts':[status(db,row[0]) for row in db.execute('SELECT sha FROM artifacts ORDER BY sha')],'events':db.execute('SELECT COUNT(*) FROM events').fetchone()[0],'scope':'Local custody and future-use quarantine only; ledger content does not verify proof labels, human authenticity, evaluator separation or scientific acceptance.'}

def main():
 p=argparse.ArgumentParser();p.add_argument('--ledger',required=True,type=Path);sub=p.add_subparsers(dest='command',required=True)
 e=sub.add_parser('export');e.add_argument('file',type=Path);e.add_argument('--source',required=True)
 d=sub.add_parser('derived');d.add_argument('file',type=Path);d.add_argument('--kind',choices=['dataset','model'],required=True);d.add_argument('--parent',action='append',required=True);d.add_argument('--source',required=True)
 w=sub.add_parser('withdraw');w.add_argument('file',type=Path);sub.add_parser('report');f=sub.add_parser('preflight');f.add_argument('sha');a=p.parse_args()
 with connect(a.ledger) as db:
  if a.command=='export':register_export(db,json.loads(a.file.read_text()),a.source)
  elif a.command=='derived':register_derived(db,a.file,a.kind,a.parent,a.source)
  elif a.command=='withdraw':withdraw(db,json.loads(a.file.read_text()))
  elif a.command=='preflight':preflight(db,a.sha)
  print(json.dumps(report(db),indent=2))
if __name__=='__main__':main()
