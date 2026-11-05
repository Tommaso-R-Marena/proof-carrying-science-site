import { mkdir, readFile, writeFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import {
  demoScenarios,
  evaluateFixture,
  summarize,
  hashArtifact,
  verifyScenario,
  compareSources,
  syntheticCohort,
  captureSchema,
  groupedSummaries,
} from "../src/research";
import { z } from "zod";

const started = performance.now();
const args = process.argv.slice(2);
const scenarioPath = args[args.indexOf("--scenario") + 1];
if (
  args.includes("--scenario") &&
  (!scenarioPath || (await stat(scenarioPath)).size > 100_000)
) {
  throw new Error("Scenario is missing or exceeds 100 KB");
}
const scenarios = args.includes("--scenario")
  ? [await verifyScenario(JSON.parse(await readFile(scenarioPath, "utf8")))]
  : await demoScenarios();
const evaluations = scenarios.flatMap((s) =>
  (["policy", "vulnerable"] as const).flatMap((agent) =>
    (["control", "attack"] as const).map((variant) =>
      evaluateFixture(s, agent, variant),
    ),
  ),
);
let captures = syntheticCohort();
const captureIndex = args.indexOf("--captures");
if (captureIndex >= 0) {
  const path = args[captureIndex + 1];
  if (!path || (await stat(path)).size > 10_000_000)
    throw new Error("Capture dataset is missing or exceeds 10 MB");
  captures = z
    .array(captureSchema)
    .max(1000)
    .parse(JSON.parse(await readFile(path, "utf8")));
}
const report = {
  version: 1,
  label: "fixture/simulated",
  generatedAt: new Date().toISOString(),
  durationMs: 0,
  realModelEvaluations: 0,
  realHumanParticipants: 0,
  suite: "public-exploratory-v1",
  scenarios,
  evaluations,
  summary: summarize(evaluations),
  strata: groupedSummaries(evaluations),
  sourceComparison: await compareSources(captures),
  limitations: [
    "Fixture behavior is deliberately programmed, not a measured model vulnerability.",
    "Synthetic-player records are demonstrations, not human data.",
    "Structural novelty is a transparent template count; no transfer or superiority claim.",
  ],
};
report.durationMs = performance.now() - started;
const envelope = { report, sha256: await hashArtifact(report) };
await mkdir("results", { recursive: true });
const path = join("results", `offline-${randomUUID()}.json`);
await writeFile(path, JSON.stringify(envelope, null, 2) + "\n", {
  flag: "wx",
  mode: 0o600,
});
const disk = JSON.parse(await readFile(path, "utf8"));
if ((await hashArtifact(disk.report)) !== disk.sha256)
  throw new Error("Disk report integrity mismatch");
console.log(
  JSON.stringify(
    {
      path,
      summary: report.summary,
      realModelEvaluations: 0,
      realHumanParticipants: 0,
    },
    null,
    2,
  ),
);
