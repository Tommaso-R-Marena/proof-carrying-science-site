import {strictParse} from './omega-core.mjs';
import {replayCountermodelSession} from './countermodel-core.mjs';
export const SEARCH_RESEARCH_FORMAT='pcs-countermodel-search-optin-v2';
export const SEARCH_RESEARCH_CONSENT='pcs-countermodel-search-adult-optin-v2';
export function normalizeResearchSession(session){
 const replay=replayCountermodelSession(session);
 const normalized={version:session.version,mission_id:session.mission_id,actions:replay.steps.map(s=>{
  const a=s.action;return a.type==='toggle'?{type:a.type,p:a.p,i:a.i}:a.type==='toggle_relation'?{type:a.type,i:a.i,j:a.j}:{type:a.type};
 })};
 return {session:normalized,replay:replayCountermodelSession(normalized)};
}
export function validateSearchResearch(doc){
 const keys=['format','consent_version','entries','next_offset','privacy','limitations'];
 if(!doc||typeof doc!=='object'||Array.isArray(doc)||Object.keys(doc).some(k=>!keys.includes(k))||doc.format!==SEARCH_RESEARCH_FORMAT||doc.consent_version!==SEARCH_RESEARCH_CONSENT||!Array.isArray(doc.entries)||doc.entries.length>200)throw Error('Unsupported search research export');
 if(doc.next_offset!==null&&(!Number.isInteger(doc.next_offset)||doc.next_offset<0||doc.next_offset>999999))throw Error('Invalid bounded research offset');
 const entries=[],seen=new Set();
 for(const e of doc.entries){
  if(!e||Object.keys(e).sort().join(',')!=='replay,session')throw Error('Unexpected personal or derived fields');
  const n=normalizeResearchSession(e.session);
  if(JSON.stringify(n.replay)!==JSON.stringify(e.replay))throw Error('Research replay mismatch');
  const key=JSON.stringify(n.session);if(!seen.has(key)){seen.add(key);entries.push(n);}
 }
 return entries;
}
export async function collectSearchResearch(fetchPage,{startOffset=0,pageBudget=1}={}){
 if(!Number.isInteger(startOffset)||startOffset<0||startOffset>999999||!Number.isInteger(pageBudget)||pageBudget<1||pageBudget>10)throw Error('Invalid bounded export batch');
 let entries=[],metadata;
 for(let page=0;page<pageBudget;page++){
  const offset=startOffset+page*20,p=await fetchPage(offset);if(p?.entries?.length>20)throw Error('Oversized research page');validateSearchResearch(p);metadata??=p;entries.push(...p.entries);
  if(p.next_offset!==null&&(p.entries.length!==20||p.next_offset!==offset+20))throw Error('Invalid research cursor');
  if(p.next_offset===null||page===pageBudget-1){const out={...metadata,entries,next_offset:p.next_offset};validateSearchResearch(out);return out;}
 }
 throw Error('Research pagination exceeded its bound');
}

// Parse each bounded replay separately. A valid 20-round export can exceed the
// shared parser's 30,000-node document budget; that budget stays unchanged.
export function readSearchResearch(raw){
 if(typeof raw!=='string'||new TextEncoder().encode(raw).length>8*1024*1024)throw Error('Research export exceeds 8 MiB; use a smaller batch');
 const preliminary=JSON.parse(raw);
 if(!Array.isArray(preliminary?.entries)||preliminary.entries.length>200)throw Error('Invalid bounded research entries');
 const replacements=[],parsed=[];let depth=0;
 const skipString=start=>{let i=start+1;for(;i<raw.length;i++){if(raw[i]==='\\'){i++;continue;}if(raw[i]==='"')return i+1;}throw Error('Unterminated string');};
 const whitespace=i=>{while(/[\t\r\n ]/.test(raw[i]||'X'))i++;return i;};
 for(let i=0;i<raw.length;i++){
  const c=raw[i];
  if(c==='"'){
   const end=skipString(i),colon=whitespace(end);
   if(depth===1&&raw[colon]===':'&&JSON.parse(raw.slice(i,end))==='entries'){
    const begin=whitespace(colon+1);if(raw[begin]!=='[')throw Error('Entries must be an array');
    let d=1,left=begin+1,j=left;
    for(;j<raw.length;j++){
     const t=raw[j];if(t==='"'){j=skipString(j)-1;continue;}
     if(t==='['||t==='{')d++;
     else if(t===']'||t==='}'){
      d--;if(d===0){if(raw.slice(left,j).trim())parsed.push(strictParse(raw.slice(left,j),1024*1024));break;}
     }else if(t===','&&d===1){parsed.push(strictParse(raw.slice(left,j),1024*1024));left=j+1;}
     if(parsed.length>200)throw Error('Too many bounded entries');
    }
    replacements.push({begin,end:j+1});i=j;continue;
   }
   i=end-1;continue;
  }
  if(c==='{'||c==='[')depth++;else if(c==='}'||c===']')depth--;
 }
 let skeleton=raw;for(const r of replacements.reverse())skeleton=skeleton.slice(0,r.begin)+'[]'+skeleton.slice(r.end);
 const doc=strictParse(skeleton,8*1024*1024);doc.entries=parsed;validateSearchResearch(doc);return doc;
}
