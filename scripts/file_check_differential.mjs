// Independent Python driver sends source bytes; this process only computes JS results.
import fs from 'node:fs';
import {parseCSV,analyze,extractedCSV,toBase64} from '../public/file-check-core.mjs';
const cases=JSON.parse(fs.readFileSync(0,'utf8'));
const results=cases.map(c=>{try{const a=parseCSV(Uint8Array.from(Buffer.from(c.left,'base64'))),b=parseCSV(Uint8Array.from(Buffer.from(c.right,'base64')));return {accepted:true,result:analyze(a,b,c.columns),extracted:[toBase64(extractedCSV(a,c.columns[0])),toBase64(extractedCSV(b,c.columns[1]))]};}catch{return {accepted:false};}});
process.stdout.write(JSON.stringify(results));
