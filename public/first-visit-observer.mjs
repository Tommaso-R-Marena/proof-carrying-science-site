// Only a small allowlist of coarse UI events is observed, after explicit study
// consent. Never reads file inputs, free text, names, IDs, facts or game traces.
import {recordEvent} from './first-visit-study-core.mjs';
const record=name=>{try{recordEvent(localStorage,name);}catch{/* Storage can be disabled. */}};
const clicks={scienceCheck:'example-checked',scienceReport:'example-report-saved',scienceReplay:'example-replay-saved',minuteCheck:'example-checked',minuteReport:'example-report-saved',minuteReplay:'example-replay-saved',modelRun:'model-run',modelBaseline:'model-run',wbCheck:'world-tested',questCheck:'quest-checked',forgeVerify:'forge-checked',gameGuideStart:'help-opened',wbHint:'help-opened',questHint:'help-opened',forgeHint:'help-opened'};
document.addEventListener('click',e=>{if(!e.isTrusted)return;const button=e.target.closest('button');if(!button||button.disabled)return;if(clicks[button.id])record(clicks[button.id]);if(button.closest('#forgeActionCards'))record('forge-action');});
const markers=[['#wbWin','world-difference'],['#questNext','quest-completed'],['#forgeVictoryNext','forge-repaired']];
const status=[['#scienceRecheckStatus','example-rechecked','Recheck complete:'],['#minuteRecheckStatus','example-rechecked','Recheck complete:'],['#modelReplayStatus','model-rechecked','Recheck complete.']];
const last=new Map();
const observer=new MutationObserver(()=>{
 for(const [sel,event] of markers){const el=document.querySelector(sel),visible=Boolean(el&&!el.hidden&&el.getClientRects().length);if(visible&&!last.get(sel))record(event);last.set(sel,visible);}
 for(const [sel,event,prefix] of status){const text=document.querySelector(sel)?.textContent||'';if(text.startsWith(prefix)&&text!==last.get(sel))record(event);last.set(sel,text);}
});observer.observe(document.querySelector('main'),{subtree:true,attributes:true,attributeFilter:['hidden'],childList:true,characterData:true});
