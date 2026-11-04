/** Real Lean process integration. Negative fixtures never substitute a positive verdict. */
import { deepStrictEqual, rejects, equal, ok } from "node:assert";
import { readFile, writeFile } from "node:fs/promises";
import { startLeanPlanProcess, root } from "./lean-plan-process";
import { createLeanRecoveryHost } from "./lean-recovery-session";
import { demoScenarios } from "../src/research";
import { evaluateActions } from "../src/research";
import { parsePlan } from "./safety-ablation";
const plan = (tool: string, args: unknown) =>
  JSON.stringify({ actions: [{ tool, args }] });
const process = await startLeanPlanProcess();
let comparisons = 0,
  identifierCases = 0,
  rejections = 0;
try {
  const invalid = [
    "",
    "null",
    "[]",
    '{"actions":[]} trailing',
    '{"actions":[],"actions":[]}',
    '{"actions":[],"\\u0061ctions":[]}',
    '{"actions":[],"ok":true}',
    '{"actions":[{"tool":"read_notice","args":{},"ok":true}]}',
    '{"actions":[{"tool":"read_notice","args":{"x":-0}}]}',
    '{"actions":[{"tool":"read_notice","args":{"x":1e999999}}]}',
    '{"actions":[{"tool":"read_notice","args":{"x":01}}]}',
    '{"actions":[{"tool":"read_notice","args":{"x":"\\ud800"}}]}',
    '{"actions":[{"tool":"read_notice","args":{"x":"\\udc00"}}]}',
    '{"actions":[{"tool":"read_notice","args":{"x":"a","x":"b"}}]}',
    '{"actions":[' + "[".repeat(34) + "null" + "]".repeat(34) + "]}",
  ];
  for (const text of invalid) {
    await rejects(process.authorize("delivery-sign", [text]));
    rejections++;
  }
  await rejects(
    process.authorize("delivery-sign", [
      plan("read_notice", {}),
      plan("read_notice", {}),
      plan("read_notice", {}),
      plan("read_notice", {}),
      plan("read_notice", {}),
    ]),
  );
  rejections++;
  await rejects(
    process.authorize("delivery-sign", [
      JSON.stringify({
        actions: Array.from({ length: 17 }, () => ({
          tool: "read_notice",
          args: {},
        })),
      }),
    ]),
  );
  rejections++;
  await rejects(
    process.authorize("delivery-sign", [
      plan("deliver_package", { packageId: "parcel-1", dockId: "dock-a" }),
      plan("read_notice", {}),
    ]),
  );
  rejections++;
  // Rejection is not a fabricated positive verdict, and a malformed request does not mutate a later check.
  const escaped =
    '{"actions":[{"tool":"deliver_package","args":{"packageId":"\\u0070arcel-1","dockId":"dock-a"}}]}';
  const allowed = await process.authorize("delivery-sign", [escaped]);
  equal(allowed.plans[0], escaped);
  equal(allowed.outcomes[0].completed, true);
  const unicode = plan("read_notice", { note: "🙂é\uFFFD" });
  const blocked = await process.authorize("delivery-sign", [unicode]);
  deepStrictEqual(blocked.outcomes[0].invalid, [true]);
  const ids = [
    "parcel-1",
    "reactor-1",
    "dock-a",
    "gate-a",
    "foreign",
    "",
    "a".repeat(80),
    "a".repeat(81),
    "é",
    "🙂",
  ];
  for (const s of (await demoScenarios()).filter((s) => s.variation === 0)) {
    const candidates = ids.flatMap((packageId) =>
      ids.map((dockId) => plan("deliver_package", { packageId, dockId })),
    );
    for (const id of ids) {
      candidates.push(
        plan("open_gate", { gateId: id }),
        plan("inspect_equipment", { equipmentId: id }),
        plan("repair_equipment", { equipmentId: id }),
      );
    }
    for (const tool of [
      "get_delivery_order",
      "read_notice",
      "__proto__",
      "constructor",
    ])
      candidates.push(
        plan(tool, {}),
        plan(tool, { extra: "no" }),
        plan(tool, null),
      );
    for (const text of candidates) {
      const decoded = parsePlan(text)!;
      const actual = evaluateActions(s, decoded, "attack");
      const l = (await process.authorize(s.family, [text])).outcomes[0];
      deepStrictEqual(l.state, actual.finalState);
      deepStrictEqual(
        l.accepted,
        actual.trace.map((t) => t.executed),
      );
      deepStrictEqual(
        l.invalid,
        actual.trace.map((t) => t.invalid),
      );
      equal(l.completed, actual.legitimate_task_completed);
      identifierCases++;
    }
  }
  equal(identifierCases, 426);
  for (const mode of ["state-only", "history"]) {
    const path = `${root}/evidence/model-recovery-v1/${mode}`;
    const p = JSON.parse(
      await readFile(`${path}/protocol.json`, "utf8"),
    ).protocol;
    const r = JSON.parse(await readFile(`${path}/report.json`, "utf8")).report;
    for (const [i, ep] of r.episodes.entries()) {
      const s = p.seedProtocol.protocol.cases.find(
        (c: { id: string }) => c.id === ep.caseId,
      ).scenario;
      const seed = p.seedReport.report.results[i];
      const texts = [seed.response.choices[0].message.content];
      const snapshots = [ep.initial];
      for (const t of ep.turns)
        if (t.snapshot) {
          texts.push(r.calls[t.call].response.choices[0].message.content);
          snapshots.push(t.snapshot);
        }
      const result = await process.authorize(s.family, texts);
      equal(result.outcomes.length, snapshots.length);
      for (const [j, state] of snapshots.entries()) {
        deepStrictEqual(result.outcomes[j].state, state.result.state);
        deepStrictEqual(
          result.outcomes[j].accepted,
          state.result.trace.map((t: { executed: boolean }) => t.executed),
        );
        deepStrictEqual(
          result.outcomes[j].invalid,
          state.result.trace.map((t: { invalid: boolean }) => t.invalid),
        );
        equal(result.outcomes[j].completed, state.result.completed);
        comparisons++;
      }
    }
  }
  // Detect changed source/artifacts using the real process, never an affirmative mock.
  const file = Object.keys(process.manifest().pins).find((p) =>
    p.endsWith("GuardedJson.olean"),
  )!;
  const bytes = await readFile(file);
  await writeFile(file, Buffer.concat([bytes, Buffer.from("tamper")]));
  try {
    await rejects(process.authorize("delivery-sign", [escaped]), /changed/);
    rejections++;
  } finally {
    await writeFile(file, bytes);
  }
} finally {
  await process.close();
}
const host = await createLeanRecoveryHost();
let commits = 0;
try {
  const s = (await demoScenarios()).find((s) => s.family === "delivery-sign")!;
  const session = await host.createSession(s),
    first = session.snapshot();
  await rejects(session.submit(first.head, '{"actions":[],"actions":[]}'));
  deepStrictEqual(session.snapshot(), first);
  rejections++;
  const bad = await session.submit(
    first.head,
    plan("deliver_package", { packageId: "parcel-1", dockId: "dock-b" }),
  );
  equal(bad.result.blocked, 1);
  equal(bad.result.state.deliveredDock, null);
  commits++;
  const attempts = await Promise.allSettled([
    session.submit(bad.head, '{"actions":[]}'),
    session.submit(
      bad.head,
      plan("deliver_package", { packageId: "parcel-1", dockId: "dock-a" }),
    ),
  ]);
  equal(attempts.filter((a) => a.status === "fulfilled").length, 1);
  commits++;
  const now = session.snapshot();
  equal(now.generation, 2);
  const done = await session.submit(
    now.head,
    plan("deliver_package", { packageId: "parcel-1", dockId: "dock-a" }),
  );
  commits++;
  equal(done.result.completed, true);
  await rejects(session.submit(done.head, plan("read_notice", {})));
  rejections++;
  ok(host.records().some((r) => r.response.ok));
  await host.close();
  await rejects(session.submit(done.head, '{"actions":[]}'), /closed/);
  rejections++;
} finally {
  await host.close();
}
console.log(
  JSON.stringify(
    {
      passed: true,
      actualLeanProcess: true,
      modelCalls: 0,
      archivedSnapshotComparisons: comparisons,
      identifierCases,
      negativeRejections: rejections,
      sessionCommits: commits,
      scope:
        "Real source-built Lean raw-plan decisions, archived trajectories, process/artifact failure and session publication. No inference rerun or immutable-host claim.",
    },
    null,
    2,
  ),
);
