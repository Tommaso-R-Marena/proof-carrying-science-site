#!/usr/bin/env python3
"""Real published observations; original-file conservation, not model accuracy.
Corrupted-value/removal cases are explicitly synthetic negative controls.
"""
import sys,json,hashlib,base64,csv,io,subprocess,tempfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'desktop'))
from file_check import LocalChecker,parse_csv,sha

def request(raws):return {'mode':'changes','columns':[0,0],'compare_headers':parse_csv(raws[0])['header'][1:],'rules':{'allow_added':True,'allow_removed':False,'allow_changed':False},'files':[{'name':str(i)+'.csv','data_base64':base64.b64encode(raw).decode(),'sha256':sha(raw)} for i,raw in enumerate(raws)]}
def serialize(table):
 s=io.StringIO(newline='');w=csv.writer(s,lineterminator='\n');w.writerow(table['header']);w.writerows(table['rows']);return s.getvalue().encode()
def main():
 checker=LocalChecker(Path(sys.argv[1]));prov=json.loads((ROOT/'research/export-conservation-v2/PROVENANCE.json').read_text());raw=(ROOT/'research/export-conservation-v2/iris-source.csv').read_bytes();assert sha(raw)==prov['source_sha256']
 source=list(csv.reader(io.StringIO(raw.decode('utf-8-sig'),newline='')));before=(ROOT/'public/example-iris-previous.csv').read_bytes();after=(ROOT/'public/example-iris-new.csv').read_bytes();old=parse_csv(before);new=parse_csv(after);published={f'iris-{i:03d}':r for i,r in enumerate(source[1:],1)}
 assert len(published)==150 and len(old['rows'])==100 and len(new['rows'])==150
 for row in old['rows']+new['rows']:assert row[1:]==published[row[0]]
 records=[];r=checker.review(request([before,after]));assert r['accepted'] and r['summary']=={'old_rows':100,'new_rows':150,'added':50,'removed':0,'changed':0,'same':100,'compared_columns':5};records.append({'case':'published_observation_extension','source':'UCI Iris snapshot with documented ordinal IDs','receipt':r})
 corrupted=parse_csv(after);next(row for row in corrupted['rows'] if row[0]=='iris-001')[1]='9.9';r=checker.review(request([before,serialize(corrupted)]));assert not r['accepted'] and r['summary']['changed']==1;records.append({'case':'synthetic_corruption_of_one_published_value','receipt':r})
 removed=parse_csv(after);removed['rows']=[row for row in removed['rows'] if row[0]!='iris-001'];r=checker.review(request([before,serialize(removed)]));assert not r['accepted'] and r['summary']['removed']==1;records.append({'case':'synthetic_loss_of_one_existing_record','receipt':r})
 print(json.dumps({'format':'pcs-public-data-conservation-v2','provenance':prov,'actual_native_checks':3,'records':records,'model_accuracy_tested':False,'new_measurements_collected':False,'human_participants':0,'scientific_acceptance':False},indent=2))
if __name__=='__main__':main()
