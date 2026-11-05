/** Fixed local host bridge. The model can supply plan text only, never paths, modes or verifier selection. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createFileHost } from "./workspace";
const output = process.env.PCS_FILE_GATE_OUTPUT;
if (!output) throw Error("Host-owned output directory required");
await fs.mkdir(join(output, "workspaces"));
const host = await createFileHost();
const sessions = new Map<string, Awaited<ReturnType<typeof host.create>>>();
try {
  for await (const line of createInterface({ input: process.stdin })) {
    try {
      if (line.length > 100000) throw Error("Envelope size");
      const p = JSON.parse(line);
      if (p.command === "info")
        console.log(
          JSON.stringify({
            ok: true,
            authority: host.authority(),
            manifest: host.manifest(),
          }),
        );
      else if (p.command === "records") {
        const records = host.records();
        const bytes = JSON.stringify(records, null, 2) + "\n";
        const file = await fs.open(
          join(output, "native-ledger.json"),
          "wx",
          0o600,
        );
        try {
          await file.writeFile(bytes);
          await file.sync();
        } finally {
          await file.close();
        }
        // Only bounded metadata crosses the JSON-lines bridge; the host owns this fixed path.
        console.log(
          JSON.stringify({
            ok: true,
            persisted: true,
            records: records.length,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          }),
        );
      } else if (p.command === "create") {
        if (
          typeof p.id !== "string" ||
          !/^[a-z0-9-]{1,80}$/.test(p.id) ||
          sessions.has(p.id)
        )
          throw Error("Workspace ID");
        if (!["guarded", "capability-control"].includes(p.mode))
          throw Error("Experiment arm");
        const s = await host[
          p.mode === "guarded" ? "create" : "createControlFixture"
        ](join(output, "workspaces", p.id), p.spec);
        sessions.set(p.id, s);
        console.log(JSON.stringify({ ok: true, snapshot: s.snapshot() }));
      } else {
        const s = sessions.get(p.id);
        if (!s) throw Error("Unknown workspace");
        if (p.command === "submit")
          console.log(
            JSON.stringify({
              ok: true,
              snapshot: await s.submit(p.checkpoint, p.content),
            }),
          );
        else if (p.command === "snapshot")
          console.log(JSON.stringify({ ok: true, snapshot: s.snapshot() }));
        else if (p.command === "replay") {
          const replayed = await host.resume(
            join(output, "workspaces", p.id),
            p.checkpoint,
          );
          console.log(
            JSON.stringify({ ok: true, snapshot: replayed.snapshot() }),
          );
        } else throw Error("Unknown command");
      }
    } catch {
      console.log(JSON.stringify({ ok: false }));
    }
  }
} finally {
  await host.close();
}
