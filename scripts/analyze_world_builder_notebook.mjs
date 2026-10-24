// Research inspection only. A local file does not establish donation consent.
import {readFileSync, statSync} from 'node:fs';
import {readNotebook, analyzeNotebook} from '../public/world-builder-core.mjs';
if(process.argv.length!==3)throw Error('Usage: node scripts/analyze_world_builder_notebook.mjs notebook.json');
if(statSync(process.argv[2]).size>131072)throw Error('Notebook exceeds byte budget');
const raw=new TextDecoder('utf-8',{fatal:true}).decode(readFileSync(process.argv[2]));
console.log(JSON.stringify(await analyzeNotebook(readNotebook(raw)),null,2));
