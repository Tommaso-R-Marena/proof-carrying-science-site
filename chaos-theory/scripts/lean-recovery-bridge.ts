/** Fixed Lean research interface; model output has no command/verifier-selection capability. */
import { createInterface } from "node:readline";
import { verifyScenario, type Scenario } from "../src/research";
import { makeRepairRequest, verifyRecoverySnapshot } from "./recovery-session";
import { createLeanRecoveryHost } from "./lean-recovery-session";
const host = await createLeanRecoveryHost();
let session: Awaited<ReturnType<typeof host.createSession>> | null = null;
let scenario: Scenario | null = null;
try {
  for await (const line of createInterface({ input: process.stdin })) {
    try {
      if (line.length > 100000) throw Error("Input size");
      const p = JSON.parse(line);
      if (p.command === "info")
        console.log(JSON.stringify({ ok: true, manifest: host.manifest() }));
      else if (p.command === "records")
        console.log(JSON.stringify({ ok: true, records: host.records() }));
      else if (p.command === "init") {
        scenario = await verifyScenario(p.scenario);
        session = await host.createSession(scenario);
        console.log(JSON.stringify({ ok: true, snapshot: session.snapshot() }));
      } else {
        if (!session || !scenario) throw Error("No active session");
        if (p.command === "submit")
          console.log(
            JSON.stringify({
              ok: true,
              snapshot: await session.submit(p.expectedHead, p.content),
            }),
          );
        else if (p.command === "obligation")
          console.log(
            JSON.stringify({
              ok: true,
              request: await makeRepairRequest(scenario, session.snapshot()),
            }),
          );
        else if (p.command === "replay")
          console.log(
            JSON.stringify({
              ok: true,
              snapshot: await verifyRecoverySnapshot(scenario, p.snapshot),
            }),
          );
        else throw Error("Unknown command");
      }
    } catch {
      console.log(JSON.stringify({ ok: false }));
    }
  }
} finally {
  await host.close();
}
