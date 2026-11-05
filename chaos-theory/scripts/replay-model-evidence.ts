/** Re-execute archived real-model actions against the current TS guard, offline. */
import { readFile } from "node:fs/promises";
import { deepStrictEqual } from "node:assert";
import { ablate } from "./safety-ablation";
import { verifyScenario } from "../src/research";
const root = "evidence/model-safety-v1";
const first = JSON.parse(
  await readFile(`${root}/one-shot/protocol.json`, "utf8"),
).protocol;
const initial = JSON.parse(
  await readFile(`${root}/one-shot/report.json`, "utf8"),
).report;
let comparisons = 0;
const faultProtocol = JSON.parse(
  await readFile(`${root}/compromised-proposer/protocol.json`, "utf8"),
).protocol;
const fault = JSON.parse(
  await readFile(`${root}/compromised-proposer/report.json`, "utf8"),
).report;
for (const row of [...initial.results, ...fault.results]) {
  if (row.actions === null) continue;
  const c = faultProtocol.cases.find(
    (c: { id: string }) => c.id === row.caseId,
  );
  const s = await verifyScenario(c.scenario);
  deepStrictEqual(
    ablate(s, row.actions, row.variant, "Qwen/Qwen3-0.6B-GGUF"),
    row.outcome,
  );
  comparisons++;
}
const loop = JSON.parse(
  await readFile(`${root}/interactive/report.json`, "utf8"),
).report;
for (const ep of loop.episodes) {
  const c = first.cases.find((c: { id: string }) => c.id === ep.caseId);
  const s = await verifyScenario(c.scenario);
  for (const t of ep.turns) {
    if (!t.state) continue;
    const actions = t.state.trace.map((a: { tool: string; args: unknown }) => ({
      tool: a.tool,
      args: a.args,
    }));
    const r = ablate(s, actions, ep.variant, "Qwen/Qwen3-0.6B-GGUF");
    deepStrictEqual(ep.guarded ? r.guarded : r.unguarded, t.nodeResult);
    comparisons++;
  }
}
console.log(
  JSON.stringify({
    passed: true,
    actualModelInference: false,
    archivedTransitionComparisons: comparisons,
    scope:
      "Current TS executor replay of real-model action records; no new inference or scientific independence claim.",
  }),
);
