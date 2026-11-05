/** Recompute each recorded raw-text Lean verdict, never trust a serialized affirmative response. */
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { deepStrictEqual, equal, ok } from "node:assert";
import { startLeanPlanProcess, root } from "./lean-plan-process";
import { createHash } from "node:crypto";
const dir = `${root}/evidence/lean-plan-replay-v1/live`;
const p = JSON.parse(await readFile(`${dir}/protocol.json`, "utf8")).protocol;
const r = JSON.parse(await readFile(`${dir}/report.json`, "utf8")).report;
const a = JSON.parse(await readFile(`${dir}/lean-authority.json`, "utf8"));
deepStrictEqual(a.manifest, p.leanAuthority);
const lean = await startLeanPlanProcess();
let count = 0;
try {
  equal(a.manifest.versionString, lean.manifest().versionString);
  deepStrictEqual(a.manifest.modelAudit, lean.manifest().modelAudit);
  deepStrictEqual(a.manifest.decoderAudit, lean.manifest().decoderAudit);
  const expectedSources = [
    "GuardedTools.lean",
    "GuardedToolsTable.lean",
    "GuardedJson.lean",
    "GuardedJsonMain.lean",
  ].sort();
  deepStrictEqual(
    Object.keys(a.manifest.pins)
      .filter((path) => path.endsWith(".lean"))
      .map((path) => basename(path))
      .sort(),
    expectedSources,
  );
  equal(
    a.manifest.pins[a.manifest.executable],
    lean.manifest().pins[lean.manifest().executable],
  );
  for (const [path, expected] of Object.entries(a.manifest.pins)) {
    if (!path.endsWith(".lean")) continue;
    const name = basename(path);
    ok(
      [
        "GuardedTools.lean",
        "GuardedToolsTable.lean",
        "GuardedJson.lean",
        "GuardedJsonMain.lean",
      ].includes(name),
    );
    equal(
      createHash("sha256")
        .update(await readFile(`${root}/formal/${name}`))
        .digest("hex"),
      expected,
    );
  }
  for (const [i, e] of r.episodes.entries()) {
    const s = p.seedProtocol.protocol.cases.find(
      (c: { id: string }) => c.id === e.caseId,
    ).scenario;
    const original = p.seedReport.report.results[i];
    const texts = [original.response.choices[0].message.content];
    const snapshots = [e.initial];
    for (const t of e.turns) {
      if (t.snapshot) {
        texts.push(r.calls[t.call].response.choices[0].message.content);
        snapshots.push(t.snapshot);
      }
    }
    for (let j = 0; j < texts.length; j++) {
      const record = a.records[count];
      deepStrictEqual(record.request, {
        kind: "lean-plan-request-v1",
        family: s.family,
        plans: texts.slice(0, j + 1),
      });
      const actual = await lean.authorize(s.family, record.request.plans);
      deepStrictEqual(record.response, { ok: true, result: actual });
      const last = actual.outcomes.at(-1)!,
        snapshot = snapshots[j];
      deepStrictEqual(last.state, snapshot.result.state);
      deepStrictEqual(
        last.accepted,
        snapshot.result.trace.map((t: { executed: boolean }) => t.executed),
      );
      deepStrictEqual(
        last.invalid,
        snapshot.result.trace.map((t: { invalid: boolean }) => t.invalid),
      );
      equal(last.completed, snapshot.result.completed);
      equal(last.violated, snapshot.result.unsafe);
      count++;
    }
  }
  equal(count, a.records.length);
} finally {
  await lean.close();
}
console.log(
  JSON.stringify(
    {
      passed: true,
      actualLeanProcess: true,
      newInferenceCalls: 0,
      recordedRawTextAuthorizations: count,
      scope:
        "Fresh Lean computation of every recorded pre-publication verdict and comparison to exact raw model strings and guarded states; not an independent rerun of inference or origin authentication.",
    },
    null,
    2,
  ),
);
