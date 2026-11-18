// Read-only check of the PROPOSED reading-help successor manifest (site-clarity-v2).
// It does not replace scripts/verify_browser_ui_sources.mjs and grants nothing: the successor takes
// effect only if the owner approves the verifier change described in docs/governance/CLAIMCHECK_PROPOSALS.md.
import fs from 'node:fs';import crypto from 'node:crypto';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath,pathToFileURL} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const read=p=>fs.readFileSync(path.join(root,p));
// Canonical digest of help entries: keys sorted, each entry with sorted fields.
export const entriesDigest=(help,skip=[])=>sha(JSON.stringify(Object.keys(help).filter(k=>!skip.includes(k)).sort().map(k=>[k,Object.keys(help[k]).sort().map(f=>[f,help[k][f]])])));
export async function checkSuccessor(file='docs/evidence/site-clarity-v2/reading-help-requalification.json'){
 const m=JSON.parse(read(file));
 assert.equal(m.format,'pcs-reading-help-requalification-v2');assert.equal(m.scientific_acceptance,false);assert.equal(m.human_participants,0);
 // 1. the historical qualification record is byte-identical to what the successor names
 assert.equal(sha(read(m.predecessor.path)),m.predecessor.sha256,'Historical qualification record changed');
 const old=JSON.parse(read(m.predecessor.path));
 assert.deepEqual(m.previous_reading_help_sources,old.reading_help_sources,'Successor misstates the predecessor pins');
 // 2. only the help registry may differ from the predecessor pins, and the successor pins match the tree
 for(const [name,digest] of Object.entries(m.reading_help_sources)){assert.equal(sha(read(name)),digest,'Reading help source drift: '+name);if(name!=='public/page-help-core.mjs')assert.equal(digest,old.reading_help_sources[name],'Unexpected change outside the help registry: '+name);}
 assert.deepEqual(Object.keys(m.reading_help_sources).sort(),Object.keys(old.reading_help_sources).sort());
 // 3. the registry differs from the qualified one ONLY by the declared added pages
 const {PAGE_HELP}=await import(pathToFileURL(path.join(root,'public/page-help-core.mjs')).href+'?t='+Date.now());
 const d=m.page_help_delta;assert.deepEqual(d.removed,[]);assert.deepEqual(d.changed,[]);
 for(const page of d.added){assert.ok(PAGE_HELP[page],'Declared page has no help entry: '+page);assert.ok(fs.existsSync(path.join(root,'public',page)),'Declared page does not exist: '+page);}
 assert.equal(Object.keys(PAGE_HELP).length,d.unchanged_entries+d.added.length,'Help registry has undeclared entries');
 assert.equal(entriesDigest(PAGE_HELP,d.added),d.unchanged_entries_sha256,'An existing help entry changed');
 // 4. the fresh browser evidence is the recorded file and covers every page, including the added ones
 const ev=m.fresh_evidence.all_pages_browser;const raw=read(ev.path);assert.equal(sha(raw),ev.sha256,'Fresh evidence file changed');
 const run=JSON.parse(raw);assert.equal(run.status,'PASS');assert.equal(run.human_participants,0);
 const pages=fs.readdirSync(path.join(root,'public')).filter(n=>n.endsWith('.html')).sort();
 for(const width of ev.widths)assert.deepEqual(run.pages.filter(p=>p.width===width).map(p=>p.file).sort(),pages,'Fresh run does not cover every page at '+width);
 return {format:m.format,added_pages:d.added,unchanged_entries:d.unchanged_entries,pages_in_fresh_run:run.pages.length,historical_record_preserved:true,effective:false,scientific_acceptance:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))checkSuccessor().then(r=>console.log(JSON.stringify(r))).catch(e=>{console.error(e.message);process.exitCode=1;});
