/**
 * Assurance Fold v2 — continuous Foldit-style spatial folding engine.
 *
 * Players freely drag evidence “residues” on a 2D board. An independent
 * energy function scores clashes, backbone stretch, pocket affinity, and
 * scientific overclaim. Lower energy is better. Stability requires holding
 * a low-energy pose — not answering a quiz.
 *
 * Never issues scientific ACCEPT/PASS. Local practice only.
 */

export const GAME_VERSION = "assurance-fold-v2";

export const KINDS = Object.freeze({
  authority: { label: "Authority", color: "#1f3a5f", pocket: "authority" },
  computational: { label: "Computational", color: "#0c5c4a", pocket: "computational" },
  artifact: { label: "Artifact", color: "#0b7a5c", pocket: "computational" },
  scientific: { label: "Scientific open", color: "#8a4b00", pocket: "scientific" },
  trap: { label: "Overclaim trap", color: "#8f1d1d", pocket: "reject" },
  rejected: { label: "Failed check", color: "#b42318", pocket: "reject" },
  limitation: { label: "Limitations", color: "#7a6200", pocket: "limits" },
});

/** Soft attractor pockets (normalized 0–1 board coords). */
export const POCKETS = Object.freeze({
  authority: { x: 0.18, y: 0.28, r: 0.14, label: "Authority well" },
  computational: { x: 0.52, y: 0.32, r: 0.16, label: "Computational well" },
  scientific: { x: 0.82, y: 0.30, r: 0.13, label: "Science-open well" },
  reject: { x: 0.22, y: 0.72, r: 0.14, label: "Reject well" },
  limits: { x: 0.72, y: 0.74, r: 0.15, label: "Limitations well" },
});

export const STRUCTURES = Object.freeze([
  {
    id: "fold-pkpd-chain",
    title: "PKPD honesty fold",
    blurb: "A computational PK package with an open biology claim. Dock residues into honest wells—keep science out of the authority pocket.",
    goal: "Hold energy ≤ 8 for 1.5s without scientific overclaim.",
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
    blurb: "Integrity failed. Yank the failure and traps into the reject well while keeping limitations parked and science open.",
    goal: "Hold energy ≤ 10 for 1.5s after burying traps.",
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
    blurb: "Valid signatures and unit checks can sit near authority—clinical adequacy must stay in the science-open well.",
    goal: "Hold energy ≤ 9 for 1.5s with no clinical bead in the authority well.",
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
    blurb: "An adversarial package nests ACCEPT language beside a computational PASS. Separate them in space until the energy bottoms out.",
    goal: "Hold energy ≤ 11 for 1.8s after isolating traps.",
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

/** Small random wiggle — Foldit-like local search assist (counts as a hint). */
export function wigglePose(pose, seed = "wiggle") {
  const rng = mulberry32(hashSeed(`${pose.seed}:${seed}:${Date.now()}`));
  const residues = pose.residues.map((r) => ({
    ...r,
    x: Math.min(0.96, Math.max(0.04, r.x + (rng() - 0.5) * 0.06)),
    y: Math.min(0.96, Math.max(0.04, r.y + (rng() - 0.5) * 0.06)),
  }));
  return { ...pose, residues };
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
      "Assurance Fold v2 grades a continuous spatial pose for an educational " +
      "evidence package. A stable low-energy fold is not a Lean 4 proof, clinical " +
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
