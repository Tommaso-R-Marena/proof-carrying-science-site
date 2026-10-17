#!/usr/bin/env node
/**
 * Offline synthetic Assurance Fold RL bootstrap (not human research data).
 * Usage: node scripts/export_assurance_fold_rl_bootstrap.mjs [out.json]
 */
import { writeFileSync } from "node:fs";
import {
  exportFoldPreferencePairs,
  exportFoldRlRows,
  fitFoldSessions,
  foldModelEnvelope,
  syntheticBootstrapSessions,
} from "../public/assurance-fold-learning.mjs";
import { GAME_VERSION } from "../public/assurance-fold-core.mjs";

const out = process.argv[2] || "assurance-fold-rl-bootstrap.json";
const sessions = syntheticBootstrapSessions(["boot-a", "boot-b", "boot-c", "boot-d"]);
const rows = exportFoldRlRows(sessions, "all");
const pairs = exportFoldPreferencePairs(sessions, "all");
const fitted = fitFoldSessions(sessions);
const coach = foldModelEnvelope(fitted, {
  data_origin: "synthetic expert bootstrap; not human research data",
  evaluation_examples_used_for_training: 0,
  hint_assisted_episodes_used_for_training: 0,
});

const payload = {
  format: "pcs-assurance-fold-rl-bootstrap-v1",
  game_version: GAME_VERSION,
  issues_accept: false,
  authority: "NONE",
  checker_before_label: true,
  sessions,
  rows,
  preference_pairs: pairs,
  coach,
  meaning:
    "Synthetic (s,a,r,s') + preference-pair bootstrap for offline RL/ranking. Rewards recomputed by the game engine. Not Lean authority.",
};

writeFileSync(out, JSON.stringify(payload, null, 2));
console.log(`Wrote ${rows.length} RL rows + ${pairs.length} preference pairs + coach weights to ${out}`);
