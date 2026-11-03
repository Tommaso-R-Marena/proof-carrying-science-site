// Explicit opt-in usability records, never proof/search training examples.
export const STUDY_KEY='pcs-first-visit-study-v1';
export const EVENTS=Object.freeze(['example-checked','example-report-saved','example-replay-saved','example-rechecked','model-run','model-rechecked','world-tested','world-difference','quest-checked','quest-completed','forge-action','forge-checked','forge-repaired','help-opened']);
export const TASKS=Object.freeze([
 {id:'purpose',title:'Understand PCS',instruction:'Open Start here. Spend about a minute exploring it, then return. What does PCS help you do?',href:'experience.html',choices:['Check a specific claim and keep evidence someone else can recheck.','Establish that every AI system is safe.','Automatically decide whether a whole study is true.'],answer:0},
 {id:'result',title:'Check, save and recheck',instruction:'Use the example lists on Start here. Check them, save the report and replay, then reopen the replay. What did the check establish?',href:'experience.html#minuteExamplePanel',choices:['Sam’s ID occurs in both lists.','The people and names have been independently verified.','The two groups are scientifically valid.'],answer:0},
 {id:'model',title:'Watch the actual model',instruction:'Open the model walkthrough. Run the permission example and compare with the original edit order. What makes a suggested repair pass?',href:'model-walkthrough.html',choices:['Its model score is high.','It matches the intended formula in all the registered small worlds.','It has been proved safe for any real AI.'],answer:1},
 {id:'world',title:'Try World Builder',instruction:'Open World Builder. Try to make the two rules disagree in the first puzzle. What is the purpose of finding that difference?',href:'world-builder.html',choices:['It shows that the rewrite changed the rule’s meaning.','It proves a real bot was unsafe.','It guarantees all possible rewrites are wrong.'],answer:0},
 {id:'quest',title:'Try Proof Quest',instruction:'Open Proof Quest. Try to complete the first bridge puzzle. What is a working order?',href:'arena-proof-quest.html',choices:['The cards are in alphabetical order.','Every step comes after the steps it needs.','Any order wins after enough clicks.'],answer:1},
 {id:'forge',title:'Try Safety Forge',instruction:'Open Safety Forge. Try actions, then try a repair. What does a passing repair need to do?',href:'arena-safety-forge.html?seed=197',choices:['Prevent failures and still allow a successful mission in the game.','Stop the bot from doing anything.','Prove real AI alignment.'],answer:0}
]);
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join('|')===[...keys].sort().join('|');
const time=x=>Number.isSafeInteger(x)&&x>=0&&x<=86400000;
export function validateSession(s){
 if(!exact(s,['format','session_id','consent','participant_kind','started_at','events','answers','human_origin_verified','timing_trusted'])||s.format!=='pcs-first-visit-study-v1'||!/^[-a-f0-9]{36}$/.test(s.session_id)||s.consent!==true||!['unverified-volunteer','automated'].includes(s.participant_kind)||!Number.isSafeInteger(s.started_at)||s.started_at<0||s.human_origin_verified!==false||s.timing_trusted!==false||!Array.isArray(s.events)||s.events.length>300||!Array.isArray(s.answers)||s.answers.length>TASKS.length)throw Error('Malformed practice record.');
 for(const e of s.events)if(!exact(e,['event','elapsed_ms'])||!EVENTS.includes(e.event)||!time(e.elapsed_ms))throw Error('Malformed practice event.');
 const seen=new Set();for(const a of s.answers){const t=TASKS.find(t=>t.id===a.task);if(!exact(a,['task','choice','completed','clarity','enjoyment','elapsed_ms'])||!t||seen.has(a.task)||!Number.isInteger(a.choice)||a.choice<0||a.choice>=t.choices.length||typeof a.completed!=='boolean'||![1,2,3,4,5].includes(a.clarity)||![null,1,2,3,4,5].includes(a.enjoyment)||!time(a.elapsed_ms))throw Error('Malformed practice answer.');seen.add(a.task);}return s;
}
export function readSession(storage){try{const raw=storage.getItem(STUDY_KEY);if(!raw||raw.length>65536)return null;return validateSession(JSON.parse(raw));}catch{return null;}}
export function startSession(storage,kind='unverified-volunteer',now=Date.now(),id=crypto.randomUUID()){
 if(storage.getItem(STUDY_KEY)!==null)throw Error('Download or erase the existing practice record before starting again.');
 const s=validateSession({format:'pcs-first-visit-study-v1',session_id:id,consent:true,participant_kind:kind,started_at:now,events:[],answers:[],human_origin_verified:false,timing_trusted:false});storage.setItem(STUDY_KEY,JSON.stringify(s));return s;
}
const elapsed=(s,now)=>Math.max(0,Math.min(86400000,Math.floor(now-s.started_at)));
export function recordEvent(storage,event,now=Date.now()){const s=readSession(storage);if(!s||!EVENTS.includes(event)||s.events.length>=300)return false;s.events.push({event,elapsed_ms:elapsed(s,now)});storage.setItem(STUDY_KEY,JSON.stringify(s));return true;}
export function answer(storage,task,choice,completed,clarity,enjoyment,now=Date.now()){
 const s=readSession(storage);if(!s)throw Error('Start the optional session first.');if(s.answers.some(a=>a.task===task))throw Error('This task already has an answer.');s.answers.push({task,choice,completed,clarity,enjoyment,elapsed_ms:elapsed(s,now)});validateSession(s);storage.setItem(STUDY_KEY,JSON.stringify(s));return s;
}
export function summarizeSession(s){validateSession(s);return {participant_kind:s.participant_kind,human_participants_verified:0,answers:s.answers.length,correct:s.answers.filter(a=>TASKS.find(t=>t.id===a.task).answer===a.choice).length,self_reported_completed:s.answers.filter(a=>a.completed).length,clarity_ratings:s.answers.map(a=>({task:a.task,clarity:a.clarity,enjoyment:a.enjoyment})),unverified_client_timing:true,not_model_training_data:true};}
export function eraseSession(storage){storage.removeItem(STUDY_KEY);}
