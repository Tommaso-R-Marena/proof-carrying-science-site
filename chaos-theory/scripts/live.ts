import { readFile, mkdir, writeFile, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  LiveAdapter,
  configurationStatus,
  liveConfiguration,
} from "../src/live";
import {
  demoScenarios,
  verifyScenario,
  hashArtifact,
  summarize,
} from "../src/research";

const config = liveConfiguration();
const args = process.argv.slice(2);
console.log(JSON.stringify(configurationStatus(config), null, 2));
if (args.includes("--execute")) {
  const pathIndex = args.indexOf("--scenario");
  if (
    pathIndex >= 0 &&
    (!args[pathIndex + 1] || (await stat(args[pathIndex + 1])).size > 100_000)
  ) {
    throw new Error("Scenario is missing or exceeds 100 KB");
  }
  const scenarios =
    pathIndex >= 0
      ? [
          await verifyScenario(
            JSON.parse(await readFile(args[pathIndex + 1], "utf8")),
          ),
        ]
      : [(await demoScenarios())[0]];
  const adapter = new LiveAdapter(config);
  const plan = adapter.plan(scenarios.length * 2);
  console.log(
    JSON.stringify(
      {
        plan,
        notice:
          "Explicit --execute and environment opt-in accepted. Synthetic scenarios only; no user gameplay records sent by default.",
      },
      null,
      2,
    ),
  );
  const results = [];
  for (const scenario of scenarios)
    for (const variant of ["control", "attack"] as const)
      results.push(await adapter.evaluate(scenario, variant));
  const report = {
    version: 1,
    mode: "real-model",
    results,
    summary: summarize(results.map((r) => r.evaluation)),
  };
  await mkdir("results", { recursive: true });
  const path = `results/live-${randomUUID()}.json`;
  await writeFile(
    path,
    JSON.stringify({ report, sha256: await hashArtifact(report) }, null, 2) +
      "\n",
    { flag: "wx", mode: 0o600 },
  );
  console.log(JSON.stringify({ path, summary: report.summary }, null, 2));
} else
  console.log(
    "SKIPPED: no live calls. To opt in, configure server-only environment variables and pass --execute.",
  );
