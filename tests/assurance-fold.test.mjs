import test from "node:test";
import assert from "node:assert/strict";
import {
  GAME_VERSION,
  HOME_LANE,
  MISSIONS,
  dailyMissionId,
  getMission,
  gradeFold,
  initialPlacement,
  listMissions,
  moveTile,
} from "../public/assurance-fold-core.mjs";

function perfectPlacement(missionId) {
  const mission = getMission(missionId);
  const placement = {};
  for (const tile of mission.tiles) placement[tile.id] = HOME_LANE[tile.kind];
  return placement;
}

test("missions expose Foldit-style searchable configuration space", () => {
  assert.equal(MISSIONS.length >= 4, true);
  for (const mission of MISSIONS) {
    assert.ok(mission.tiles.length >= 5);
    assert.ok(mission.story.length > 40);
    const kinds = new Set(mission.tiles.map((t) => t.kind));
    assert.ok(kinds.has("limitation"), mission.id);
    assert.ok(
      kinds.has("claim_scientific") || kinds.has("false_accept"),
      mission.id
    );
  }
});

test("perfect fold has zero energy and never issues accept", () => {
  for (const mission of MISSIONS) {
    const grade = gradeFold(mission.id, perfectPlacement(mission.id), { hints_used: 0 });
    assert.equal(grade.valid, true, mission.id);
    assert.equal(grade.energy, 0, mission.id);
    assert.equal(grade.score, 100, mission.id);
    assert.equal(grade.issues_accept, false);
    assert.equal(grade.inspection_is_not_authority, true);
    assert.equal(grade.game_version, GAME_VERSION);
    assert.match(grade.meaning, /not a Lean 4 proof/);
  }
});

test("scientific overclaim and ACCEPT traps raise energy and fail closed", () => {
  const mission = getMission("fold-01-pkpd-boundary");
  const placement = perfectPlacement(mission.id);
  placement.t_bio = "authority"; // scientific overclaim
  placement.t_trap = "computational"; // trap escape
  const grade = gradeFold(mission.id, placement, { hints_used: 0 });
  assert.equal(grade.valid, false);
  assert.ok(grade.energy >= 40);
  assert.ok(grade.mistakes.some((m) => m.reason === "scientific_overclaim"));
  assert.ok(grade.mistakes.some((m) => m.reason === "trap_not_rejected"));
});

test("initial placement is deterministic for a seed and starts on the bench", () => {
  const a = initialPlacement("fold-02-tamper-reject", "seed-a");
  const b = initialPlacement("fold-02-tamper-reject", "seed-a");
  const c = initialPlacement("fold-02-tamper-reject", "seed-b");
  assert.deepEqual(a.order, b.order);
  assert.notDeepEqual(a.order, c.order);
  assert.ok(Object.values(a.placement).every((lane) => lane === "bench"));
});

test("moveTile and grading reject malformed input", () => {
  const state = initialPlacement("fold-03-crypto-vs-science", "x");
  assert.throws(() => moveTile(state, "nope", "authority"), /Unknown tile/);
  assert.throws(() => moveTile(state, "t_auth", "moon"), /Unknown lane/);
  assert.throws(() => gradeFold("fold-03-crypto-vs-science", { t_auth: "authority" }), /exactly once/);
  assert.throws(
    () => gradeFold("fold-03-crypto-vs-science", perfectPlacement("fold-03-crypto-vs-science"), { hints_used: -1 }),
    /Invalid hint/
  );
});

test("hints increase energy but perfect lane placement stays hard-clear", () => {
  const grade = gradeFold("fold-04-adversarial-trap", perfectPlacement("fold-04-adversarial-trap"), {
    hints_used: 3,
  });
  assert.equal(grade.hard_clear, true);
  assert.equal(grade.valid, true);
  assert.equal(grade.energy, 6);
  assert.equal(grade.score, 94);
});

test("daily mission id is stable for a UTC day and listMissions is complete", () => {
  const day = new Date("2026-10-17T12:00:00Z");
  assert.equal(dailyMissionId(day), dailyMissionId(day));
  assert.equal(listMissions().length, MISSIONS.length);
});
