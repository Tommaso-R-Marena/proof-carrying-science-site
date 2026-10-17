/**
 * Assurance Fold — Foldit-inspired evidence-package folding engine.
 *
 * Players place package tiles into assurance lanes. An independent energy
 * function scores the fold. Lower energy is better. The checker never trusts
 * a client-claimed win and never issues scientific ACCEPT/PASS.
 *
 * Practice is local-only. This is not Lean verification, clinical validity,
 * or residual-trust closure.
 */

export const GAME_VERSION = "assurance-fold-v1";
export const LANES = Object.freeze([
  "bench",
  "authority",
  "computational",
  "scientific_open",
  "rejected",
  "limitations",
]);

export const LANE_META = Object.freeze({
  bench: {
    title: "Workbench",
    hint: "Unsorted pieces start here. Leaving claims on the bench costs energy.",
  },
  authority: {
    title: "Authority lane",
    hint: "Only black-box verify / cryptographic authority markers belong here.",
  },
  computational: {
    title: "Computational support",
    hint: "Replayable checks and non-science claims that are computationally supported.",
  },
  scientific_open: {
    title: "Scientific adequacy (open)",
    hint: "Biology / adequacy claims stay open even if computation passed.",
  },
  rejected: {
    title: "Rejected / failed",
    hint: "Hash mismatches, false ACCEPT traps, and failed checks.",
  },
  limitations: {
    title: "Limitations & non-claims",
    hint: "Keep the honest boundary visible: PASS ≠ empirical adequacy.",
  },
});

/** Correct home lane for each tile kind (hard constraint). */
export const HOME_LANE = Object.freeze({
  authority_marker: "authority",
  claim_crypto: "authority",
  claim_computational: "computational",
  artifact: "computational",
  assumption: "computational",
  claim_scientific: "scientific_open",
  false_accept: "rejected",
  claim_failed: "rejected",
  limitation: "limitations",
});

export const MISSIONS = Object.freeze([
  {
    id: "fold-01-pkpd-boundary",
    title: "PKPD evidence fold",
    story:
      "A one-compartment PK model package verified computationally, but biology remains open. Fold the pieces so authority, computation, science, and limitations stay honest.",
    goal: "Minimize fold energy without scientific overclaim.",
    energy_threshold: 0,
    tiles: [
      { id: "t_auth", kind: "authority_marker", label: "pcs verify · ok", note: "Black-box CLI authority" },
      { id: "t_replay", kind: "claim_computational", label: "C_REPLAY", note: "Predictions match analytic model" },
      { id: "t_art", kind: "artifact", label: "predictions.csv", note: "Bound artifact bytes" },
      { id: "t_bio", kind: "claim_scientific", label: "C_BIOLOGY", note: "Biological adequacy — still open" },
      { id: "t_lim", kind: "limitation", label: "LIMITATIONS", note: "Computational PASS ≠ empirical adequacy" },
      { id: "t_trap", kind: "false_accept", label: "ACCEPT biology", note: "Trap: card never issues ACCEPT" },
    ],
  },
  {
    id: "fold-02-tamper-reject",
    title: "Tampered package fold",
    story:
      "Someone swapped a prediction file. Integrity failed. Fold authority failure, rejected claims, and limitations so a reviewer cannot confuse this with science PASS.",
    goal: "Put failures in rejected; keep limitations visible; never elevate science.",
    energy_threshold: 0,
    tiles: [
      { id: "t_auth", kind: "authority_marker", label: "pcs verify · fail", note: "Authority lane records failure" },
      { id: "t_hash", kind: "claim_failed", label: "C_INTEGRITY", note: "Hash mismatch" },
      { id: "t_art", kind: "artifact", label: "model.json", note: "Declared model bytes" },
      { id: "t_sci", kind: "claim_scientific", label: "C_ADEQUACY", note: "Still scientifically open" },
      { id: "t_lim", kind: "limitation", label: "LIMITATIONS", note: "Failure is not scientific proof either" },
      { id: "t_trap", kind: "false_accept", label: "MERGE READY", note: "Trap: never merge from a game win" },
    ],
  },
  {
    id: "fold-03-crypto-vs-science",
    title: "Signatures are not science",
    story:
      "A package has a valid signature and computational replay, plus an open clinical claim. Fold crypto into authority, replay into computational support, and keep clinical adequacy open.",
    goal: "Separate cryptographic validity from scientific adequacy.",
    energy_threshold: 0,
    tiles: [
      { id: "t_sig", kind: "claim_crypto", label: "C_SIGNATURE", note: "Ed25519 package authenticity" },
      { id: "t_auth", kind: "authority_marker", label: "pcs verify · ok", note: "CLI authority outcome" },
      { id: "t_comp", kind: "claim_computational", label: "C_UNITS", note: "Unit compatibility check" },
      { id: "t_asm", kind: "assumption", label: "A_MODEL", note: "Declared equation form" },
      { id: "t_clin", kind: "claim_scientific", label: "C_CLINICAL", note: "Clinical validity — open" },
      { id: "t_lim", kind: "limitation", label: "NON-CLAIMS", note: "No clinical validity claimed" },
      { id: "t_trap", kind: "false_accept", label: "REGULATORY OK", note: "Trap: not regulatory acceptance" },
    ],
  },
  {
    id: "fold-04-adversarial-trap",
    title: "Adversarial overclaim fold",
    story:
      "An adversarial package tries to smuggle ACCEPT language next to a computational PASS. Fold traps into rejected and keep the inspection lattice honest.",
    goal: "Reject traps; keep science open; preserve limitations.",
    energy_threshold: 0,
    tiles: [
      { id: "t_auth", kind: "authority_marker", label: "pcs verify · ok", note: "Computational package valid" },
      { id: "t_comp", kind: "claim_computational", label: "C_REPLAY", note: "Supported computationally" },
      { id: "t_art", kind: "artifact", label: "certificate.json", note: "Evidence package root" },
      { id: "t_sci", kind: "claim_scientific", label: "C_REALWORLD", note: "Real-world adequacy open" },
      { id: "t_lim", kind: "limitation", label: "LIMITATIONS", note: "Inspection is not authority" },
      { id: "t_trap1", kind: "false_accept", label: "card_issues_accept:true", note: "Trap flag" },
      { id: "t_trap2", kind: "false_accept", label: "LEAN ACCEPT = SCIENCE", note: "Trap conflation" },
      { id: "t_fail", kind: "claim_failed", label: "C_POLICY", note: "Reviewer policy not met" },
    ],
  },
]);

const MISSION_BY_ID = new Map(MISSIONS.map((m) => [m.id, m]));

function mulberry32(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function getMission(id) {
  const mission = MISSION_BY_ID.get(id);
  if (!mission) throw new Error(`Unknown mission: ${id}`);
  return mission;
}

/** Deterministic shuffled starting placement — all tiles begin on the bench. */
export function initialPlacement(missionId, seed = "default") {
  const mission = getMission(missionId);
  const rng = mulberry32(hashSeed(`${GAME_VERSION}:${missionId}:${seed}`));
  const tiles = mission.tiles.map((t) => ({ ...t }));
  for (let i = tiles.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [tiles[i], tiles[j]] = [tiles[j], tiles[i]];
  }
  const placement = {};
  for (const tile of tiles) placement[tile.id] = "bench";
  return {
    mission_id: missionId,
    seed: String(seed),
    game_version: GAME_VERSION,
    order: tiles.map((t) => t.id),
    placement,
  };
}

export function moveTile(state, tileId, lane) {
  if (!LANES.includes(lane)) throw new Error("Unknown lane");
  if (!(tileId in state.placement)) throw new Error("Unknown tile");
  return {
    ...state,
    placement: { ...state.placement, [tileId]: lane },
  };
}

/**
 * Independent energy / validity checker.
 * Returns a structured grade; never invents scientific ACCEPT.
 */
export function gradeFold(missionId, placement, options = {}) {
  const mission = getMission(missionId);
  const hints = Number(options.hints_used || 0);
  if (!Number.isInteger(hints) || hints < 0 || hints > 20) {
    throw new Error("Invalid hint count");
  }

  const tileIds = new Set(mission.tiles.map((t) => t.id));
  const placedIds = Object.keys(placement || {});
  if (placedIds.length !== tileIds.size || placedIds.some((id) => !tileIds.has(id))) {
    throw new Error("Placement must include each mission tile exactly once");
  }
  for (const id of placedIds) {
    if (!LANES.includes(placement[id])) throw new Error("Unknown lane in placement");
  }

  const mistakes = [];
  let energy = 0;

  for (const tile of mission.tiles) {
    const lane = placement[tile.id];
    const home = HOME_LANE[tile.kind];
    if (!home) {
      mistakes.push({ tile: tile.id, reason: "unknown_kind" });
      energy += 50;
      continue;
    }
    if (lane === "bench") {
      mistakes.push({ tile: tile.id, reason: "left_on_bench", home });
      energy += tile.kind === "limitation" || tile.kind.startsWith("false") ? 25 : 12;
      continue;
    }
    if (lane !== home) {
      // Scientific overclaim is especially expensive.
      const overclaim =
        tile.kind === "claim_scientific" &&
        (lane === "authority" || lane === "computational");
      const trapEscape = tile.kind === "false_accept" && lane !== "rejected";
      mistakes.push({
        tile: tile.id,
        reason: overclaim ? "scientific_overclaim" : trapEscape ? "trap_not_rejected" : "wrong_lane",
        lane,
        home,
      });
      energy += overclaim ? 40 : trapEscape ? 45 : 18;
    }
  }

  // Soft structure bonuses / penalties (Foldit-like local interactions).
  const limOk = mission.tiles
    .filter((t) => t.kind === "limitation")
    .every((t) => placement[t.id] === "limitations");
  if (!limOk) {
    energy += 8;
    mistakes.push({ tile: null, reason: "limitations_not_visible" });
  }

  const scienceInAuth = mission.tiles.some(
    (t) => t.kind === "claim_scientific" && placement[t.id] === "authority"
  );
  if (scienceInAuth) {
    energy += 20;
  }

  // Hint usage increases energy (discourages assisted “wins” without changing hard validity).
  energy += Math.min(20, hints) * 2;

  const threshold = mission.energy_threshold;
  // Valid only when every tile is in its home lane.
  const allHome = mission.tiles.every((t) => placement[t.id] === HOME_LANE[t.kind]);
  const valid = allHome && energy <= threshold + hints * 2;
  const score = Math.max(0, Math.round(100 - energy));

  return {
    game_version: GAME_VERSION,
    mission_id: missionId,
    valid,
    energy,
    threshold,
    score,
    hints_used: hints,
    mistakes,
    hard_clear: allHome,
    issues_accept: false,
    inspection_is_not_authority: true,
    meaning:
      "Assurance Fold grades lane placement for an educational evidence package. " +
      "A low-energy fold is not a Lean 4 proof, clinical validation, security proof, " +
      "or merge recommendation. card_issues_accept remains false.",
  };
}

/** Seeded daily mission id (UTC day). */
export function dailyMissionId(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  const idx = hashSeed(`daily:${day}`) % MISSIONS.length;
  return MISSIONS[idx].id;
}

export function listMissions() {
  return MISSIONS.map((m) => ({
    id: m.id,
    title: m.title,
    story: m.story,
    goal: m.goal,
    tile_count: m.tiles.length,
  }));
}
