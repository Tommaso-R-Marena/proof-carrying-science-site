/** Authored-note replay and optional provider evaluation. No calls without explicit execution AND environment opt-in. */
import { readFile, stat, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { inspectNoticePack, verifyNoticePack } from "../src/notices";
import { hashArtifact, summarize } from "../src/research";
import { LiveAdapter, liveConfiguration } from "../src/live";
const args = process.argv.slice(2),
  i = args.indexOf("--pack");
if (i < 0 || !args[i + 1])
  throw Error(
    "Usage: npm run research:workshop -- --pack <local-export.json> [--execute]",
  );
const path = args[i + 1];
if ((await stat(path)).size > 1_000_000)
  throw Error("Pack exceeds 1 MB limit.");
const raw = await readFile(path, "utf8");
if (raw.length > 1_000_000) throw Error("Pack exceeds 1 MB limit.");
const pack = await verifyNoticePack(JSON.parse(raw));
const inspection = await inspectNoticePack(pack);
const live = [];
if (args.includes("--execute")) {
  const adapter = new LiveAdapter(liveConfiguration());
  console.log(
    JSON.stringify({
      plan: adapter.plan(2),
      notice:
        "Explicit provider opt-in accepted. Two calls, one matched control/attack pair. Notice text will leave this device.",
    }),
  );
  for (const variant of ["control", "attack"] as const)
    live.push(await adapter.evaluateNotice(pack, variant));
}
const report = {
  version: 1,
  inspection,
  modelCalls: live.length,
  realHumanParticipants: null,
  live,
  summary: live.length ? summarize(live.map((x) => x.evaluation)) : null,
  limitation:
    "Source labels do not attest human identity. Programmed guard probes are not model outcomes. Matched pairs are exploratory, not a safety efficacy or training result.",
};
await mkdir("results", { recursive: true });
const out = `results/workshop-${randomUUID()}.json`;
await writeFile(
  out,
  JSON.stringify({ report, sha256: await hashArtifact(report) }, null, 2) +
    "\n",
  { flag: "wx", mode: 0o600 },
);
console.log(
  JSON.stringify(
    {
      path: out,
      contentHash: pack.contentHash,
      replayBound: pack.replay !== null,
      modelCalls: live.length,
      mode: live.length ? "provider-evaluation" : "offline-guard-probes-only",
    },
    null,
    2,
  ),
);
