// Use the same bounded CSV parser and ID checker as "Check my files".
// Fixed fictional examples only. No upload, model inference or Lean verdict.
import {utf8,parseCSV,analyze,sha256,SCOPE,canonical,toBase64,validateRecipe,reportHTML} from './file-check-core.mjs';
export function sampleFiles(mode='overlap'){
 if(!['overlap','separate'].includes(mode))throw Error('Unknown example');
 return [
  {name:'group-a.csv',bytes:utf8('ID,Name\n101,Alex\n102,Jordan\n103,Sam\n')},
  {name:'group-b.csv',bytes:utf8(mode==='overlap'?'ID,Name\n103,Sam\n104,Robin\n105,Casey\n':'ID,Name\n106,Taylor\n104,Robin\n105,Casey\n')}
 ];
}
export async function checkSample(mode){
 const files=sampleFiles(mode),tables=files.map(f=>parseCSV(f.bytes));
 const result=analyze(tables[0],tables[1],[0,0]);
 const inputs=await Promise.all(files.map(async f=>({name:f.name,bytes:f.bytes.length,sha256:await sha256(f.bytes),data_base64:toBase64(f.bytes)})));
 const columns=tables.map(t=>({header:t.header[0],index:0}));
 const recipe=validateRecipe({format:'pcs-file-check-recipe-v1',scope:SCOPE,name:'PCS example: separate groups',columns,previous:null});
 const replay={format:'pcs-file-check-replay-v1',recipe,inputs,summary:result.summary,local_receipt:null};
 const html=reportHTML({name:recipe.name,inputs,columns,result,localReceipt:null,includeIDs:true}).replace('<h2>1 shared IDs found</h2>','<h2>1 shared ID found</h2>');
 return {mode,result,replay_json:canonical(replay)+'\n',report_html:html,kernel_executed:false,pcs_authority:false};
}
