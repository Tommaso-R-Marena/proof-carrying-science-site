/**
 * Assurance Fold local learning — RL transitions + tiny behavior-cloning coach.
 *
 * Checker-before-label: every reward/energy/stability flag is recomputed by
 * replayFoldSession. Client-claimed scores are rejected. No network I/O.
 * Held-out structures never enter fitting. Authority remains NONE.
 */
import {
  EVALUATION_STRUCTURES,
  GAME_VERSION,
  KINDS,
  POCKETS,
  STRUCTURES,
  makeFoldSession,
  replayFoldSession,
  syntheticExpertActions,
} from "./assurance-fold-core.mjs";

export const FOLD_POLICY_FORMAT = "pcs-assurance-fold-policy-v1";
export const FOLD_FEATURE_DIM = 16;
export const FOLD_ACTION_CLASSES = Object.freeze([
  "authority",
  "computational",
  "scientific",
  "reject",
  "limits",
]);

/** Fixed feature vector from a pose snapshot (pre-action). */
export function foldFeatures(stateResidues) {
  if (!Array.isArray(stateResidues) || !stateResidues.length) {
    throw new Error("Invalid fold state for features");
  }
  const feats = new Array(FOLD_FEATURE_DIM).fill(0);
  let i = 0;
  // Mean pocket-distance per kind pocket (5)
  for (const pocketName of FOLD_ACTION_CLASSES) {
    const pocket = POCKETS[pocketName];
    const members = stateResidues.filter((r) => KINDS[r.kind]?.pocket === pocketName);
    if (!members.length) {
      feats[i++] = 0;
      continue;
    }
    const mean =
      members.reduce((s, r) => s + Math.hypot(r.x - pocket.x, r.y - pocket.y), 0) /
      members.length;
    feats[i++] = Math.min(1, mean);
  }
  // Fraction of scientific beads near authority well
  const auth = POCKETS.authority;
  const sci = stateResidues.filter((r) => r.kind === "scientific");
  feats[i++] = sci.length
    ? sci.filter((r) => Math.hypot(r.x - auth.x, r.y - auth.y) < auth.r).length / sci.length
    : 0;
  // Fraction of traps outside reject well
  const rej = POCKETS.reject;
  const traps = stateResidues.filter((r) => r.kind === "trap");
  feats[i++] = traps.length
    ? traps.filter((r) => Math.hypot(r.x - rej.x, r.y - rej.y) > rej.r).length / traps.length
    : 0;
  // Mean pairwise clash proxy (close pairs)
  let close = 0;
  let pairs = 0;
  for (let a = 0; a < stateResidues.length; a++) {
    for (let b = a + 1; b < stateResidues.length; b++) {
      pairs += 1;
      if (Math.hypot(stateResidues[a].x - stateResidues[b].x, stateResidues[a].y - stateResidues[b].y) < 0.09) {
        close += 1;
      }
    }
  }
  feats[i++] = pairs ? close / pairs : 0;
  // Kind histogram (authority, computational, artifact, scientific, trap, rejected, limitation) → 7
  const kinds = ["authority", "computational", "artifact", "scientific", "trap", "rejected", "limitation"];
  const n = stateResidues.length;
  for (const k of kinds) {
    feats[i++] = stateResidues.filter((r) => r.kind === k).length / n;
  }
  // Pad / truncate
  while (i < FOLD_FEATURE_DIM) feats[i++] = 0;
  return feats.slice(0, FOLD_FEATURE_DIM).map((x) => Math.round(x * 1e6) / 1e6);
}

function placeActionClass(action, stateBefore) {
  if (action.type !== "place") return null;
  const bead = stateBefore.find((r) => r.id === action.residue_id);
  if (!bead) throw new Error("Place action missing residue in state");
  // Label = destination pocket nearest to the placed coordinate (engine geometry).
  let best = null;
  let bestD = Infinity;
  for (const name of FOLD_ACTION_CLASSES) {
    const p = POCKETS[name];
    const d = Math.hypot(action.x - p.x, action.y - p.y);
    if (d < bestD) {
      bestD = d;
      best = name;
    }
  }
  return best;
}

export function normalizeFoldSession(input) {
  const replay = replayFoldSession(input);
  const session = makeFoldSession(input.structure_id, input.seed, replay.transitions.map((t) => t.action));
  return { session, replay };
}

function eligibleSessions(sessions) {
  if (!Array.isArray(sessions) || sessions.length > 200) {
    throw new Error("At most 200 bounded fold notebooks");
  }
  const seen = new Set();
  const entries = [];
  for (const input of sessions) {
    const entry = normalizeFoldSession(input);
    const key = JSON.stringify(entry.session);
    if (!entry.replay.locked || !entry.replay.final_stable) {
      throw new Error("Only locked stable folds enter learning");
    }
    if (entry.replay.issues_accept !== false) throw new Error("Accepting folds rejected");
    if (seen.has(key)) continue;
    seen.add(key);
    entries.push(entry);
  }
  return entries;
}

/** RL-ready rows: (s, a, r, s', done, features). Engine rewards only. */
export function exportFoldRlRows(sessions, split = "training") {
  if (!["training", "evaluation", "all"].includes(split)) throw new Error("Unknown split");
  const entries = eligibleSessions(sessions).filter(({ replay }) => split === "all" || replay.split === split);
  return entries.flatMap(({ session, replay }) =>
    replay.transitions.map((t) => ({
      structure_id: session.structure_id,
      seed: session.seed,
      split: replay.split,
      index: t.index,
      state: t.state_before,
      action: t.action,
      reward: t.reward,
      next_state: t.state_after,
      done: t.done,
      energy_before: t.energy_before,
      energy_after: t.energy_after,
      assisted: t.assisted,
      features: foldFeatures(t.state_before),
      issues_accept: false,
    }))
  );
}

export function foldSessionRows(sessions, split) {
  if (!["training", "evaluation"].includes(split)) throw new Error("Unknown learning partition");
  return eligibleSessions(sessions)
    .filter(({ session, replay }) => !replay.hints && replay.split === split)
    .flatMap(({ session, replay }) =>
      replay.transitions
        .filter((t) => t.action.type === "place")
        .map((t) => {
          const cls = placeActionClass(t.action, t.state_before);
          const index = FOLD_ACTION_CLASSES.indexOf(cls);
          if (index < 0) throw new Error("Unsupported training action class");
          return {
            case_id: session.structure_id,
            index,
            features: foldFeatures(t.state_before),
            legal: FOLD_ACTION_CLASSES.map((_, i) => i),
          };
        })
    );
}

export function fitFoldSessions(sessions) {
  const entries = eligibleSessions(sessions);
  const rows = foldSessionRows(sessions, "training");
  if (!rows.length) {
    throw new Error("No unassisted training-family trajectories; refusing to invent training data");
  }
  const weights = FOLD_ACTION_CLASSES.map(() => Array(FOLD_FEATURE_DIM).fill(0));
  const counts = FOLD_ACTION_CLASSES.map(() => 0);
  for (const row of rows) counts[row.index] += 1;
  for (let epoch = 0; epoch < 32; epoch++) {
    for (const row of rows) {
      const logits = row.legal.map((i) => weights[i].reduce((sum, w, j) => sum + w * row.features[j], 0));
      const max = Math.max(...logits);
      const exp = logits.map((x) => Math.exp(x - max));
      const total = exp.reduce((a, b) => a + b, 0);
      const lr = 0.1 / (1 + epoch * 0.08);
      row.legal.forEach((i, k) => {
        const error = (i === row.index ? 1 : 0) - exp[k] / total;
        weights[i] = weights[i].map((w, j) => w + lr * (error * row.features[j] - 0.001 * w));
      });
    }
  }
  return {
    rows,
    weights: weights.map((w) => w.map((x) => Math.round(x * 1e8) / 1e8)),
    training: {
      epochs: 32,
      examples: rows.length,
      episodes: entries.filter(({ replay }) => !replay.hints && replay.split === "training").length,
      task_ids: [...new Set(rows.map((r) => r.case_id))].sort(),
      action_counts: counts,
    },
  };
}

export function foldModelEnvelope(fitted, provenance) {
  return {
    format: FOLD_POLICY_FORMAT,
    authority: "NONE_UNTRUSTED_BEHAVIOR_CLONING",
    method: "deterministic_masked_softmax_behavior_cloning",
    game_version: GAME_VERSION,
    provenance,
    training: fitted.training,
    weights: fitted.weights,
    limitations: [
      "Learns observed pocket-placement choices, not optimal folds or formal proofs",
      "Tiny public structure pool; no external generalization claim",
      "Hints excluded from fitting; synthetic bootstrap is tagged separately",
      "No automatic deployment or scientific authority promotion",
    ],
    issues_accept: false,
  };
}

/** Bootstrap notebooks from the synthetic expert (not human research data). */
export function syntheticBootstrapSessions(seeds = ["syn-a", "syn-b", "syn-c"]) {
  const out = [];
  for (const s of STRUCTURES) {
    if (EVALUATION_STRUCTURES.includes(s.id)) continue;
    for (const seed of seeds) {
      const actions = syntheticExpertActions(s.id, seed);
      out.push(makeFoldSession(s.id, seed, actions));
    }
  }
  return out;
}

export function suggestPocket(model, stateResidues) {
  if (!model || model.format !== FOLD_POLICY_FORMAT) throw new Error("Unsupported fold model");
  if (model.authority !== "NONE_UNTRUSTED_BEHAVIOR_CLONING") throw new Error("Untrusted authority field");
  const features = foldFeatures(stateResidues);
  const scores = model.weights.map((row) => row.reduce((sum, w, j) => sum + w * features[j], 0));
  let best = 0;
  for (let i = 1; i < scores.length; i++) if (scores[i] > scores[best]) best = i;
  return {
    pocket: FOLD_ACTION_CLASSES[best],
    scores: scores.map((x) => Math.round(x * 1000) / 1000),
    authority: "NONE",
    meaning: "Untrusted coach suggestion only; not a scientific ACCEPT.",
  };
}
