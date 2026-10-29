import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

test("evidence atlas JSON cites real DOIs and never issues accept", () => {
  const data = JSON.parse(readFileSync(join(root, "evidence-atlas.json"), "utf8"));
  assert.equal(data.format, "pcs-evidence-atlas-v1");
  assert.equal(data.issues_accept, false);
  assert.ok(data.entries.length >= 8);
  const dois = data.entries.map((e) => e.doi).filter(Boolean);
  assert.ok(dois.includes("10.1038/nature09304"));
  assert.ok(dois.includes("10.1371/journal.pmed.0020124"));
  assert.ok(dois.includes("10.1126/science.1213847"));
  for (const e of data.entries) {
    assert.ok(e.url.startsWith("https://"));
    assert.ok(e.why.length > 20);
    assert.ok(["study", "repository", "standard", "supplement"].includes(e.kind));
  }
});

test("evidence atlas page hard-links allowlisted journal and repo URLs", () => {
  const html = readFileSync(join(root, "evidence-atlas.html"), "utf8");
  for (const url of [
    "https://doi.org/10.1038/nature09304",
    "https://doi.org/10.1371/journal.pmed.0020124",
    "https://github.com/Tommaso-R-Marena/proof-carrying-science",
    "https://github.com/leanprover/lean4",
    "https://www.rfc-editor.org/rfc/rfc8032",
  ]) {
    assert.match(html, new RegExp(url.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(html, /noopener noreferrer/);
  assert.match(html, /does not treat bibliography as Lean proof/);
});
