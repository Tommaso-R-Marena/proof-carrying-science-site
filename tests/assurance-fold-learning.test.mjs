import test from "node:test";
import assert from "node:assert/strict";
import {
  EVALUATION_STRUCTURES,
  GAME_VERSION,
  comboStatsFromTransitions,
  makeFoldSession,
  replayFoldSession,
  syntheticExpertActions,
} from "../public/assurance-fold-core.mjs";
import {
  exportFoldPreferencePairs,
  exportFoldRlRows,
  fitFoldSessions,
  foldFeatures,
  foldModelEnvelope,
  suggestPocket,
  syntheticBootstrapSessions,
} from "../public/assurance-fold-learning.mjs";

const POCKETS_OK = ["authority", "computational", "scientific", "reject", "limits"];

test("replay recomputes rewards and rejects client labels", () => {
  const actions = syntheticExpertActions("fold-pkpd-chain", "t1");
  const session = makeFoldSession("fold-pkpd-chain", "t1", actions);
  const replay = replayFoldSession(session);
  assert.equal(replay.game_version, GAME_VERSION);
  assert.equal(replay.issues_accept, false);
  assert.equal(replay.locked, true);
  assert.equal(replay.final_stable, true);
  assert.ok(replay.transitions.length >= 6);
  assert.ok(replay.transitions.every((t) => Number.isFinite(t.reward)));
  assert.throws(
    () =>
      replayFoldSession({
        ...session,
        actions: [{ type: "place", residue_id: "R1", x: 0.2, y: 0.2, reward: 99 }],
      }),
    /Client-supplied labels/
  );
});

test("RL export rows are engine-labeled and split-aware", () => {
  const sessions = syntheticBootstrapSessions(["boot-1"]);
  const train = exportFoldRlRows(sessions, "training");
  assert.ok(train.length > 10);
  assert.ok(train.every((r) => r.issues_accept === false));
  assert.ok(train.every((r) => r.split === "training"));
  assert.ok(train.every((r) => r.features.length === 16));
  assert.ok(!train.some((r) => EVALUATION_STRUCTURES.includes(r.structure_id)));
});

test("local fold coach fits only unassisted training families", () => {
  const sessions = syntheticBootstrapSessions(["fit-a", "fit-b"]);
  const fitted = fitFoldSessions(sessions);
  assert.ok(fitted.training.examples >= 6);
  assert.ok(fitted.training.episodes >= 2);
  assert.ok(!fitted.training.task_ids.includes("fold-adversarial-nest"));
  const model = foldModelEnvelope(fitted, {
    data_origin: "synthetic expert bootstrap; not human research data",
    evaluation_examples_used_for_training: 0,
    hint_assisted_episodes_used_for_training: 0,
  });
  assert.equal(model.authority, "NONE_UNTRUSTED_BEHAVIOR_CLONING");
  assert.equal(model.issues_accept, false);
  const state = [
    { id: "R1", kind: "authority", x: 0.5, y: 0.5 },
    { id: "R2", kind: "computational", x: 0.5, y: 0.5 },
    { id: "R3", kind: "artifact", x: 0.5, y: 0.5 },
    { id: "R4", kind: "scientific", x: 0.5, y: 0.5 },
    { id: "R5", kind: "limitation", x: 0.5, y: 0.5 },
    { id: "R6", kind: "trap", x: 0.5, y: 0.5 },
  ];
  const suggestion = suggestPocket(model, state);
  assert.ok(POCKETS_OK.includes(suggestion.pocket));
  assert.equal(suggestion.authority, "NONE");
});

test("feature vector is bounded and deterministic", () => {
  const state = [
    { id: "R1", kind: "authority", x: 0.18, y: 0.28 },
    { id: "R2", kind: "trap", x: 0.8, y: 0.2 },
  ];
  assert.deepEqual(foldFeatures(state), foldFeatures(state));
  assert.equal(foldFeatures(state).length, 16);
  assert.ok(foldFeatures(state).every((x) => x >= 0 && x <= 1));
});

test("replay summary recomputes combo and preference pairs are engine-ranked", () => {
  const sessions = syntheticBootstrapSessions(["pref-1"]);
  const replay = replayFoldSession(sessions[0]);
  assert.ok(replay.summary);
  assert.equal(typeof replay.summary.combo_max, "number");
  assert.equal(replay.summary.issues_accept, false);
  const fromTransitions = comboStatsFromTransitions(replay.transitions);
  assert.equal(replay.summary.combo_max, fromTransitions.combo_max);
  if (replay.rating) assert.ok(replay.rating.stars >= 1 && replay.rating.stars <= 3);
  const pairs = exportFoldPreferencePairs(sessions, "training");
  assert.ok(pairs.length >= 1);
  for (const p of pairs) {
    assert.ok(p.preferred.energy_after < p.rejected.energy_after);
    assert.equal(p.issues_accept, false);
  }
  assert.throws(
    () =>
      replayFoldSession({
        ...sessions[0],
        actions: [{ type: "place", residue_id: "R1", x: 0.2, y: 0.2, combo: 9 }],
      }),
    /Client-supplied labels/
  );
});
