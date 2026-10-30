/**
 * Evidence Atlas UI — renders curated external sources from local JSON.
 * Navigation only; no remote API fetches beyond the static JSON on same origin.
 */
const ALLOWED_HOSTS = new Set([
  "doi.org",
  "www.nature.com",
  "pmc.ncbi.nlm.nih.gov",
  "journals.plos.org",
  "github.com",
  "www.rfc-editor.org",
]);

function esc(v) {
  return String(v ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeUrl(url) {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    if (!ALLOWED_HOSTS.has(u.hostname)) return null;
    return u.href;
  } catch {
    return null;
  }
}

function render(entries, filter) {
  const root = document.getElementById("eaList");
  root.innerHTML = "";
  const list = entries.filter((e) => filter === "all" || e.kind === filter);
  if (!list.length) {
    root.innerHTML = "<p>No sources in this filter.</p>";
    return;
  }
  for (const e of list) {
    const card = document.createElement("article");
    card.className = "ea-card";
    card.dataset.kind = e.kind;
    const links = [];
    for (const key of ["url", "also", "pmc"]) {
      const href = safeUrl(e[key]);
      if (!href) continue;
      const label =
        key === "url" ? "Primary link" : key === "also" ? "Publisher page" : "PMC full text";
      links.push(`<a href="${esc(href)}" rel="noopener noreferrer" target="_blank">${esc(label)}</a>`);
    }
    const surfaces = (e.pcs_surface || [])
      .map((s) => `<a href="${esc(s)}">${esc(s.replace(".html", "").replace(/#.*$/, ""))}</a>`)
      .join(" · ");
    const demo =
      typeof e.demo_run === "string" && e.demo_run.startsWith("paper-demos.html")
        ? `<p class="ea-demo"><a class="button secondary" href="${esc(e.demo_run)}">Run PCS paper demo →</a></p>`
        : "";
    card.innerHTML = `
      <span class="ea-kind">${esc(e.kind)}</span>
      <h2>${esc(e.title)}</h2>
      <p class="ea-meta">${esc(e.authors)} · ${esc(e.venue)}${e.doi ? ` · DOI <code>${esc(e.doi)}</code>` : ""}</p>
      <p class="ea-why">${esc(e.why)}</p>
      <div class="ea-links">${links.join("")}</div>
      ${demo}
      <p class="ea-surfaces"><strong>PCS surfaces:</strong> ${surfaces || "—"}</p>`;
    root.appendChild(card);
  }
}

async function boot() {
  // Same-origin static asset only (cache:no-store matches site security gate).
  const res = await fetch("evidence-atlas.json", { cache: "no-store" });
  if (!res.ok) throw new Error("evidence atlas missing");
  const data = await res.json();
  if (data.issues_accept !== false) throw new Error("atlas must not issue accept");
  const filter = document.getElementById("eaFilter");
  const draw = () => render(data.entries || [], filter.value);
  filter.addEventListener("change", draw);
  draw();
}

boot().catch((err) => {
  const root = document.getElementById("eaList");
  root.innerHTML = `<p class="ea-disclaimer">Could not load local atlas JSON (${esc(err.message)}). Static DOI links below remain available.</p>`;
});
