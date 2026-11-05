/** Real Lean compiler differentials and actual CSV publication; no model calls or mock verdicts. */
import fs from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { deepStrictEqual, equal } from "node:assert";
import { root } from "../lean-plan-process";
import { buildIntentCompiler } from "./native";
import { createFileHost } from "../file-gate/workspace";
const compiler = await buildIntentCompiler(),
  host = await createFileHost();
await fs.mkdir(join(root, "results"), { recursive: true });
const out = await fs.mkdtemp(join(root, "results/intent-tests-"));
const spec = {
    files: [{ id: "m", bytes: "id,value\nx,7\nkeep,42\n" }],
    policy: {
      inspectable: ["m"],
      editable: [{ fileId: "m", rowId: "x" }],
      minimum: 0,
      maximum: 1000000,
      requireInspection: true,
    },
  },
  target = { fileId: "m", rowId: "x" };
const vectors = [];
try {
  for (const req of [false, true])
    for (const inspectable of [[], ["m"]])
      for (const rowId of ["x", "keep"])
        for (const maximum of [10, 1000000])
          for (const value of [0, 7, 10, 11, 1000000]) {
            const s = {
                ...spec,
                policy: {
                  ...spec.policy,
                  requireInspection: req,
                  inspectable,
                  maximum,
                },
              },
              t = { ...target, rowId };
            vectors.push(
              await compiler.compile(
                s,
                t,
                JSON.stringify({ value: String(value) }),
              ),
            );
          }
  for (const raw of [
    '{"value":7}',
    '{"value":"01"}',
    '{"value":"-0"}',
    '{"value":"-1"}',
    '{"value":"1000001"}',
    '{"value":"1","value":"2"}',
    '{"value":"1","\\u0076alue":"2"}',
    '{"value":"1","verified":true}',
    '{"value":"\\ud800"}',
    '{"value":"١"}',
    '{"value":"7"}x',
    "[]",
    ' {"value":"\\u0031"}\n',
    '{"value":"7"}',
  ])
    vectors.push(await compiler.compile(spec, target, raw));
  await fs.writeFile(join(out, "vectors.json"), JSON.stringify(vectors));
  const py = JSON.parse(
    execFileSync(
      "python3",
      ["scripts/file-intent/verify-vectors.py", join(out, "vectors.json")],
      { cwd: root, encoding: "utf8" },
    ),
  );
  equal(py.cases, vectors.length);
  const s = await host.create(join(out, "actual-files"), spec);
  const legal = await compiler.compile(spec, target, '{"value":"7000"}');
  if (!legal.response.ok || !legal.response.result.plan)
    throw Error("Real compiler refused legal plan");
  const result = await s.submit(
    s.snapshot().checkpoint,
    legal.response.result.plan,
  );
  equal(result.outcome.files[0].bytes, "id,value\nx,7000\nkeep,42\n");
  const wrong = await compiler.compile(spec, target, '{"value":"8"}');
  if (!wrong.response.ok || !wrong.response.result.plan)
    throw Error("Control refused");
  const w = await s.submit(result.checkpoint, wrong.response.result.plan);
  equal(w.outcome.files[0].bytes, "id,value\nx,8\nkeep,42\n");
  deepStrictEqual(
    (await host.resume(join(out, "actual-files"), w.checkpoint)).snapshot()
      .outcome,
    w.outcome,
  );
  equal(
    await fs.readFile(w.artifacts[0].path, "utf8"),
    "id,value\nx,8\nkeep,42\n",
  );
  const cases = JSON.parse(
    execFileSync(
      "python3",
      [
        "-c",
        "import sys,json;sys.path.insert(0,'scripts/file-intent');from study import corpus;print(json.dumps(corpus()))",
      ],
      { cwd: root, encoding: "utf8" },
    ),
  );
  let legalGoals = 0;
  for (const c of cases) {
    const candidate = await compiler.compile(
      c.spec,
      c.target,
      JSON.stringify({ value: String(c.goal.value) }),
    );
    if (!candidate.response.ok || !candidate.response.result.plan)
      throw Error("Authored goal refused");
    const session = await host.create(join(out, c.id), c.spec);
    const result = await session.submit(
      session.snapshot().checkpoint,
      candidate.response.result.plan,
    );
    equal(
      result.outcome.files[0].bytes,
      `id,value\n${c.target.rowId},${c.goal.value}\nreference,42\n`,
    );
    equal(
      await fs.readFile(result.artifacts[0].path, "utf8"),
      result.outcome.files[0].bytes,
    );
    legalGoals++;
  }
  // Mutating one source byte must invalidate the active compiler, then restore it exactly.
  const source = join(root, "formal/FileIntentMain.lean"),
    bytes = await fs.readFile(source);
  let rejected = false;
  try {
    await fs.appendFile(source, "\n-- pin negative control\n");
    try {
      await compiler.compile(spec, target, '{"value":"7"}');
    } catch {
      rejected = true;
    }
  } finally {
    await fs.writeFile(source, bytes);
  }
  equal(rejected, true);
  const resultSummary = {
    passed: true,
    realLeanCompiler: true,
    compilerDifferentialCases: vectors.length,
    independentPythonCases: py.cases,
    newTheorems: compiler.manifest().audit.length,
    totalTheorems:
      compiler.manifest().oldAudits.length + compiler.manifest().audit.length,
    actualCsvWrites: 2 + legalGoals,
    authoredGoalWitnesses: legalGoals,
    acceptedSafeWrongAnswer: true,
    sourceTamperRejected: true,
    output: out,
    newInferenceCalls: 0,
  };
  await fs.writeFile(
    join(out, "summary.json"),
    JSON.stringify(resultSummary, null, 2) + "\n",
  );
  console.log(JSON.stringify(resultSummary, null, 2));
} finally {
  await host.close();
}
