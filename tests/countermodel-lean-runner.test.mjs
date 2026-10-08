import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, writeFileSync, chmodSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const runner=fileURLToPath(new URL('../scripts/verify_countermodel_lean.mjs', import.meta.url));
const run=(binary)=>spawnSync(process.execPath,[runner],{
  env:{...process.env,PCS_LEAN_BIN:binary},encoding:'utf8',timeout:30000
});
test('absent Lean executable fails closed instead of claiming a kernel proof',()=>{
  const r=run(join(tmpdir(),'pcs-nonexistent-lean-cli-test'));
  assert.equal(r.status,2,r.stderr);
  assert.match(r.stderr,/LEAN_TOOLCHAIN_NOT_VERIFIED/);
  assert.doesNotMatch(r.stdout,/LEAN_KERNEL_VERIFIED/);
});
test('incorrect Lean toolchain version rejects even when fake accepts arbitrary proof files',()=>{
  if(process.platform==='win32')return;
  const dir=mkdtempSync(join(tmpdir(),'pcs-version-test-'));
  try{
    const binary=join(dir,'fake-lean');
    writeFileSync(binary,'#!/bin/sh\nif [ "$1" = "--version" ]; then echo "Lean (version 4.27.0, test)"; exit 0; fi\nexit 0\n');
    chmodSync(binary,0o755);
    const r=run(binary);
    assert.equal(r.status,2,r.stderr);
    assert.match(r.stderr,/LEAN_TOOLCHAIN_NOT_VERIFIED.*4\.27\.0/);
    assert.doesNotMatch(r.stdout,/LEAN_KERNEL_VERIFIED/);
  }finally{rmSync(dir,{recursive:true,force:true});}
});
