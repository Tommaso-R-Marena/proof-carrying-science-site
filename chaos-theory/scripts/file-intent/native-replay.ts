/** Fresh actual-Lean intent and execution replay. This does not generate new model output. */
import fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { deepStrictEqual, equal, ok } from "node:assert";
import { root } from "../lean-plan-process";
import { fileHash, startFileAuthority } from "../file-gate/native";
import { createFileHost } from "../file-gate/workspace";
import { buildIntentCompiler } from "./native";
const path = resolve(
  process.argv[2] ?? join(root, "evidence/file-intents-v1/live"),
);
const python = JSON.parse(
  execFileSync("python3", ["scripts/file-intent/replay.py", path], {
    cwd: root,
    encoding: "utf8",
    timeout: 60000,
  }),
);
ok(python.passed);
const p = JSON.parse(
  await fs.readFile(join(path, "protocol.json"), "utf8"),
).protocol;
for (const [name, h] of Object.entries(p.sources))
  equal(
    await fileHash(join(root, name)),
    h,
    "Frozen intent-study source changed",
  );
const r = JSON.parse(
  await fs.readFile(join(path, "report.json"), "utf8"),
).report;
const compiler = await buildIntentCompiler(),
  host = await createFileHost(),
  native = await startFileAuthority();
let compiled = 0,
  replayed = 0;
try {
  deepStrictEqual(compiler.manifest(), p.intentCompiler);
  deepStrictEqual(host.authority(), p.authority);
  for (const e of r.episodes) {
    const actual = (
      await host.resume(join(path, "workspaces", e.id), e.final.checkpoint)
    ).snapshot();
    const strip = (v: typeof actual) => ({
      ...v,
      artifacts: v.artifacts.map(({ path: _path, ...a }) => a),
    });
    deepStrictEqual(strip(actual), strip(e.final));
    for (const t of e.turns)
      if (t.compilation) {
        const q = t.compilation.request;
        const record = await compiler.compile(
          {
            files: p.cases.find((c: { id: string }) => c.id === e.caseId).spec
              .files,
            policy: q.policy,
          },
          q.target,
          q.raw,
        );
        deepStrictEqual(record, t.compilation);
        compiled++;
      }
    replayed++;
  }
  const ledger = JSON.parse(
    await fs.readFile(join(path, "native-ledger.json"), "utf8"),
  );
  for (const record of ledger) {
    const before = native.records().length;
    let accepted = true;
    try {
      await native.authorize(
        { files: record.request.files, policy: record.request.policy },
        record.request.plans,
      );
    } catch {
      accepted = false;
    }
    equal(accepted, record.response.ok);
    equal(native.records().length, before + 1);
    deepStrictEqual(native.records().at(-1), record);
  }
  console.log(
    JSON.stringify(
      {
        passed: true,
        actualLean: true,
        episodes: replayed,
        recompiledIntents: compiled,
        nativeExecutionRecords: ledger.length,
        originalNativeLedgerRetained: true,
        newInferenceCalls: 0,
      },
      null,
      2,
    ),
  );
} finally {
  await host.close();
  await native.close();
}
