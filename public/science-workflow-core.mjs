// Same original-file change-review engine and replay format as the shipping app.
// Real published observations; deliberate changes are teaching controls only.
import {parseCSV,utf8,sha256,canonical,toBase64,fromBase64} from './file-check-core.mjs';
import {reviewChanges,REVIEW_SCOPE,DEFAULT_RULES,reviewRecipe,parseReviewDocument,changeReport} from './change-review-core.mjs';
export const SCIENCE_FILES=Object.freeze({
 'example-iris-previous.csv':'18bea934786a9ca9aa6745226120bf816e3aec059db7afc95eeb739c10a5038b',
 'example-iris-new.csv':'5df2056b9bcfb9165d4a4ab0ef55837605896caa4ac36090b0830e5d351b2111'
});
export const SCIENCE_SOURCE_SHA='daaeb5e3e889d07fbdd44544f5a39fe2372a07172e25899d577be0ad74df9e65';
export const SCIENCE_CASES=Object.freeze(['original','edited','removed']);
export async function verifyScienceFiles(inputs){
 if(!Array.isArray(inputs)||inputs.length!==2||inputs.some(b=>!(b instanceof Uint8Array)||b.length<1||b.length>16384))throw Error('Both published-data exports are required.');
 const captured=inputs.map(b=>new Uint8Array(b));
 for(const [i,[name,digest]] of Object.entries(SCIENCE_FILES).entries())if(await sha256(captured[i])!==digest)throw Error('The published-data export identity did not match: '+name);
 return captured;
}
const cell=s=>/[",\r\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s;
function serialize(t){return utf8([t.header,...t.rows].map(row=>row.map(cell).join(',')).join('\n')+'\n');}
export async function checkScienceWorkflow(raws,mode='original'){
 if(!SCIENCE_CASES.includes(mode))throw Error('Unknown teaching case.');
 const files=await verifyScienceFiles(raws),names=Object.keys(SCIENCE_FILES);
 if(mode!=='original'){
  const t=parseCSV(files[1]),row=t.rows.find(r=>r[0]==='iris-001');if(!row)throw Error('Expected published observation missing.');
  if(mode==='edited'){row[1]='9.9';names[1]='teaching-control-edited-value.csv';}
  else{t.rows=t.rows.filter(r=>r[0]!=='iris-001');names[1]='teaching-control-removed-row.csv';}
  files[1]=serialize(t);
 }
 const tables=files.map(parseCSV),headers=tables[0].header.slice(1),rules={...DEFAULT_RULES};
 const result=reviewChanges(tables[0],tables[1],[0,0],headers,rules);
 const inputs=await Promise.all(files.map(async(b,i)=>({name:names[i],sha256:await sha256(b),bytes:b.length,data_base64:toBase64(b)})));
 const recipe=reviewRecipe({format:'pcs-change-recipe-v2',scope:REVIEW_SCOPE,name:'Iris: preserve existing observations',columns:tables.map(t=>({header:t.header[0],index:0})),compare_headers:headers,rules,previous:null});
 const replay={format:'pcs-change-replay-v2',recipe,inputs,summary:result.summary,accepted:result.accepted,local_receipt:null};
 const provenance='<h2>Published data and teaching changes</h2><p>R. A. Fisher, Iris, UC Irvine Machine Learning Repository, DOI 10.24432/C56C76, CC BY 4.0. Source SHA-256: <code>'+SCIENCE_SOURCE_SHA+'</code>.</p><p>These exports were constructed from one archived snapshot: 100 previous observations, then all 150 in reverse order. Row IDs identify only this snapshot. '+(mode==='original'?'Published cell strings are preserved.':'This run deliberately '+(mode==='edited'?'changes one published value to 9.9':'removes one existing observation')+' as a teaching control, not an observed research incident.')+'</p><p>UCI reports discrepancies in observations 35 and 38. Conserving their values does not validate their scientific accuracy.</p>';
 return {mode,result,files,inputs,headers,rules,replay_json:canonical(replay)+'\n',report_html:changeReport({name:recipe.name,result,inputs,headers,rules,localReceipt:null,includeValues:true}).replace('</html>',provenance+'</html>'),kernel_executed:false,scientific_acceptance:false};
}
export async function recheckScienceDownload(bytes){
 const d=parseReviewDocument(bytes);if(d.kind!=='replay')throw Error('Choose the replay file that includes the observations.');
 const r=d.value;
 const requiredHeaders=['sepal length','sepal width','petal length','petal width','class'];
 if(canonical(r.recipe.rules)!==canonical(DEFAULT_RULES)||canonical(r.recipe.compare_headers)!==canonical(requiredHeaders)||r.recipe.columns.some(c=>c.header!=='source_row_id'||c.index!==0))throw Error('This starter rechecks the five-column Iris preservation question. Use What changed? for other settings.');
 const files=r.inputs.map(i=>{if(i.data_base64===null)throw Error('This replay needs its original files. Open it in What changed?');return fromBase64(i.data_base64);});
 for(let i=0;i<2;i++)if(files[i].length!==r.inputs[i].bytes||await sha256(files[i])!==r.inputs[i].sha256)throw Error('A file does not match its recorded identity.');
 const tables=files.map(parseCSV);for(let i=0;i<2;i++)if(tables[i].header[r.recipe.columns[i].index]!==r.recipe.columns[i].header)throw Error('The recorded ID column is not the selected file column.');
 const fresh=reviewChanges(tables[0],tables[1],r.recipe.columns.map(c=>c.index),r.recipe.compare_headers,r.recipe.rules);
 if(canonical(fresh.summary)!==canonical(r.summary)||fresh.accepted!==r.accepted)throw Error('The recorded result disagrees with a fresh check.');
 return {result:fresh,kernel_executed:false,scientific_acceptance:false,imported_receipt_trusted:false};
}
