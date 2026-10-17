import test from "node:test";
import assert from "node:assert/strict";
import {
  GAME_VERSION,
  STRUCTURES,
  dailyStructureId,
  getStructure,
  gradePose,
  idealPose,
  initialPose,
  listStructures,
  moveResidue,
  wigglePose,
} from "../public/assurance-fold-core.mjs";

test("structures expose continuous Foldit-style search spaces", () => {
  assert.ok(STRUCTURES.length >= 4);
  for (const s of STRUCTURES) {
    assert.ok(s.residues.length >= 6, s.id);
    assert.ok(s.bonds.length >= 4, s.id);
    assert.ok(s.blurb.length > 40, s.id);
    assert.ok(s.threshold > 0);
    assert.ok(s.hold_ms >= 1000);
  }
});

test("ideal poses are stable and never issue accept", () => {
  for (const s of STRUCTURES) {
    const pose = idealPose(s.id);
    const grade = gradePose(s.id, pose, { hints_used: 0 });
    assert.equal(grade.game_version, GAME_VERSION);
    assert.equal(grade.issues_accept, false);
    assert.equal(grade.inspection_is_not_authority, true);
    assert.equal(grade.stable, true, `${s.id} energy=${grade.energy}`);
    assert.ok(grade.energy <= s.threshold, `${s.id} energy=${grade.energy}`);
    assert.match(grade.meaning, /not a Lean 4 proof/);
  }
});

test("scientific overclaim raises energy when science docks on authority", () => {
  const pose = idealPose("fold-pkpd-chain");
  const auth = pose.residues.find((r) => r.kind === "authority");
  const sci = pose.residues.find((r) => r.kind === "scientific");
  const bad = moveResidue(pose, sci.id, auth.x + 0.01, auth.y + 0.01);
  const grade = gradePose("fold-pkpd-chain", bad, { hints_used: 0 });
  assert.equal(grade.stable, false);
  assert.ok(grade.components.overclaim > 0);
  assert.ok(grade.tensions.some((t) => String(t.type).includes("overclaim") || String(t.type).includes("authority")));
});

test("initial poses are deterministic per seed and scrambled", () => {
  const a = initialPose("fold-tamper-storm", "seed-a");
  const b = initialPose("fold-tamper-storm", "seed-a");
  const c = initialPose("fold-tamper-storm", "seed-b");
  assert.deepEqual(
    a.residues.map((r) => [r.id, r.x, r.y]),
    b.residues.map((r) => [r.id, r.x, r.y])
  );
  assert.notDeepEqual(
    a.residues.map((r) => [r.x, r.y]),
    c.residues.map((r) => [r.x, r.y])
  );
  const ideal = idealPose("fold-tamper-storm");
  const gradeScramble = gradePose("fold-tamper-storm", a, { hints_used: 0 });
  const gradeIdeal = gradePose("fold-tamper-storm", ideal, { hints_used: 0 });
  assert.ok(gradeScramble.energy > gradeIdeal.energy);
});

test("wiggle and malformed inputs fail closed", () => {
  const pose = initialPose("fold-crypto-vs-clinic", "x");
  const wig = wigglePose(pose, "w1");
  assert.equal(wig.residues.length, pose.residues.length);
  assert.throws(() => moveResidue(pose, "nope", 0.2, 0.2), /Unknown residue/);
  assert.throws(() => gradePose("fold-crypto-vs-clinic", { residues: [] }), /Invalid pose|missing|count/i);
  assert.throws(
    () => gradePose("fold-crypto-vs-clinic", idealPose("fold-crypto-vs-clinic"), { hints_used: -1 }),
    /Invalid hint/
  );
});

test("daily structure id stable for a UTC day", () => {
  const day = new Date("2026-10-17T12:00:00Z");
  assert.equal(dailyStructureId(day), dailyStructureId(day));
  assert.equal(listStructures().length, STRUCTURES.length);
  assert.equal(getStructure(STRUCTURES[0].id).id, STRUCTURES[0].id);
});
