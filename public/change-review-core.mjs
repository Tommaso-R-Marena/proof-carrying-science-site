import {LIMITS,canonical,utf8,hex,idsFor,escapeHTML} from './file-check-core.mjs';
export const REVIEW_SCOPE='original-csv-change-review-v2';
export const DEFAULT_RULES=Object.freeze({allow_added:true,allow_removed:false,allow_changed:false});
const exact=(v,keys)=>v&&typeof v==='object'&&!Array.isArray(v)&&canonical(Object.keys(v).sort())===canonical([...keys].sort());
export function rulesOK(r){if(!exact(r,['allow_added','allow_removed','allow_changed'])||Object.values(r).some(v=>typeof v!=='boolean'))throw Error('Choose the three record-change rules.');return r;}
const order=xs=>[...xs].sort((a,b)=>hex(a)<hex(b)?-1:hex(a)>hex(b)?1:0);
export function sharedHeaders(old,newer,columns){return old.header.filter((h,i)=>i!==columns[0]&&newer.header.includes(h)&&newer.header.indexOf(h)!==columns[1]);}
export function reviewChanges(old,newer,columns,headers,rules){
 rulesOK(rules);if(!Array.isArray(columns)||columns.length!==2)throw Error('Choose both ID columns.');
 const a=idsFor(old,columns[0]).ids,b=idsFor(newer,columns[1]).ids;
 if([...a.values(),...b.values()].some(lines=>lines.length!==1))throw Error('Change review needs one row per ID. Fix repeated IDs before comparing; use Check my files to find overlaps.');
 if(!Array.isArray(headers)||headers.length>127||headers.some(h=>typeof h!=='string'||utf8(h).length>1024)||new Set(headers).size!==headers.length)throw Error('Choose distinct columns to compare.');
 const pairs=headers.map(h=>{const p=[old.header.indexOf(h),newer.header.indexOf(h)];if(p.some((n,i)=>n<0||n===columns[i]))throw Error('A compared heading is missing or is an ID column. Choose other shared columns.');return p;});
 const left=new Map(old.rows.map((row,i)=>[row[columns[0]],{row,line:old.lines[i]}])),right=new Map(newer.rows.map((row,i)=>[row[columns[1]],{row,line:newer.lines[i]}]));
 const added=order([...right.keys()].filter(k=>!left.has(k))).map(id=>({id,line:right.get(id).line}));
 const removed=order([...left.keys()].filter(k=>!right.has(k))).map(id=>({id,line:left.get(id).line}));
 const shared=order([...left.keys()].filter(k=>right.has(k))),changed=[];
 for(const id of shared){const x=left.get(id),y=right.get(id);const differences=headers.flatMap((column,i)=>x.row[pairs[i][0]]!==y.row[pairs[i][1]]?[{column,before:x.row[pairs[i][0]],after:y.row[pairs[i][1]]}]:[]);if(differences.length)changed.push({id,before_line:x.line,after_line:y.line,differences});}
 const summary={old_rows:old.rows.length,new_rows:newer.rows.length,added:added.length,removed:removed.length,changed:changed.length,same:shared.length-changed.length,compared_columns:headers.length};
 const accepted=['added','removed','changed'].every(k=>rules['allow_'+k]||summary[k]===0);
 const an=new Set(old.header.filter((_,i)=>i!==columns[0])),bn=new Set(newer.header.filter((_,i)=>i!==columns[1]));
 return {scope:REVIEW_SCOPE,summary,accepted,added,removed,changed,columns_added:order([...bn].filter(x=>!an.has(x))),columns_removed:order([...an].filter(x=>!bn.has(x))),pairs};
}
export function reviewSummary(s){if(!exact(s,['old_rows','new_rows','added','removed','changed','same','compared_columns'])||Object.values(s).some(n=>!Number.isSafeInteger(n)||n<0||n>LIMITS.rows)||s.compared_columns>127)throw Error('The recorded change counts are malformed.');return s;}
export function reviewRecipe(r){
 if(!exact(r,['format','scope','name','columns','compare_headers','rules','previous'])||r.format!=='pcs-change-recipe-v2'||r.scope!==REVIEW_SCOPE||typeof r.name!=='string'||!r.name.trim()||r.name.length>80||!Array.isArray(r.columns)||r.columns.length!==2||r.columns.some(x=>!exact(x,['header','index'])||typeof x.header!=='string'||!x.header||utf8(x.header).length>1024||!Number.isSafeInteger(x.index)||x.index<0||x.index>=128)||!Array.isArray(r.compare_headers)||r.compare_headers.length>127||r.compare_headers.some(h=>typeof h!=='string'||utf8(h).length>1024)||new Set(r.compare_headers).size!==r.compare_headers.length)throw Error('Choose a supported saved change review.');
 rulesOK(r.rules);if(r.previous!==null){if(!exact(r.previous,['summary','sha256','checked_at'])||!Array.isArray(r.previous.sha256)||r.previous.sha256.length!==2||r.previous.sha256.some(x=>!/^[a-f0-9]{64}$/.test(x))||typeof r.previous.checked_at!=='string'||r.previous.checked_at.length>50)throw Error('Malformed previous review.');reviewSummary(r.previous.summary);}return r;
}
export function parseReviewDocument(bytes){
 if(bytes.length>2*LIMITS.bytes*2+65536)throw Error('This review file is too large.');let raw,v;try{raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);v=JSON.parse(raw);}catch{throw Error('Choose a change-review JSON file.');}
 if(raw!==canonical(v)+'\n')throw Error('The review file is not canonical. It may have been edited.');
 if(v.format==='pcs-change-recipe-v2')return {kind:'recipe',value:reviewRecipe(v)};
 if(!exact(v,['format','recipe','inputs','summary','accepted','local_receipt'])||v.format!=='pcs-change-replay-v2'||typeof v.accepted!=='boolean')throw Error('Unknown review format or unexpected fields.');reviewRecipe(v.recipe);reviewSummary(v.summary);
 if(!Array.isArray(v.inputs)||v.inputs.length!==2||v.inputs.some(x=>!exact(x,['name','sha256','bytes','data_base64'])||typeof x.name!=='string'||x.name.length>255||!/^[a-f0-9]{64}$/.test(x.sha256)||!Number.isSafeInteger(x.bytes)||x.bytes<1||x.bytes>LIMITS.bytes||(x.data_base64!==null&&typeof x.data_base64!=='string')))throw Error('Malformed input identities.');
 if(v.local_receipt!==null&&(typeof v.local_receipt!=='object'||Array.isArray(v.local_receipt)||canonical(v.local_receipt).length>8192))throw Error('Malformed recorded receipt.');return {kind:'replay',value:v};
}
export function decodedImage(table){return {header:table.header.map(hex),rows:table.rows.map(row=>row.map(hex)),lines:table.lines};}
export function changeReport({name,result,inputs,headers,rules,localReceipt,includeValues=false}){
 const e=escapeHTML,s=result.summary,rows=[];
 for(const x of result.added)rows.push(`<tr><td>Added</td><td>${includeValues?e(x.id):'ID omitted'}</td><td>New file line ${x.line}</td><td></td></tr>`);
 for(const x of result.removed)rows.push(`<tr><td>Removed</td><td>${includeValues?e(x.id):'ID omitted'}</td><td>Previous file line ${x.line}</td><td></td></tr>`);
 for(const x of result.changed)for(const d of x.differences)rows.push(`<tr><td>Edited</td><td>${includeValues?e(x.id):'ID omitted'}</td><td>Previous line ${x.before_line}, new line ${x.after_line}</td><td>${e(d.column)}: ${includeValues?e(d.before)+' → '+e(d.after):'values omitted'}</td></tr>`);
 return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>PCS change review</title><style>body{font:17px system-ui;max-width:900px;margin:40px auto;padding:20px;color:#173447}table{border-collapse:collapse;width:100%}td,th{border:1px solid #ccc;padding:8px;text-align:left;overflow-wrap:anywhere}code{overflow-wrap:anywhere}</style>'+`<h1>${e(name)}</h1><h2>${result.accepted?'Selected rules met':'Changes need review'}</h2><p>${s.added} added; ${s.removed} removed; ${s.changed} edited; ${s.same} unchanged in compared columns.</p><p>${localReceipt?'Lean decoded and checked the original CSV snapshots.':'Browser calculation. No local Lean confirmation was performed.'}</p><p>Compared columns: ${headers.length?headers.map(e).join(', '):'none; record edits were not checked'}. IDs and values compare exactly. A change is not inherently an error or an improvement.</p><p>Rules: ${['added','removed','changed'].map(k=>`${k} records ${rules['allow_'+k]?'allowed':'flagged'}`).join('; ')}.</p><p>Uncompared schema changes: added ${result.columns_added.map(e).join(', ')||'none'}; removed ${result.columns_removed.map(e).join(', ')||'none'}.</p>${inputs.map(x=>`<p>${e(x.name)} · SHA-256 <code>${e(x.sha256)}</code></p>`).join('')}<table><tr><th>Change</th><th>ID</th><th>Original lines</th><th>Compared value</th></tr>${rows.join('')||'<tr><td colspan="4">No added, removed or edited records in this scope.</td></tr>'}</table><p>Replay with the original files or an explicitly embedded replay. Imported receipts and this unsigned report cannot grant a fresh confirmation. Compilation and host execution remain assumptions. This is not scientific acceptance.</p></html>`;
}
