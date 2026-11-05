/** Independently rebuild and replay a durable local-model run; never rerun inference in CI. */
import fs from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { deepStrictEqual, equal, ok } from "node:assert";
import { createDurableRecoveryHost, decodeJournal } from "./durable-recovery";
import { startLeanPlanProcess, root } from "./lean-plan-process";
const directory = resolve(
  process.argv[2] ?? join(root, "evidence/durable-recovery-v1/live"),
);
const python = JSON.parse(
  execFileSync(
    "python3",
    ["scripts/local_model_recovery.py", "--verify", directory],
    { cwd: root, encoding: "utf8", timeout: 30000 },
  ),
);
ok(python.passed);
const p = JSON.parse(
  await fs.readFile(join(directory, "protocol.json"), "utf8"),
).protocol;
const r = JSON.parse(
  await fs.readFile(join(directory, "report.json"), "utf8"),
).report;
ok(p.durableMode === true && p.historyMode === true);
const sourceNames = [
  "scripts/local_model_recovery.py",
  "scripts/local_runtime.py",
  "scripts/local_model_interactive.py",
  "scripts/replay_real_model.py",
  "scripts/recovery-session.ts",
  "scripts/recovery-bridge.ts",
  "scripts/safety-ablation.ts",
  "src/research.ts",
  "scripts/local_lean_runtime.py",
  "scripts/lean-plan-process.ts",
  "scripts/lean-recovery-session.ts",
  "scripts/lean-recovery-bridge.ts",
  "formal/GuardedTools.lean",
  "formal/GuardedToolsTable.lean",
  "formal/GuardedJson.lean",
  "formal/GuardedJsonMain.lean",
  "scripts/durable-recovery.ts",
  "scripts/durable-recovery-bridge.ts",
  "scripts/local_durable_runtime.py",
  "scripts/replay_durable_journal.py",
];
deepStrictEqual(Object.keys(p.sourceFiles).sort(), sourceNames.sort());
for (const name of sourceNames)
  equal(
    createHash("sha256")
      .update(await fs.readFile(join(root, name)))
      .digest("hex"),
    p.sourceFiles[name],
    `Recorded source differs: ${name}`,
  );
const stored = JSON.parse(
  await fs.readFile(join(directory, "lean-authority.json"), "utf8"),
);
deepStrictEqual(stored.manifest, p.leanAuthority);
const host = await createDurableRecoveryHost(),
  replay = await startLeanPlanProcess();
let records = 0,
  journals = 0;
try {
  deepStrictEqual(host.authority(), p.journalAuthority);
  const manifest = host.manifest();
  equal(manifest.versionString, stored.manifest.versionString);
  equal(
    manifest.pins[manifest.executable],
    stored.manifest.pins[stored.manifest.executable],
  );
  deepStrictEqual(manifest.modelAudit, stored.manifest.modelAudit);
  deepStrictEqual(manifest.decoderAudit, stored.manifest.decoderAudit);
  for (const [i, episode] of r.episodes.entries()) {
    const checkpoint = decodeJournal(
      await fs.readFile(
        join(
          directory,
          "checkpoints",
          `journal-${i}-${episode.final.generation}.json`,
        ),
      ),
    );
    const session = await host.resume(
      join(directory, "journals", `journal-${i}`),
      checkpoint,
    );
    deepStrictEqual(session.snapshot(), episode.final);
    journals++;
    const scenario = p.seedProtocol.protocol.cases.find(
      (c: { id: string }) => c.id === episode.caseId,
    ).scenario;
    const texts = [
      p.seedReport.report.results[i].response.choices[0].message.content,
      ...episode.turns
        .filter((t: { snapshot?: unknown }) => t.snapshot)
        .map(
          (t: { call: number }) =>
            r.calls[t.call].response.choices[0].message.content,
        ),
    ];
    // Actual submit replays its incumbent prefix, then checks the new candidate. Final bridge replay checks every prefix again.
    const lengths = texts.flatMap((_: string, j: number) =>
      Array.from({ length: j + 1 }, (_, k) => k + 1),
    );
    lengths.push(...texts.map((_: string, j: number) => j + 1));
    for (const length of lengths) {
      const record = stored.records[records++];
      deepStrictEqual(record.request, {
        kind: "lean-plan-request-v1",
        family: scenario.family,
        plans: texts.slice(0, length),
      });
      deepStrictEqual(record.response, {
        ok: true,
        result: await replay.authorize(scenario.family, record.request.plans),
      });
    }
  }
  equal(records, stored.records.length);
  equal(journals, 36);
} finally {
  await host.close();
  await replay.close();
}
console.log(
  JSON.stringify(
    {
      passed: true,
      journals,
      nativeLedgerRecords: records,
      originalInferenceCalls: r.calls.length,
      newInferenceCalls: 0,
      sourceBound: true,
      scope:
        "Fresh real-Lean journal and native-ledger replay plus independent Python state/hash verification. Inference is archived, not independently rerun; host and unsigned origin remain trusted.",
    },
    null,
    2,
  ),
);
