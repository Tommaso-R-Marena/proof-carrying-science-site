// Aggregate only explicitly unverified records. No claim of human recruitment,
// authorship, trustworthy timing or task completion follows from these files.
import fs from 'node:fs';
import {validateSession,summarizeSession} from '../public/first-visit-study-core.mjs';
export function summarizeRecords(records){
 const seen=new Set(),volunteers=[],automated=[];
 for(const input of records){const s=validateSession(input);if(seen.has(s.session_id))throw Error('Duplicate practice session');seen.add(s.session_id);(s.participant_kind==='automated'?automated:volunteers).push(summarizeSession(s));}
 return {format:'pcs-first-visit-summary-v1',human_participants_verified:0,human_usability_finding_established:false,unverified_volunteer_records:volunteers,automated_records_excluded_from_human_findings:automated.length,automated_records:automated,limits:['Records and ratings are unverified client reports.','Independent observer notes and consent are required for a human usability study.','No study records are authorized as model-training data.']};
}
if(process.argv[1]&&new URL(import.meta.url).pathname===process.argv[1])try{
 if(process.argv.length<3)throw Error('Usage: node scripts/summarize_first_visit.mjs record.json [...]');
 const records=process.argv.slice(2).map(p=>{const b=fs.readFileSync(p);if(b.length>65536)throw Error('Oversized practice record');return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(b));});console.log(JSON.stringify(summarizeRecords(records),null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
