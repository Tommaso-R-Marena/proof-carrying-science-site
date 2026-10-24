// Visual play uses the existing, unchanged finite checker and donation protocol.
import {COUNTERMODEL_VERSION, COUNTERMODEL_MISSIONS, countermodelMission, initialWorld, replayCountermodelSession} from './countermodel-core.mjs';
import {normalizeSearchSession, SEARCH_RULESET_SHA256, EVALUATION_MISSIONS} from './countermodel-learning.mjs';
import {exact, strictParse, shaText} from './omega-core.mjs';

export const WORLD_BUILDER_VERSION = 'world-builder/1';
export const MISSIONS = Object.freeze(['implication-flip','negation-drop','connective-swap','assumption-loss','quantifier-switch','quantifier-scope','variable-capture']);
export const NOTEBOOK_LIMIT = 20;
export const missionFor = id => {const m = countermodelMission(id); if (!m) throw Error('Unknown mission'); return m;};
export const newSession = mission_id => ({version:COUNTERMODEL_VERSION, mission_id:missionFor(mission_id).id, actions:[]});

export async function verifyRuleset() {
 const actual=await shaText(JSON.stringify(COUNTERMODEL_MISSIONS.map(({id,kind,left,right,a,b})=>({id,kind,left,right,a,b}))));
 if(actual!==SEARCH_RULESET_SHA256)throw Error('The finite ruleset changed; review its codec and labels before replay.');
 return actual;
}

export function sessionView(session) {
 exact(session, ['version','mission_id','actions']); missionFor(session.mission_id);
 if (session.version !== COUNTERMODEL_VERSION || !Array.isArray(session.actions) || session.actions.length > 120) throw Error('Invalid session');
 if (!session.actions.length) return {world:initialWorld(), checks:0, edits:0, hints:0, checked:null};
 // The original replay requires a check. An internal finite calculation can
 // reconstruct pre-check states, but is NEVER a recorded player observation.
 const hasCheck = session.actions.some(a => a?.type === 'check');
 const r = replayCountermodelSession(hasCheck ? session : {...session, actions:[...session.actions, {type:'check'}]});
 return {world:r.final_world, checks:hasCheck?r.checks:0, edits:r.edits, hints:r.hints,
   checked:session.actions.at(-1).type === 'check' ? r : null};
}

export function addAction(session, action) {
 if (session.actions.length >= (action?.type === 'check' ? 120 : 119)) throw Error('This round is full. Check it, then start a new round.');
 const next = {...session, actions:[...session.actions, structuredClone(action)]};
 sessionView(next); return next;
}

export function checkedSession(session) {
 if (!session.actions.some(a=>a.type==='check')) throw Error('Test a world before saving this round.');
 return normalizeSearchSession(session).session;
}
export function collectSession(saved, session) {
 if (!Array.isArray(saved) || saved.length > NOTEBOOK_LIMIT) throw Error('Notebook limit exceeded');
 const normalized = checkedSession(session), key = JSON.stringify(normalized);
 if (saved.some(s => JSON.stringify(checkedSession(s)) === key)) return structuredClone(saved);
 if (saved.length === NOTEBOOK_LIMIT) throw Error('Notebook full. Download it, then clear it to keep new rounds.');
 return [...structuredClone(saved), normalized];
}

export function notebook(saved) {
 const sessions = saved.reduce((out,s)=>collectSession(out,s), []);
 return {format:'pcs-world-builder-notebook-v1', ui_version:WORLD_BUILDER_VERSION,
   ruleset_sha256:SEARCH_RULESET_SHA256, sessions};
}
export function readNotebook(raw) {
 const n = strictParse(raw, 131072);
 exact(n, ['format','ui_version','ruleset_sha256','sessions']);
 if (n.format !== 'pcs-world-builder-notebook-v1' || n.ui_version !== WORLD_BUILDER_VERSION || n.ruleset_sha256 !== SEARCH_RULESET_SHA256 ||
     !Array.isArray(n.sessions) || !n.sessions.length || n.sessions.length > NOTEBOOK_LIMIT) throw Error('Unsupported or empty notebook');
 return notebook(n.sessions);
}

export async function analyzeNotebook(n) {
 await verifyRuleset();
 const checked = readNotebook(JSON.stringify(n)), rows = [], episodes = [];
 for (const session of checked.sessions) {
   const replay = replayCountermodelSession(session);
   const split = replay.hints ? 'assisted_excluded' : EVALUATION_MISSIONS.includes(session.mission_id) ? 'evaluation' : 'training';
   let observed = null;
   for (const step of replay.steps) {
     rows.push({episode:episodes.length, index:step.index, split,
       input:{mission_id:session.mission_id, world:step.state_before,
         previous_check:structuredClone(observed), assistance_seen:step.assisted_before_action},
       chosen_action:step.action,
       // Derived outcome labels are deliberately separate from pre-action inputs.
       outcome:{world:step.world, source_true:step.source_true, proposal_true:step.proposal_true,
         counterexample:step.counterexample, checker_response_seen:step.received_checker_response}});
     if (step.received_checker_response) observed = {world:step.world, source_true:step.source_true,
       proposal_true:step.proposal_true, counterexample:step.counterexample};
   }
   episodes.push({mission_id:session.mission_id, split, actions:session.actions.length,
     checks:replay.checks, failed_checks:replay.steps.filter(s=>s.received_checker_response&&!s.counterexample).length,
     solved:replay.final_verified, hints:replay.hints});
 }
 return {format:'pcs-world-builder-analysis-v1', ruleset_sha256:SEARCH_RULESET_SHA256, episodes, rows,
   participant_provenance:'UNVERIFIED; files and consent cannot prove human authorship',
   purpose:'Search strategy and failure analysis; observed choices are not optimal-action labels',
   kernel_checked:false, pcs_authoritative:false,
   limitations:['Seven public missions; no blind benchmark or generalization claim',
     'Assisted episodes excluded from training and evaluation',
     'Unsolved rounds retained; final checked successes are still subject to selection bias',
     'Browser replay is not authentication, server acceptance or Lean execution']};
}
