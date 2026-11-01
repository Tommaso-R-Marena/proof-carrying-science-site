import fs from 'node:fs';import {parseCSV} from '../public/file-check-core.mjs';import {decodedImage} from '../public/change-review-core.mjs';
const cases=JSON.parse(fs.readFileSync(0,'utf8'));process.stdout.write(JSON.stringify(cases.map(hex=>{try{return decodedImage(parseCSV(Uint8Array.from(Buffer.from(hex,'hex'))));}catch{return null;}})));
