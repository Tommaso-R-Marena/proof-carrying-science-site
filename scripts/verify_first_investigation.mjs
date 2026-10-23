// Actual compilation of exactly the two proof downloads offered by the tour.
// No mock verdict or emit-only mode. The Linux x86_64 Lean executable is pinned.
import {createHash} from 'node:crypto';
import {mkdtempSync, readFileSync, writeFileSync, realpathSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {makeWorld, proofFor} from '../public/first-investigation-core.mjs';

const selected = process.env.PCS_LEAN_BIN || 'lean';
const located = spawnSync('which', [selected], {encoding: 'utf8'});
if (located.status !== 0) throw Error('Lean 4.28.0 is required; no proof verdict available.');
const lean = realpathSync(located.stdout.trim());
if (createHash('sha256').update(readFileSync(lean)).digest('hex') !==
    '3e0d0d3d801675359f2d4cf9815bfdb417b20b92fdd9d48b3b14c95bbae28bbf')
  throw Error('The reviewed Linux x86_64 Lean 4.28.0 executable is required.');
const dir = mkdtempSync(join(tmpdir(), 'pcs-first-proof-'));
const results = [];
try {
  for (const [used, permission] of [[true, false], [false, true]]) {
    const proof = proofFor(makeWorld(used, permission));
    const file = join(dir, `case-${Number(used)}-${Number(permission)}.lean`);
    writeFileSync(file, proof.lean_source + '\n#print axioms PCSArenaCountermodel.exhibited_meaning_difference\n');
    const r = spawnSync(lean, ['-j1', '-M2048', file], {encoding: 'utf8', timeout: 60000});
    if (r.error || r.status !== 0) throw Error('Lean rejected the actual download: ' + (r.error?.message || r.stdout + r.stderr));
    const match = /'PCSArenaCountermodel.exhibited_meaning_difference' (?:depends on axioms: \[([^\]]*)\]|does not depend on any axioms)/.exec(r.stdout);
    if (!match) throw Error('Missing exact theorem assumption audit.');
    const axioms = (match[1] || '').split(',').map(x => x.trim()).filter(Boolean);
    if (axioms.some(x => !['propext', 'Classical.choice', 'Quot.sound'].includes(x))) throw Error('Unexpected proof assumptions.');
    results.push({used, permission, kernel_checked: true, axioms,
      proof_sha256: createHash('sha256').update(proof.lean_source).digest('hex')});
  }
  const bad = join(dir, 'False.lean'); writeFileSync(bad, 'import Std\ntheorem false_control : (0 : Nat) = 1 := by decide\n');
  const r = spawnSync(lean, ['-j1', '-M2048', bad], {encoding: 'utf8', timeout: 60000});
  if (r.error || r.status === 0 || !r.stdout.includes('is false')) throw Error('The deliberate false-proof control was not correctly rejected.');
  console.log(JSON.stringify({format: 'pcs-first-investigation-lean-v1', results,
    false_proof_rejected: true, production_authority: false}, null, 2));
} finally { rmSync(dir, {recursive: true, force: true}); }
