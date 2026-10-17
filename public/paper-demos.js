/**
 * Paper Demos UI — guided walkthrough over real receipts.
 * Loads same-origin JSON only. Never issues scientific ACCEPT.
 */
const STEPS = [
  {
    id: "penguins",
    title: "Palmer Penguins package",
    nav: "1. Real field data",
    atlas: ["zenodo-3960218", "peng-2011"],
    receipt: "paper-demos/penguins-package-receipt.json",
    playHref: "scientific-workflow-v2.html",
    playLabel: "Open Real Data Explorer →",
    paperHref: "https://doi.org/10.5281/zenodo.3960218",
    paperLabel: "Zenodo 10.5281/zenodo.3960218",
    alsoPaper: {
      href: "https://doi.org/10.1371/journal.pone.0090081",
      label: "Gorman et al., PLoS ONE 2014",
    },
    body: [
      "Start with measurements people actually took: Kristen Gorman and Palmer Station LTER recorded flipper length and body mass for Adelie, Chinstrap, and Gentoo penguins. The palmerpenguins project publishes that table under CC0; PCS ships a signed .pcs.zip built from those bytes.",
      "On the Real Data Explorer you can browse the points, then inspect a recorded receiver run. Separately, this site’s Paper Demos build re-ran the independent replay command against the same bundle and public key.",
      "What PCS shows well here: the package verifies, dimensional unit checks are Lean-authoritative, least-squares numbers replay exactly, and population / causal validity stays OPEN. scientific_acceptance remains false on purpose.",
    ],
    highlightKeys: [
      "lean_authority_verdict",
      "scientific_acceptance",
      "open_obligations",
      "domain_outcome",
      "bundle_sha256",
    ],
  },
  {
    id: "countermodel",
    title: "Countermodel witnesses → Lean",
    nav: "2. Logic you can recompile",
    atlas: ["peng-2011", "lean4"],
    receipt: "paper-demos/countermodel-lean-receipt.json",
    playHref: "arena-countermodel.html",
    playLabel: "Play Countermodel Lab →",
    paperHref: "https://doi.org/10.1126/science.1213847",
    paperLabel: "Peng, Science 2011 (DOI)",
    body: [
      "Peng’s note on reproducible computational science is about keeping the trail attached to the claim. Countermodel Lab is a tiny version of that idea for logic: when two English readings disagree, you find a finite world that proves it, then export Lean 4 source.",
      "The receipt on this page is not a screenshot claim. A pinned Lean 4.28.0 binary compiled every exported witness theorem and printed LEAN_KERNEL_VERIFIED for each mission.",
      "That is real kernel data for an educational logic surface. It is not a psychology replication, and it is not scientific ACCEPT.",
    ],
    highlightKeys: ["mission_count", "missions_verified", "status", "checked_at_utc"],
  },
  {
    id: "bridge",
    title: "Bridge Builder on a fresh kernel",
    nav: "3. Typed proof actions",
    atlas: ["lean4", "mathlib4"],
    receipt: "paper-demos/bridge-tutorial-lean-receipt.json",
    playHref: "bridge-builder.html",
    playLabel: "Play Bridge Builder →",
    paperHref: "https://github.com/leanprover/lean4",
    paperLabel: "Lean 4 repository",
    body: [
      "Bridge Builder lets you carry facts across a proof bridge using recorded Lean states. When you finish a route, you can also ask the public checker for a fresh remote kernel run (rate-limited).",
      "For this Paper Demos build we took the tutorial mission—“if A→B and B→C then A→C”—and re-verified its typed proof actions with a local LeanEnvironment on Lean 4.28.0. The kernel axioms stay inside the approved set (often empty for this fragment).",
      "You get a machine-checked math receipt. You do not get clinical or merge authority.",
    ],
    highlightKeys: ["statement", "status", "action_count", "kernel_axioms", "elapsed_seconds"],
  },
  {
    id: "fold",
    title: "Assurance Fold (practice board)",
    nav: "4. Claim-lane practice",
    atlas: ["foldit-cooper-2010", "ioannidis-2005", "rfc8032"],
    receipt: null,
    playHref: "assurance-fold.html",
    playLabel: "Play Assurance Fold →",
    paperHref: "https://doi.org/10.1038/nature09304",
    paperLabel: "Cooper et al., Nature 2010 (Foldit)",
    alsoPaper: {
      href: "https://doi.org/10.1371/journal.pmed.0020124",
      label: "Ioannidis, PLoS Med 2005",
    },
    body: [
      "Foldit showed that people can explore hard configuration spaces under a score. Assurance Fold borrows only that spirit: you rearrange claim tokens until board heat stays low. It is not protein folding, and a locked board is not Lean ACCEPT.",
      "Ioannidis’s warning is why science-open tokens must stay out of the Authority zone, and why overclaim traps belong in Reject. RFC 8032 sits nearby as the authenticity lane for signed packages—signatures ≠ clinical truth.",
      "Play the board after the paper demos. Combos and stars make it worth another run; the notebooks you export are for training research, not certificates.",
    ],
    highlightKeys: [],
    staticNote:
      "No Lean receipt by design. issues_accept stays false. Use the demos above when you want real kernel or package data.",
  },
];

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function pick(obj, keys) {
  const out = {};
  for (const k of keys) {
    if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  }
  return out;
}

async function loadManifest() {
  const res = await fetch("paper-demos/manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error(`manifest missing (${res.status})`);
  return res.json();
}

async function loadReceipt(stepId) {
  // Literal same-origin static fetches only (site security gate).
  let res;
  if (stepId === "penguins") {
    res = await fetch("paper-demos/penguins-package-receipt.json", { cache: "no-store" });
  } else if (stepId === "countermodel") {
    res = await fetch("paper-demos/countermodel-lean-receipt.json", { cache: "no-store" });
  } else if (stepId === "bridge") {
    res = await fetch("paper-demos/bridge-tutorial-lean-receipt.json", { cache: "no-store" });
  } else {
    return null;
  }
  if (!res.ok) throw new Error(`receipt missing (${res.status})`);
  return res.json();
}

function renderManifest(manifest) {
  const status = document.getElementById("pdManifestStatus");
  const list = document.getElementById("pdReceiptList");
  status.textContent = `Generated ${manifest.generated_at_utc || "—"} · ${
    manifest.lean_version_line || "Lean version unknown"
  } · scientific authority never asserted`;
  list.innerHTML = "";
  for (const demo of manifest.demos || []) {
    const li = document.createElement("li");
    const badgeClass =
      demo.status === "verified" || String(demo.status).includes("ACCEPT")
        ? "ok"
        : demo.kind === "spatial_training_game"
          ? "warn"
          : "ok";
    li.innerHTML = `<span class="pd-badge ${badgeClass}">${esc(demo.kind || "demo")}</span>
      <span><strong>${esc(demo.id)}</strong> · ${esc(demo.status)}${
        demo.note ? `<br><small>${esc(demo.note)}</small>` : ""
      }</span>
      <span>${
        demo.receipt
          ? `<a href="${esc(demo.receipt)}">receipt</a> · `
          : ""
      }<a href="${esc(demo.play)}">open</a></span>`;
    list.appendChild(li);
  }
}

function renderNav(activeId) {
  const ol = document.getElementById("pdStepNav");
  ol.innerHTML = "";
  for (const step of STEPS) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.type = "button";
    btn.textContent = step.nav;
    if (step.id === activeId) btn.setAttribute("aria-current", "true");
    btn.addEventListener("click", () => showStep(step.id));
    li.appendChild(btn);
    ol.appendChild(li);
  }
}

async function showStep(id) {
  const step = STEPS.find((s) => s.id === id) || STEPS[0];
  renderNav(step.id);
  const panel = document.getElementById("pdPanel");
  panel.innerHTML = `<p>Loading ${esc(step.title)}…</p>`;

  let receipt = null;
  let receiptError = null;
  if (step.receipt) {
    try {
      receipt = await loadReceipt(step.id);
      if (!receipt) throw new Error("no receipt for step");
      if (receipt.issues_accept !== false) throw new Error("receipt issued accept");
    } catch (err) {
      receiptError = err.message;
    }
  }

  const bodyHtml = step.body.map((p) => `<p>${esc(p)}</p>`).join("");
  const also = step.alsoPaper
    ? ` · <a href="${esc(step.alsoPaper.href)}" rel="noopener noreferrer" target="_blank">${esc(
        step.alsoPaper.label
      )}</a>`
    : "";

  let receiptBlock = "";
  if (step.staticNote) {
    receiptBlock = `<div class="pd-callout open">${esc(step.staticNote)}</div>`;
  } else if (receiptError) {
    receiptBlock = `<div class="pd-callout open">Receipt not loaded (${esc(
      receiptError
    )}). Run <code>python3 scripts/run_paper_demos_kernel.py</code> with Lean 4.28 activated.</div>`;
  } else if (receipt) {
    const highlights = pick(receipt, step.highlightKeys);
    const open = Array.isArray(receipt.open_obligations) && receipt.open_obligations.length;
    receiptBlock = `
      <div class="pd-callout${open || receipt.scientific_acceptance === false ? " open" : ""}">
        ${
          receipt.lean_authority_verdict
            ? `Lean authority verdict: <strong>${esc(receipt.lean_authority_verdict)}</strong>; scientific_acceptance: <strong>${esc(
                receipt.scientific_acceptance
              )}</strong>.`
            : `Kernel status: <strong>${esc(receipt.status)}</strong> on Lean ${esc(
                receipt.lean_version || "4.28.0"
              )}.`
        }
        ${esc(receipt.meaning || "")}
      </div>
      <pre class="pcs-lean-print" tabindex="0">${esc(JSON.stringify(highlights, null, 2))}</pre>
      <p class="pd-meta"><a href="${esc(step.receipt)}">Download full receipt JSON</a></p>`;
  }

  panel.innerHTML = `
    <h2>${esc(step.title)}</h2>
    <p class="pd-meta">Paper / source:
      <a href="${esc(step.paperHref)}" rel="noopener noreferrer" target="_blank">${esc(step.paperLabel)}</a>${also}
    </p>
    ${bodyHtml}
    ${receiptBlock}
    <div class="pd-actions">
      <a class="button primary" href="${esc(step.playHref)}">${esc(step.playLabel)}</a>
      <a class="button secondary" href="evidence-atlas.html">Evidence Atlas</a>
      ${
        step.id !== "fold"
          ? `<button type="button" class="button secondary" id="pdNext">Next step →</button>`
          : `<a class="button secondary" href="assurance-fold.html">Finish on the claim board →</a>`
      }
    </div>`;

  const next = document.getElementById("pdNext");
  if (next) {
    const idx = STEPS.findIndex((s) => s.id === step.id);
    next.addEventListener("click", () => showStep(STEPS[idx + 1].id));
  }

  history.replaceState(null, "", `#${step.id}`);
}

async function boot() {
  try {
    const manifest = await loadManifest();
    if (manifest.issues_accept !== false) throw new Error("manifest issued accept");
    renderManifest(manifest);
  } catch (err) {
    document.getElementById("pdManifestStatus").textContent =
      `Manifest missing (${err.message}). Generate with python3 scripts/run_paper_demos_kernel.py`;
  }
  const hash = (location.hash || "").replace(/^#/, "");
  const start = STEPS.some((s) => s.id === hash) ? hash : "penguins";
  await showStep(start);
}

boot();
