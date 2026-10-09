import {replayCountermodelSession} from './countermodel-core.mjs';

// Owner credentials stay in the existing admin API wrapper. No public endpoint.
export async function collectCountermodelExport(fetchPage,{maxEntries=200}={}){
 if(!Number.isInteger(maxEntries)||maxEntries<1||maxEntries>200)throw Error('Use a bounded export of at most 200 sessions');
 let offset=0,entries=[],metadata;
 for(let pageNumber=0;pageNumber<11;pageNumber++){
  const page=await fetchPage(offset);
  if(!page||page.format!=='pcs-countermodel-adult-optin-dataset-v1'||!Array.isArray(page.entries)||page.entries.length>20)throw Error('Unexpected Countermodel export schema');
  metadata??=page;
  for(const entry of page.entries){
   if(!entry||Object.keys(entry).sort().join(',')!=='replay,session')throw Error('Unexpected personal fields in research export');
   const replay=replayCountermodelSession(entry.session);
   if(!replay.final_verified||JSON.stringify(replay)!==JSON.stringify(entry.replay))throw Error('Export replay mismatch');
   entries.push(entry);
  }
  if(entries.length>maxEntries)throw Error('Export exceeds the bounded preparation limit; request a reviewed batch');
  if(page.next_offset===null)return {format:metadata.format,checker:metadata.checker,privacy:metadata.privacy,limitations:metadata.limitations,entries};
  if(page.entries.length!==20||page.next_offset!==offset+20)throw Error('Invalid export pagination');
  offset=page.next_offset;
 }
 throw Error('Export exceeded bounded page limit');
}
