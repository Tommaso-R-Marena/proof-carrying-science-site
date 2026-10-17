/**
 * Assurance Fold v2 UI — continuous canvas Foldit-style play.
 * No network. Independent energy from assurance-fold-core.mjs.
 * Local notebooks export RL transitions; labels are engine-replayed only.
 */
import {
  GAME_VERSION,
  KINDS,
  POCKETS,
  dailyStructureId,
  getStructure,
  gradePose,
  initialPose,
  listStructures,
  makeFoldSession,
  moveResidue,
  nudgeResidue,
  replayFoldSession,
  wigglePose,
} from "./assurance-fold-core.mjs";
import {
  exportFoldRlRows,
  fitFoldSessions,
  foldModelEnvelope,
  suggestPocket,
  syntheticBootstrapSessions,
} from "./assurance-fold-learning.mjs";

const $ = (id) => document.getElementById(id);
const MAX_NOTEBOOKS = 20;

let pose = null;
let selectedId = null;
let dragging = null;
let hintsUsed = 0;
let bestEnergy = Infinity;
let holdStarted = null;
let locked = false;
let raf = 0;
let particles = [];
let shake = 0;
let actions = [];
let notebooks = [];
let coachModel = null;
let lockRecorded = false;

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function q(v) {
  return Math.round(Number(v) * 1000) / 1000;
}

function record(action) {
  if (locked && action.type !== "lock") return;
  if (actions.length >= 400) {
    $("afLive").textContent = "Action cap reached for this notebook (400). Export or reset.";
    return;
  }
  actions.push(action);
  refreshResearchHud();
}

function canvasPoint(event, canvas) {
  const rect = canvas.getBoundingClientRect();
  const clientX = event.clientX ?? event.touches?.[0]?.clientX;
  const clientY = event.clientY ?? event.touches?.[0]?.clientY;
  return {
    x: (clientX - rect.left) / rect.width,
    y: (clientY - rect.top) / rect.height,
  };
}

function hitResidue(nx, ny) {
  let best = null;
  let bestD = Infinity;
  for (const r of pose.residues) {
    const d = Math.hypot(r.x - nx, r.y - ny);
    if (d < r.radius * 1.35 && d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

function spawnSpark(x, y, color) {
  for (let i = 0; i < 6; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.01,
      vy: (Math.random() - 0.5) * 0.01,
      life: 1,
      color,
    });
  }
}

function download(name, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function currentSession() {
  return makeFoldSession(pose.structure_id, pose.seed, actions);
}

function refreshResearchHud() {
  const status = $("afResearchStatus");
  if (!status) return;
  status.textContent = `Live actions ${actions.length} · saved notebooks ${notebooks.length}/${MAX_NOTEBOOKS} · coach ${
    coachModel ? "fitted" : "none"
  }`;
}

function renderMissionList() {
  const list = $("afMissionList");
  list.innerHTML = "";
  for (const s of listStructures()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.structure = s.id;
    if (pose?.structure_id === s.id) btn.setAttribute("aria-current", "true");
    btn.innerHTML = `<strong>${esc(s.title)}</strong><small>${esc(s.residue_count)} residues · threshold ${esc(s.threshold)}</small>`;
    btn.addEventListener("click", () => loadStructure(s.id));
    list.appendChild(btn);
  }
}

function updateHud(grade) {
  $("afEnergyValue").textContent = String(grade.energy);
  $("afEnergyBar").max = Math.max(40, grade.threshold * 4);
  $("afEnergyBar").value = Math.min(grade.energy, $("afEnergyBar").max);
  const hold = holdStarted
    ? Math.min(1, (performance.now() - holdStarted) / getStructure(pose.structure_id).hold_ms)
    : 0;
  $("afEnergyMeta").textContent = grade.stable
    ? `Stable zone · hold ${(hold * 100).toFixed(0)}% · best ${bestEnergy === Infinity ? "—" : bestEnergy}`
    : `Exploring · best ${bestEnergy === Infinity ? "—" : bestEnergy} · overclaim ${grade.components.overclaim}`;
  $("afScore").textContent = String(grade.score);
  $("afComponents").textContent =
    `clash ${grade.components.clash} · pocket ${grade.components.pocket} · stretch ${grade.components.backbone} · traps ${grade.components.overclaim}`;
  const fill = $("afHoldFill");
  if (fill) fill.style.width = `${(hold * 100).toFixed(1)}%`;
}

function draw() {
  const canvas = $("afCanvas");
  if (!canvas || !pose) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const ox = shake ? (Math.random() - 0.5) * shake * 8 : 0;
  const oy = shake ? (Math.random() - 0.5) * shake * 8 : 0;
  shake *= 0.85;

  ctx.clearRect(0, 0, w, h);
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#e7f3ee");
  g.addColorStop(1, "#f4f7f5");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(ox, oy);

  for (const [name, pocket] of Object.entries(POCKETS)) {
    const px = pocket.x * w;
    const py = pocket.y * h;
    const pr = pocket.r * Math.min(w, h);
    ctx.beginPath();
    ctx.setLineDash([6, 6]);
    ctx.strokeStyle = name === "authority" ? "#1f3a5f99" : name === "reject" ? "#8f1d1d99" : "#0c5c4a88";
    ctx.lineWidth = 2;
    ctx.arc(px, py, pr, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#13241f99";
    ctx.font = `${Math.max(11, Math.floor(w * 0.014))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(pocket.label, px, py - pr - 6);
  }

  const structure = getStructure(pose.structure_id);
  const byId = new Map(pose.residues.map((r) => [r.id, r]));
  ctx.strokeStyle = "#9aada4";
  ctx.lineWidth = 1.5;
  for (const [aId, bId] of structure.bonds) {
    const a = byId.get(aId);
    const b = byId.get(bId);
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }

  for (const r of pose.residues) {
    const meta = KINDS[r.kind];
    const rx = r.x * w;
    const ry = r.y * h;
    const rr = r.radius * Math.min(w, h);
    ctx.beginPath();
    ctx.fillStyle = meta.color;
    ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.fill();
    if (selectedId === r.id) {
      ctx.strokeStyle = "#13241f";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${Math.max(10, Math.floor(rr * 0.55))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = r.label.length > 8 ? r.label.slice(0, 7) + "…" : r.label;
    ctx.fillText(label, rx, ry);
    ctx.textAlign = "start";
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x * w, p.y * h, 3, 3);
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.04;
  }
  ctx.globalAlpha = 1;
  particles = particles.filter((p) => p.life > 0);
  ctx.restore();
}

function tick() {
  if (!pose) return;
  const grade = gradePose(pose.structure_id, pose, { hints_used: hintsUsed });
  if (grade.energy < bestEnergy) {
    bestEnergy = grade.energy;
    spawnSpark(0.5, 0.5, "#0c5c4a");
  }
  if (grade.components.clash > 4 || grade.components.overclaim > 8) shake = Math.min(1, shake + 0.35);

  if (grade.stable) {
    if (!holdStarted) holdStarted = performance.now();
    const need = getStructure(pose.structure_id).hold_ms;
    if (!locked && performance.now() - holdStarted >= need) {
      locked = true;
      if (!lockRecorded) {
        record({ type: "lock" });
        lockRecorded = true;
      }
      const box = $("afFeedback");
      box.hidden = false;
      box.dataset.tone = "ok";
      box.innerHTML = `<strong>Stable fold locked</strong>
        <p>Energy <code>${grade.energy}</code> · score <code>${grade.score}</code> · issues_accept <code>false</code></p>
        <p>Trajectory has <code>${actions.length}</code> typed actions ready to save as an RL notebook.</p>
        <p>${esc(grade.meaning)}</p>`;
      $("afNext").hidden = false;
      $("afLive").textContent = "Fold locked — save the notebook to capture engine-replayed rewards.";
      for (let i = 0; i < 18; i++) {
        spawnSpark(0.5 + (Math.random() - 0.5) * 0.2, 0.45 + (Math.random() - 0.5) * 0.2, "#0c5c4a");
      }
    }
  } else {
    holdStarted = null;
    if (!lockRecorded) locked = false;
  }

  updateHud(grade);
  draw();
  raf = requestAnimationFrame(tick);
}

function loadStructure(id, seed = "play") {
  pose = initialPose(id, seed);
  selectedId = null;
  hintsUsed = 0;
  bestEnergy = Infinity;
  holdStarted = null;
  locked = false;
  lockRecorded = false;
  particles = [];
  actions = [];
  const s = getStructure(id);
  $("afLevel").textContent = `${s.id} · ${GAME_VERSION}`;
  $("afTitle").textContent = s.title;
  $("afStory").textContent = s.blurb;
  $("afGoal").textContent = s.goal;
  $("afFeedback").hidden = true;
  $("afNext").hidden = true;
  $("afLive").textContent = "Drag residues into the soft wells. Every place/nudge/wiggle is typed for research export.";
  renderMissionList();
  refreshResearchHud();
}

function bindCanvas() {
  const canvas = $("afCanvas");
  const resize = () => {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.max(320, Math.floor(rect.width * dpr));
    canvas.height = Math.max(280, Math.floor(rect.height * dpr));
  };
  resize();
  window.addEventListener("resize", resize);

  const start = (event) => {
    if (locked) return;
    event.preventDefault();
    const p = canvasPoint(event, canvas);
    const hit = hitResidue(p.x, p.y);
    if (!hit) return;
    selectedId = hit.id;
    dragging = hit.id;
    $("afLive").textContent = `Dragging ${hit.label} (${KINDS[hit.kind].label})`;
  };
  const move = (event) => {
    if (!dragging || locked) return;
    event.preventDefault();
    const p = canvasPoint(event, canvas);
    pose = moveResidue(pose, dragging, p.x, p.y);
  };
  const end = () => {
    if (!dragging) return;
    const bead = pose.residues.find((r) => r.id === dragging);
    spawnSpark(bead.x, bead.y, KINDS[bead.kind].color);
    record({ type: "place", residue_id: dragging, x: q(bead.x), y: q(bead.y) });
    dragging = null;
  };

  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointerleave", end);
  canvas.addEventListener("pointercancel", end);
}

function saveNotebook() {
  if (!actions.length) {
    $("afLive").textContent = "No actions yet — fold first, then save.";
    return;
  }
  try {
    const session = currentSession();
    const replay = replayFoldSession(session);
    if (!replay.locked || !replay.final_stable) {
      $("afLive").textContent = "Only locked stable folds can enter the notebook collection.";
      return;
    }
    if (notebooks.length >= MAX_NOTEBOOKS) notebooks.shift();
    notebooks.push(session);
    refreshResearchHud();
    $("afLive").textContent = `Notebook saved (${replay.transitions.length} engine-labeled transitions, split=${replay.split}).`;
  } catch (err) {
    $("afLive").textContent = `Save failed: ${err.message}`;
  }
}

function exportRlDataset() {
  if (!notebooks.length) {
    $("afLive").textContent = "Save at least one locked notebook before exporting.";
    return;
  }
  try {
    const rows = exportFoldRlRows(notebooks, "all");
    const payload = {
      format: "pcs-assurance-fold-rl-dataset-v1",
      game_version: GAME_VERSION,
      issues_accept: false,
      authority: "NONE",
      checker_before_label: true,
      rows,
      meaning:
        "Engine-replayed (s,a,r,s') rows for offline RL / BC. Not Lean authority or clinical validity.",
    };
    download(`assurance-fold-rl-${Date.now()}.json`, JSON.stringify(payload, null, 2));
    $("afLive").textContent = `Exported ${rows.length} RL transitions (rewards recomputed by the fold engine).`;
  } catch (err) {
    $("afLive").textContent = `Export failed: ${err.message}`;
  }
}

function exportSessions() {
  if (!notebooks.length) {
    $("afLive").textContent = "No notebooks to export.";
    return;
  }
  download(
    `assurance-fold-sessions-${Date.now()}.json`,
    JSON.stringify({ format: "pcs-assurance-fold-notebook-collection-v1", sessions: notebooks }, null, 2)
  );
}

function fitCoach() {
  try {
    const pool = notebooks.length ? notebooks : syntheticBootstrapSessions(["ui-a", "ui-b"]);
    const fitted = fitFoldSessions(pool);
    coachModel = foldModelEnvelope(fitted, {
      data_origin: notebooks.length
        ? "private local fold notebooks; account provenance and research consent not asserted"
        : "synthetic expert bootstrap; not human research data",
      evaluation_examples_used_for_training: 0,
      hint_assisted_episodes_used_for_training: 0,
      episodes: fitted.training.episodes,
      examples: fitted.training.examples,
    });
    download(`assurance-fold-coach-${Date.now()}.json`, JSON.stringify(coachModel, null, 2));
    refreshResearchHud();
    $("afLive").textContent = `Fold coach fitted on ${fitted.training.examples} place-actions (${fitted.training.episodes} episodes). Untrusted suggestion only.`;
  } catch (err) {
    $("afLive").textContent = `Fit failed: ${err.message}`;
  }
}

function askCoach() {
  if (!coachModel) {
    $("afLive").textContent = "Fit a local coach first (or it will refuse without data).";
    return;
  }
  if (!selectedId) {
    $("afLive").textContent = "Select a residue, then ask the coach which pocket it suggests.";
    return;
  }
  try {
    const state = pose.residues.map((r) => ({ id: r.id, kind: r.kind, x: q(r.x), y: q(r.y) }));
    const tip = suggestPocket(coachModel, state);
    $("afLive").textContent = `Coach suggests pocket “${tip.pocket}” for the current pose (authority=NONE). Not ACCEPT.`;
  } catch (err) {
    $("afLive").textContent = `Coach failed: ${err.message}`;
  }
}

function boot() {
  bindCanvas();
  const params = new URLSearchParams(location.search);
  const id = params.get("structure") || dailyStructureId();
  try {
    loadStructure(id, params.get("seed") || "boot");
  } catch {
    loadStructure(listStructures()[0].id, "boot");
  }

  $("afWiggle").addEventListener("click", () => {
    hintsUsed = Math.min(40, hintsUsed + 1);
    const seed = `w${hintsUsed}`;
    pose = wigglePose(pose, seed);
    record({ type: "wiggle", seed });
    $("afLive").textContent = `Wiggle assist used (${hintsUsed}). Energy penalty applied; flagged assisted.`;
    spawnSpark(0.5, 0.45, "#c47b16");
  });
  $("afReset").addEventListener("click", () => loadStructure(pose.structure_id, pose.seed));
  $("afShuffle").addEventListener("click", () =>
    loadStructure(pose.structure_id, `shuffle-${Math.floor(Math.random() * 1e9)}`)
  );
  $("afDaily").addEventListener("click", () => loadStructure(dailyStructureId(), "daily"));
  $("afCheck").addEventListener("click", () => {
    record({ type: "check" });
    const grade = gradePose(pose.structure_id, pose, { hints_used: hintsUsed });
    const box = $("afFeedback");
    box.hidden = false;
    box.dataset.tone = grade.stable ? "ok" : grade.components.overclaim > 0 ? "bad" : "warn";
    const tensions = grade.tensions.length
      ? `<ul>${grade.tensions
          .slice(0, 6)
          .map((t) => `<li><code>${esc(t.type)}</code>${t.a ? ` · ${esc(t.a)}` : ""}${t.b ? `↔${esc(t.b)}` : ""}</li>`)
          .join("")}</ul>`
      : "<p>No major tensions listed — keep holding in the stable zone.</p>";
    box.innerHTML = `<strong>${grade.stable ? "In the stable zone" : "Still tense"}</strong>
      <p>Energy <code>${grade.energy}</code> / threshold <code>${grade.threshold}</code> · score <code>${grade.score}</code> · issues_accept <code>false</code></p>
      ${tensions}
      <p>${esc(grade.meaning)}</p>`;
  });
  $("afNext").addEventListener("click", () => {
    const ids = listStructures().map((s) => s.id);
    const idx = ids.indexOf(pose.structure_id);
    loadStructure(ids[(idx + 1) % ids.length], `next-${Date.now()}`);
  });

  $("afSaveNotebook")?.addEventListener("click", saveNotebook);
  $("afExportRl")?.addEventListener("click", exportRlDataset);
  $("afExportSessions")?.addEventListener("click", exportSessions);
  $("afFitCoach")?.addEventListener("click", fitCoach);
  $("afAskCoach")?.addEventListener("click", askCoach);
  $("afClearNotebooks")?.addEventListener("click", () => {
    notebooks = [];
    coachModel = null;
    refreshResearchHud();
    $("afLive").textContent = "Local notebooks cleared. Nothing was uploaded.";
  });

  document.addEventListener("keydown", (event) => {
    if (!selectedId || locked) return;
    const step = event.shiftKey ? 0.03 : 0.012;
    let dx = 0;
    let dy = 0;
    if (event.key === "ArrowLeft") dx = -step;
    else if (event.key === "ArrowRight") dx = step;
    else if (event.key === "ArrowUp") dy = -step;
    else if (event.key === "ArrowDown") dy = step;
    else return;
    event.preventDefault();
    pose = nudgeResidue(pose, selectedId, dx, dy);
    record({ type: "nudge", residue_id: selectedId, dx: q(dx), dy: q(dy) });
  });

  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
  refreshResearchHud();
}

boot();
