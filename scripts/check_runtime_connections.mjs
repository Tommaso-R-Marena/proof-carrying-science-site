// Structural coverage audit only. Inventory metadata is never a Lean verdict.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import {PAGE_HELP} from '../public/page-help-core.mjs';import {CAPABILITIES} from '../public/capability-catalog.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../public');
export function checkRuntimeConnections(){
 const inventory=JSON.parse(fs.readFileSync(path.join(root,'runtime-connections.json')));
 assert.equal(inventory.format,'pcs-website-runtime-connections-v1');assert.equal(inventory.inventory_is_execution_attestation,false);assert.equal(inventory.automatic_model_promotion,false);assert.equal(inventory.pcs_authority,false);
 const models=JSON.parse(fs.readFileSync(path.join(root,'model-capabilities.json')));assert.equal(inventory.core_revision,models.core_revision);
 const pages=fs.readdirSync(root).filter(n=>n.endsWith('.html')).sort();assert.deepEqual(inventory.pages.map(p=>p.page).sort(),pages);assert.deepEqual(pages,Object.keys(PAGE_HELP).sort());
 const modes=new Set(['fresh-hosted-model-and-Lean','native-original-byte-Lean','recorded-Lean-states-with-fresh-route-check','browser-model-with-finite-checker','browser-finite-or-structural-checker','browser-inspection-or-project-preparation','recorded-research-or-exploratory-calculation','website-service-or-opt-in-study','information-or-navigation']);
 const visited=new Set();
 function module(name){
  assert.ok(!path.isAbsolute(name)&&!name.split('/').includes('..'),'Reviewed public asset path required');if(visited.has(name))return;visited.add(name);
  const p=path.join(root,name);assert.ok(fs.statSync(p).isFile(),'Runtime entrypoint is missing: '+name);
  const source=fs.readFileSync(p,'utf8');
  // Literal ES-module dependencies, including conditionally loaded catalogs.
  for(const match of source.matchAll(/(?:from\s+|import\s*\(?\s*)['"](\.[^'"]+\.mjs)['"]/g)){
   const next=path.posix.normalize(path.posix.join(path.posix.dirname(name),match[1]));module(next);
  }
 }
 for(const row of inventory.pages){
  assert.ok(modes.has(row.execution),'Unreviewed execution mode: '+row.page);assert.equal(row.kind,PAGE_HELP[row.page].kind);assert.ok(row.scope.length>60);
  const html=fs.readFileSync(path.join(root,row.page),'utf8');const actual=[...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(m=>m[1].replace(/^\//,''));
  assert.deepEqual(row.entrypoints,actual,'Page/runtime wiring changed without review: '+row.page);row.entrypoints.forEach(module);
 }
 for(const c of CAPABILITIES)assert.ok(pages.includes(c.page),'Capability link has no real page');
 return {format:inventory.format,pages:pages.length,runtime_sources:visited.size,capability_paths:CAPABILITIES.length,model_checkpoints:models.models.length,inventory_is_execution_attestation:false,pcs_authority:false};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))console.log(JSON.stringify(checkRuntimeConnections()));
