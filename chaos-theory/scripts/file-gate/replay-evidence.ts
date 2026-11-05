/** Fresh source-built replay of actual model proposals, CSV artifacts and the full recorded native ledger. */
import fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { deepStrictEqual, equal, ok } from "node:assert";
import { startFileAuthority, fileHash } from "./native";
import { createFileHost } from "./workspace";
import { root } from "../lean-plan-process";
import { checkStudySources, studySourceNames } from "./source-profile";
const path = resolve(
  process.argv[2] ?? join(root, "evidence/general-file-gate-v1/live"),
);
const python = JSON.parse(
  execFileSync("python3", ["scripts/file-gate/verify_evaluation.py", path], {
    cwd: root,
    encoding: "utf8",
    timeout: 60000,
  }),
);
ok(python.passed);
const protocolEnvelope = JSON.parse(
  await fs.readFile(join(path, "protocol.json"), "utf8"),
);
const p = protocolEnvelope.protocol;
const r = JSON.parse(
  await fs.readFile(join(path, "report.json"), "utf8"),
).report;
const currentSources = Object.fromEntries(
  await Promise.all(
    studySourceNames.map(async (name) => [
      name,
      await fileHash(join(root, name)),
    ]),
  ),
);
const observerRepair = await checkStudySources(
  p.sources,
  currentSources,
  r.collectionRecovery,
  {
    protocolHash: protocolEnvelope.sha256,
    modelCalls: r.calls.length,
    episodes: r.episodes.length,
  },
);
const host = await createFileHost(),
  native = await startFileAuthority();
const ledger = JSON.parse(
  await fs.readFile(join(path, "native-ledger.json"), "utf8"),
);
let count = 0,
  successes = 0,
  rejections = 0;
try {
  deepStrictEqual(host.authority(), p.authority);
  equal(host.manifest().versionString, p.nativeManifest.versionString);
  equal(
    host.manifest().pins[host.manifest().executable],
    p.nativeManifest.pins[p.nativeManifest.executable],
  );
  for (const e of r.episodes) {
    const s = await host.resume(
        join(path, "workspaces", e.id),
        e.final.checkpoint,
      ),
      actual = s.snapshot();
    // Absolute historical paths describe origin. Replay verifies actual artifact bytes under the selected local directory.
    deepStrictEqual(
      {
        ...actual,
        artifacts: actual.artifacts.map(({ path: _path, ...a }) => a),
      },
      {
        ...e.final,
        artifacts: e.final.artifacts.map(
          ({
            path: _path,
            ...a
          }: {
            path: string;
            id: string;
            sha256: string;
          }) => a,
        ),
      },
    );
    count++;
  }
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
    if (accepted) successes++;
    else rejections++;
  }
} finally {
  await host.close();
  await native.close();
}
console.log(
  JSON.stringify(
    {
      passed: true,
      realLeanProcess: true,
      actualArtifactWorkspaces: count,
      freshNativeComputations: ledger.length,
      acceptedNativeProfiles: successes,
      rejectedNativeProfiles: rejections,
      originalModelCalls: r.calls.length,
      ledgerProvenance:
        r.collectionRecovery?.nativeLedgerProvenance ?? "original-recording",
      observerReplayProfile: observerRepair
        ? "pinned-collection-repair-v1"
        : "current-sources",
      newInferenceCalls: 0,
      scope:
        "Exact-source independent replay of archived inference, not a new generation experiment, origin authentication or a hostile-host proof.",
    },
    null,
    2,
  ),
);
