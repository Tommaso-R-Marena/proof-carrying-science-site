import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

function read(rel) {
  return readFileSync(join(ROOT, rel), "utf8");
}

function json(rel) {
  return JSON.parse(read(rel));
}

test("paper demos manifest never issues accept and lists kernel receipts", () => {
  const manifest = json("paper-demos/manifest.json");
  assert.equal(manifest.format, "pcs-paper-demos-manifest-v1");
  assert.equal(manifest.issues_accept, false);
  assert.equal(manifest.pcs_scientific_authority, false);
  const ids = (manifest.demos || []).map((d) => d.id);
  assert.ok(ids.includes("countermodel-lab-witnesses"));
  assert.ok(ids.includes("bridge-tutorial-transitivity"));
  assert.ok(ids.includes("palmer-penguins-scientific-workflow-v2"));
  assert.ok(ids.includes("assurance-fold-claim-board"));
});

test("countermodel lean receipt records verified missions", () => {
  const r = json("paper-demos/countermodel-lean-receipt.json");
  assert.equal(r.issues_accept, false);
  assert.equal(r.status, "verified");
  assert.ok(r.mission_count >= 7);
  assert.ok(r.missions_verified.includes("implication-flip"));
});

test("bridge tutorial lean receipt is verified without scientific authority", () => {
  const r = json("paper-demos/bridge-tutorial-lean-receipt.json");
  assert.equal(r.issues_accept, false);
  assert.equal(r.pcs_scientific_authority, false);
  assert.equal(r.status, "verified");
  assert.match(r.statement, /A implies C/);
  assert.ok(r.action_count >= 5);
});

test("penguins package receipt keeps science open under lean ACCEPT", () => {
  const r = json("paper-demos/penguins-package-receipt.json");
  assert.equal(r.issues_accept, false);
  assert.equal(r.scientific_acceptance, false);
  assert.equal(r.lean_authority_verdict, "ACCEPT");
  assert.equal(r.pcs_package_valid, true);
  assert.ok((r.open_obligations || []).includes("population_or_causal_validity"));
  assert.ok((r.source_dois || []).includes("10.5281/zenodo.3960218"));
});

test("paper demos page and atlas wire demo_run links", () => {
  const html = read("paper-demos.html");
  assert.match(html, /Paper Demos/);
  assert.match(html, /paper-demos\.js/);
  assert.match(html, /does not mean the biology is true/);
  const atlas = json("evidence-atlas.json");
  assert.equal(atlas.issues_accept, false);
  const withDemo = atlas.entries.filter((e) => e.demo_run);
  assert.ok(withDemo.length >= 4);
  assert.ok(withDemo.every((e) => String(e.demo_run).startsWith("paper-demos.html")));
});
