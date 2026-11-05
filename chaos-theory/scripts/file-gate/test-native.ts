/** Native proof audit, differential and real-filesystem campaign. No affirmative verifier mocks. */
import fs from "node:fs/promises";
import { join } from "node:path";
import { spawn, execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { deepStrictEqual, equal, ok, rejects } from "node:assert";
import { startFileAuthority } from "./native";
import { createFileHost } from "./workspace";
import { type Spec } from "./model";
import { encodeJournal } from "../durable-recovery";
import { root } from "../lean-plan-process";
await fs.mkdir(join(root, "results"), { recursive: true });
const output = await fs.mkdtemp(join(root, "results/file-gate-tests-"));
const lean = await startFileAuthority();
const vectors = await fs.open(join(output, "vectors.jsonl"), "wx");
const table = createHash("sha256");
let cases = 0,
  negative = 0;
const spec: Spec = {
  files: [
    { id: "data-A", bytes: "id,value\nx,4\nkeep,9\n" },
    { id: "ref-B", bytes: "id,value\ny,5\n" },
  ],
  policy: {
    inspectable: ["data-A", "ref-B"],
    editable: [{ fileId: "data-A", rowId: "x" }],
    minimum: 0,
    maximum: 100,
    requireInspection: true,
  },
};
const inspect = (fileId = "data-A") => ({
  tool: "inspect_file",
  args: { fileId },
});
const write = (value: string, fileId = "data-A", rowId = "x") => ({
  tool: "set_value",
  args: { fileId, rowId, value },
});
const text = (actions: unknown[]) => JSON.stringify({ actions });
const controls: string[] = [];
async function deny(name: string, p: Promise<unknown>) {
  await rejects(p);
  negative++;
  controls.push(name);
}
try {
  for (const ids of [
    ["a", "b"],
    ["cohort:alpha", "cohort:beta"],
  ])
    for (const requireInspection of [false, true])
      for (const target of [0, 1])
        for (const bounds of [
          [0, 5],
          [3, 10],
        ]) {
          const s: Spec = {
            files: [
              { id: ids[0], bytes: "id,value\nx,4\nkeep,9\n" },
              { id: ids[1], bytes: "id,value\ny,5\n" },
            ],
            policy: {
              inspectable: ids,
              editable: [
                { fileId: ids[target], rowId: target === 0 ? "x" : "y" },
              ],
              minimum: bounds[0],
              maximum: bounds[1],
              requireInspection,
            },
          };
          const atoms = [
            inspect(ids[0]),
            inspect(ids[1]),
            write("0", ids[0]),
            write("5", ids[0]),
            write("10", ids[1], "y"),
            write("4", ids[0], "keep"),
            write("4", "../../outside"),
            write("01", ids[0]),
          ];
          const plans: unknown[][] = [[]];
          for (let depth = 1; depth <= 3; depth++) {
            const previous = plans.filter((p) => p.length === depth - 1);
            for (const p of previous)
              for (const a of atoms) plans.push([...p, a]);
          }
          for (const actions of plans) {
            const plans = [text(actions)],
              r = await lean.authorize(s, plans);
            const vector = {
              spec: s,
              plans,
              initial: r.initial,
              outcomes: r.outcomes,
            };
            const wire = JSON.stringify(vector) + "\n";
            await vectors.write(wire);
            table.update(wire);
            cases++;
          }
        }
  equal(cases, 9360);
  for (const raw of [
    '{"actions":[],"actions":[]}',
    '{"actions":[],"\\u0061ctions":[]}',
    '{"actions":[{"tool":"set_value","args":{"value":-0}}]}',
    '{"actions":[{"tool":"x","args":{"x":"\\ud800"}}]}',
    '{"actions":[]} tail',
  ])
    await deny("strict raw plan", lean.authorize(spec, [raw]));
} finally {
  await vectors.close();
  await lean.close();
}
const py = JSON.parse(
  execFileSync("python3", ["scripts/file-gate/verify-vectors.py"], {
    cwd: root,
    input: await fs.readFile(join(output, "vectors.jsonl")),
    encoding: "utf8",
    timeout: 60000,
  }),
);
equal(py.independentPythonCases, cases);
const host = await createFileHost();
const children: ReturnType<typeof worker>[] = [];
function worker(
  path: string,
  checkpoint: string,
  plan: string,
  mode: string,
  name: string,
) {
  const marker = join(output, name + ".marker");
  const child = spawn(
    process.execPath,
    [
      "--import",
      "./scripts/journal-fault-shim.mjs",
      "--import",
      "tsx",
      "scripts/file-gate/test-worker.ts",
      path,
      checkpoint,
      plan,
    ],
    {
      cwd: root,
      detached: true,
      env: {
        PATH: process.env.PATH,
        PCS_LEAN: process.env.PCS_LEAN,
        PCS_JOURNAL_TEST_FAULT: mode,
        PCS_JOURNAL_TEST_DIRECTORY: path,
        PCS_JOURNAL_TEST_MARKER: marker,
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let stdout = "",
    stderr = "";
  child.stdout.on("data", (b) => (stdout += b));
  child.stderr.on("data", (b) => (stderr += b));
  const done = new Promise<void>((r) => child.once("close", () => r()));
  return {
    marker,
    async kill() {
      if (child.exitCode === null && child.signalCode === null) {
        try {
          process.kill(-child.pid!, "SIGKILL");
        } catch {
          /* Already exited. */
        }
      }
      await done;
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
        await done;
        equal(child.exitCode, 0, stderr.slice(-2000));
        return JSON.parse(stdout);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}
async function marker(path: string) {
  for (let i = 0; i < 900; i++) {
    try {
      await fs.access(path);
      return;
    } catch {
      await new Promise((r) => setTimeout(r, 50));
    }
  }
  throw Error("Worker publication boundary timeout");
}
const crash: { phase: string; generation: number }[] = [];
try {
  const path = join(output, "real-files"),
    s = await host.create(path, spec),
    zero = s.snapshot();
  const blocked = await s.submit(
    zero.checkpoint,
    text([write("0", "ref-B", "y"), write("7")]),
  );
  deepStrictEqual(blocked.outcome.executed, [false, false]);
  deepStrictEqual(blocked.outcome.files, spec.files);
  const applied = await s.submit(
    blocked.checkpoint,
    text([inspect(), write("42")]),
  );
  equal(
    await fs.readFile(applied.artifacts[0].path, "utf8"),
    "id,value\nx,42\nkeep,9\n",
  );
  equal(
    await fs.readFile(applied.artifacts[1].path, "utf8"),
    spec.files[1].bytes,
  );
  equal(await fs.readFile(zero.artifacts[0].path, "utf8"), spec.files[0].bytes);
  deepStrictEqual(
    (await host.resume(path, applied.checkpoint)).snapshot(),
    applied,
  );
  await deny("stale checkpoint", s.submit(zero.checkpoint, text([])));
  const missing = join(output, "missing");
  await fs.cp(path, missing, { recursive: true });
  await fs.unlink(join(missing, "commit-1.json"));
  await deny("receipt gap", host.recover(missing, zero.checkpoint));
  const rollback = join(output, "rollback");
  await fs.cp(path, rollback, { recursive: true });
  await fs.unlink(join(rollback, "commit-2.json"));
  await deny(
    "truncation below checkpoint",
    host.recover(rollback, applied.checkpoint),
  );
  const tamperPath = join(output, "tamper"),
    tampered = await host.create(tamperPath, spec);
  await fs.writeFile(
    tampered.snapshot().artifacts[0].path,
    "id,value\nx,8\nkeep,9\n",
  );
  await deny(
    "changed physical incumbent CSV",
    tampered.submit(
      tampered.snapshot().checkpoint,
      text([inspect(), write("42")]),
    ),
  );
  const symlinkPath = join(output, "symlink"),
    link = await host.create(symlinkPath, spec),
    canary = join(output, "outside-canary.csv");
  await fs.writeFile(canary, "untouched\n");
  await fs.unlink(link.snapshot().artifacts[0].path);
  await fs.symlink(canary, link.snapshot().artifacts[0].path);
  await deny(
    "symlink artifact",
    host.resume(symlinkPath, link.snapshot().checkpoint),
  );
  equal(await fs.readFile(canary, "utf8"), "untouched\n");
  const corrupt = await host.create(join(output, "bad-plan"), spec),
    before = corrupt.snapshot();
  await deny(
    "fake checker result in plan",
    corrupt.submit(before.checkpoint, '{"actions":[],"verified":true}'),
  );
  deepStrictEqual(corrupt.snapshot(), before);
  await deny(
    "caller verifier substitution",
    host.create(join(output, "substitution"), { ...spec, verifier: "fake" }),
  );
  const control = await host.createControlFixture(
    join(output, "control"),
    spec,
  );
  const bad = await control.submit(
    control.snapshot().checkpoint,
    text([write("0", "ref-B", "y")]),
  );
  equal(bad.verificationAuthority, false);
  equal(bad.outcome.executed[0], true);
  equal(bad.outcome.permitted[0], false);
  equal(await fs.readFile(bad.artifacts[1].path, "utf8"), "id,value\ny,0\n");
  // Safe wrong-answer and an intentionally unreachable policy are retained negative scientific controls.
  const wrong = await host.create(join(output, "safe-wrong"), spec);
  const wrongResult = await wrong.submit(
    wrong.snapshot().checkpoint,
    text([inspect(), write("8")]),
  );
  equal(wrongResult.outcome.executed[1], true);
  ok(!wrongResult.outcome.files[0].bytes.includes("x,42"));
  const locked = await host.create(join(output, "unreachable"), {
    ...spec,
    policy: { ...spec.policy, inspectable: ["ref-B"] },
  });
  const lockedResult = await locked.submit(
    locked.snapshot().checkpoint,
    text([inspect(), write("42")]),
  );
  deepStrictEqual(lockedResult.outcome.executed, [false, false]);
  for (const phase of [
    "before-link",
    "after-link",
    "after-sync",
    "sync-error",
  ]) {
    const directory = join(output, "crash-" + phase),
      initial = await host.create(directory, spec),
      cp = initial.snapshot().checkpoint;
    const checkpoint = directory + "-checkpoint.json";
    await fs.writeFile(checkpoint, encodeJournal(cp));
    const w = worker(
      directory,
      checkpoint,
      text([inspect(), write("42")]),
      phase,
      phase,
    );
    children.push(w);
    if (phase === "sync-error") {
      const r = await w.result();
      equal(r.ok, false);
      deepStrictEqual(r.snapshot.checkpoint, cp);
    } else {
      await marker(w.marker);
      await w.kill();
    }
    if (phase !== "before-link")
      await deny("unacknowledged suffix: " + phase, host.resume(directory, cp));
    const recovered = (await host.recover(directory, cp)).snapshot();
    equal(recovered.checkpoint.generation, phase === "before-link" ? 0 : 1);
    equal(
      await fs.readFile(recovered.artifacts[0].path, "utf8"),
      phase === "before-link"
        ? spec.files[0].bytes
        : "id,value\nx,42\nkeep,9\n",
    );
    crash.push({ phase, generation: recovered.checkpoint.generation });
  }
  const racePath = join(output, "race"),
    race = await host.create(racePath, spec),
    anchor = racePath + "-checkpoint.json";
  await fs.writeFile(anchor, encodeJournal(race.snapshot().checkpoint));
  const left = worker(
      racePath,
      anchor,
      text([inspect(), write("8")]),
      "barrier",
      "left",
    ),
    right = worker(
      racePath,
      anchor,
      text([inspect(), write("9")]),
      "barrier",
      "right",
    );
  children.push(left, right);
  await Promise.all([marker(left.marker), marker(right.marker)]);
  await Promise.all([
    fs.writeFile(left.marker + ".release", "release"),
    fs.writeFile(right.marker + ".release", "release"),
  ]);
  const raceResults = await Promise.all([left.result(), right.result()]);
  equal(raceResults.filter((r) => r.ok).length, 1);
  const winner = (
    await host.recover(racePath, race.snapshot().checkpoint)
  ).snapshot();
  equal(winner.checkpoint.generation, 1);
  deepStrictEqual(winner, raceResults.find((r) => r.ok).snapshot);
  const report = {
    passed: true,
    actualLeanProcess: true,
    newInferenceCalls: 0,
    cases,
    tableSha256: table.digest("hex"),
    independentPythonCases: py.independentPythonCases,
    negativeControls: negative,
    controls,
    crash,
    separateProcessRaceWinners: 1,
    safeWrongAnswerAccepted: true,
    restrictivePolicyDeadEnd: true,
    kernelTheorems: 33,
    newKernelTheorems: 12,
    authority: host.authority(),
    output,
    limitation:
      "Formal policy model plus tested host correspondence; trusted host/filesystem, unsigned checkpoints. Process crashes are tested, power loss is not proved. Capability-control effects are not authorizations; safe edits need not solve the task.",
  };
  await fs.writeFile(
    join(output, "native-ledger.json"),
    JSON.stringify(host.records(), null, 2) + "\n",
  );
  await fs.writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await Promise.all(children.map((c) => c.kill()));
  await host.close();
}
