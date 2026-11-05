"""Real-Lean regression for a ledger larger than the JSON-lines transport bound. No model calls."""
import hashlib
import json
import tempfile
from pathlib import Path
from evaluate import Bridge

def run():
    with tempfile.TemporaryDirectory(prefix='pcs-collector-') as tmp:
        out=Path(tmp)
        rows='id,value\n'+''.join('row-'+str(i).zfill(2)+'-'+'a'*64+',4\n' for i in range(16))
        spec={'files':[{'id':f'f{i}','bytes':rows} for i in range(4)],'policy':{'inspectable':[f'f{i}' for i in range(4)],'editable':[{'fileId':'f0','rowId':'row-00-'+'a'*64}],'minimum':0,'maximum':1000000,'requireInspection':True}}
        raw=json.dumps({'actions':[{'tool':'unknown_tool','args':{'data':'x'*15000}}]})
        with Bridge(out) as bridge:
            assert bridge.request({'command':'info'})['ok']
            r=bridge.request({'command':'create','id':'collector-regression','mode':'guarded','spec':spec});assert r['ok'];current=r['snapshot']
            for _ in range(4):
                r=bridge.request({'command':'submit','id':'collector-regression','checkpoint':current['checkpoint'],'content':raw});assert r['ok'];current=r['snapshot']
                assert not any(current['outcome']['executed'])
            for _ in range(8):assert bridge.request({'command':'replay','id':'collector-regression','checkpoint':current['checkpoint']})['ok']
            metadata=bridge.request({'command':'records','path':'../forbidden-overwrite'});assert metadata['ok'] and metadata['persisted']
            payload=(out/'native-ledger.json').read_bytes()
            assert len(payload)>1000000 and len(json.dumps(metadata))<1000
            assert hashlib.sha256(payload).hexdigest()==metadata['sha256'] and len(json.loads(payload))==metadata['records']
            assert not bridge.request({'command':'records'})['ok']
            assert (out/'native-ledger.json').read_bytes()==payload
        return {'passed':True,'nativeLedgerBytes':len(payload),'nativeComputations':metadata['records'],'bridgeMetadataBytes':len(json.dumps(metadata)),
                'existingLedgerOverwriteRefused':True,'newInferenceCalls':0,'positiveVerifierResponsesMocked':0}

if __name__=='__main__':print(json.dumps(run(),indent=2))
