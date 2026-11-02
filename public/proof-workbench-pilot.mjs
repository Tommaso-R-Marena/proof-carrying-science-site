export function pilotStorage(){try{return globalThis.sessionStorage||null;}catch{return null;}}
export const PILOT_KEY='pcs-proof-workbench-pilot-v1';
export const PILOT_EVENTS=['claim-chosen','meaning-confirmed','public-request-submitted','recorded-result-opened','fresh-result-received','request-ended-without-result','service-interrupted','cancellation-requested','report-exported','evidence-exported','proof-exported','replay-instructions-opened'];
export const PILOT_TASKS=[
 {id:'meaning',question:'What does the mathematical proof establish?',options:['The displayed mathematical statement under its listed assumptions.','The real-world labels and data are automatically true.','The model will solve every similar problem.'],answer:0},
 {id:'publication',question:'What is submitted when you consent to a public proof job?',options:['Private context and study answers.','The exact mathematical statement, interpretation choice and selected strategy.','Every file on your device.'],answer:1},
 {id:'unknown',question:'A search ends unresolved. What follows?',options:['The statement is false.','The statement is true.','Neither truth nor falsity has been established by that search.'],answer:2},
 {id:'recorded',question:'You open the recorded example. What has run now?',options:['A fresh neural-model and Lean job.','A recorded result was loaded; no fresh proof job was run.','New model training.'],answer:1},
 {id:'replay',question:'What can the independent replay tool check?',options:['A model is always safe.','The sender is a verified human.','The exact encoded statement by regenerating approved proof commands and invoking Lean.'],answer:2}
];
const exact=(o,keys)=>o&&typeof o==='object'&&!Array.isArray(o)&&Object.keys(o).sort().join(',')===keys.slice().sort().join(',');
const caseId=value=>value===null||/^(combine|reuse|chain|insufficient|length|reverse|offset-[0-8]-[0-8])$/.test(value);
export function validatePilot(s){
 if(!exact(s,['format','session_id','participant_kind','experience','adult_consent','consent','started_at','events','answers','completion','human_origin_verified','timing_trusted'])||s.format!=='pcs-proof-workbench-pilot-v1'||!/^([a-f0-9-]{36})$/.test(s.session_id)||!['automated','unverified-volunteer'].includes(s.participant_kind)||!['none','some','undisclosed'].includes(s.experience)||s.consent!==true||s.adult_consent!==true||s.human_origin_verified!==false||s.timing_trusted!==false||!Number.isSafeInteger(s.started_at)||s.started_at<0||!Array.isArray(s.events)||s.events.length>300||!Array.isArray(s.answers)||s.answers.length>5||!['not-finished','completed','declined-publication','service-unavailable','unsupported-claim'].includes(s.completion))throw Error('Malformed pilot session');
 let last=0;for(const e of s.events){if(!exact(e,['event','case_id','elapsed_ms'])||!PILOT_EVENTS.includes(e.event)||!caseId(e.case_id)||!Number.isSafeInteger(e.elapsed_ms)||e.elapsed_ms<last||e.elapsed_ms>86400000)throw Error('Invalid bounded pilot event');last=e.elapsed_ms;}
 const seen=new Set();for(const a of s.answers){if(!exact(a,['task','choice','elapsed_ms'])||!PILOT_TASKS.some(t=>t.id===a.task)||seen.has(a.task)||!Number.isInteger(a.choice)||a.choice<0||a.choice>2||!Number.isSafeInteger(a.elapsed_ms)||a.elapsed_ms<0||a.elapsed_ms>86400000)throw Error('Invalid comprehension answer');seen.add(a.task);}
 return s;
}
export function readPilot(storage){try{const raw=storage.getItem(PILOT_KEY);return raw&&raw.length<=65536?validatePilot(JSON.parse(raw)):null;}catch{return null;}}
export function beginPilot(storage,{kind='unverified-volunteer',experience='undisclosed',adult=false,consent=false,now=Date.now(),id=crypto.randomUUID()}={}){
 if(!storage)throw Error('Local study storage is unavailable');
 if(!adult||!consent)throw Error('Separate adult and study consent are required');if(storage.getItem(PILOT_KEY)!==null)throw Error('Export or erase your existing session first');
 const s=validatePilot({format:'pcs-proof-workbench-pilot-v1',session_id:id,participant_kind:kind,experience,adult_consent:true,consent:true,started_at:now,events:[],answers:[],completion:'not-finished',human_origin_verified:false,timing_trusted:false});storage.setItem(PILOT_KEY,JSON.stringify(s));return s;
}
export function recordPilotEvent(storage,event,case_id=null,now=Date.now()){
 const s=readPilot(storage);if(!s||s.events.length>=300)return false;
 s.events.push({event,case_id,elapsed_ms:Math.max(s.events.at(-1)?.elapsed_ms||0,Math.max(0,now-s.started_at))});validatePilot(s);storage.setItem(PILOT_KEY,JSON.stringify(s));return true;
}
export function answerPilot(storage,task,choice,now=Date.now()){
 const s=readPilot(storage);if(!s)throw Error('Start the optional study first');if(s.answers.some(a=>a.task===task))throw Error('This answer is already recorded');s.answers.push({task,choice,elapsed_ms:Math.max(0,now-s.started_at)});validatePilot(s);storage.setItem(PILOT_KEY,JSON.stringify(s));return s;
}
export function finishPilot(storage,completion){const s=readPilot(storage);if(!s)throw Error('No study session');s.completion=completion;validatePilot(s);storage.setItem(PILOT_KEY,JSON.stringify(s));return s;}
export function pilotSummary(s){validatePilot(s);return {participant_kind:s.participant_kind,completion:s.completion,answers:s.answers.length,correct:s.answers.filter(a=>PILOT_TASKS.find(t=>t.id===a.task).answer===a.choice).length,recorded_example_used:s.events.some(e=>e.event==='recorded-result-opened'),fresh_result_received:s.events.some(e=>e.event==='fresh-result-received'),report_exported:s.events.some(e=>e.event==='report-exported'),human_identities_verified:0,client_records_are_untrusted:true};}
export function erasePilot(storage){storage.removeItem(PILOT_KEY);}
