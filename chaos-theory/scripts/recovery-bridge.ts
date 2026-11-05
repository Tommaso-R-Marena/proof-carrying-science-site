/** Private JSON-lines research process. It cannot select a replacement guard. */
import { createInterface } from "node:readline";
import { verifyScenario, type Scenario } from "../src/research";
import {
  createRecoverySession,
  makeRepairRequest,
  verifyRepairRequest,
  verifyRecoverySnapshot,
} from "./recovery-session";
let session: Awaited<ReturnType<typeof createRecoverySession>> | null = null;
let scenario: Scenario | null = null;
for await (const line of createInterface({ input: process.stdin })) {
  try {
    if (line.length > 100_000) throw Error("Input too large");
    const p = JSON.parse(line);
    if (p.command === "init") {
      scenario = await verifyScenario(p.scenario);
      session = await createRecoverySession(scenario);
      console.log(JSON.stringify({ ok: true, snapshot: session.snapshot() }));
    } else {
      if (!session || !scenario) throw Error("No active research session");
      if (p.command === "submit") {
        console.log(
          JSON.stringify({
            ok: true,
            snapshot: await session.submit(p.expectedHead, p.content),
          }),
        );
      } else if (p.command === "obligation") {
        const snapshot = session.snapshot();
        const request = await makeRepairRequest(scenario, snapshot);
        await verifyRepairRequest(scenario, snapshot, request);
        console.log(JSON.stringify({ ok: true, request }));
      } else if (p.command === "replay") {
        console.log(
          JSON.stringify({
            ok: true,
            snapshot: await verifyRecoverySnapshot(scenario, p.snapshot),
          }),
        );
      } else throw Error("Unknown command");
    }
  } catch {
    console.log(JSON.stringify({ ok: false }));
  }
}
