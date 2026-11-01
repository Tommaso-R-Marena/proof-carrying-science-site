// Local, bounded CSV analysis. A browser calculation never grants Lean authority.
export const LIMITS = Object.freeze({bytes:2097152, rows:5000, columns:128, idBytes:256});
export const SCOPE = 'exact-utf8-id-overlap-v1';
const enc = new TextEncoder();
export const utf8 = text => enc.encode(text);
const trimID = text => text.replace(/^[\t\n\v\f\r ]+|[\t\n\v\f\r ]+$/g,'');
export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',') + '}';
}
export async function sha256(bytes) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export const hex = text => [...utf8(text)].map(n=>n.toString(16).padStart(2,'0')).join('');
export function parseCSV(bytes) {
  if (!(bytes instanceof Uint8Array) || !bytes.length || bytes.length>LIMITS.bytes) throw Error('Choose a nonempty CSV file smaller than 2 MB.');
  let text; try {text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);} catch {throw Error('Save this file as CSV UTF-8, then choose it again.');}
  if (text.includes('\0')) throw Error('This file contains a NUL character. Export a fresh CSV UTF-8 file.');
  const records=[], lines=[]; let row=[],field='',quoted=false,closed=false,start=1,line=1,active=false;
  const finishField=()=>{row.push(field);field='';closed=false;if(row.length>LIMITS.columns)throw Error('Use a CSV with at most 128 columns.');};
  const finishRow=()=>{finishField();records.push(row);lines.push(start);row=[];active=false;if(records.length>LIMITS.rows+1)throw Error('This version supports up to 5,000 data rows per file.');};
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) {if(c==='"'){if(text[i+1]==='"'){field+='"';i++;}else{quoted=false;closed=true;}}else{if(c==='\r'&&text[i+1]!=='\n')throw Error('Use LF or CRLF line endings.');field+=c;if(c==='\n')line++;}continue;}
    if(c==='"'){if(field || closed)throw Error(`Unexpected quote near line ${line}. Export the file as CSV again.`);quoted=true;active=true;continue;}
    if(c===','){finishField();active=true;continue;}
    if(c==='\n'||c==='\r') {
      if(c==='\r'){if(text[i+1]!=='\n')throw Error(`Use LF or CRLF line endings (line ${line}).`);i++;}
      if(!active&&!row.length&&!field&&!closed)throw Error(`Blank record on line ${line}. Remove it and export a rectangular CSV.`);
      finishRow();line++;start=line;continue;
    }
    if(closed)throw Error(`Unexpected text after a closing quote near line ${line}.`);
    field+=c;active=true;
  }
  if(quoted)throw Error('A quoted field is not closed. Export the file as CSV again.');
  if(active || field || row.length || closed)finishRow();
  const header=records.shift();lines.shift();
  if(!header || header.some(h=>!trimID(h)||utf8(h).length>1024) || new Set(header).size!==header.length)throw Error('Give every column a nonempty, unique heading of up to 1,024 UTF-8 bytes in the first row.');
  if(!records.length)throw Error('This file has headings but no data rows.');
  for(let i=0;i<records.length;i++)if(records[i].length!==header.length)throw Error(`Line ${lines[i]} has ${records[i].length} fields; the heading has ${header.length}. Export a rectangular table.`);
  return {header,rows:records,lines};
}
export function idsFor(table,column) {
  if(!Number.isSafeInteger(column)||column<0||column>=table.header.length)throw Error('Choose the column that identifies each person or item.');
  const ids=new Map();let spaced=0;
  table.rows.forEach((row,i)=>{
    const id=row[column];
    if(!trimID(id))throw Error(`The ID is blank on line ${table.lines[i]}. Fill it in or remove that row, then check again.`);
    if(utf8(id).length>LIMITS.idBytes)throw Error(`The ID on line ${table.lines[i]} is longer than 256 UTF-8 bytes.`);
    if(id!==trimID(id))spaced++;
    if(!ids.has(id))ids.set(id,[]);ids.get(id).push(table.lines[i]);
  });
  return {ids,spaced};
}
export function analyze(left,right,columns) {
  if(!Array.isArray(columns)||columns.length!==2)throw Error('Choose an ID column in each file.');
  const a=idsFor(left,columns[0]), b=idsFor(right,columns[1]);
  const shared=[...a.ids.keys()].filter(id=>b.ids.has(id)).sort((x,y)=>hex(x)<hex(y)?-1:hex(x)>hex(y)?1:0).map(id=>({id,left:a.ids.get(id),right:b.ids.get(id)}));
  const summary={left_rows:left.rows.length,right_rows:right.rows.length,left_unique:a.ids.size,right_unique:b.ids.size,
    left_repeated_rows:left.rows.length-a.ids.size,right_repeated_rows:right.rows.length-b.ids.size,shared_ids:shared.length,
    left_affected_rows:shared.reduce((n,x)=>n+x.left.length,0),right_affected_rows:shared.reduce((n,x)=>n+x.right.length,0),
    left_spaced_ids:a.spaced,right_spaced_ids:b.spaced};
  return {scope:SCOPE,summary,shared,disjoint:shared.length===0};
}
export function extractedCSV(table,column) {
  idsFor(table,column); // Identical admission bounds; preserve each data-row value.
  return utf8('id\n'+table.rows.map(row=>hex(row[column])).join('\n')+'\n');
}
const exactKeys=(v,keys)=>v && typeof v==='object'&&!Array.isArray(v)&&canonical(Object.keys(v).sort())===canonical([...keys].sort());
function columnsOK(c){return Array.isArray(c)&&c.length===2&&c.every(x=>exactKeys(x,['header','index'])&&typeof x.header==='string'&&x.header.length>0&&x.header.length<4096&&Number.isSafeInteger(x.index)&&x.index>=0&&x.index<LIMITS.columns);}
export function validateRecipe(r) {
  if(!exactKeys(r,['format','scope','name','columns','previous'])||r.format!=='pcs-file-check-recipe-v1'||r.scope!==SCOPE||typeof r.name!=='string'||!r.name.trim()||r.name.length>80||!columnsOK(r.columns))throw Error('This is not a supported saved check.');
  if(r.previous!==null){if(!exactKeys(r.previous,['summary','sha256','checked_at'])||!Array.isArray(r.previous.sha256)||r.previous.sha256.length!==2||r.previous.sha256.some(x=>!/^([a-f0-9]{64})$/.test(x))||typeof r.previous.checked_at!=='string')throw Error('The previous result summary is malformed.');validateSummary(r.previous.summary);}
  return r;
}
export function validateSummary(s){const keys=['left_rows','right_rows','left_unique','right_unique','left_repeated_rows','right_repeated_rows','shared_ids','left_affected_rows','right_affected_rows','left_spaced_ids','right_spaced_ids'];if(!exactKeys(s,keys)||Object.values(s).some(n=>!Number.isSafeInteger(n)||n<0||n>LIMITS.rows))throw Error('The recorded counts are malformed.');return s;}
export function parseDocument(bytes) {
  if(bytes.length>2*LIMITS.bytes*2+65536)throw Error('This replay file is too large.');
  let raw,value;try{raw=new TextDecoder('utf-8',{fatal:true}).decode(bytes);value=JSON.parse(raw);}catch{throw Error('Choose a PCS saved-check or replay JSON file.');}
  if(raw!==canonical(value)+'\n')throw Error('The file is not in the canonical PCS replay format. It may have been edited.');
  if(value.format==='pcs-file-check-recipe-v1')return {kind:'recipe',value:validateRecipe(value)};
  if(!exactKeys(value,['format','recipe','inputs','summary','local_receipt'])||value.format!=='pcs-file-check-replay-v1')throw Error('Unknown replay format or unexpected fields.');
  validateRecipe(value.recipe);validateSummary(value.summary);
  if(!Array.isArray(value.inputs)||value.inputs.length!==2||value.inputs.some(x=>!exactKeys(x,['name','sha256','bytes','data_base64'])||typeof x.name!=='string'||x.name.length>255||!/^([a-f0-9]{64})$/.test(x.sha256)||!Number.isSafeInteger(x.bytes)||x.bytes<1||x.bytes>LIMITS.bytes||(x.data_base64!==null&&typeof x.data_base64!=='string')))throw Error('The input-file identities are malformed.');
  // An imported receipt is historical information. It cannot set a live verdict.
  if(value.local_receipt!==null && (typeof value.local_receipt!=='object'||Array.isArray(value.local_receipt)||canonical(value.local_receipt).length>8192))throw Error('The recorded local receipt is malformed.');
  return {kind:'replay',value};
}
export function toBase64(bytes){let out='';for(let i=0;i<bytes.length;i+=8192)out+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(out);}
export function fromBase64(s){if(typeof s!=='string'||s.length>Math.ceil(LIMITS.bytes/3)*4||s.length%4||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(s))throw Error('Malformed embedded CSV data.');const raw=Uint8Array.from(atob(s),c=>c.charCodeAt(0));if(toBase64(raw)!==s)throw Error('Noncanonical embedded CSV data.');return raw;}
export function chooseSavedColumn(table,saved){const i=table.header.indexOf(saved.header);return i>=0?i:null;}
export function escapeHTML(s){return String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
export function reportHTML({name,inputs,columns,result,localReceipt,includeIDs=false}) {
  const e=escapeHTML,s=result.summary;
  const rows=result.shared.map(x=>`<tr><td>${includeIDs?e(x.id):'ID omitted'}</td><td>${e(x.left.join(', '))}</td><td>${e(x.right.join(', '))}</td></tr>`).join('');
  return '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>PCS file check</title><style>body{font:17px system-ui;max-width:860px;margin:40px auto;padding:20px;color:#142d3a}table{border-collapse:collapse;width:100%}td,th{padding:8px;border:1px solid #ccc;text-align:left}code{overflow-wrap:anywhere}h1{font-size:30px}</style>'+`<h1>${e(name)}</h1><h2>${s.shared_ids?`${s.shared_ids} shared IDs found`:'No shared IDs found'}</h2><p>${localReceipt?(localReceipt.original_csv_decoding_proved?'Lean decoded and checked the original CSV snapshots.':'Confirmed by the local Lean checker for the extracted ID lists.'):'Browser calculation. No local Lean check was run.'}</p><p>IDs compare exactly, including case, spaces and leading zeros. This checks the selected ID columns; it does not establish that the data is correct or suitable for a study.</p><table><tr><th>File</th><th>ID column</th><th>Data rows</th><th>SHA-256</th></tr>${inputs.map((x,i)=>`<tr><td>${e(x.name)}</td><td>${e(columns[i].header)}</td><td>${i?s.right_rows:s.left_rows}</td><td><code>${e(x.sha256)}</code></td></tr>`).join('')}</table><h2>Rows to review</h2><p>Line numbers count physical lines in the original CSV, including the heading. ${includeIDs?'This report contains matching IDs.':'IDs are omitted from this report.'}</p><table><tr><th>ID</th><th>First file lines</th><th>Second file lines</th></tr>${rows||'<tr><td colspan="3">No shared IDs.</td></tr>'}</table><p>To recheck independently, use the PCS replay JSON and the original input files. This HTML is a readable report, not a signed certificate.</p></html>`;
}
