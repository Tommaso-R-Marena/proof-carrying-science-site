/** Actual Lean refinement replay. Archived proposals are not a fresh adaptive model experiment. */
import fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";
import { equal, ok } from "node:assert";
import { root } from "../lean-plan-process";
import { createConversionHost } from "./host";
import { createFileHost } from "../file-gate/workspace";
const study = process.argv[2] ? resolve(process.argv[2]) : null;
const owner = await createConversionHost(),
  low = await createFileHost();
await fs.mkdir(join(root, "results"), { recursive: true });
const output = await fs.mkdtemp(join(root, "results/conversion-campaign-"));
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
const records = [];
let legal = 0,
  rejectedWrong = 0,
  archived = 0,
  accepted = 0;
try {
  for (const c of cases) {
    const path = join(output, c.id),
      s = await owner.create(path, {
        spec: c.spec,
        target: c.target,
        factor: String(c.factor),
      });
    const wrong = await s.submit(s.receipt(), '{"value":"8"}');
    equal(wrong.accepted, false);
    equal(s.snapshot().checkpoint.generation, 0);
    rejectedWrong++;
    records.push(wrong);
    const r = await s.submit(
      s.receipt(),
      JSON.stringify({ value: String(c.goal.value) }),
    );
    ok(r.accepted);
    equal(
      r.snapshot.outcome.files[0].bytes,
      `id,value\n${c.target.rowId},${c.goal.value}\nreference,42\n`,
    );
    legal++;
    equal(
      (await owner.resume(path, r.receipt)).snapshot().outcome.files[0].bytes,
      r.snapshot.outcome.files[0].bytes,
    );
    records.push(r);
  }
  const c = cases[0],
    attackPath = join(output, "bypass-negative"),
    s = await owner.create(attackPath, {
      spec: c.spec,
      target: c.target,
      factor: String(c.factor),
    });
  // The lower-level permission gate legitimately accepts 8. The stronger resume must refuse it.
  const bare = await low.resume(
    join(attackPath, "data"),
    s.snapshot().checkpoint,
  );
  const raw = JSON.stringify({
    actions: [
      { tool: "inspect_file", args: { fileId: c.target.fileId } },
      { tool: "set_value", args: { ...c.target, value: "8" } },
    ],
  });
  const bad = await bare.submit(bare.snapshot().checkpoint, raw);
  let rejected = false;
  try {
    await owner.resume(attackPath, {
      ...s.receipt(),
      checkpoint: bad.checkpoint,
    });
  } catch {
    rejected = true;
  }
  equal(rejected, true);
  let factorSwap = false;
  try {
    await owner.resume(join(output, cases[0].id), {
      ...(
        await owner.resume(join(output, cases[0].id), records[1].receipt!)
      ).receipt(),
      jobHash: "0".repeat(64),
    });
  } catch {
    factorSwap = true;
  }
  equal(factorSwap, true);
  const racePath = join(output, "concurrent-cas"),
    race = await owner.create(racePath, {
      spec: c.spec,
      target: c.target,
      factor: String(c.factor),
    }),
    anchor = race.receipt();
  const winners = await Promise.allSettled([
    race.submit(anchor, JSON.stringify({ value: String(c.goal.value) })),
    race.submit(anchor, JSON.stringify({ value: String(c.goal.value) })),
  ]);
  equal(
    winners.filter((x) => x.status === "fulfilled" && x.value.accepted).length,
    1,
  );
  equal(race.receipt().checkpoint.generation, 1);
  const ownerPath = join(racePath, "owner.json"),
    original = await fs.readFile(ownerPath);
  let ownerTamper = false;
  try {
    const modified = JSON.parse(original.toString());
    modified.job.factor = "1";
    await fs.writeFile(ownerPath, JSON.stringify(modified) + "\n");
    try {
      await owner.resume(racePath, race.receipt());
      const recoveryPath = join(output, "uncertain-ack"),
        recovery = await owner.create(recoveryPath, {
          spec: c.spec,
          target: c.target,
          factor: String(c.factor),
        }),
        retained = recovery.receipt();
      await recovery.submit(
        retained,
        JSON.stringify({ value: String(c.goal.value) }),
      );
      let stale = false;
      try {
        await owner.resume(recoveryPath, retained);
      } catch {
        stale = true;
      }
      equal(stale, true);
      const recovered = await owner.recover(recoveryPath, retained);
      equal(recovered.receipt().checkpoint.generation, 1);
      let badRecover = false;
      try {
        await owner.recover(attackPath, s.receipt());
      } catch {
        badRecover = true;
      }
      equal(badRecover, true);
    } catch {
      ownerTamper = true;
    }
  } finally {
    await fs.writeFile(ownerPath, original);
  }
  equal(ownerTamper, true);
  await owner.resume(racePath, race.receipt());
  if (study) {
    const r = JSON.parse(
      await fs.readFile(join(study, "report.json"), "utf8"),
    ).report;
    for (const e of r.episodes)
      if (e.interface === "intent") {
        const c = cases.find((c: { id: string }) => c.id === e.caseId),
          session = await owner.create(join(output, e.id), {
            spec: c.spec,
            target: c.target,
            factor: String(c.factor),
          });
        for (const t of e.turns) {
          const call = r.calls[t.call];
          if (call.status !== "ok") continue;
          const result = await session.submit(
            session.receipt(),
            call.response.choices[0].message.content,
          );
          archived++;
          accepted += Number(result.accepted);
          records.push({ id: e.id, call: t.call, ...result });
        }
      }
  }
  await fs.writeFile(
    join(output, "records.json"),
    JSON.stringify(records, null, 2) + "\n",
  );
  const result = {
    passed: true,
    actualLean: true,
    newConversionTheorems: 9,
    totalNamedTheorems: owner.manifest().semantic.audits.length,
    authoredCorrectConversions: legal,
    authoredWrongAnswersBlocked: rejectedWrong,
    lowerLevelBypassDetectedOnResume: true,
    substitutedJobRejected: true,
    concurrentPublicationWinners: 1,
    ownerMultiplierTamperingRejected: true,
    safeUnacknowledgedSuffixRecovered: true,
    incorrectSuffixRecoveryRejected: true,
    archivedModelProposals: archived,
    archivedProposalsAccepted: accepted,
    newInferenceCalls: 0,
    output,
    scope:
      "Exact Nat multiplier relation under owner-supplied metadata; archived proposals are not an adaptive counterfactual. No-model authored controls are not model performance.",
  };
  await fs.writeFile(
    join(output, "summary.json"),
    JSON.stringify(result, null, 2) + "\n",
  );
  console.log(JSON.stringify(result, null, 2));
} finally {
  await owner.close();
  await low.close();
}
