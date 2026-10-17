import test from "node:test";
import assert from "node:assert/strict";
import {
  CAMPAIGN_ORDER,
  GAME_VERSION,
  STRUCTURES,
  dailyStructureId,
  getStructure,
  gradePose,
  idealPose,
  initialPose,
  listStructures,
  moveResidue,
  rateFoldLock,
  softMagnetPose,
  wigglePose,
} from "../public/assurance-fold-core.mjs";

test("structures expose continuous Foldit-style search spaces", () => {
  assert.ok(STRUCTURES.length >= 5);
  assert.ok(CAMPAIGN_ORDER.length >= 5);
  for (const s of STRUCTURES) {
    assert.ok(s.residues.length >= 6, s.id);
    assert.ok(s.bonds.length >= 4, s.id);
    assert.ok(s.blurb.length > 40, s.id);
    assert.ok(s.threshold > 0);
    assert.ok(s.hold_ms >= 1000);
  }
});

test("soft magnet pulls near-pocket beads without teleporting", () => {
  const pose = initialPose("fold-spark-start", "magnet");
  const bead = pose.residues.find((r) => r.kind === "trap");
  const near = moveResidue(pose, bead.id, 0.28, 0.72);
  const pulled = softMagnetPose(near, bead.id);
  const after = pulled.residues.find((r) => r.id === bead.id);
  assert.ok(Math.hypot(after.x - 0.22, after.y - 0.72) < Math.hypot(0.28 - 0.22, 0.72 - 0.72) + 0.001);
  const rating = rateFoldLock({ energy: 2, threshold: 9, actionCount: 12, hints: 0, comboMax: 4 });
  assert.equal(rating.stars, 3);
  assert.equal(rating.issues_accept, false);
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
