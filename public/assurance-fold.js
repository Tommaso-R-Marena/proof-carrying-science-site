/**
 * Assurance Fold v2 UI — continuous canvas Foldit-style play.
 * No network. Independent energy from assurance-fold-core.mjs.
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
  moveResidue,
  nudgeResidue,
  wigglePose,
} from "./assurance-fold-core.mjs";

const $ = (id) => document.getElementById(id);

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

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
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
  const hold = holdStarted ? Math.min(1, (performance.now() - holdStarted) / getStructure(pose.structure_id).hold_ms) : 0;
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
  // Atmosphere
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#e7f3ee");
  g.addColorStop(1, "#f4f7f5");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.translate(ox, oy);

  // Pockets
  for (const [key, p] of Object.entries(POCKETS)) {
    const cx = p.x * w;
    const cy = p.y * h;
    const rr = p.r * Math.min(w, h);
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(12, 92, 74, 0.06)";
    ctx.fill();
    ctx.strokeStyle = "rgba(12, 92, 74, 0.28)";
    ctx.setLineDash([6, 6]);
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#3d534b";
    ctx.font = "600 13px Source Sans 3, Segoe UI, sans-serif";
    ctx.fillText(p.label, cx - rr * 0.6, cy - rr - 8);
    void key;
  }

  const structure = getStructure(pose.structure_id);
  const byId = new Map(pose.residues.map((r) => [r.id, r]));

  // Bonds
  ctx.lineWidth = 3;
  for (const [aId, bId] of structure.bonds) {
    const a = byId.get(aId);
    const b = byId.get(bId);
    ctx.strokeStyle = "rgba(19, 36, 31, 0.22)";
    ctx.beginPath();
    ctx.moveTo(a.x * w, a.y * h);
    ctx.lineTo(b.x * w, b.y * h);
    ctx.stroke();
  }

  // Residues
  for (const r of pose.residues) {
    const meta = KINDS[r.kind];
    const cx = r.x * w;
    const cy = r.y * h;
    const rad = r.radius * Math.min(w, h);
    ctx.beginPath();
    ctx.arc(cx, cy, rad, 0, Math.PI * 2);
    ctx.fillStyle = meta.color;
    ctx.globalAlpha = selectedId === r.id ? 1 : 0.92;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = selectedId === r.id ? 4 : 2;
    ctx.strokeStyle = selectedId === r.id ? "#0b57d0" : "rgba(255,255,255,0.65)";
    ctx.stroke();
    ctx.fillStyle = "#fff";
    ctx.font = "700 12px IBM Plex Mono, Consolas, monospace";
    ctx.textAlign = "center";
    ctx.fillText(r.label.slice(0, 10), cx, cy + 4);
    ctx.textAlign = "start";
  }

  // Particles
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
      const box = $("afFeedback");
      box.hidden = false;
      box.dataset.tone = "ok";
      box.innerHTML = `<strong>Stable fold locked</strong>
        <p>Energy <code>${grade.energy}</code> · score <code>${grade.score}</code> · issues_accept <code>false</code></p>
        <p>${esc(grade.meaning)}</p>`;
      $("afNext").hidden = false;
      $("afLive").textContent = "Beautiful fold — still not scientific ACCEPT. Try the next structure.";
      for (let i = 0; i < 18; i++) spawnSpark(0.5 + (Math.random() - 0.5) * 0.2, 0.45 + (Math.random() - 0.5) * 0.2, "#0c5c4a");
    }
  } else {
    holdStarted = null;
    locked = false;
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
  particles = [];
  const s = getStructure(id);
  $("afLevel").textContent = `${s.id} · ${GAME_VERSION}`;
  $("afTitle").textContent = s.title;
  $("afStory").textContent = s.blurb;
  $("afGoal").textContent = s.goal;
  $("afFeedback").hidden = true;
  $("afNext").hidden = true;
  $("afLive").textContent = "Drag residues into the soft wells. Watch the energy fall.";
  renderMissionList();
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
    event.preventDefault();
    const p = canvasPoint(event, canvas);
    const hit = hitResidue(p.x, p.y);
    if (!hit) return;
    selectedId = hit.id;
    dragging = hit.id;
    $("afLive").textContent = `Dragging ${hit.label} (${KINDS[hit.kind].label})`;
  };
  const move = (event) => {
    if (!dragging) return;
    event.preventDefault();
    const p = canvasPoint(event, canvas);
    pose = moveResidue(pose, dragging, p.x, p.y);
  };
  const end = () => {
    if (dragging) spawnSpark(pose.residues.find((r) => r.id === dragging).x, pose.residues.find((r) => r.id === dragging).y, KINDS[pose.residues.find((r) => r.id === dragging).kind].color);
    dragging = null;
  };

  canvas.addEventListener("pointerdown", start);
  canvas.addEventListener("pointermove", move);
  canvas.addEventListener("pointerup", end);
  canvas.addEventListener("pointerleave", end);
  canvas.addEventListener("pointercancel", end);
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
    pose = wigglePose(pose, `w${hintsUsed}`);
    $("afLive").textContent = `Wiggle assist used (${hintsUsed}). Energy penalty applied.`;
    spawnSpark(0.5, 0.45, "#c47b16");
  });
  $("afReset").addEventListener("click", () => loadStructure(pose.structure_id, pose.seed));
  $("afShuffle").addEventListener("click", () =>
    loadStructure(pose.structure_id, `shuffle-${Math.floor(Math.random() * 1e9)}`)
  );
  $("afDaily").addEventListener("click", () => loadStructure(dailyStructureId(), "daily"));
  $("afCheck").addEventListener("click", () => {
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

  document.addEventListener("keydown", (event) => {
    if (!selectedId) return;
    const step = event.shiftKey ? 0.03 : 0.012;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      pose = nudgeResidue(pose, selectedId, -step, 0);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      pose = nudgeResidue(pose, selectedId, step, 0);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      pose = nudgeResidue(pose, selectedId, 0, -step);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      pose = nudgeResidue(pose, selectedId, 0, step);
    }
  });

  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(tick);
}

boot();
