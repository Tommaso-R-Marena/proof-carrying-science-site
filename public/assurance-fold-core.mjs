/**
 * Assurance Fold — spatial claim-board engine for PCS Arena.
 *
 * Players drag evidence tokens on a live board. An independent heat function
 * scores clashes, chain stretch, zone affinity, and scientific overclaim.
 * Soft magnetism, combos, and campaign unlocks live in the UI; the engine
 * stays the sole label authority.
 *
 * Never issues scientific ACCEPT/PASS. Local practice only.
 */

export const GAME_VERSION = "assurance-fold-v3";

export const KINDS = Object.freeze({
  authority: { label: "Authority", color: "#1f3a5f", pocket: "authority" },
  computational: { label: "Computational", color: "#0c5c4a", pocket: "computational" },
  artifact: { label: "Artifact", color: "#0b7a5c", pocket: "computational" },
  scientific: { label: "Scientific open", color: "#8a4b00", pocket: "scientific" },
  trap: { label: "Overclaim trap", color: "#8f1d1d", pocket: "reject" },
  rejected: { label: "Failed check", color: "#b42318", pocket: "reject" },
  limitation: { label: "Limitations", color: "#7a6200", pocket: "limits" },
});

/** Soft attractor zones (normalized 0–1 board coords). */
export const POCKETS = Object.freeze({
  authority: { x: 0.18, y: 0.28, r: 0.14, label: "Authority zone" },
  computational: { x: 0.52, y: 0.32, r: 0.16, label: "Computational zone" },
  scientific: { x: 0.82, y: 0.30, r: 0.13, label: "Science-open zone" },
  reject: { x: 0.22, y: 0.72, r: 0.14, label: "Reject zone" },
  limits: { x: 0.72, y: 0.74, r: 0.15, label: "Limitations zone" },
});

/** Campaign unlock order (held-out structures are always playable as challenges). */
export const CAMPAIGN_ORDER = Object.freeze([
  "fold-spark-start",
  "fold-pkpd-chain",
  "fold-crypto-vs-clinic",
  "fold-tamper-storm",
  "fold-adversarial-nest",
]);

export const STRUCTURES = Object.freeze([
  {
    id: "fold-spark-start",
    title: "Spark start",
    blurb: "Warm-up board: bury the ACCEPT trap, park science in the open zone, and crash the heat when tokens snap into honest places.",
    goal: "Hold heat ≤ 9 for 1.2s. Chase a 3★ clear (few moves, no shake).",
    threshold: 9,
    hold_ms: 1200,
    residues: [
      { id: "R1", kind: "authority", label: "verify", note: "CLI authority" },
      { id: "R2", kind: "computational", label: "replay", note: "Matches bytes" },
      { id: "R3", kind: "artifact", label: "receipt", note: "Bound artifact" },
      { id: "R4", kind: "scientific", label: "open claim", note: "Still open" },
      { id: "R5", kind: "limitation", label: "limits", note: "Non-claims" },
      { id: "R6", kind: "trap", label: "ACCEPT!", note: "Trap bead" },
    ],
    bonds: [["R1", "R2"], ["R2", "R3"], ["R3", "R4"], ["R4", "R5"], ["R5", "R6"]],
    contacts: [
      { a: "R2", b: "R3", d: 0.11 },
      { a: "R4", b: "R5", d: 0.12 },
    ],
  },
  {
    id: "fold-pkpd-chain",
    title: "PKPD honesty board",
    blurb: "A computational PK package with an open biology claim. Seat tokens in honest zones—keep science out of the authority zone.",
    goal: "Hold heat ≤ 8 for 1.5s without scientific overclaim.",
    threshold: 8,
    hold_ms: 1500,
    residues: [
      { id: "R1", kind: "authority", label: "pcs verify", note: "CLI authority" },
      { id: "R2", kind: "computational", label: "C_REPLAY", note: "Analytic match" },
      { id: "R3", kind: "artifact", label: "predictions.csv", note: "Bound bytes" },
      { id: "R4", kind: "scientific", label: "C_BIOLOGY", note: "Adequacy open" },
      { id: "R5", kind: "limitation", label: "LIMITATIONS", note: "PASS ≠ adequacy" },
      { id: "R6", kind: "trap", label: "ACCEPT biology", note: "Trap bead" },
    ],
    bonds: [["R1", "R2"], ["R2", "R3"], ["R3", "R4"], ["R4", "R5"], ["R5", "R6"]],
    contacts: [
      { a: "R2", b: "R3", d: 0.11 },
      { a: "R5", b: "R4", d: 0.14 },
    ],
  },
  {
    id: "fold-tamper-storm",
    title: "Tamper storm",
    blurb: "Integrity failed. Yank the failure and traps into the reject zone while keeping limitations parked and science open.",
    goal: "Hold heat ≤ 10 for 1.5s after burying traps.",
    threshold: 10,
    hold_ms: 1500,
    residues: [
      { id: "R1", kind: "authority", label: "verify fail", note: "Authority recorded fail" },
      { id: "R2", kind: "rejected", label: "C_INTEGRITY", note: "Hash mismatch" },
      { id: "R3", kind: "artifact", label: "model.json", note: "Declared model" },
      { id: "R4", kind: "scientific", label: "C_ADEQUACY", note: "Still open" },
      { id: "R5", kind: "limitation", label: "LIMITATIONS", note: "Failure ≠ science proof" },
      { id: "R6", kind: "trap", label: "MERGE READY", note: "Trap" },
      { id: "R7", kind: "trap", label: "REGULATORY OK", note: "Trap" },
    ],
    bonds: [["R1", "R2"], ["R2", "R3"], ["R3", "R4"], ["R4", "R5"], ["R5", "R6"], ["R6", "R7"]],
    contacts: [
      { a: "R2", b: "R6", d: 0.12 },
      { a: "R5", b: "R4", d: 0.15 },
    ],
  },
  {
    id: "fold-crypto-vs-clinic",
    title: "Signatures ≠ clinics",
    blurb: "Valid signatures and unit checks can sit near authority—clinical adequacy must stay in the science-open zone.",
    goal: "Hold heat ≤ 9 for 1.5s with no clinical token in the authority zone.",
    threshold: 9,
    hold_ms: 1500,
    residues: [
      { id: "R1", kind: "authority", label: "Ed25519 ok", note: "Package authenticity" },
      { id: "R2", kind: "computational", label: "C_UNITS", note: "Unit check" },
      { id: "R3", kind: "artifact", label: "certificate", note: "Evidence root" },
      { id: "R4", kind: "scientific", label: "C_CLINICAL", note: "Clinical open" },
      { id: "R5", kind: "limitation", label: "NON-CLAIMS", note: "No clinical validity" },
      { id: "R6", kind: "trap", label: "SAFE DRUG", note: "Trap" },
    ],
    bonds: [["R1", "R2"], ["R2", "R3"], ["R3", "R4"], ["R4", "R5"], ["R1", "R5"]],
    contacts: [
      { a: "R1", b: "R2", d: 0.12 },
      { a: "R4", b: "R5", d: 0.12 },
    ],
  },
  {
    id: "fold-adversarial-nest",
    title: "Adversarial nest",
    blurb: "An adversarial package nests ACCEPT language beside a computational PASS. Separate them in space until the heat bottoms out.",
    goal: "Hold heat ≤ 11 for 1.8s after isolating traps.",
    threshold: 11,
    hold_ms: 1800,
    residues: [
      { id: "R1", kind: "authority", label: "verify ok", note: "Computational valid" },
      { id: "R2", kind: "computational", label: "C_REPLAY", note: "Supported" },
      { id: "R3", kind: "artifact", label: "receipt", note: "Reported fields" },
      { id: "R4", kind: "scientific", label: "C_REALWORLD", note: "Open" },
      { id: "R5", kind: "limitation", label: "inspection≠authority", note: "Banner" },
      { id: "R6", kind: "trap", label: "card_issues_accept", note: "Trap flag" },
      { id: "R7", kind: "trap", label: "LEAN=SCIENCE", note: "Trap conflation" },
      { id: "R8", kind: "rejected", label: "C_POLICY", note: "Policy unmet" },
    ],
    bonds: [
      ["R1", "R2"], ["R2", "R3"], ["R3", "R4"], ["R4", "R5"],
      ["R5", "R6"], ["R6", "R7"], ["R7", "R8"],
    ],
    contacts: [
      { a: "R2", b: "R3", d: 0.1 },
      { a: "R6", b: "R7", d: 0.1 },
      { a: "R8", b: "R6", d: 0.12 },
    ],
  },
]);

const STRUCTURE_BY_ID = new Map(STRUCTURES.map((s) => [s.id, s]));

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

function dist(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.hypot(dx, dy);
}

export function getStructure(id) {
  const s = STRUCTURE_BY_ID.get(id);
  if (!s) throw new Error(`Unknown structure: ${id}`);
  return s;
}

export function listStructures() {
  return STRUCTURES.map((s) => ({
    id: s.id,
    title: s.title,
    blurb: s.blurb,
    goal: s.goal,
    residue_count: s.residues.length,
    threshold: s.threshold,
  }));
}

/** Scrambled starting pose (continuous coords in [0.08,0.92]). */
export function initialPose(structureId, seed = "default") {
  const structure = getStructure(structureId);
  const rng = mulberry32(hashSeed(`${GAME_VERSION}:${structureId}:${seed}`));
  const residues = structure.residues.map((r, i) => {
    // Start as a messy arc so the fold is a real rearrange, not a quiz.
    const t = (i + rng()) / Math.max(1, structure.residues.length);
    return {
      ...r,
      x: 0.12 + rng() * 0.76,
      y: 0.18 + ((t + rng() * 0.2) % 1) * 0.64,
      vx: 0,
      vy: 0,
      radius: 0.045,
    };
  });
  return {
    structure_id: structureId,
    seed: String(seed),
    game_version: GAME_VERSION,
    residues,
  };
}

export function moveResidue(pose, residueId, x, y) {
  if (!pose?.residues?.some((r) => r.id === residueId)) {
    throw new Error("Unknown residue");
  }
  const residues = pose.residues.map((r) => {
    if (r.id !== residueId) return r;
    return {
      ...r,
      x: Math.min(0.96, Math.max(0.04, x)),
      y: Math.min(0.96, Math.max(0.04, y)),
      vx: 0,
      vy: 0,
    };
  });
  return { ...pose, residues };
}

export function nudgeResidue(pose, residueId, dx, dy) {
  const r = pose.residues.find((x) => x.id === residueId);
  if (!r) throw new Error("Unknown residue");
  return moveResidue(pose, residueId, r.x + dx, r.y + dy);
}

/**
 * Soft zone magnetism — snap feel without forcing a quiz answer.
 * Pulls a token toward its home zone only when already near the rim.
 */
export function softMagnetPose(pose, residueId) {
  const r = pose.residues.find((x) => x.id === residueId);
  if (!r) throw new Error("Unknown residue");
  const home = POCKETS[KINDS[r.kind]?.pocket];
  if (!home) return pose;
  const d = dist(r, home);
  const pullStart = home.r * 1.35;
  if (d <= home.r * 0.85 || d > pullStart) return pose;
  const t = Math.min(1, (pullStart - d) / (pullStart - home.r * 0.85));
  const strength = 0.22 + t * 0.45;
  const nx = r.x + (home.x - r.x) * strength;
  const ny = r.y + (home.y - r.y) * strength;
  return moveResidue(pose, residueId, nx, ny);
}

/**
 * Star rating for a locked fold. Pure function of engine grade + action stats.
 * 3★ = tight energy, short trajectory, no wiggle. Never issues ACCEPT.
 */
export function rateFoldLock({ energy, threshold, actionCount, hints, comboMax = 0 }) {
  if (!Number.isFinite(energy) || !Number.isFinite(threshold) || energy > threshold) {
    throw new Error("rateFoldLock requires a stable under-threshold energy");
  }
  const headroom = (threshold - energy) / Math.max(0.1, threshold);
  let stars = 1;
  if (headroom >= 0.15 && actionCount <= 48 && hints === 0) stars = 2;
  if (headroom >= 0.35 && actionCount <= 28 && hints === 0 && comboMax >= 3) stars = 3;
  return {
    stars,
    headroom: Math.round(headroom * 1000) / 1000,
    issues_accept: false,
    label: stars === 3 ? "Flawless fold" : stars === 2 ? "Clean fold" : "Locked fold",
  };
}

export function nextCampaignStructure(clearedId) {
  const idx = CAMPAIGN_ORDER.indexOf(clearedId);
  if (idx < 0 || idx >= CAMPAIGN_ORDER.length - 1) return null;
  return CAMPAIGN_ORDER[idx + 1];
}

/**
 * Small random shake — local search assist (counts as a hint).
 * Deterministic in (pose.seed, seed) so research trajectories can be replayed.
 */
export function wigglePose(pose, seed = "wiggle") {
  const rng = mulberry32(hashSeed(`${pose.seed}:${seed}`));
  const residues = pose.residues.map((r) => ({
    ...r,
    x: Math.min(0.96, Math.max(0.04, r.x + (rng() - 0.5) * 0.06)),
    y: Math.min(0.96, Math.max(0.04, r.y + (rng() - 0.5) * 0.06)),
  }));
  return { ...pose, residues };
}

/** Held-out structures never enter local fold-coach fitting. */
export const EVALUATION_STRUCTURES = Object.freeze(["fold-adversarial-nest"]);

export const SESSION_FORMAT = "pcs-assurance-fold-session-v1";
export const MAX_SESSION_ACTIONS = 400;

function quantize(v) {
  return Math.round(Number(v) * 1000) / 1000;
}

function poseCoords(pose) {
  return pose.residues.map((r) => ({
    id: r.id,
    kind: r.kind,
    x: quantize(r.x),
    y: quantize(r.y),
  }));
}

function assertAction(action) {
  if (!action || typeof action !== "object" || Array.isArray(action)) {
    throw new Error("Invalid fold action");
  }
  if ("reward" in action || "energy" in action || "score" in action || "stable" in action) {
    throw new Error("Client-supplied labels rejected");
  }
  const keys = Object.keys(action).sort().join(",");
  if (action.type === "place" && keys === "residue_id,type,x,y") {
    if (typeof action.residue_id !== "string") throw new Error("Invalid place");
    if (!Number.isFinite(action.x) || !Number.isFinite(action.y)) throw new Error("Invalid place coords");
    return;
  }
  if (action.type === "nudge" && keys === "dx,dy,residue_id,type") {
    if (typeof action.residue_id !== "string") throw new Error("Invalid nudge");
    if (!Number.isFinite(action.dx) || !Number.isFinite(action.dy)) throw new Error("Invalid nudge");
    if (Math.abs(action.dx) > 0.2 || Math.abs(action.dy) > 0.2) throw new Error("Nudge too large");
    return;
  }
  if (action.type === "wiggle" && keys === "seed,type") {
    if (typeof action.seed !== "string" || action.seed.length > 64) throw new Error("Invalid wiggle seed");
    return;
  }
  if (action.type === "check" && keys === "type") return;
  if (action.type === "lock" && keys === "type") return;
  if (action.type === "assist" && keys === "type") return;
  throw new Error("Unknown or unavailable fold action");
}

/**
 * Replay a typed action session. Energy, reward, stability and assistance are
 * recomputed by the engine — never accepted from the client.
 */
export function replayFoldSession(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("Invalid fold session");
  }
  const keys = Object.keys(input).sort();
  const allowed = ["actions", "format", "game_version", "mode", "seed", "structure_id"];
  if (keys.some((k) => !allowed.includes(k))) throw new Error("Unexpected fold session fields");
  for (const req of ["actions", "format", "game_version", "seed", "structure_id"]) {
    if (!keys.includes(req)) throw new Error("Unexpected fold session fields");
  }
  if (input.format !== SESSION_FORMAT) throw new Error("Unsupported fold session format");
  if (input.game_version !== GAME_VERSION) throw new Error("Unsupported fold game version");
  const mode = input.mode ?? "practice";
  if (!["practice", "campaign", "daily"].includes(mode)) throw new Error("Invalid fold mode");
  if (typeof input.structure_id !== "string") throw new Error("Unknown structure");
  getStructure(input.structure_id);
  if (typeof input.seed !== "string" || input.seed.length > 80) throw new Error("Invalid seed");
  if (!Array.isArray(input.actions) || input.actions.length < 1 || input.actions.length > MAX_SESSION_ACTIONS) {
    throw new Error("Invalid fold action trajectory length");
  }

  let pose = initialPose(input.structure_id, input.seed);
  let hints = 0;
  let checks = 0;
  let locked = false;
  const transitions = [];

  for (let i = 0; i < input.actions.length; i++) {
    const action = input.actions[i];
    assertAction(action);
    const before = gradePose(input.structure_id, pose, { hints_used: hints });
    const stateBefore = poseCoords(pose);
    const assistedBefore = hints > 0;

    if (action.type === "place") {
      pose = moveResidue(pose, action.residue_id, quantize(action.x), quantize(action.y));
    } else if (action.type === "nudge") {
      pose = nudgeResidue(pose, action.residue_id, quantize(action.dx), quantize(action.dy));
    } else if (action.type === "wiggle") {
      hints = Math.min(40, hints + 1);
      pose = wigglePose(pose, action.seed);
    } else if (action.type === "assist") {
      hints = Math.min(40, hints + 1);
    } else if (action.type === "check") {
      checks += 1;
    } else if (action.type === "lock") {
      if (!before.stable) throw new Error("Lock requires a stable pose");
      locked = true;
    }

    const after = gradePose(input.structure_id, pose, { hints_used: hints });
    const delta = before.energy - after.energy;
    let reward = Math.round(delta * 5) / 10;
    if (after.components.overclaim > before.components.overclaim) reward -= 2;
    if (action.type === "wiggle" || action.type === "assist") reward -= 0.4;
    if (action.type === "check" && after.stable) reward += 3;
    if (action.type === "lock" && after.stable) reward += 10;
    reward = Math.round(reward * 10) / 10;

    transitions.push({
      index: i,
      action: { ...action },
      state_before: stateBefore,
      state_after: poseCoords(pose),
      energy_before: before.energy,
      energy_after: after.energy,
      components_after: after.components,
      stable_after: after.stable,
      assisted_before_action: assistedBefore,
      assisted: hints > 0,
      reward,
      done: locked,
    });
  }

  const final = gradePose(input.structure_id, pose, { hints_used: hints });
  const split = EVALUATION_STRUCTURES.includes(input.structure_id) ? "evaluation" : "training";
  const rating = locked && final.stable
    ? rateFoldLock({
        energy: final.energy,
        threshold: final.threshold,
        actionCount: input.actions.length,
        hints,
        comboMax: 0,
      })
    : null;
  return {
    format: "pcs-assurance-fold-verified-session-v1",
    game_version: GAME_VERSION,
    structure_id: input.structure_id,
    seed: input.seed,
    mode,
    split,
    transitions,
    checks,
    hints,
    locked,
    final_energy: final.energy,
    final_stable: final.stable,
    rating,
    issues_accept: false,
    inspection_is_not_authority: true,
    training_use:
      "Replay-checked spatial fold choices only. Rewards and stability are engine-derived. " +
      "Not a Lean proof, clinical validation, security certification, or merge recommendation.",
  };
}

/** Build a compact session envelope from recorded actions (no labels). */
export function makeFoldSession(structureId, seed, actions, mode = "practice") {
  if (!["practice", "campaign", "daily"].includes(mode)) throw new Error("Invalid fold mode");
  return {
    format: SESSION_FORMAT,
    game_version: GAME_VERSION,
    structure_id: structureId,
    seed: String(seed),
    mode,
    actions,
  };
}

/**
 * Synthetic expert trajectory: place each residue onto its ideal pocket pose.
 * Tagged only via caller provenance — useful for offline RL bootstrap, not human data.
 */
export function syntheticExpertActions(structureId, seed = "synthetic") {
  const start = initialPose(structureId, seed);
  const ideal = idealPose(structureId);
  const byId = new Map(ideal.residues.map((r) => [r.id, r]));
  const actions = [];
  for (const r of start.residues) {
    const target = byId.get(r.id);
    actions.push({
      type: "place",
      residue_id: r.id,
      x: quantize(target.x),
      y: quantize(target.y),
    });
  }
  actions.push({ type: "check" });
  const probe = replayFoldSession(makeFoldSession(structureId, seed, actions));
  if (probe.final_stable) actions.push({ type: "lock" });
  return actions;
}

/**
 * Independent continuous energy. Returns components for UI feedback.
 */
export function gradePose(structureId, pose, options = {}) {
  const structure = getStructure(structureId);
  const hints = Number(options.hints_used || 0);
  if (!Number.isInteger(hints) || hints < 0 || hints > 40) {
    throw new Error("Invalid hint count");
  }
  if (!pose || !Array.isArray(pose.residues)) throw new Error("Invalid pose");

  const byId = new Map(pose.residues.map((r) => [r.id, r]));
  for (const r of structure.residues) {
    if (!byId.has(r.id)) throw new Error("Pose missing residue");
  }
  if (pose.residues.length !== structure.residues.length) {
    throw new Error("Pose residue count mismatch");
  }

  let clash = 0;
  let backbone = 0;
  let contact = 0;
  let pocket = 0;
  let overclaim = 0;
  const tensions = [];

  const residues = pose.residues;
  for (let i = 0; i < residues.length; i++) {
    for (let j = i + 1; j < residues.length; j++) {
      const a = residues[i];
      const b = residues[j];
      const d = dist(a, b);
      const min = a.radius + b.radius;
      if (d < min) {
        const pen = ((min - d) / min) ** 2 * 18;
        clash += pen;
        if (pen > 2) tensions.push({ type: "clash", a: a.id, b: b.id });
      }
      // Scientific overclaim: science bead pressed into authority bead.
      if (
        (a.kind === "scientific" && b.kind === "authority") ||
        (b.kind === "scientific" && a.kind === "authority")
      ) {
        if (d < 0.16) {
          overclaim += (0.16 - d) * 55;
          tensions.push({ type: "scientific_overclaim", a: a.id, b: b.id });
        }
      }
      // Trap near authority/computational when not in reject pocket.
      const trap = a.kind === "trap" ? a : b.kind === "trap" ? b : null;
      const other = trap === a ? b : trap === b ? a : null;
      if (trap && other && (other.kind === "authority" || other.kind === "computational")) {
        if (d < 0.14) {
          overclaim += (0.14 - d) * 40;
          tensions.push({ type: "trap_near_authority", a: trap.id, b: other.id });
        }
      }
    }
  }

  for (const [aId, bId] of structure.bonds) {
    const a = byId.get(aId);
    const b = byId.get(bId);
    const d = dist(a, b);
    // Same-pocket bonds stay tight; cross-well chain links may span the board.
    const samePocket = KINDS[a.kind]?.pocket === KINDS[b.kind]?.pocket;
    const target = samePocket ? 0.12 : 0.4;
    const weight = samePocket ? 22 : 6;
    backbone += (d - target) ** 2 * weight;
  }

  for (const c of structure.contacts) {
    const a = byId.get(c.a);
    const b = byId.get(c.b);
    contact += (dist(a, b) - c.d) ** 2 * 30;
  }

  for (const r of residues) {
    const home = KINDS[r.kind]?.pocket;
    const pocketDef = POCKETS[home];
    if (!pocketDef) continue;
    const d = dist(r, pocketDef);
    // Soft well: reward being inside pocket radius.
    if (d > pocketDef.r) {
      pocket += (d - pocketDef.r) ** 2 * 35;
      if (d - pocketDef.r > 0.08) {
        tensions.push({ type: "off_pocket", a: r.id, pocket: home });
      }
    }
    // Extra punishment: science inside authority pocket.
    if (r.kind === "scientific") {
      const auth = POCKETS.authority;
      if (dist(r, auth) < auth.r * 0.9) {
        overclaim += 25;
        tensions.push({ type: "science_in_authority_well", a: r.id });
      }
    }
    if (r.kind === "trap") {
      const rej = POCKETS.reject;
      if (dist(r, rej) > rej.r) {
        pocket += 6;
      }
    }
  }

  const hintPenalty = Math.min(40, hints) * 0.35;
  const energy =
    clash + backbone * 0.45 + contact * 0.35 + pocket + overclaim + hintPenalty;
  const rounded = Math.round(energy * 10) / 10;
  const threshold = structure.threshold;
  const stable = rounded <= threshold && overclaim < 0.5;
  const score = Math.max(0, Math.round(100 - rounded));

  return {
    game_version: GAME_VERSION,
    structure_id: structureId,
    energy: rounded,
    threshold,
    score,
    stable,
    hints_used: hints,
    components: {
      clash: Math.round(clash * 10) / 10,
      backbone: Math.round(backbone * 0.45 * 10) / 10,
      contact: Math.round(contact * 0.35 * 10) / 10,
      pocket: Math.round(pocket * 10) / 10,
      overclaim: Math.round(overclaim * 10) / 10,
      hints: Math.round(hintPenalty * 10) / 10,
    },
    tensions: tensions.slice(0, 12),
    issues_accept: false,
    inspection_is_not_authority: true,
    meaning:
      "Assurance Fold grades a continuous spatial board for an educational " +
      "evidence package. A locked low-heat board is not a Lean 4 proof, clinical " +
      "validation, security proof, or merge recommendation. card_issues_accept remains false.",
  };
}

export function dailyStructureId(date = new Date()) {
  const day = date.toISOString().slice(0, 10);
  return STRUCTURES[hashSeed(`daily:${day}`) % STRUCTURES.length].id;
}

/**
 * Near-optimal pose for tests/tutorials: pack each residue inside its home
 * pocket without bead clashes. Cross-well bonds remain soft so a pocket-correct
 * fold can sit under the structure threshold.
 */
export function idealPose(structureId) {
  const structure = getStructure(structureId);
  const groups = new Map();
  for (const r of structure.residues) {
    const home = KINDS[r.kind].pocket;
    if (!groups.has(home)) groups.set(home, []);
    groups.get(home).push(r);
  }
  const placed = new Map();
  for (const [home, list] of groups) {
    const pocket = POCKETS[home];
    const n = list.length;
    list.forEach((r, i) => {
      const angle = n === 1 ? 0 : (i / n) * Math.PI * 2 + 0.35;
      // Keep beads clear of each other (radius 0.045 → center spacing ≥ 0.1).
      const rad = n === 1 ? 0 : Math.min(pocket.r * 0.55, 0.055 + (n - 2) * 0.012);
      placed.set(r.id, {
        ...r,
        x: pocket.x + Math.cos(angle) * rad,
        y: pocket.y + Math.sin(angle) * rad,
        vx: 0,
        vy: 0,
        radius: 0.045,
      });
    });
  }
  // Nudge bonded same-pocket pairs slightly closer for contact targets.
  for (const c of structure.contacts || []) {
    const a = placed.get(c.a);
    const b = placed.get(c.b);
    if (!a || !b) continue;
    if (KINDS[a.kind].pocket !== KINDS[b.kind].pocket) continue;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;
    const half = Math.max(0.05, c.d / 2);
    const ang = Math.atan2(b.y - a.y, b.x - a.x) || 0.2;
    a.x = midX - Math.cos(ang) * half;
    a.y = midY - Math.sin(ang) * half;
    b.x = midX + Math.cos(ang) * half;
    b.y = midY + Math.sin(ang) * half;
  }
  return {
    structure_id: structureId,
    seed: "ideal",
    game_version: GAME_VERSION,
    residues: structure.residues.map((r) => placed.get(r.id)),
  };
}
