/**
 * Assurance Fold UI — local-only Foldit-inspired evidence folding.
 * No network calls. No auto-upload. Checker is assurance-fold-core.mjs.
 */
import {
  GAME_VERSION,
  HOME_LANE,
  LANES,
  LANE_META,
  dailyMissionId,
  getMission,
  gradeFold,
  initialPlacement,
  listMissions,
  moveTile,
} from "./assurance-fold-core.mjs";

const $ = (id) => document.getElementById(id);

let state = null;
let selectedTile = null;
let hintsUsed = 0;
let dragTileId = null;

function esc(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function kindLabel(kind) {
  return String(kind || "").replaceAll("_", " ");
}

function livePreviewEnergy() {
  if (!state) return;
  try {
    const grade = gradeFold(state.mission_id, state.placement, { hints_used: hintsUsed });
    $("afEnergyValue").textContent = String(grade.energy);
    $("afEnergyBar").max = Math.max(100, grade.energy + 20);
    $("afEnergyBar").value = Math.min(grade.energy, $("afEnergyBar").max);
    $("afEnergyMeta").textContent = grade.valid
      ? `Stable fold · score ${grade.score}`
      : `${grade.mistakes.length} tension(s) · score ${grade.score}`;
  } catch {
    $("afEnergyValue").textContent = "—";
  }
}

function renderMissions() {
  const list = $("afMissionList");
  list.innerHTML = "";
  for (const mission of listMissions()) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.mission = mission.id;
    if (state?.mission_id === mission.id) btn.setAttribute("aria-current", "true");
    btn.innerHTML = `<strong>${esc(mission.title)}</strong><small>${esc(mission.tile_count)} tiles · ${esc(mission.goal)}</small>`;
    btn.addEventListener("click", () => loadMission(mission.id));
    list.appendChild(btn);
  }
}

function renderLaneSelect() {
  const select = $("afLaneSelect");
  select.innerHTML = LANES.map(
    (lane) => `<option value="${esc(lane)}">${esc(LANE_META[lane].title)}</option>`
  ).join("");
}

function renderBoard() {
  const mission = getMission(state.mission_id);
  $("afLevel").textContent = `${mission.id} · ${GAME_VERSION}`;
  $("afTitle").textContent = mission.title;
  $("afStory").textContent = mission.story;
  $("afGoal").textContent = mission.goal;

  const byId = new Map(mission.tiles.map((t) => [t.id, t]));
  const root = $("afLanes");
  root.innerHTML = "";

  for (const lane of LANES) {
    const section = document.createElement("section");
    section.className = "af-lane";
    section.dataset.lane = lane;
    section.setAttribute("aria-label", LANE_META[lane].title);
    section.innerHTML = `<div class="af-lane-head"><strong>${esc(LANE_META[lane].title)}</strong><span>${esc(LANE_META[lane].hint)}</span></div>`;
    const tiles = document.createElement("div");
    tiles.className = "af-tiles";
    tiles.dataset.lane = lane;

    for (const tileId of state.order) {
      if (state.placement[tileId] !== lane) continue;
      const tile = byId.get(tileId);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "af-tile";
      button.draggable = true;
      button.dataset.tile = tile.id;
      button.dataset.kind = tile.kind;
      button.setAttribute("aria-grabbed", selectedTile === tile.id ? "true" : "false");
      button.innerHTML = `<span class="af-kind">${esc(kindLabel(tile.kind))}</span><strong>${esc(tile.label)}</strong><em>${esc(tile.note)}</em>`;
      button.addEventListener("click", () => {
        selectedTile = tile.id;
        $("afLive").textContent = `Selected ${tile.label}. Choose a lane and press Move, or drag it.`;
        renderBoard();
      });
      button.addEventListener("dragstart", (event) => {
        dragTileId = tile.id;
        selectedTile = tile.id;
        button.setAttribute("aria-grabbed", "true");
        event.dataTransfer.setData("text/plain", tile.id);
        event.dataTransfer.effectAllowed = "move";
      });
      button.addEventListener("dragend", () => {
        dragTileId = null;
        button.setAttribute("aria-grabbed", "false");
        root.querySelectorAll(".af-drag-over").forEach((el) => el.classList.remove("af-drag-over"));
      });
      tiles.appendChild(button);
    }

    section.addEventListener("dragover", (event) => {
      event.preventDefault();
      section.classList.add("af-drag-over");
      event.dataTransfer.dropEffect = "move";
    });
    section.addEventListener("dragleave", () => section.classList.remove("af-drag-over"));
    section.addEventListener("drop", (event) => {
      event.preventDefault();
      section.classList.remove("af-drag-over");
      const id = event.dataTransfer.getData("text/plain") || dragTileId;
      if (!id) return;
      applyMove(id, lane);
    });

    section.appendChild(tiles);
    root.appendChild(section);
  }

  renderMissions();
  livePreviewEnergy();
  $("afNext").hidden = true;
}

function applyMove(tileId, lane) {
  state = moveTile(state, tileId, lane);
  selectedTile = tileId;
  $("afFeedback").hidden = true;
  $("afLive").textContent = `Moved into ${LANE_META[lane].title}.`;
  renderBoard();
}

function loadMission(missionId, seed = "play") {
  state = initialPlacement(missionId, seed);
  hintsUsed = 0;
  selectedTile = null;
  $("afFeedback").hidden = true;
  $("afLive").textContent = "Tiles start on the workbench. Fold them into honest lanes.";
  renderBoard();
}

function showHint() {
  const mission = getMission(state.mission_id);
  const misplaced = mission.tiles.find((t) => state.placement[t.id] !== HOME_LANE[t.kind]);
  hintsUsed = Math.min(20, hintsUsed + 1);
  const box = $("afFeedback");
  box.hidden = false;
  box.dataset.tone = "warn";
  if (!misplaced) {
    box.innerHTML = `<strong>Hint</strong><p>Every tile is already in its home lane. Press check to confirm. Hints used: ${hintsUsed}.</p>`;
  } else {
    box.innerHTML = `<strong>Hint</strong><p><code>${esc(misplaced.label)}</code> belongs in <strong>${esc(LANE_META[HOME_LANE[misplaced.kind]].title)}</strong>. Hints raise fold energy.</p>`;
  }
  livePreviewEnergy();
}

function checkFold() {
  const grade = gradeFold(state.mission_id, state.placement, { hints_used: hintsUsed });
  const box = $("afFeedback");
  box.hidden = false;
  box.dataset.tone = grade.valid ? "ok" : grade.hard_clear ? "warn" : "bad";
  const mistakeHtml = grade.mistakes.length
    ? `<ul>${grade.mistakes
        .slice(0, 8)
        .map((m) => {
          if (!m.tile) return `<li>${esc(m.reason)}</li>`;
          return `<li><code>${esc(m.tile)}</code>: ${esc(m.reason)}${m.home ? ` → ${esc(LANE_META[m.home].title)}` : ""}</li>`;
        })
        .join("")}</ul>`
    : "<p>No lane tensions remain.</p>";
  box.innerHTML = `
    <strong>${grade.valid ? "Stable fold" : "Fold still tense"}</strong>
    <p>Energy <code>${grade.energy}</code> · score <code>${grade.score}</code> · valid <code>${grade.valid}</code> · issues_accept <code>false</code></p>
    ${mistakeHtml}
    <p>${esc(grade.meaning)}</p>`;
  livePreviewEnergy();
  $("afNext").hidden = !grade.valid;
  $("afLive").textContent = grade.valid
    ? "Nice fold. Remember: this still does not certify science."
    : "Keep folding. Watch for scientific overclaim and ACCEPT traps.";
}

function nextMission() {
  const ids = listMissions().map((m) => m.id);
  const idx = ids.indexOf(state.mission_id);
  loadMission(ids[(idx + 1) % ids.length], `next-${Date.now()}`);
}

function boot() {
  renderLaneSelect();
  const params = new URLSearchParams(location.search);
  const mission = params.get("mission") || dailyMissionId();
  const seed = params.get("seed") || "boot";
  try {
    loadMission(mission, seed);
  } catch {
    loadMission(listMissions()[0].id, seed);
  }

  $("afMoveSelected").addEventListener("click", () => {
    if (!selectedTile) {
      $("afLive").textContent = "Select a tile first.";
      return;
    }
    applyMove(selectedTile, $("afLaneSelect").value);
  });
  $("afHint").addEventListener("click", showHint);
  $("afReset").addEventListener("click", () => loadMission(state.mission_id, state.seed));
  $("afShuffle").addEventListener("click", () =>
    loadMission(state.mission_id, `shuffle-${Math.floor(Math.random() * 1e9)}`)
  );
  $("afDaily").addEventListener("click", () => loadMission(dailyMissionId(), "daily"));
  $("afCheck").addEventListener("click", checkFold);
  $("afNext").addEventListener("click", nextMission);

  document.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      checkFold();
    }
  });
}

boot();
