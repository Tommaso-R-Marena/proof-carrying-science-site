/** Authored positive controls for all task goals, not model inference or selected successful model transitions. */
import fs from "node:fs/promises";
import { join } from "node:path";
import { equal, deepStrictEqual } from "node:assert";
import { createFileHost } from "./workspace";
import { csv } from "./model";
import { root } from "../lean-plan-process";
const frozen = JSON.parse(
  await fs.readFile(
    join(root, "evidence/general-file-gate-v1/pre-inference-plan.json"),
    "utf8",
  ),
).plan;
await fs.mkdir(join(root, "results"), { recursive: true });
const output = await fs.mkdtemp(join(root, "results/file-gate-reachability-"));
const host = await createFileHost();
let completed = 0;
try {
  for (const c of frozen.cases) {
    const g = c.goal,
      session = await host.create(join(output, c.id), c.spec);
    const actual = await session.submit(
      session.snapshot().checkpoint,
      JSON.stringify({
        actions: [
          { tool: "inspect_file", args: { fileId: g.fileId } },
          {
            tool: "set_value",
            args: { fileId: g.fileId, rowId: g.rowId, value: String(g.value) },
          },
        ],
      }),
    );
    deepStrictEqual(actual.outcome.executed, [true, true]);
    for (const [i, f] of actual.outcome.files.entries()) {
      equal(await fs.readFile(actual.artifacts[i].path, "utf8"), f.bytes);
      const old = csv(c.spec.files[i].bytes),
        next = csv(f.bytes);
      for (const [j, r] of next.entries())
        equal(
          r.value,
          f.id === g.fileId && r.id === g.rowId ? g.value : old[j].value,
        );
    }
    completed++;
  }
  const report = {
    passed: true,
    authoredPositiveControls: completed,
    actualModelCalls: 0,
    actualLeanProcess: true,
    scope:
      "All frozen goals can be published by a legal authored witness. This does not count as model task success or show that a model finds that witness.",
    output,
  };
  await fs.writeFile(
    join(output, "report.json"),
    JSON.stringify(report, null, 2) + "\n",
  );
  console.log(JSON.stringify(report, null, 2));
} finally {
  await host.close();
}
