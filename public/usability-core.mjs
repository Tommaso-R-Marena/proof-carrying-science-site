// Opt-in, device-only study records. No file names, headers, IDs or CSV values.
export const STUDY_KEY='pcs-usability-active-v1';
export const STUDY_EVENTS=Object.freeze(['file-chosen','id-column-chosen','comparison-chosen','rules-chosen','overlap-complete','review-complete','local-check-complete','settings-saved','report-downloaded','replay-downloaded','hint-opened']);
export const TASKS=Object.freeze([
 {id:'choose-id',title:'Find the shared record',instructions:'Download the practice files. Open Check my files, choose the column identifying a person in each, and check for shared IDs. Which person ID appears in both files?',choices:['001','002','003'],answer:1},
 {id:'interpret',title:'Interpret the result',instructions:'What does finding that shared ID establish?',choices:['The selected ID occurs in both chosen columns.','The data is scientifically correct.','Every column in the files matches.'],answer:0},
 {id:'correct',title:'Correct and repeat',instructions:'Download the corrected second file, choose it instead of the original second file, and run the check again. What should the result show?',choices:['No shared IDs.','The old result remains confirmed without a new check.','The source files have been edited automatically.'],answer:0},
 {id:'review',title:'Review a recurring export',instructions:'Open What changed? and load its example. Keep existing IDs and values protected, then review. Which changes need attention?',choices:['One removed record and one edited record.','Only a new record.','Nothing changed.'],answer:0},
 {id:'repeat',title:'Save and return',instructions:'Save the review, reopen What changed? in another tab, use the saved review and choose the exports again. What was remembered?',choices:['Column choices, rules and prior counts.','The full original CSV data.','A fresh Lean confirmation without rerunning it.'],answer:0}
]);
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&JSON.stringify(Object.keys(v).sort())===JSON.stringify([...keys].sort());
export function validateStudy(s){
 if(!exact(s,['format','session_id','participant_kind','consent','started_at','events','answers','human_origin_verified','timing_trusted'])||s.format!=='pcs-usability-session-v1'||typeof s.session_id!=='string'||!/^([a-f0-9-]{36})$/.test(s.session_id)||!['unverified-volunteer','automated'].includes(s.participant_kind)||s.consent!==true||s.human_origin_verified!==false||s.timing_trusted!==false||!Number.isFinite(s.started_at)||s.started_at<0||!Array.isArray(s.events)||s.events.length>300||!Array.isArray(s.answers)||s.answers.length>TASKS.length)throw Error('Malformed study session.');
 for(const e of s.events)if(!exact(e,['event','elapsed_ms'])||!STUDY_EVENTS.includes(e.event)||!Number.isSafeInteger(e.elapsed_ms)||e.elapsed_ms<0||e.elapsed_ms>86400000)throw Error('Malformed study event.');
 const seen=new Set();for(const a of s.answers){const t=TASKS.find(t=>t.id===a.task);if(!exact(a,['task','choice','elapsed_ms'])||!t||seen.has(a.task)||!Number.isInteger(a.choice)||a.choice<0||a.choice>=t.choices.length||!Number.isSafeInteger(a.elapsed_ms)||a.elapsed_ms<0||a.elapsed_ms>86400000)throw Error('Malformed study answer.');seen.add(a.task);}return s;
}
export function startStudy(storage,kind='unverified-volunteer',now=Date.now(),id=crypto.randomUUID()){
 if(storage.getItem(STUDY_KEY)!==null)throw Error('Export or erase the current session before starting another.');
 const s=validateStudy({format:'pcs-usability-session-v1',session_id:id,participant_kind:kind,consent:true,started_at:now,events:[],answers:[],human_origin_verified:false,timing_trusted:false});storage.setItem(STUDY_KEY,JSON.stringify(s));return s;
}
export function readStudy(storage){try{const raw=storage.getItem(STUDY_KEY);if(!raw)return null;if(raw.length>65536)return null;return validateStudy(JSON.parse(raw));}catch{return null;}}
const elapsed=(s,now)=>Math.max(0,Math.min(86400000,Math.floor(now-s.started_at)));
export function recordStudyEvent(storage,event,now=Date.now()){const s=readStudy(storage);if(!s||!STUDY_EVENTS.includes(event)||s.events.length>=300)return false;s.events.push({event,elapsed_ms:elapsed(s,now)});storage.setItem(STUDY_KEY,JSON.stringify(s));return true;}
export function studyEvent(event){try{return recordStudyEvent(localStorage,event);}catch{return false;}}
export function answerTask(storage,task,choice,now=Date.now()){const s=readStudy(storage);if(!s)throw Error('Start an optional study session first.');if(s.answers.some(a=>a.task===task))throw Error('This answer is already recorded. Start a new session to repeat the tasks.');s.answers.push({task,choice,elapsed_ms:elapsed(s,now)});validateStudy(s);storage.setItem(STUDY_KEY,JSON.stringify(s));return s;}
export function studySummary(s){validateStudy(s);return {participant_kind:s.participant_kind,human_participants_verified:0,answers:s.answers.length,correct_answers:s.answers.filter(a=>TASKS.find(t=>t.id===a.task).answer===a.choice).length,hints:s.events.filter(e=>e.event==='hint-opened').length,elapsed_ms:s.answers.length?Math.max(...s.answers.map(a=>a.elapsed_ms)):0,measurements_are_unverified_client_records:true};}
export function forgetStudy(storage){storage.removeItem(STUDY_KEY);}
