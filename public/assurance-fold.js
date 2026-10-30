/**
 * Assurance Fold UI — spatial claim-board play for PCS Arena.
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
  seatInPocket,
  softMagnetPose,
  wigglePose,
} from "./assurance-fold-core.mjs";
import {
  exportFoldPreferencePairs,
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
let dragTrail = [];
let nearMiss = 0;
let boardFlash = 0;
let lastDragPos = null;
let hoverId = null;
let seatFlash = null; // { pocket, until }

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

function nowMs() {
  return Math.max(0, Math.round(performance.now() - sessionStarted));
}

function record(action) {
  if (locked && action.type !== "lock") return;
  if (actions.length >= 400) {
    $("afLive").textContent = "You’ve made 400 moves on this board. Export what you have, or reshuffle and start fresh.";
    return;
  }
  actions.push({ ...action, t_ms: nowMs() });
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
  status.textContent = `Moves this run ${actions.length} · notebooks saved ${notebooks.length}/${MAX_NOTEBOOKS} · coach ${
    coachModel ? "ready" : "not fitted"
  } · combo ${combo} (best ${comboMax})`;
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
      btn.innerHTML = `<strong>🔒 ${esc(s.title)}</strong><small>Finish the earlier campaign boards first</small>`;
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

function zoneColor(name) {
  return name === "authority"
    ? "#6ea8ff"
    : name === "reject"
      ? "#ff7a7a"
      : name === "scientific"
        ? "#f0b35a"
        : name === "limits"
          ? "#e0c35a"
          : "#5fd0a8";
}

function nextOffHomeToken(afterId) {
  if (!pose) return null;
  const order = pose.residues;
  const idx = order.findIndex((r) => r.id === afterId);
  const start = idx >= 0 ? idx : -1;
  for (let i = 1; i <= order.length; i++) {
    const r = order[(start + i) % order.length];
    const home = POCKETS[KINDS[r.kind]?.pocket];
    if (!home) continue;
    if (Math.hypot(r.x - home.x, r.y - home.y) > home.r * 0.95) return r.id;
  }
  return null;
}

function seatSelected(pocketName) {
  if (!selectedId || locked || !pose) return;
  const pocket = POCKETS[pocketName];
  if (!pocket) return;
  const bead = pose.residues.find((r) => r.id === selectedId);
  if (!bead) return;
  const before = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
  pose = seatInPocket(pose, selectedId, pocketName);
  const after = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
  const placed = pose.residues.find((r) => r.id === selectedId);
  record({ type: "place", residue_id: selectedId, x: q(placed.x), y: q(placed.y) });
  onEnergyDrop(before, after, placed);
  spawnSpark(placed.x, placed.y, KINDS[placed.kind].color, 14);
  seatFlash = { pocket: pocketName, until: performance.now() + 450 };
  boardFlash = Math.min(1, boardFlash + 0.25);
  const seatedId = selectedId;
  const nxt = nextOffHomeToken(seatedId);
  selectedId = nxt;
  $("afLive").textContent = nxt
    ? `Seated “${placed.label}” in ${pocket.label}. Next up: “${pose.residues.find((r) => r.id === nxt).label}”.`
    : `Seated “${placed.label}” in ${pocket.label}. Hold still if heat is under the threshold.`;
  renderInteractControls();
}

function renderInteractControls() {
  const tray = $("afTokenTray");
  const zones = $("afZonePad");
  if (!tray || !zones || !pose) return;
  tray.innerHTML = "";
  for (const r of pose.residues) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.setAttribute("aria-pressed", selectedId === r.id ? "true" : "false");
    btn.innerHTML = `<span class="af-dot" style="background:${esc(KINDS[r.kind].color)}"></span>${esc(r.label)}`;
    btn.addEventListener("click", () => {
      if (locked) return;
      selectedId = r.id;
      const home = KINDS[r.kind]?.pocket;
      $("afLive").textContent = home
        ? `Selected “${r.label}”. Drag it, press Space to seat in ${POCKETS[home].label}, or tap a zone pad.`
        : `Selected “${r.label}”.`;
      renderInteractControls();
    });
    tray.appendChild(btn);
  }
  zones.innerHTML = "";
  const home = selectedId
    ? KINDS[pose.residues.find((r) => r.id === selectedId)?.kind]?.pocket
    : null;
  for (const [name, pocket] of Object.entries(POCKETS)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.disabled = !selectedId || locked;
    btn.dataset.home = home === name ? "true" : "false";
    btn.style.borderColor = zoneColor(name);
    btn.textContent = pocket.label.replace(" zone", "");
    btn.addEventListener("click", () => seatSelected(name));
    zones.appendChild(btn);
  }
  const seat = $("afSeatHome");
  if (seat) {
    seat.disabled = !selectedId || locked || !home;
    seat.textContent = home
      ? `Seat in ${POCKETS[home].label} →`
      : "Seat in home zone →";
  }
}

function hitPocket(nx, ny) {
  let best = null;
  let bestD = Infinity;
  for (const [name, pocket] of Object.entries(POCKETS)) {
    const d = Math.hypot(nx - pocket.x, ny - pocket.y);
    if (d <= pocket.r * 1.05 && d < bestD) {
      best = name;
      bestD = d;
    }
  }
  return best;
}

function updateHud(grade) {
  $("afEnergyValue").textContent = String(grade.energy);
  if ($("afHeatChip")) $("afHeatChip").textContent = String(grade.energy);
  $("afEnergyBar").max = Math.max(40, grade.threshold * 4);
  $("afEnergyBar").value = Math.min(grade.energy, $("afEnergyBar").max);
  const hold = holdStarted
    ? Math.min(1, (performance.now() - holdStarted) / getStructure(pose.structure_id).hold_ms)
    : 0;
  $("afEnergyMeta").textContent = grade.stable
    ? `Cool enough. Keep it there ${(hold * 100).toFixed(0)}% · combo ${combo}`
    : `Still warm · lowest so far ${bestEnergy === Infinity ? "—" : bestEnergy} · combo ${combo}`;
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
  const m = Math.min(w, h);
  const ox = shake ? (Math.random() - 0.5) * shake * 8 : 0;
  const oy = shake ? (Math.random() - 0.5) * shake * 8 : 0;
  shake *= 0.85;
  pulse = (pulse + 0.045) % (Math.PI * 2);
  const grade = gradePose(pose.structure_id, pose, { hints_used: hintsUsed });
  const heatT = Math.min(1, grade.energy / Math.max(8, grade.threshold * 3));

  ctx.clearRect(0, 0, w, h);
  const g = ctx.createRadialGradient(w * 0.5, h * 0.42, m * 0.05, w * 0.5, h * 0.5, m * 0.85);
  g.addColorStop(0, `rgb(${18 + heatT * 40}, ${42 - heatT * 10}, ${36})`);
  g.addColorStop(0.55, "#122a24");
  g.addColorStop(1, "#0b1714");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // Soft vignette + animated scan lines
  ctx.strokeStyle = `rgba(180, 220, 200, ${0.04 + (1 - heatT) * 0.03})`;
  ctx.lineWidth = 1;
  for (let gx = 0; gx < w; gx += Math.max(26, w / 26)) {
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.lineTo(gx, h);
    ctx.stroke();
  }
  for (let gy = 0; gy < h; gy += Math.max(26, h / 18)) {
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
    const pr = pocket.r * m;
    const hot = homePocket === name;
    const flash = seatFlash && seatFlash.pocket === name && performance.now() < seatFlash.until;
    const pad = pr + (hot ? Math.sin(pulse) * 4 : 0) + (flash ? 6 : 0);
    const color = zoneColor(name);
    const rw = pad * 1.85;
    const rh = pad * 1.35;
    const x0 = px - rw / 2;
    const y0 = py - rh / 2;
    const rad = Math.min(22, pad * 0.38);
    if (hot || flash) {
      const glow = ctx.createRadialGradient(px, py, pr * 0.2, px, py, pr * 1.6);
      glow.addColorStop(0, `${color}55`);
      glow.addColorStop(1, `${color}00`);
      ctx.fillStyle = glow;
      ctx.fillRect(px - pr * 1.8, py - pr * 1.8, pr * 3.6, pr * 3.6);
    }
    ctx.beginPath();
    ctx.moveTo(x0 + rad, y0);
    ctx.arcTo(x0 + rw, y0, x0 + rw, y0 + rh, rad);
    ctx.arcTo(x0 + rw, y0 + rh, x0, y0 + rh, rad);
    ctx.arcTo(x0, y0 + rh, x0, y0, rad);
    ctx.arcTo(x0, y0, x0 + rw, y0, rad);
    ctx.closePath();
    ctx.fillStyle = hot ? `${color}28` : `${color}16`;
    ctx.fill();
    ctx.strokeStyle = hot || flash ? color : `${color}aa`;
    ctx.lineWidth = hot || flash ? 3 : 1.6;
    ctx.stroke();
    // Inner dashed ring for magnetism feel
    ctx.beginPath();
    ctx.setLineDash([5, 6]);
    ctx.strokeStyle = `${color}66`;
    ctx.lineWidth = 1;
    ctx.ellipse(px, py, rw * 0.34, rh * 0.34, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    const occ = zoneOccupancy()[name] || 0;
    ctx.fillStyle = "rgba(236, 245, 240, 0.92)";
    ctx.font = `600 ${Math.max(13, Math.floor(w * 0.016))}px "Source Sans 3", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(`${pocket.label}${occ ? ` · ${occ}` : ""}`, px, y0 - 6);
  }

  // Aim guide from selected/dragging token to home zone
  if (selected && homePocket) {
    const home = POCKETS[homePocket];
    ctx.beginPath();
    ctx.strokeStyle = `${zoneColor(homePocket)}88`;
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.moveTo(selected.x * w, selected.y * h);
    ctx.lineTo(home.x * w, home.y * h);
    ctx.stroke();
    ctx.setLineDash([]);
    // Arrow tip
    const ang = Math.atan2(home.y - selected.y, home.x - selected.x);
    const ax = home.x * w;
    const ay = home.y * h;
    ctx.beginPath();
    ctx.fillStyle = zoneColor(homePocket);
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - Math.cos(ang - 0.4) * 12, ay - Math.sin(ang - 0.4) * 12);
    ctx.lineTo(ax - Math.cos(ang + 0.4) * 12, ay - Math.sin(ang + 0.4) * 12);
    ctx.closePath();
    ctx.fill();
  }

  if (dragTrail.length > 1) {
    ctx.beginPath();
    ctx.strokeStyle = "rgba(127, 255, 196, 0.55)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.moveTo(dragTrail[0].x * w, dragTrail[0].y * h);
    for (let i = 1; i < dragTrail.length; i++) ctx.lineTo(dragTrail[i].x * w, dragTrail[i].y * h);
    ctx.stroke();
  }

  if (ghostPose?.residues) {
    for (const r of ghostPose.residues) {
      ctx.beginPath();
      ctx.strokeStyle = "rgba(220, 245, 230, 0.32)";
      ctx.lineWidth = 1.8;
      ctx.setLineDash([3, 4]);
      ctx.arc(r.x * w, r.y * h, r.radius * m * 1.05, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  const structure = getStructure(pose.structure_id);
  const byId = new Map(pose.residues.map((r) => [r.id, r]));
  for (const [aId, bId] of structure.bonds) {
    const a = byId.get(aId);
    const b = byId.get(bId);
    const grad = ctx.createLinearGradient(a.x * w, a.y * h, b.x * w, b.y * h);
    grad.addColorStop(0, `${KINDS[a.kind].color}99`);
    grad.addColorStop(1, `${KINDS[b.kind].color}99`);
    ctx.beginPath();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 2.2;
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }

  for (const r of pose.residues) {
    const meta = KINDS[r.kind];
    const rx = r.x * w;
    const ry = r.y * h;
    const rr = r.radius * m * (selectedId === r.id || hoverId === r.id ? 1.12 : 1);
    // Soft shadow
    ctx.beginPath();
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    ctx.ellipse(rx + 2, ry + 4, rr * 0.95, rr * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();
    const disc = ctx.createRadialGradient(rx - rr * 0.25, ry - rr * 0.3, rr * 0.1, rx, ry, rr);
    disc.addColorStop(0, "#ffffff55");
    disc.addColorStop(0.35, meta.color);
    disc.addColorStop(1, meta.color);
    ctx.beginPath();
    ctx.fillStyle = disc;
    ctx.arc(rx, ry, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = selectedId === r.id ? "#f4fff8" : hoverId === r.id ? "#d7ffe9" : "rgba(255,255,255,0.4)";
    ctx.lineWidth = selectedId === r.id ? 3.5 : 1.8;
    ctx.stroke();
    if (selectedId === r.id) {
      ctx.beginPath();
      ctx.strokeStyle = `rgba(125, 255, 196, ${0.35 + Math.sin(pulse) * 0.2})`;
      ctx.lineWidth = 2;
      ctx.arc(rx, ry, rr + 7 + Math.sin(pulse) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = "#fff";
    ctx.font = `600 ${Math.max(12, Math.floor(rr * 0.52))}px "Source Sans 3", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    const full = String(r.label || "");
    if (full.length <= 7) {
      ctx.fillText(full, rx, ry);
    } else {
      // Two-line label inside the chip when possible; full caption under selected tokens.
      const mid = Math.ceil(full.length / 2);
      let split = full.lastIndexOf(" ", mid);
      if (split < 2) split = mid;
      const a = full.slice(0, split).trim();
      const b = full.slice(split).trim();
      const fs = Math.max(10, Math.floor(rr * 0.42));
      ctx.font = `600 ${fs}px "Source Sans 3", sans-serif`;
      ctx.fillText(a.slice(0, 8), rx, ry - fs * 0.55);
      ctx.fillText(b.slice(0, 9), rx, ry + fs * 0.55);
    }
    if (selectedId === r.id || hoverId === r.id) {
      const tag = full;
      ctx.font = `600 ${Math.max(12, Math.floor(w * 0.014))}px "Source Sans 3", sans-serif`;
      const tw = ctx.measureText(tag).width + 14;
      const th = Math.max(18, Math.floor(w * 0.018));
      const tx = rx - tw / 2;
      const ty = ry + rr + 8;
      ctx.fillStyle = "rgba(8, 22, 18, 0.78)";
      ctx.fillRect(tx, ty, tw, th);
      ctx.fillStyle = "#f4fff8";
      ctx.textBaseline = "middle";
      ctx.fillText(tag, rx, ty + th / 2);
    }
  }

  // Side heat thermometer
  const thermoX = w - 28;
  const thermoTop = h * 0.18;
  const thermoH = h * 0.55;
  ctx.fillStyle = "rgba(255,255,255,0.08)";
  ctx.fillRect(thermoX - 8, thermoTop, 16, thermoH);
  const fillH = thermoH * heatT;
  const tg = ctx.createLinearGradient(0, thermoTop + thermoH, 0, thermoTop);
  tg.addColorStop(0, "#7dffc4");
  tg.addColorStop(0.55, "#f0b35a");
  tg.addColorStop(1, "#ff7a7a");
  ctx.fillStyle = tg;
  ctx.fillRect(thermoX - 6, thermoTop + thermoH - fillH, 12, fillH);
  ctx.fillStyle = "rgba(236,245,240,0.8)";
  ctx.font = `600 ${Math.max(11, Math.floor(w * 0.013))}px "IBM Plex Mono", monospace`;
  ctx.textAlign = "center";
  ctx.fillText("HEAT", thermoX, thermoTop - 10);

  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x * w, p.y * h, 2.4, 0, Math.PI * 2);
    ctx.fill();
    p.x += p.vx;
    p.y += p.vy;
    p.life -= 0.04;
  }
  for (const f of floaters) {
    ctx.globalAlpha = Math.max(0, f.life);
    ctx.fillStyle = f.tone === "good" ? "#7dffc4" : f.tone === "bad" ? "#ff8f8f" : "#ffd27a";
    ctx.font = `700 ${Math.max(16, Math.floor(w * 0.022))}px "Source Sans 3", sans-serif`;
    ctx.textAlign = "center";
    ctx.fillText(f.text, f.x * w, f.y * h - (1 - f.life) * 28);
    f.y -= 0.0015;
    f.life -= 0.018;
  }
  ctx.globalAlpha = 1;
  particles = particles.filter((p) => p.life > 0);
  floaters = floaters.filter((f) => f.life > 0);
  if (nearMiss > 0.05) {
    ctx.fillStyle = `rgba(255, 90, 90, ${0.08 + nearMiss * 0.12})`;
    ctx.fillRect(0, 0, w, h);
  }
  if (boardFlash > 0.02) {
    ctx.fillStyle = `rgba(125, 255, 196, ${boardFlash * 0.18})`;
    ctx.fillRect(0, 0, w, h);
    boardFlash *= 0.9;
  }
  if (seatFlash && performance.now() > seatFlash.until) seatFlash = null;
  ctx.restore();
}

function onEnergyDrop(prev, next, at) {
  if (next < prev - 0.15) {
    combo += 1;
    comboMax = Math.max(comboMax, combo);
    spawnFloater(at?.x ?? 0.5, at?.y ?? 0.4, `−${(prev - next).toFixed(1)}`, "good");
    if (combo >= 3) {
      spawnFloater(0.5, 0.22, `COMBO ×${combo}`, "good");
      boardFlash = Math.min(1, 0.35 + combo * 0.05);
    }
  } else if (next > prev + 0.4) {
    combo = 0;
    spawnFloater(at?.x ?? 0.5, at?.y ?? 0.4, `+${(next - prev).toFixed(1)}`, "bad");
  }
}

function zoneOccupancy() {
  const counts = { authority: 0, computational: 0, scientific: 0, reject: 0, limits: 0 };
  for (const r of pose.residues) {
    const home = KINDS[r.kind]?.pocket;
    const z = POCKETS[home];
    if (!z) continue;
    if (Math.hypot(r.x - z.x, r.y - z.y) <= z.r) counts[home] += 1;
  }
  return counts;
}

function updateNearMiss(grade) {
  const sci = pose.residues.filter((r) => r.kind === "scientific");
  const auth = POCKETS.authority;
  let closest = Infinity;
  for (const r of sci) closest = Math.min(closest, Math.hypot(r.x - auth.x, r.y - auth.y));
  if (closest < auth.r * 1.35 && grade.components.overclaim === 0) {
    nearMiss = Math.min(1, nearMiss + 0.08);
    if (nearMiss > 0.55) $("afLive").textContent = "Careful: a science token is getting too close to Authority.";
  } else {
    nearMiss *= 0.9;
  }
}

function finalizeLock(grade) {
  locked = true;
  if (!lockRecorded) {
    record({ type: "lock" });
    lockRecorded = true;
  }
  const coords = pose.residues.map((r) => ({ id: r.id, x: q(r.x), y: q(r.y), radius: r.radius }));
  let rating = rateFoldLock({
    energy: grade.energy,
    threshold: grade.threshold,
    actionCount: actions.length,
    hints: hintsUsed,
    comboMax,
  });
  let summaryLine = "";
  // Auto-save + engine-authoritative rating/combo from replay.
  try {
    const session = currentSession();
    const replay = replayFoldSession(session);
    if (replay.locked && replay.final_stable) {
      if (notebooks.length >= MAX_NOTEBOOKS) notebooks.shift();
      notebooks.push(session);
      if (replay.rating) rating = replay.rating;
      if (replay.summary) {
        comboMax = replay.summary.combo_max;
        summaryLine = ` · drops ${replay.summary.heat_drops} · peak overclaim ${replay.summary.peak_overclaim} · tokens ${replay.summary.tokens_moved}`;
      }
    }
  } catch {
    /* keep playable even if save fails */
  }

  const isPb = rememberBest(pose.structure_id, grade.energy, coords, rating.stars);
  if (playMode === "daily") bumpDailyStreak();

  const campaignIdx = CAMPAIGN_ORDER.indexOf(pose.structure_id);
  if (campaignIdx >= 0 && campaignIdx >= unlockedThrough() && campaignIdx < CAMPAIGN_ORDER.length - 1) {
    saveJson(STORAGE_UNLOCK, { index: campaignIdx + 1 });
  }

  const nextId = nextCampaignStructure(pose.structure_id);
  const box = $("afFeedback");
  box.hidden = false;
  box.dataset.tone = "ok";
  box.innerHTML = `<strong>${esc(rating.label)} · ${"★".repeat(rating.stars)}${"☆".repeat(3 - rating.stars)}</strong>
    <p>Heat <code>${grade.energy}</code> · score <code>${grade.score}</code> · longest combo <code>${comboMax}</code>${esc(summaryLine)} · issues_accept <code>false</code></p>
    <p>${isPb ? "New personal best! Your best-layout outline is saved." : "Board locked."} A notebook of this run was saved in the tab (${actions.length} actions).${
      nextId && isUnlocked(nextId) ? ` Next up: <em>${esc(getStructure(nextId).title)}</em>.` : ""
    }</p>
    <p>${esc(grade.meaning)}</p>
    <p>Want the real kernel / package trail this board is practicing for? Open <a href="paper-demos.html">Paper Demos</a> (penguins Lean authority, Countermodel witnesses, Bridge Builder).</p>`;
  $("afNext").hidden = false;
  if ($("afAgain")) $("afAgain").hidden = false;
  $("afLive").textContent = `${rating.label}. Notebook saved. Play again, try the next mission or open Paper Demos.`;
  boardFlash = 1;
  for (let i = 0; i < 22; i++) {
    spawnSpark(0.5 + (Math.random() - 0.5) * 0.25, 0.45 + (Math.random() - 0.5) * 0.25, "#7dffc4", 1);
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

  updateNearMiss(grade);
  updateHud(grade);
  draw();
  raf = requestAnimationFrame(tick);
}

function loadStructure(id, seed = "play") {
  if (!isUnlocked(id)) {
    $("afLive").textContent = "That board is still locked. Finish the earlier campaign missions first.";
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
  lastDragPos = null;
  dragTrail = [];
  nearMiss = 0;
  boardFlash = 0;
  sessionStarted = performance.now();
  const pb = personalBest(id);
  ghostPose = pb?.coords ? { residues: pb.coords } : null;
  if ($("afAgain")) $("afAgain").hidden = true;
  const s = getStructure(id);
  $("afLevel").textContent = `${s.id} · ${GAME_VERSION} · ${playMode}`;
  $("afTitle").textContent = s.title;
  $("afStory").textContent = s.blurb;
  $("afGoal").textContent = s.goal;
  const paper = $("afPaperNote");
  if (paper) {
    if (s.paper_demo && s.paper_note) {
      paper.innerHTML = `${esc(s.paper_note)} <a href="${esc(s.paper_demo)}">Open Paper Demos →</a>`;
    } else {
      paper.textContent = "";
    }
  }
  $("afFeedback").hidden = true;
  $("afNext").hidden = true;
  $("afLive").textContent =
    "Drag tokens toward their zones, or tap a token below and Seat in home zone. Press Space to seat the selection. Zones glow when they match.";
  hoverId = null;
  seatFlash = null;
  // Start with the first token that is still off its home zone.
  selectedId = nextOffHomeToken(null) || pose.residues[0]?.id || null;
  renderMissionList();
  renderInteractControls();
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
    if (hit) {
      selectedId = hit.id;
      dragging = hit.id;
      lastSampled = performance.now();
      canvas.setPointerCapture?.(event.pointerId);
      $("afLive").textContent = `Moving “${hit.label}”. It belongs in the ${KINDS[hit.kind].label.toLowerCase()} zone`;
      renderInteractControls();
      return;
    }
    // Tap a zone with a selection to seat the token there.
    const pocket = hitPocket(p.x, p.y);
    if (pocket && selectedId) {
      seatSelected(pocket);
    }
  };
  const move = (event) => {
    const p = canvasPoint(event, canvas);
    if (!dragging) {
      const hit = hitResidue(p.x, p.y);
      hoverId = hit?.id || null;
      canvas.style.cursor = hit ? "grab" : hitPocket(p.x, p.y) && selectedId ? "pointer" : "default";
      return;
    }
    if (locked) return;
    event.preventDefault();
    const before = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
    pose = moveResidue(pose, dragging, p.x, p.y);
    const bead = pose.residues.find((r) => r.id === dragging);
    dragTrail.push({ x: bead.x, y: bead.y });
    if (dragTrail.length > 36) dragTrail.shift();
    const after = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
    const now = performance.now();
    const moved =
      !lastDragPos || Math.hypot(bead.x - lastDragPos.x, bead.y - lastDragPos.y) >= 0.018;
    if (moved && now - lastSampled > 85) {
      record({ type: "place", residue_id: dragging, x: q(bead.x), y: q(bead.y) });
      onEnergyDrop(before, after, bead);
      lastSampled = now;
      lastDragPos = { x: bead.x, y: bead.y };
    }
  };
  const end = (event) => {
    if (!dragging) return;
    try {
      canvas.releasePointerCapture?.(event.pointerId);
    } catch {
      /* ignore */
    }
    const before = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
    pose = softMagnetPose(pose, dragging);
    const bead = pose.residues.find((r) => r.id === dragging);
    const after = gradePose(pose.structure_id, pose, { hints_used: hintsUsed }).energy;
    spawnSpark(bead.x, bead.y, KINDS[bead.kind].color, 12);
    record({ type: "place", residue_id: dragging, x: q(bead.x), y: q(bead.y) });
    onEnergyDrop(before, after, bead);
    dragging = null;
    lastDragPos = null;
    dragTrail = [];
    renderInteractControls();
  };

  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointerleave", () => {
    hoverId = null;
    if (!dragging) canvas.style.cursor = "default";
  });
  canvas.addEventListener("pointercancel", end);
}

function saveNotebook() {
  if (!actions.length) {
    $("afLive").textContent = "Nothing to save yet. Move a few tokens first.";
    return;
  }
  try {
    const session = currentSession();
    const replay = replayFoldSession(session);
    if (!replay.locked || !replay.final_stable) {
      $("afLive").textContent = "Only a locked, stable board can be added to the notebook list.";
      return;
    }
    if (notebooks.length >= MAX_NOTEBOOKS) notebooks.shift();
    notebooks.push(session);
    refreshResearchHud();
    $("afLive").textContent = `Notebook saved (${replay.transitions.length} steps, ${replay.rating?.stars || "?"}★, split=${replay.split}).`;
  } catch (err) {
    $("afLive").textContent = `Save failed: ${err.message}`;
  }
}

function exportRlDataset() {
  if (!notebooks.length) {
    $("afLive").textContent = "Lock a board first. This saves a notebook automatically.";
    return;
  }
  try {
    const rows = exportFoldRlRows(notebooks, "all");
    const pairs = exportFoldPreferencePairs(notebooks, "all");
    const payload = {
      format: "pcs-assurance-fold-rl-dataset-v1",
      game_version: GAME_VERSION,
      issues_accept: false,
      authority: "NONE",
      checker_before_label: true,
      rows,
      preference_pairs: pairs,
      meaning:
        "Engine-replayed step rows plus preference pairs for offline training or ranking. Not Lean authority.",
    };
    download(`assurance-fold-rl-${Date.now()}.json`, JSON.stringify(payload, null, 2));
    $("afLive").textContent = `Exported ${rows.length} training steps and ${pairs.length} preference pairs.`;
  } catch (err) {
    $("afLive").textContent = `Export failed: ${err.message}`;
  }
}

function exportSessions() {
  if (!notebooks.length) {
    $("afLive").textContent = "No notebooks to export yet.";
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
    $("afLive").textContent = `Local coach fitted on ${fitted.training.examples} placements. These suggestions have not passed formal verification.`;
  } catch (err) {
    $("afLive").textContent = `Fit failed: ${err.message}`;
  }
}

function askCoach() {
  if (!coachModel) {
    $("afLive").textContent = "Fit a local coach first, then ask again.";
    return;
  }
  if (!selectedId) {
    $("afLive").textContent = "Click a token first, then ask the coach.";
    return;
  }
  try {
    const state = pose.residues.map((r) => ({ id: r.id, kind: r.kind, x: q(r.x), y: q(r.y) }));
    const tip = suggestPocket(coachModel, state);
    hintsUsed = Math.min(40, hintsUsed + 1);
    record({ type: "assist" });
    $("afLive").textContent = `Coach suggests the “${tip.pocket}” zone (counts as help). Not authority.`;
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

  $("afSeatHome")?.addEventListener("click", () => {
    if (!selectedId || locked) return;
    const bead = pose.residues.find((r) => r.id === selectedId);
    const home = KINDS[bead?.kind]?.pocket;
    if (home) seatSelected(home);
  });
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
    $("afLive").textContent = `Shake ×${hintsUsed}. This run counts as assisted; combo reset.`;
    spawnSpark(0.5, 0.45, "#c47b16", 12);
    renderInteractControls();
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
      : "<p>No major tensions. Hold still while the board stays cool.</p>";
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
  $("afAgain")?.addEventListener("click", () => {
    loadStructure(pose.structure_id, `again-${Math.floor(Math.random() * 1e9)}`);
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
    $("afLive").textContent = "Local notebooks cleared. Campaign progress and personal bests stayed put.";
  });

  document.addEventListener("keydown", (event) => {
    if (!selectedId || locked) return;
    if (event.key === " " || event.key === "Enter") {
      event.preventDefault();
      const bead = pose.residues.find((r) => r.id === selectedId);
      const home = KINDS[bead?.kind]?.pocket;
      if (home) seatSelected(home);
      return;
    }
    if (event.key === "Tab") {
      event.preventDefault();
      const nxt = nextOffHomeToken(selectedId) || pose.residues[0]?.id;
      if (nxt) {
        selectedId = nxt;
        renderInteractControls();
        const bead = pose.residues.find((r) => r.id === selectedId);
        $("afLive").textContent = `Selected “${bead.label}”. Space seats it home.`;
      }
      return;
    }
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
