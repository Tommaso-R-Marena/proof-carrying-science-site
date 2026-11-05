/** Actual source-built Lean plus disk/process tests. No affirmative verifier mocks. */
import fs from "node:fs/promises";
import { spawn, execFileSync } from "node:child_process";
import { join } from "node:path";
import { equal, deepStrictEqual, rejects, ok } from "node:assert";
import { demoScenarios, hashArtifact } from "../src/research";
import { createDurableRecoveryHost, encodeJournal } from "./durable-recovery";
import { root } from "./lean-plan-process";

const output = await fs.mkdtemp(join(root, "results/durable-recovery-"));
const scenario = (await demoScenarios()).find(
  (s) => s.family === "maintenance-note",
)!;
const action = (tool: string) =>
  JSON.stringify({ actions: [{ tool, args: { equipmentId: "reactor-1" } }] });
const inspect = action("inspect_equipment"),
  repair = action("repair_equipment");
let host = await createDurableRecoveryHost();
const ledger: unknown[] = [];
let nativeChecks = 0,
  negativeControls = 0,
  archivedCommits = 0;
const controls: string[] = [];
const crashResults: {
  phase: string;
  recoveredGeneration: number;
  ignoredPending: number;
}[] = [];
const workers: ReturnType<typeof worker>[] = [];
async function rejected(name: string, operation: Promise<unknown>) {
  await rejects(operation);
  negativeControls++;
  controls.push(name);
}
function python(path: string, anchor: unknown) {
  const cp = path + "-checkpoint.json";
  execFileSync("python3", [
    "-c",
    "import pathlib,sys;pathlib.Path(sys.argv[1]).write_text(sys.argv[2])",
    cp,
    encodeJournal(anchor),
  ]);
  return JSON.parse(
    execFileSync("python3", ["scripts/replay_durable_journal.py", path, cp], {
      cwd: root,
      encoding: "utf8",
      timeout: 15000,
    }),
  );
}
async function clone(source: string, name: string) {
  const target = join(output, name);
  await fs.cp(source, target, { recursive: true });
  return target;
}
async function waitFile(path: string) {
  for (let i = 0; i < 900; i++) {
    try {
      await fs.access(path);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw Error(`Actual worker did not reach boundary: ${path}`);
}
function worker(
  directory: string,
  cpPath: string,
  content: string,
  mode: string,
  name: string,
) {
  const marker = join(output, name + ".marker");
  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH,
    PCS_LEAN: process.env.PCS_LEAN,
    PCS_JOURNAL_TEST_FAULT: mode,
    PCS_JOURNAL_TEST_DIRECTORY: directory,
    PCS_JOURNAL_TEST_MARKER: marker,
  };
  const child = spawn(
    process.execPath,
    [
      "--import",
      "./scripts/journal-fault-shim.mjs",
      "--import",
      "tsx",
      "scripts/journal-test-worker.ts",
      directory,
      cpPath,
      content,
    ],
    { cwd: root, env, detached: true, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (b) => {
    stdout += b;
  });
  child.stderr.on("data", (b) => {
    stderr += b;
  });
  const ended = new Promise<void>((resolve) =>
    child.once("close", () => resolve()),
  );
  return {
    child,
    marker,
    ended,
    async kill() {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          /* Already exited. */
        }
      }
      await ended;
    },
    async result() {
      const timer = setTimeout(() => {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          /* Already exited. */
        }
      }, 60000);
      try {
        await ended;
        equal(child.exitCode, 0, stderr.slice(-3000));
        return JSON.parse(stdout);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
try {
  // Preserve a temporal obligation through an independently built process restart.
  const main = join(output, "temporal"),
    session = await host.create(main, scenario);
  const zero = session.checkpoint();
  const denied = await session.submit(zero, repair);
  equal(denied.snapshot.result.blocked, 1);
  nativeChecks += host.records().length;
  ledger.push(...host.records());
  await host.close();
  host = await createDurableRecoveryHost();
  const restarted = await host.resume(main, denied.checkpoint);
  const inspected = await restarted.submit(restarted.checkpoint(), inspect);
  const completed = await restarted.submit(inspected.checkpoint, repair);
  equal(completed.snapshot.result.completed, true);
  deepStrictEqual(
    completed.snapshot.result.trace.map((t) => t.executed),
    [false, true, true],
  );
  equal(python(main, completed.checkpoint).commits, 3);
  await rejected("stale checkpoint", host.resume(main, denied.checkpoint));
  await rejected(
    "terminal write",
    restarted.submit(completed.checkpoint, inspect),
  );
  await rejected(
    "boolean generation",
    host.resume(main, { ...completed.checkpoint, generation: true }),
  );
  const rootOnly = await clone(main, "rollback");
  await fs.unlink(join(rootOnly, "commit-3.json"));
  await rejected(
    "truncation below retained checkpoint",
    host.recover(rootOnly, completed.checkpoint),
  );
  const gap = await clone(main, "gap");
  await fs.unlink(join(gap, "commit-2.json"));
  await rejected("missing middle receipt", host.recover(gap, zero));
  const extra = await clone(main, "extra");
  await fs.writeFile(join(extra, "surprise.json"), "{}\n");
  await rejected("unexpected file", host.recover(extra, zero));
  const symlink = await clone(main, "symlink");
  await fs.unlink(join(symlink, "commit-1.json"));
  await fs.symlink(join(main, "commit-1.json"), join(symlink, "commit-1.json"));
  await rejected("symlink receipt", host.recover(symlink, zero));
  const duplicate = await clone(main, "duplicate");
  const original = await fs.readFile(join(duplicate, "session.json"), "utf8");
  await fs.writeFile(
    join(duplicate, "session.json"),
    original.replace("{", '{"format":"lean-recovery-journal-v1",'),
  );
  await rejected("duplicate descriptor key", host.recover(duplicate, zero));
  const forged = await clone(main, "forged");
  const file = join(forged, "commit-1.json"),
    raw = JSON.parse(await fs.readFile(file, "utf8"));
  raw.snapshot.result.state.repairedEquipment = ["reactor-1"];
  delete raw.digest;
  raw.digest = await hashArtifact(raw);
  await fs.writeFile(file, encodeJournal(raw));
  await rejected("rehashed false state", host.recover(forged, zero));
  const rawChanged = await clone(main, "raw-text");
  const rawFile = join(rawChanged, "commit-3.json"),
    r = JSON.parse(await fs.readFile(rawFile, "utf8"));
  r.content = " " + r.content;
  delete r.digest;
  r.digest = await hashArtifact(r);
  await fs.writeFile(rawFile, encodeJournal(r));
  await rejected(
    "semantically equal text differs from retained checkpoint",
    host.recover(rawChanged, completed.checkpoint),
  );
  const unrelated = await host.create(join(output, "unrelated"), scenario);
  await rejected(
    "different session identity",
    host.resume(main, unrelated.checkpoint()),
  );
  const malformed = await host.create(join(output, "malformed"), scenario);
  const malformedCp = malformed.checkpoint();
  const authorityMismatch = await clone(
    join(output, "malformed"),
    "authority-mismatch",
  );
  const descriptor = JSON.parse(
    await fs.readFile(join(authorityMismatch, "session.json"), "utf8"),
  );
  descriptor.authorityHash = "0".repeat(64);
  delete descriptor.digest;
  descriptor.digest = await hashArtifact(descriptor);
  await fs.writeFile(
    join(authorityMismatch, "session.json"),
    encodeJournal(descriptor),
  );
  await rejected(
    "unknown authority despite rehashed checkpoint",
    host.resume(authorityMismatch, {
      ...malformedCp,
      manifestDigest: descriptor.digest,
      recordDigest: descriptor.digest,
    }),
  );
  const incomplete = join(output, "incomplete");
  await fs.mkdir(incomplete);
  await rejected(
    "incomplete initialization",
    host.resume(incomplete, malformedCp),
  );
  const oversized = await clone(join(output, "malformed"), "oversized");
  await fs.writeFile(join(oversized, "session.json"), " ".repeat(500001));
  await rejected(
    "oversized disk artifact",
    host.resume(oversized, malformedCp),
  );
  await rejected(
    "duplicate raw plan",
    malformed.submit(malformedCp, '{"actions":[],"actions":[]}'),
  );
  deepStrictEqual(malformed.checkpoint(), malformedCp);
  deepStrictEqual(await fs.readdir(join(output, "malformed")), [
    "session.json",
  ]);

  const unicodePath = join(output, "unicode");
  const unicodeSession = await host.create(unicodePath, scenario);
  await unicodeSession.submit(
    unicodeSession.checkpoint(),
    JSON.stringify({
      actions: [
        {
          tool: "read_notice",
          args: { "\uE000": "bmp", "\u{10000}": "astral" },
        },
      ],
    }),
  );
  equal(python(unicodePath, unicodeSession.checkpoint()).commits, 1);

  // All 36 actual archived model episodes, exact original raw strings, fresh durable journals.
  const archived = JSON.parse(
    await fs.readFile(
      join(root, "evidence/lean-plan-replay-v1/live/protocol.json"),
      "utf8",
    ),
  ).protocol;
  const report = JSON.parse(
    await fs.readFile(
      join(root, "evidence/lean-plan-replay-v1/live/report.json"),
      "utf8",
    ),
  ).report;
  for (const [i, episode] of report.episodes.entries()) {
    const s = archived.seedProtocol.protocol.cases.find(
      (c: { id: string }) => c.id === episode.caseId,
    ).scenario;
    const journal = join(output, `archived-${i}`);
    let active = await host.create(journal, s);
    const texts = [
      archived.seedReport.report.results[i].response.choices[0].message.content,
      ...episode.turns
        .filter((t: { snapshot?: unknown }) => t.snapshot)
        .map(
          (t: { call: number }) =>
            report.calls[t.call].response.choices[0].message.content,
        ),
    ];
    for (const text of texts) {
      await active.submit(active.checkpoint(), text);
      archivedCommits++;
      active = await host.resume(journal, active.checkpoint());
    }
    deepStrictEqual(active.snapshot(), episode.final);
    equal(python(journal, active.checkpoint()).commits, texts.length);
  }

  // Killed processes and uncertain fsync must recover only complete published records.
  for (const mode of [
    "before-link",
    "after-link",
    "after-sync",
    "sync-error",
  ]) {
    const path = join(output, "crash-" + mode),
      active = await host.create(path, scenario),
      cp = active.checkpoint();
    const cpPath = path + "-checkpoint.json";
    await fs.writeFile(cpPath, encodeJournal(cp));
    const w = worker(path, cpPath, inspect, mode, mode);
    workers.push(w);
    if (mode === "sync-error") {
      const result = await w.result();
      equal(result.ok, false);
      deepStrictEqual(result.unchangedMemory, cp);
    } else {
      await waitFile(w.marker);
      await w.kill();
    }
    if (mode !== "before-link")
      await rejected(
        "unacknowledged suffix needs explicit recovery: " + mode,
        host.resume(path, cp),
      );
    const recovered = await host.recover(path, cp);
    equal(recovered.checkpoint().generation, mode === "before-link" ? 0 : 1);
    equal(python(path, cp).commits, recovered.checkpoint().generation);
    crashResults.push({
      phase: mode,
      recoveredGeneration: recovered.checkpoint().generation,
      ignoredPending: recovered.ignoredPending,
    });
    if (mode !== "before-link") {
      const done = await recovered.submit(recovered.checkpoint(), repair);
      equal(done.snapshot.result.completed, true);
    }
  }

  // Two separate Lean processes both reach the same publication slot before either is released.
  const racePath = join(output, "race"),
    race = await host.create(racePath, scenario),
    raceCp = race.checkpoint();
  const raceAnchor = racePath + "-checkpoint.json";
  await fs.writeFile(raceAnchor, encodeJournal(raceCp));
  const left = worker(racePath, raceAnchor, inspect, "barrier", "race-left"),
    right = worker(racePath, raceAnchor, repair, "barrier", "race-right");
  workers.push(left, right);
  await Promise.all([waitFile(left.marker), waitFile(right.marker)]);
  await Promise.all([
    fs.writeFile(left.marker + ".release", "release"),
    fs.writeFile(right.marker + ".release", "release"),
  ]);
  const raceResults = await Promise.all([left.result(), right.result()]);
  equal(raceResults.filter((r) => r.ok).length, 1);
  const winner = await host.recover(racePath, raceCp);
  equal(winner.checkpoint().generation, 1);
  deepStrictEqual(winner.snapshot(), raceResults.find((r) => r.ok).snapshot);
  equal(python(racePath, raceCp).commits, 1);

  // Deliberate limitation control: copying an unprotected directory permits separate valid forks.
  const forkBase = join(output, "fork-base"),
    base = await host.create(forkBase, scenario),
    forkCp = base.checkpoint();
  const forkA = await clone(forkBase, "fork-a"),
    forkB = await clone(forkBase, "fork-b");
  const a = await host.resume(forkA, forkCp),
    b = await host.resume(forkB, forkCp);
  await a.submit(forkCp, inspect);
  await b.submit(forkCp, repair);
  ok(a.checkpoint().recordDigest !== b.checkpoint().recordDigest);
  const authority = host.authority();
  nativeChecks += host.records().length;
  ledger.push(...host.records());
  await host.close();
  await rejected("closed host", host.resume(main, completed.checkpoint));
  const result = {
    passed: true,
    actualLeanProcess: true,
    newInferenceCalls: 0,
    archivedEpisodes: 36,
    archivedCommits,
    mainHostLeanComputations: nativeChecks,
    negativeControls,
    controls,
    crashResults,
    separateProcessRaceWinners: 1,
    raceOutcomes: raceResults,
    directoryForkCounterexampleReproduced: true,
    authority,
    evidenceDirectory: output,
    limitation:
      "Synthetic state only. Atomic hard-link/fsync behavior and host trusted; tests cover process crashes, not power loss. Latest independently retained checkpoint required for rollback detection. Directory copies permit valid forks. No origin authentication, immutable root, production authority or new model inference.",
  };
  await fs.writeFile(
    join(output, "report.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  await fs.writeFile(
    join(output, "native-ledger.json"),
    JSON.stringify(ledger, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await Promise.all(workers.map((w) => w.kill()));
  await host.close();
}
