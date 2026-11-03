import {canonical,utf8,sha256,parseCSV,toBase64,fromBase64,escapeHTML,LIMITS} from './file-check-core.mjs';
export const EVALUATION_SCOPE='original-csv-model-evaluation-v1';
export const DEFAULT_PROVENANCE=Object.freeze({baseline_name:'Earlier version',candidate_name:'New version',baseline_weights_sha256:null,candidate_weights_sha256:null,reference_note:'Supplied reference labels or required outcomes.',source_note:''});
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&canonical(Object.keys(v).sort())===canonical([...keys].sort());
export function validateProvenance(v){
 if(!exact(v,Object.keys(DEFAULT_PROVENANCE)))throw Error('Unsupported evaluation provenance.');
 for(const k of ['baseline_name','candidate_name','reference_note','source_note'])if(typeof v[k]!=='string'||v[k].length>(k.endsWith('_name')?80:500))throw Error('Keep model names and source notes short.');
 for(const k of ['baseline_weights_sha256','candidate_weights_sha256'])if(v[k]!==null&&(typeof v[k]!=='string'||!/^[a-f0-9]{64}$/.test(v[k])))throw Error('Use a SHA-256 digest or leave the weight identity empty.');return v;
}
export function evaluateTables(tables,columns){
 if(!Array.isArray(tables)||tables.length!==3||!Array.isArray(columns)||columns.length!==3||columns.some(p=>!Array.isArray(p)||p.length!==2||p.some(i=>!Number.isSafeInteger(i))||p[0]===p[1]))throw Error('Choose distinct ID and outcome columns in all three files.');
 const maps=tables.map((t,n)=>{const p=columns[n];if(t.rows.length>1000||p.some(i=>i<0||i>=t.header.length))throw Error('Evaluation supports 1,000 rows per file and valid columns.');const map=new Map();for(const r of t.rows){const id=r[p[0]];if(/^[ \t\r\n\v\f]*$/.test(id)||utf8(id).length>256||map.has(id))throw Error('Every evaluation ID must be nonempty and unique.');map.set(id,r[p[1]]);}return map;});
 if(maps.some(m=>m.size!==maps[0].size||[...maps[0].keys()].some(id=>!m.has(id))))throw Error('All three files must contain exactly the same IDs. Missing or extra predictions cannot be ignored.');
 const cases=tables[0].rows.map(r=>({id:r[columns[0][0]],expected:r[columns[0][1]],before:maps[1].get(r[columns[0][0]]),after:maps[2].get(r[columns[0][0]])}));
 const summary={total:cases.length,before_matches:0,after_matches:0,improvements:0,regressions:0};
 for(const c of cases){const b=c.before===c.expected,a=c.after===c.expected;summary.before_matches+=Number(b);summary.after_matches+=Number(a);summary.improvements+=Number(!b&&a);summary.regressions+=Number(b&&!a);}
 return {scope:EVALUATION_SCOPE,summary,preserved:summary.regressions===0,cases};
}
export async function evaluationDocument(inputs,columns,provenance,result,receipt=null,includeFiles=false){
 validateProvenance(provenance);
 return {format:'pcs-model-evaluation-replay-v1',scope:EVALUATION_SCOPE,columns:inputs.map((e,i)=>columns[i].map(index=>({header:e.table.header[index],index}))),provenance:structuredClone(provenance),
  inputs:inputs.map(e=>({name:e.name,sha256:e.sha256,bytes:e.bytes.length,data_base64:includeFiles?toBase64(e.bytes):null})),summary:structuredClone(result.summary),preserved:result.preserved,local_receipt:receipt};
}
export function parseEvaluationDocument(bytes){
 if(bytes.length>9_000_000)throw Error('Evaluation replay exceeds 9 MB.');const raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes),v=JSON.parse(raw);
 if(raw!==canonical(v)+'\n'||!exact(v,['format','scope','columns','provenance','inputs','summary','preserved','local_receipt'])||v.format!=='pcs-model-evaluation-replay-v1'||v.scope!==EVALUATION_SCOPE)throw Error('Choose an unmodified canonical evaluation replay.');
 validateProvenance(v.provenance);
 if(!Array.isArray(v.inputs)||v.inputs.length!==3||v.inputs.some(x=>!exact(x,['name','sha256','bytes','data_base64'])||typeof x.name!=='string'||x.name.length>255||!/^[0-9a-f]{64}$/.test(x.sha256)||!Number.isSafeInteger(x.bytes)||x.bytes<1||x.bytes>LIMITS.bytes||(x.data_base64!==null&&typeof x.data_base64!=='string'))||!Array.isArray(v.columns)||v.columns.length!==3||v.columns.some(p=>!Array.isArray(p)||p.length!==2||p.some(x=>!exact(x,['header','index'])||typeof x.header!=='string'||!x.header||utf8(x.header).length>1024||!Number.isSafeInteger(x.index)||x.index<0||x.index>=128)))throw Error('Malformed evaluation inputs or columns.');
 if(!exact(v.summary,['total','before_matches','after_matches','improvements','regressions'])||Object.values(v.summary).some(n=>!Number.isSafeInteger(n)||n<0||n>1000)||typeof v.preserved!=='boolean'||(v.local_receipt!==null&&(typeof v.local_receipt!=='object'||Array.isArray(v.local_receipt)||canonical(v.local_receipt).length>16384)))throw Error('Malformed evaluation counts or recorded receipt.');
 return v;
}
export async function replayEvaluation(bytes){
 const doc=parseEvaluationDocument(bytes),inputs=[];
 for(const x of doc.inputs){if(x.data_base64===null)throw Error('This replay needs its three original CSV files.');const raw=fromBase64(x.data_base64);if(raw.length!==x.bytes||await sha256(raw)!==x.sha256)throw Error('Embedded evaluation file changed.');inputs.push({name:x.name,bytes:raw,sha256:x.sha256,table:parseCSV(raw)});}
 const columns=inputs.map((e,i)=>doc.columns[i].map(x=>{if(e.table.header[x.index]!==x.header)throw Error('A selected evaluation column changed.');return x.index;})),result=evaluateTables(inputs.map(e=>e.table),columns);
 if(canonical(result.summary)!==canonical(doc.summary)||result.preserved!==doc.preserved)throw Error('The recorded evaluation disagrees with a fresh calculation.');
 return {doc,inputs,columns,result};
}
export function evaluationReport(result,inputs,provenance,receipt,includeValues=false){
 const e=escapeHTML,s=result.summary;
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src &#39;none&#39;; style-src &#39;unsafe-inline&#39;; base-uri &#39;none&#39;"><title>PCS model output comparison</title><style>body{font:18px system-ui;max-width:900px;margin:24px auto;padding:20px;line-height:1.6;overflow-wrap:anywhere}td,th{padding:8px;border:1px solid #ccd}table{border-collapse:collapse;width:100%}</style><h1>Model output comparison</h1><h2>'+e(result.preserved?'No earlier reference matches were lost':'Earlier reference matches were lost')+'</h2><p>Earlier: '+s.before_matches+'/'+s.total+' matches. New: '+s.after_matches+'/'+s.total+'. Gains: '+s.improvements+'. Regressions: '+s.regressions+'.</p><p>'+(receipt?'The pinned native Lean checker agreed on all three original CSVs, selected columns and counts.':'Browser calculation. No fresh native Lean check ran.')+'</p><p>An aggregate gain can still lose earlier successes. The preservation check requires zero regressions in this exact dataset.</p><h2>Provided provenance</h2><pre>'+e(canonical(provenance))+'</pre>'+inputs.map((x,i)=>'<p>'+['Reference','Earlier outputs','New outputs'][i]+' SHA-256: '+e(x.sha256)+'</p>').join('')+(includeValues?'<table><tr><th>ID</th><th>Reference</th><th>Earlier</th><th>New</th></tr>'+result.cases.map(c=>'<tr>'+['id','expected','before','after'].map(k=>'<td>'+e(c[k])+'</td>').join('')+'</tr>').join('')+'</table>':'<p>Row IDs, labels and outputs omitted.</p>')+'<p>Supplied labels, dataset selection, claimed model identity and physical generation require separate evidence. These finite counts do not establish held-out generalization, scientific validity or universal AI safety. This unsigned report needs independent replay from the exact original files. Compilation and host execution remain assumptions.</p></html>';
}
