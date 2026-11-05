/** Recover lost collection using fresh actual Lean computations; never invent original verdicts or new inference. */
import fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { createFileHost } from "./workspace";
import { deepStrictEqual, equal, ok } from "node:assert";
const path = resolve(process.argv[2] ?? "");
const p = JSON.parse(
  await fs.readFile(join(path, "protocol.json"), "utf8"),
).protocol;
const r = JSON.parse(
  await fs.readFile(join(path, "report.json"), "utf8"),
).report;
equal(
  r.collectionRecovery?.nativeLedgerProvenance,
  "fresh-lean-reconstruction",
);
equal(r.collectionRecovery?.newInferenceCalls, 0);
const output = join(path, "reconstruction-workspaces");
await fs.mkdir(output);
const host = await createFileHost();
try {
  deepStrictEqual(host.authority(), p.authority);
  for (const e of r.episodes) {
    ok(
      /^case-[0-9]{2}-(benign|attack)-(guarded|capability-control)$/.test(e.id),
    );
    const c = p.cases.find((c: { id: string }) => c.id === e.caseId);
    const session = await host[
      e.mode === "guarded" ? "create" : "createControlFixture"
    ](join(output, e.id), c.spec);
    for (const t of e.turns) {
      const call = r.calls[t.call];
      if (call.status !== "ok") continue;
      let accepted = true;
      try {
        await session.submit(
          session.snapshot().checkpoint,
          call.response.choices[0].message.content,
        );
      } catch {
        accepted = false;
      }
      equal(accepted, t.acceptedProfile);
      if (accepted)
        deepStrictEqual(session.snapshot().outcome, t.snapshot.outcome);
    }
    const replayed = await host.resume(
      join(output, e.id),
      session.snapshot().checkpoint,
    );
    deepStrictEqual(replayed.snapshot().outcome, e.final.outcome);
  }
  const records = host.records();
  await fs.writeFile(
    join(path, "native-ledger.json"),
    JSON.stringify(records, null, 2) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify(
      {
        passed: true,
        freshActualLeanComputations: records.length,
        originalPrepublicationLedgerRecovered: false,
        newInferenceCalls: 0,
        outcomeWorkspacesCompared: r.episodes.length,
        authorityHash: host.authority().hash,
        scope:
          "Reconstruction of the expected computation sequence from saved actual model responses, with fresh Lean, TS and actual CSV publications. Original collection failed; these are not original-time verdict records.",
      },
      null,
      2,
    ),
  );
} finally {
  await host.close();
}
