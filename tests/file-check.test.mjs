import test from 'node:test';
import assert from 'node:assert/strict';
import {LIMITS,SCOPE,utf8,canonical,parseCSV,analyze,extractedCSV,validateRecipe,parseDocument,toBase64,fromBase64,reportHTML,chooseSavedColumn} from '../public/file-check-core.mjs';
const csv=s=>parseCSV(utf8(s));
const pair=(a,b)=>analyze(csv(a),csv(b),[0,0]);
test('overlap includes every source line and counts repeats separately',()=>{
 const r=pair('id,x\na,1\nb,2\na,3\n','other,x\na,4\na,5\nc,6\n');
 assert.deepEqual(r.shared,[{id:'a',left:[2,4],right:[2,3]}]);
 assert.equal(r.summary.shared_ids,1);assert.equal(r.summary.left_repeated_rows,1);assert.equal(r.summary.right_repeated_rows,1);assert.equal(r.summary.left_affected_rows,2);
});
test('exact IDs preserve zero padding, Unicode, case and spaces',()=>{
 const r=pair('id\n001\nABC\n é \n😀\n\ufeff\n','id\n1\nabc\né\n😀\n\ufeff\n');
 assert.deepEqual(r.shared.map(x=>x.id),['\ufeff','😀']);assert.equal(r.summary.left_spaced_ids,1);
});
test('quoted commas, escaped quotes and embedded CRLF retain physical source lines',()=>{
 const t=csv('id,note\r\n"a,b","line1\r\nline2"\r\n"a""b",ok\r\n');
 assert.deepEqual(t.rows,[['a,b','line1\r\nline2'],['a"b','ok']]);assert.deepEqual(t.lines,[2,4]);
 assert.equal(new TextDecoder().decode(extractedCSV(t,0)),'id\n612c62\n612262\n');
});
test('UTF-8 BOM is ignored as an encoding marker, while raw bytes remain available to hash',()=>{assert.deepEqual(csv('\ufeffid\r\n001\r\n').header,['id']);});
for(const [name,s] of Object.entries({empty:'',headerOnly:'id\n',duplicate:'id,id\na,b',blankHeader:',id\na,b',short:'id,x\na',long:'id\na,b',openQuote:'id\n"a',trailingQuote:'id\n"a"x',midQuote:'id\na"b',nul:'id\na\0',bareCR:'id\ra',quotedCR:'id\n"a\rb"'}))test(`malformed ${name} fails closed`,()=>assert.throws(()=>csv(s)));
test('invalid UTF-8 is rejected instead of silently replaced',()=>assert.throws(()=>parseCSV(Uint8Array.of(255,254,10))));
test('blank IDs, booleans as column indexes and excessive ID lengths are rejected',()=>{
 assert.throws(()=>pair('id\n" "\n','id\nx\n'));
 assert.throws(()=>analyze(csv('id\nx'),csv('id\ny'),[true,0]));
 assert.throws(()=>pair('id\n'+'é'.repeat(129),'id\nx'));
});
test('resource limits reject oversize files, columns and row counts',()=>{
 assert.throws(()=>parseCSV(new Uint8Array(LIMITS.bytes+1)));
 assert.throws(()=>csv(Array.from({length:129},(_,i)=>'h'+i).join(',')+'\n'));
 assert.throws(()=>csv('id\n'+('x\n'.repeat(5001))));
 assert.equal(csv('id\n'+('x\n'.repeat(5000))).rows.length,5000);
});
const summary=pair('id\na\n','id\nb\n').summary;
const recipe=()=>({format:'pcs-file-check-recipe-v1',scope:SCOPE,name:'Weekly exports',columns:[{header:'id',index:0},{header:'id',index:0}],previous:{summary,sha256:['a'.repeat(64),'b'.repeat(64)],checked_at:'2026-10-31T00:00:00Z'}});
test('recipes store only settings and aggregate previous results',()=>{const r=recipe();assert.equal(validateRecipe(r),r);assert.equal(parseDocument(utf8(canonical(r)+'\n')).kind,'recipe');assert.equal(chooseSavedColumn(csv('value,id\nx,a\n'),r.columns[0]),1);assert.equal(chooseSavedColumn(csv('different\na\n'),r.columns[0]),null);});
for(const attack of ['scope','unknown','count','column','name'])test(`recipe ${attack} tampering is rejected`,()=>{const r=recipe();if(attack==='scope')r.scope='trust-me';if(attack==='unknown')r.verifier='/tmp/caller';if(attack==='count')r.previous.summary={...summary,shared_ids:-1};if(attack==='column')r.columns[0].index=true;if(attack==='name')r.name='';assert.throws(()=>validateRecipe(r));});
test('canonical replay parser rejects duplicates, extra fields and future versions',()=>{
 const r=recipe();assert.throws(()=>parseDocument(utf8(JSON.stringify(r))));
 assert.throws(()=>parseDocument(utf8('{"format":"pcs-file-check-recipe-v1","format":"pcs-file-check-recipe-v1"}\n')));
 assert.throws(()=>parseDocument(utf8(canonical({...r,format:'v999'})+'\n')));
});
test('base64 decoding is exact and rejects ambiguous padding',()=>{const x=utf8('é,😀\n');assert.deepEqual(fromBase64(toBase64(x)),x);for(const s of ['YQ','YR==','YQ==\n','!==='])assert.throws(()=>fromBase64(s));});
test('readable reports escape attacker text and omit IDs unless requested',()=>{
 const a=csv('id\n<img src=x onerror=alert(1)>\n'),r=analyze(a,a,[0,0]);
 const args={name:'<script>bad</script>',inputs:[{name:'<x>',sha256:'a'},{name:'b',sha256:'b'}],columns:[{header:'id'},{header:'id'}],result:r,localReceipt:null};
 const hidden=reportHTML(args);assert.ok(!hidden.includes('<script>'));assert.ok(!hidden.includes('<img'));assert.ok(hidden.includes('ID omitted'));assert.ok(hidden.includes('No local Lean check was run'));
 const shown=reportHTML({...args,includeIDs:true});assert.ok(shown.includes('&lt;img'));assert.ok(!shown.includes('<img'));
});
test('independent brute-force oracle agrees over all pairs of finite ID subsets',()=>{
 const universe=['01','1','A','a','é'];
 for(let l=1;l<32;l++)for(let r=1;r<32;r++){
  const a=universe.filter((_,i)=>l&(1<<i)),b=universe.filter((_,i)=>r&(1<<i));
  const got=pair('id\n'+a.join('\n'),'id\n'+b.join('\n'));
  assert.equal(got.summary.shared_ids,a.filter(x=>b.includes(x)).length);
  assert.equal(got.disjoint,a.every(x=>!b.includes(x)));
 }
});
