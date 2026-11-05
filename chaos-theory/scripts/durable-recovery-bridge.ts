/** Fixed research bridge. Filesystem location is controlled by the host, never by a model plan. */
import fs from "node:fs/promises";
import { join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { verifyScenario, type Scenario } from "../src/research";
import { makeRepairRequest, verifyRecoverySnapshot } from "./recovery-session";
import { createDurableRecoveryHost, encodeJournal } from "./durable-recovery";
const output = process.env.PCS_JOURNAL_OUTPUT;
if (!output) throw Error("Host-owned journal output directory required");
const journals = join(resolve(output), "journals"),
  checkpoints = join(resolve(output), "checkpoints");
await fs.mkdir(journals);
await fs.mkdir(checkpoints);
const host = await createDurableRecoveryHost();
let session: Awaited<ReturnType<typeof host.create>> | null = null;
let scenario: Scenario | null = null,
  index = -1;
async function retain() {
  const cp = session!.checkpoint();
  const handle = await fs.open(
    join(checkpoints, `journal-${index}-${cp.generation}.json`),
    "wx",
    0o600,
  );
  try {
    await handle.writeFile(encodeJournal(cp));
    await handle.sync();
  } finally {
    await handle.close();
  }
  const directory = await fs.open(checkpoints, "r");
  try {
    await directory.sync();
  } finally {
    await directory.close();
  }
}
try {
  for await (const line of createInterface({ input: process.stdin })) {
    try {
      if (line.length > 100000) throw Error("Input size");
      const p = JSON.parse(line);
      if (p.command === "info")
        console.log(
          JSON.stringify({
            ok: true,
            manifest: host.manifest(),
            journalAuthority: host.authority(),
          }),
        );
      else if (p.command === "records")
        console.log(JSON.stringify({ ok: true, records: host.records() }));
      else if (p.command === "init") {
        scenario = await verifyScenario(p.scenario);
        session = await host.create(
          join(journals, `journal-${++index}`),
          scenario,
        );
        await retain();
        console.log(
          JSON.stringify({
            ok: true,
            snapshot: session.snapshot(),
            checkpoint: session.checkpoint(),
          }),
        );
      } else {
        if (!session || !scenario) throw Error("No active session");
        if (p.command === "submit") {
          if (p.expectedHead !== session.snapshot().head)
            throw Error("Stale head");
          const value = await session.submit(session.checkpoint(), p.content);
          await retain();
          console.log(JSON.stringify({ ok: true, ...value }));
        } else if (p.command === "obligation")
          console.log(
            JSON.stringify({
              ok: true,
              request: await makeRepairRequest(scenario, session.snapshot()),
            }),
          );
        else if (p.command === "replay") {
          const replayed = await host.resume(
            join(journals, `journal-${index}`),
            session.checkpoint(),
          );
          const checked = await verifyRecoverySnapshot(scenario, p.snapshot);
          if (encodeJournal(checked) !== encodeJournal(replayed.snapshot()))
            throw Error("Journal/snapshot mismatch");
          console.log(JSON.stringify({ ok: true, snapshot: checked }));
        } else throw Error("Unknown command");
      }
    } catch {
      console.log(JSON.stringify({ ok: false }));
    }
  }
} finally {
  await host.close();
}
