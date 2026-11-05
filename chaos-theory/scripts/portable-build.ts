/** Reproducible source build for an offline, single-file review game. No deployment or test-mode controller. */
import { build } from "vite";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { BUILD } from "../src/contracts";
export async function buildPortable() {
  const result = await build({
    configFile: false,
    publicDir: false,
    base: "./",
    mode: "production",
    build: {
      write: false,
      emptyOutDir: false,
      target: "es2022",
      cssCodeSplit: false,
      rolldownOptions: { output: { codeSplitting: false, format: "es" } },
    },
  });
  if (Array.isArray(result) || !("output" in result))
    throw Error("Expected one portable build.");
  const chunks = result.output.filter((x) => x.type === "chunk");
  const css = result.output.filter(
    (x) => x.type === "asset" && x.fileName.endsWith(".css"),
  );
  const index = result.output.find(
    (x) => x.type === "asset" && x.fileName === "index.html",
  );
  if (
    chunks.length !== 1 ||
    css.length !== 1 ||
    !index ||
    index.type !== "asset" ||
    css[0].type !== "asset"
  )
    throw Error(
      "Portable build must have exactly one script, stylesheet and HTML entry.",
    );
  const script = chunks[0].code,
    style = String(css[0].source);
  if (
    /__chaos|OPENAI_API_KEY|api\.openai\.com|<\/script/i.test(script) ||
    /<\/style/i.test(style)
  )
    throw Error("Unsafe or server-only portable output.");
  const hash = (s: string) => createHash("sha256").update(s).digest("base64");
  const csp = `default-src 'none'; script-src 'sha256-${hash(script)}'; style-src 'unsafe-inline'; img-src data: blob:; connect-src 'none'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'`;
  let html = String(index.source);
  const replaceOnce = (pattern: RegExp, value: string) => {
    const matches = html.match(pattern);
    if (!matches || matches.length !== 1)
      throw Error("Expected a single reviewed HTML insertion point.");
    html = html.replace(pattern, () => value);
  };
  replaceOnce(
    /<link\b[^>]*\brel="stylesheet"[^>]*>/g,
    `<style>${style}</style>`,
  );
  replaceOnce(
    /<meta\s+http-equiv="Content-Security-Policy"\s+content="[^"]*"\s*\/?>/g,
    `<meta http-equiv="Content-Security-Policy" content="${csp}" />`,
  );
  html = html.replace(/<link\b[^>]*\brel="modulepreload"[^>]*>/g, "");
  const licenses = await readFile("public/third-party-notices.txt", "utf8");
  const escaped = licenses
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
  html = html.replace(
    "</body>",
    () =>
      `<details style="margin:20px 4%;font:12px system-ui;max-width:900px"><summary>Offline build licenses</summary><pre style="white-space:pre-wrap">${escaped}</pre></details></body>`,
  );
  // Insert code last: embedded dependency strings can contain HTML closing tags.
  replaceOnce(
    /<script\b[^>]*\bsrc="[^"]+"[^>]*><\/script>/g,
    `<script type="module">${script}</script>`,
  );
  const inlined = html.match(/<script type="module">([\s\S]*?)<\/script>/)?.[1];
  if (!inlined || hash(inlined) !== hash(script))
    throw Error("Inline script no longer matches its CSP hash.");
  const output = `results/portable-build-${randomUUID()}`;
  await mkdir(output, { recursive: true });
  await writeFile(
    output + "/OPEN_ME_FIRST.txt",
    "ODD POST: POCKET MAYHEM\n\nOpen odd-post.html in a current Chrome or Firefox browser. No installation, internet connection or account is required.\n\nNew player? Choose Learn with one delivery. The full heist asks you to steal three parcels, bring them home, then catch the tram.\n\nMove: WASD or arrows. Aim: mouse. Fire: click or J. Gadgets: 1-4. Dash: Space. Pick up/deliver: E. Pause: Escape. Touch controls are also available.\n\nHelp test AI is optional. Nothing uploads automatically. Downloaded research files contain the text you choose to include.\n\nThis is a review prototype, not a proven enjoyment or AI-safety finding. Source and docs: https://github.com/Tommaso-R-Marena/proof-carrying-science-site/pull/145\n",
    { flag: "wx" },
  );
  const file = output + "/odd-post.html";
  await writeFile(file, html, { flag: "wx" });
  const report = {
    version: 1,
    build: BUILD,
    file,
    bytes: Buffer.byteLength(html),
    sha256: createHash("sha256").update(html).digest("hex"),
    scriptHash: hash(script),
    contentSecurityPolicy: csp,
    scope:
      "Standalone production-mode review file, no hosted deployment, model adapter or test controller. Source/build hashes are unsigned comparisons, not origin attestation.",
  };
  await writeFile(
    output + "/build-report.json",
    JSON.stringify(report, null, 2) + "\n",
    { flag: "wx" },
  );
  return { output, ...report };
}
