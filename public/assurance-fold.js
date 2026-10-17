/**
 * Assurance Fold UI — addictive spatial claim-board play for PCS Arena.
 * No network. Soft magnetism, combos, campaign unlocks, personal-best ghosts.
 * Trajectories auto-save locally; labels are engine-replayed only.
 */
import {
  CAMPAIGN_ORDER,
  EVALUATION_STRUCTURES,
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
  nextCampaignStructure,
  nudgeResidue,
  rateFoldLock,
  replayFoldSession,
  softMagnetPose,
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
const MAX_NOTEBOOKS = 24;
const STORAGE_UNLOCK = "pcs-af-campaign-unlock-v3";
const STORAGE_BEST = "pcs-af-best-v3";
const STORAGE_STREAK = "pcs-af-daily-streak-v3";

let pose = null;
let selectedId = null;
let dragging = null;
let hintsUsed = 0;
let bestEnergy = Infinity;
let holdStarted = null;
let locked = false;
let raf = 0;
let particles = [];
let floaters = [];
let shake = 0;
let actions = [];
let notebooks = [];
let coachModel = null;
let lockRecorded = false;
let combo = 0;
let comboMax = 0;
let lastSampled = 0;
let playMode = "campaign";
let pulse = 0;
let ghostPose = null;
let sessionStarted = 0;

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

function loadJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function saveJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* private mode */
  }
}

function unlockedThrough() {
  const saved = loadJson(STORAGE_UNLOCK, { index: 0 });
  return Math.max(0, Math.min(CAMPAIGN_ORDER.length - 1, Number(saved.index) || 0));
}

function isUnlocked(id) {
  if (EVALUATION_STRUCTURES.includes(id)) return true;
  const idx = CAMPAIGN_ORDER.indexOf(id);
  if (idx < 0) return true;
  return idx <= unlockedThrough();
}

function personalBest(id) {
  const all = loadJson(STORAGE_BEST, {});
  return all[id] || null;
}

function rememberBest(id, energy, coords, stars) {
  const all = loadJson(STORAGE_BEST, {});
  const prev = all[id];
  if (!prev || energy < prev.energy) {
    all[id] = { energy, coords, stars, at: Date.now() };
    saveJson(STORAGE_BEST, all);
    return true;
  }
  if (stars > (prev.stars || 0)) {
    all[id] = { ...prev, stars };
    saveJson(STORAGE_BEST, all);
  }
  return false;
}

function bumpDailyStreak() {
  const day = new Date().toISOString().slice(0, 10);
  const st = loadJson(STORAGE_STREAK, { day: null, count: 0 });
  if (st.day === day) return st.count;
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  const count = st.day === yesterday ? st.count + 1 : 1;
  saveJson(STORAGE_STREAK, { day, count });
  return count;
}

function record(action) {
  if (locked && action.type !== "lock") return;
  if (actions.length >= 400) {
    $("afLive").textContent = "Action cap reached (400). Export or reshuffle.";
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
    if (d < r.radius * 1.45 && d < bestD) {
      best = r;
      bestD = d;
    }
  }
  return best;
}

function spawnSpark(x, y, color, n = 6) {
  for (let i = 0; i < n; i++) {
    particles.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 0.012,
      vy: (Math.random() - 0.5) * 0.012,
      life: 1,
      color,
    });
  }
}

function spawnFloater(x, y, text, tone = "good") {
  floaters.push({ x, y, text, tone, life: 1 });
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
  return makeFoldSession(pose.structure_id, pose.seed, actions, playMode);
}

function refreshResearchHud() {
  const status = $("afResearchStatus");
  if (!status) return;
  status.textContent = `Live actions ${actions.length} · saved notebooks ${notebooks.length}/${MAX_NOTEBOOKS} · coach ${
    coachModel ? "fitted" : "none"
  } · combo ${combo} (max ${comboMax})`;
}

function refreshMetaHud() {
  const streak = loadJson(STORAGE_STREAK, { count: 0 }).count || 0;
  const pb = personalBest(pose?.structure_id);
  if ($("afCombo")) $("afCombo").textContent = String(combo);
  if ($("afStars")) $("afStars").textContent = locked && pb ? "★".repeat(pb.stars || 1) : "☆☆☆";
  if ($("afStreak")) $("afStreak").textContent = String(streak);
  if ($("afPersonalBest")) {
    $("afPersonalBest").textContent = pb ? `PB ${pb.energy}` : "PB —";
  }
}

function renderMissionList() {
  const list = $("afMissionList");
  list.innerHTML = "";
  for (const s of listStructures()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.structure = s.id;
    const unlocked = isUnlocked(s.id);
    const pb = personalBest(s.id);
    if (pose?.structure_id === s.id) btn.setAttribute("aria-current", "true");
    if (!unlocked) {
      btn.disabled = true;
      btn.innerHTML = `<strong>🔒 ${esc(s.title)}</strong><small>Clear prior campaign fold to unlock</small>`;
    } else {
      btn.innerHTML = `<strong>${esc(s.title)}</strong><small>${esc(s.residue_count)} tokens · heat ≤ ${esc(s.threshold)}${
        pb ? ` · PB ${esc(pb.energy)} ${"★".repeat(pb.stars || 1)}` : ""
      }</small>`;
      btn.addEventListener("click", () => {
        playMode = CAMPAIGN_ORDER.includes(s.id) ? "campaign" : "practice";
        loadStructure(s.id);
      });
    }
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
    ? `Cool zone · hold ${(hold * 100).toFixed(0)}% · combo ${combo}`
    : `Heating · best ${bestEnergy === Infinity ? "—" : bestEnergy} · combo ${combo}`;
  $("afScore").textContent = String(grade.score + Math.min(40, combo * 2));
  $("afComponents").textContent =
    `clash ${grade.components.clash} · zone ${grade.components.pocket} · stretch ${grade.components.backbone} · traps ${grade.components.overclaim}`;
  const fill = $("afHoldFill");
  if (fill) fill.style.width = `${(hold * 100).toFixed(1)}%`;
  const bar = $("afEnergyBar");
  if (bar) bar.dataset.zone = grade.stable ? "stable" : grade.components.overclaim > 0 ? "hot" : "cold";
  refreshMetaHud();
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
  pulse = (pulse + 0.04) % (Math.PI * 2);

  ctx.clearRect(0, 0, w, h);
  // Signal-board atmosphere (not a protein canvas).
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#10241f");
  g.addColorStop(0.45, "#16352d");
  g.addColorStop(1, "#1a2a33");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(180, 220, 200, 0.06)";
  ctx.lineWidth = 1;
  for (let gx = 0; gx < w; gx += Math.max(28, w / 24)) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
  }
  for (let gy = 0; gy < h; gy += Math.max(28, h / 16)) {
    ctx.beginPath();
    ctx.moveTo(0, gy);
    ctx.lineTo(w, gy);
    ctx.stroke();
  }

  ctx.save();
  ctx.translate(ox, oy);

  const selected = pose.residues.find((r) => r.id === selectedId);
  const homePocket = selected ? KINDS[selected.kind]?.pocket : null;

  for (const [name, pocket] of Object.entries(POCKETS)) {
    const px = pocket.x * w;
    const py = pocket.y * h;
    const pr = pocket.r * Math.min(w, h);
    const hot = homePocket === name;
    const pad = pr + (hot ? Math.sin(pulse) * 3 : 0);
    const color =
      name === "authority" ? "#6ea8ff" : name === "reject" ? "#ff7a7a" : name === "scientific" ? "#f0b35a" : name === "limits" ? "#e0c35a" : "#5fd0a8";
    // Rounded zone pads
    const rw = pad * 1.7;
    const rh = pad * 1.25;
    const x0 = px - rw / 2;
    const y0 = py - rh / 2;
    const rad = Math.min(18, pad * 0.35);
    ctx.beginPath();
    ctx.moveTo(x0 + rad, y0);
    ctx.arcTo(x0 + rw, y0, x0 + rw, y0 + rh, rad);
    ctx.arcTo(x0 + rw, y0 + rh, x0, y0 + rh, rad);
    ctx.arcTo(x0, y0 + rh, x0, y0, rad);
    ctx.arcTo(x0, y0, x0 + rw, y0, rad);
    ctx.closePath();
    ctx.fillStyle = hot ? `${color}22` : `${color}14`;
    ctx.fill();
    ctx.strokeStyle = hot ? color : `${color}99`;
    ctx.lineWidth = hot ? 2.5 : 1.5;
    ctx.stroke();
    ctx.fillStyle = "rgba(236, 245, 240, 0.85)";
    ctx.font = `${Math.max(11, Math.floor(w * 0.014))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(pocket.label, px, y0 - 8);
  }

  if (ghostPose?.residues) {
    for (const r of ghostPose.residues) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(220, 245, 230, 0.28)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 4]);
      ctx.arc(r.x * w, r.y * h, r.radius * Math.min(w, h), 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const structure = getStructure(pose.structure_id);
  const byId = new Map(pose.residues.map((r) => [r.id, r]));
  ctx.strokeStyle = "rgba(160, 210, 190, 0.35)";
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
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (selectedId === r.id) {
      ctx.strokeStyle = "#f4fff8";
      ctx.lineWidth = 3;
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${Math.max(10, Math.floor(rr * 0.55))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const label = r.label.length > 8 ? r.label.slice(0, 7) + "…" : r.label;
    ctx.fillText(label, rx, ry);
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x * w, p.y * h, 3, 3);
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.04;
  }
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = f.tone === "good" ? "#7dffc4" : f.tone === "bad" ? "#ff8f8f" : "#ffd27a";
    ctx.font = `700 ${Math.max(14, Math.floor(w * 0.02))}px sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x * w, f.y * h - (1 - f.life) * 28);
    f.y -= 0.0015;
    f.life -= 0.018;
  }
  ctx.globalAlpha = 1;
  particles = particles.filter((p) => p.life > 0);
  floaters = floaters.filter((f) => f.life > 0);
  ctx.restore();
}

function onEnergyDrop(prev, next, at) {
  if (next < prev - 0.15) {
    combo += 1;
    comboMax = Math.max(comboMax, combo);
    spawnFloater(at?.x ?? 0.5, at?.y ?? 0.4, `−${(prev - next).toFixed(1)}`, "good");
    if (combo >= 3) spawnFloater(0.5, 0.22, `COMBO ×${combo}`, "good");
  } else if (next > prev + 0.4) {
    combo = 0;
    spawnFloater(at?.x ?? 0.5, at?.y ?? 0.4, `+${(next - prev).toFixed(1)}`, "bad");
  }
}

function finalizeLock(grade) {
  locked = true;
  if (!lockRecorded) {
    record({ type: "lock" });
    lockRecorded = true;
  }
  const rating = rateFoldLock({
    energy: grade.energy,
    threshold: grade.threshold,
    actionCount: actions.length,
    hints: hintsUsed,
    comboMax,
  });
  const coords = pose.residues.map((r) => ({ id: r.id, x: q(r.x), y: q(r.y), radius: r.radius }));
  const isPb = rememberBest(pose.structure_id, grade.energy, coords, rating.stars);
  if (playMode === "daily") bumpDailyStreak();

  const campaignIdx = CAMPAIGN_ORDER.indexOf(pose.structure_id);
  if (campaignIdx >= 0 && campaignIdx >= unlockedThrough() && campaignIdx < CAMPAIGN_ORDER.length - 1) {
    saveJson(STORAGE_UNLOCK, { index: campaignIdx + 1 });
  }

  // Auto-save notebook for research density (local only).
  try {
    const session = currentSession();
    const replay = replayFoldSession(session);
    if (replay.locked && replay.final_stable) {
      if (notebooks.length >= MAX_NOTEBOOKS) notebooks.shift();
      notebooks.push(session);
    }
  } catch {
    /* keep playable even if save fails */
  }

  const nextId = nextCampaignStructure(pose.structure_id);
  const box = $("afFeedback");
  box.hidden = false;
  box.dataset.tone = "ok";
  box.innerHTML = `<strong>${esc(rating.label)} · ${"★".repeat(rating.stars)}${"☆".repeat(3 - rating.stars)}</strong>
    <p>Energy <code>${grade.energy}</code> · score <code>${grade.score}</code> · combo max <code>${comboMax}</code> · issues_accept <code>false</code></p>
    <p>${isPb ? "New personal best — ghost trail updated." : "Locked."} Notebook auto-saved locally (${actions.length} actions).${
      nextId && isUnlocked(nextId) ? ` Next unlock ready: <em>${esc(getStructure(nextId).title)}</em>.` : ""
    }</p>
    <p>${esc(grade.meaning)}</p>`;
  $("afNext").hidden = false;
  $("afLive").textContent = `${rating.label}! Save/export whenever — data already captured locally.`;
  for (let i = 0; i < 22; i++) {
    spawnSpark(0.5 + (Math.random() - 0.5) * 0.25, 0.45 + (Math.random() - 0.5) * 0.25, "#0c5c4a", 1);
  }
  renderMissionList();
  refreshResearchHud();
  refreshMetaHud();
}

function tick() {
  if (!pose) return;
  const grade = gradePose(pose.structure_id, pose, { hints_used: hintsUsed });
  if (grade.energy < bestEnergy) {
    bestEnergy = grade.energy;
    spawnSpark(0.5, 0.5, "#0c5c4a", 4);
  }
  if (grade.components.clash > 4 || grade.components.overclaim > 8) shake = Math.min(1, shake + 0.35);

  if (grade.stable) {
    if (!holdStarted) holdStarted = performance.now();
    const need = getStructure(pose.structure_id).hold_ms;
    if (!locked && performance.now() - holdStarted >= need) finalizeLock(grade);
  } else {
    holdStarted = null;
    if (!lockRecorded) locked = false;
  }

  updateHud(grade);
  draw();
  raf = requestAnimationFrame(tick);
}

function loadStructure(id, seed = "play") {
  if (!isUnlocked(id)) {
    $("afLive").textContent = "That structure is still locked — clear the campaign folds before it.";
    return;
  }
  pose = initialPose(id, seed);
  selectedId = null;
  hintsUsed = 0;
  bestEnergy = Infinity;
  holdStarted = null;
  locked = false;
  lockRecorded = false;
  particles = [];
  floaters = [];
  actions = [];
  combo = 0;
  comboMax = 0;
  lastSampled = 0;
  sessionStarted = performance.now();
  const pb = personalBest(id);
  ghostPose = pb?.coords ? { residues: pb.coords } : null;
  const s = getStructure(id);
  $("afLevel").textContent = `${s.id} · ${GAME_VERSION} · ${playMode}`;
  $("afTitle").textContent = s.title;
  $("afStory").textContent = s.blurb;
  $("afGoal").textContent = s.goal;
  $("afFeedback").hidden = true;
  $("afNext").hidden = true;
  $("afLive").textContent = "Drag tokens into pulsing zones. Soft snap near the rim. Chase combos and ★★★.";
  renderMissionList();
  refreshResearchHud();
  refreshMetaHud();
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
    lastSampled = performance.now();
    $("afLive").textContent = `Dragging ${hit.label} → aim for the ${KINDS[hit.kind].label.toLowerCase()} zone`;
  };
  const move = (event) => {
    if (!dragging || locked) return;
    event.preventDefault();
    const p = canvasPoint(event, canvas);
    const before = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
    pose = moveResidue(pose, dragging, p.x, p.y);
    const after = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
    // Dense trajectory samples for continuous-control RL (throttled).
    const now = performance.now();
    if (now - lastSampled > 90) {
      const bead = pose.residues.find((r) => r.id === dragging);
      record({ type: "place", residue_id: dragging, x: q(bead.x), y: q(bead.y) });
      onEnergyDrop(before, after, bead);
      lastSampled = now;
    }
  };
  const end = () => {
    if (!dragging) return;
    const before = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
    pose = softMagnetPose(pose, dragging);
    const bead = pose.residues.find((r) => r.id === dragging);
    const after = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
    spawnSpark(bead.x, bead.y, KINDS[bead.kind].color, 10);
    record({ type: "place", residue_id: dragging, x: q(bead.x), y: q(bead.y) });
    onEnergyDrop(before, after, bead);
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
    $("afLive").textContent = "No actions yet — fold first.";
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
    $("afLive").textContent = `Notebook saved (${replay.transitions.length} transitions, ${replay.rating?.stars || "?"}★, split=${replay.split}).`;
  } catch (err) {
    $("afLive").textContent = `Save failed: ${err.message}`;
  }
}

function exportRlDataset() {
  if (!notebooks.length) {
    $("afLive").textContent = "Lock a fold first (notebooks auto-save on lock).";
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
        "Engine-replayed (s,a,r,s') rows for offline RL / BC. Dense drag samples included. Not Lean authority.",
    };
    download(`assurance-fold-rl-${Date.now()}.json`, JSON.stringify(payload, null, 2));
    $("afLive").textContent = `Exported ${rows.length} RL transitions.`;
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
    JSON.stringify(
      {
        format: "pcs-assurance-fold-notebook-collection-v1",
        game_version: GAME_VERSION,
        sessions: notebooks,
      },
      null,
      2
    )
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
    $("afLive").textContent = `Coach fitted on ${fitted.training.examples} place-actions. Untrusted suggestion only.`;
  } catch (err) {
    $("afLive").textContent = `Fit failed: ${err.message}`;
  }
}

function askCoach() {
  if (!coachModel) {
    $("afLive").textContent = "Fit a local coach first.";
    return;
  }
  if (!selectedId) {
    $("afLive").textContent = "Select a residue, then ask the coach.";
    return;
  }
  try {
    const state = pose.residues.map((r) => ({ id: r.id, kind: r.kind, x: q(r.x), y: q(r.y) }));
    const tip = suggestPocket(coachModel, state);
    hintsUsed = Math.min(40, hintsUsed + 1);
    record({ type: "assist" });
    $("afLive").textContent = `Coach → “${tip.pocket}” (counts as assistance). Authority=NONE.`;
  } catch (err) {
    $("afLive").textContent = `Coach failed: ${err.message}`;
  }
}

function boot() {
  bindCanvas();
  const params = new URLSearchParams(location.search);
  playMode = params.get("mode") === "daily" ? "daily" : "campaign";
  const want = params.get("structure") || (playMode === "daily" ? dailyStructureId() : CAMPAIGN_ORDER[0]);
  try {
    loadStructure(isUnlocked(want) ? want : CAMPAIGN_ORDER[0], params.get("seed") || "boot");
  } catch {
    loadStructure(CAMPAIGN_ORDER[0], "boot");
  }

  $("afWiggle").addEventListener("click", () => {
    if (locked) return;
    hintsUsed = Math.min(40, hintsUsed + 1);
    const seed = `w${hintsUsed}`;
    const before = gradePose(pose.structure_id, pose, { hints_used: hintsUsed - 1 }).energy;
    pose = wigglePose(pose, seed);
    const after = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
    record({ type: "wiggle", seed });
    combo = 0;
    onEnergyDrop(before, after, { x: 0.5, y: 0.45 });
    $("afLive").textContent = `Shake ×${hintsUsed} — assisted flag on; combo reset.`;
    spawnSpark(0.5, 0.45, "#c47b16", 12);
  });
  $("afReset").addEventListener("click", () => loadStructure(pose.structure_id, pose.seed));
  $("afShuffle").addEventListener("click", () =>
    loadStructure(pose.structure_id, `shuffle-${Math.floor(Math.random() * 1e9)}`)
  );
  $("afDaily").addEventListener("click", () => {
    playMode = "daily";
    loadStructure(dailyStructureId(), "daily");
  });
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
      : "<p>No major tensions — hold still while the board stays cool.</p>";
    box.innerHTML = `<strong>${grade.stable ? "Board is cool enough" : "Still too hot"}</strong>
      <p>Heat <code>${grade.energy}</code> / <code>${grade.threshold}</code> · combo <code>${combo}</code> · issues_accept <code>false</code></p>
      ${tensions}`;
  });
  $("afNext").addEventListener("click", () => {
    const next = nextCampaignStructure(pose.structure_id);
    if (next && isUnlocked(next)) {
      playMode = "campaign";
      loadStructure(next, `next-${Date.now()}`);
      return;
    }
    const ids = listStructures().map((s) => s.id).filter(isUnlocked);
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
    $("afLive").textContent = "Local notebooks cleared. Progress/PBs kept.";
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
    const before = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
    pose = nudgeResidue(pose, selectedId, dx, dy);
    const after = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
    record({ type: "nudge", residue_id: selectedId, dx: q(dx), dy: q(dy) });
    onEnergyDrop(before, after, pose.residues.find((r) => r.id === selectedId));
  });

  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
  refreshResearchHud();
}

boot();
