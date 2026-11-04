/** Actual archived repair proposals and receipt chains, rechecked without new inference. */
import { readFile } from "node:fs/promises";
import { deepStrictEqual, rejects } from "node:assert";
import {
  createRecoverySession,
  verifyRepairRequest,
  verifyRecoverySnapshot,
} from "./recovery-session";
let submissions = 0,
  obligations = 0;
for (const mode of ["state-only", "history"]) {
  const dir = `evidence/model-recovery-v1/${mode}`;
  const p = JSON.parse(await readFile(`${dir}/protocol.json`, "utf8")).protocol;
  const r = JSON.parse(await readFile(`${dir}/report.json`, "utf8")).report;
  for (const [i, e] of r.episodes.entries()) {
    const original = p.seedReport.report.results[i];
    const s = p.seedProtocol.protocol.cases.find(
      (c: { id: string }) => c.id === e.caseId,
    ).scenario;
    const session = await createRecoverySession(s);
    const initial = await session.submit(
      session.snapshot().head,
      original.response.choices[0].message.content,
    );
    deepStrictEqual(initial, e.initial);
    submissions++;
    for (const t of e.turns) {
      const request = await verifyRepairRequest(
        s,
        session.snapshot(),
        t.obligation,
      );
      obligations++;
      const call = r.calls[t.call];
      if (call.actions === null) break;
      const content = call.response.choices[0].message.content;
      if (t.submissionRejected) {
        await rejects(session.submit(request.expectedHead, content));
        break;
      }
      deepStrictEqual(
        await session.submit(request.expectedHead, content),
        t.snapshot,
      );
      submissions++;
    }
    deepStrictEqual(session.snapshot(), e.final);
    deepStrictEqual(await verifyRecoverySnapshot(s, e.final), e.final);
  }
}
console.log(
  JSON.stringify({
    passed: true,
    realModelCalls: 0,
    submissions,
    obligations,
    scope:
      "Offline current-controller replay of authentic archived model-response records; no inference rerun or origin authentication.",
  }),
);
