/** Host-owned research bridge. Model text never selects target, policy, interface, path or verifier. */
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { createFileHost } from "../file-gate/workspace";
import { validateSpec, type Spec } from "../file-gate/model";
import { targetFor, type Target } from "./model";
import { buildIntentCompiler } from "./native";
const output = process.env.PCS_FILE_GATE_OUTPUT;
if (!output) throw Error("Host-owned output required");
await fs.mkdir(join(output, "workspaces"));
await fs.mkdir(join(output, "compilations"));
const host = await createFileHost(),
  compiler = await buildIntentCompiler();
const sessions = new Map<
  string,
  {
    session: Awaited<ReturnType<typeof host.create>>;
    spec: Spec;
    target: Target;
    interface: "tools" | "intent";
  }
>();
let compilations = 0;
async function persist(path: string, body: unknown) {
  const h = await fs.open(path, "wx", 0o600);
  try {
    await h.writeFile(JSON.stringify(body, null, 2) + "\n");
    await h.sync();
  } finally {
    await h.close();
  }
}
try {
  for await (const line of createInterface({ input: process.stdin })) {
    try {
      if (line.length > 100000) throw Error("Envelope bounds");
      const p = JSON.parse(line);
      if (p.command === "info")
        console.log(
          JSON.stringify({
            ok: true,
            authority: host.authority(),
            intentCompiler: compiler.manifest(),
          }),
        );
      else if (p.command === "records") {
        const bytes = JSON.stringify(host.records(), null, 2) + "\n";
        await persist(join(output, "native-ledger.json"), host.records());
        console.log(
          JSON.stringify({
            ok: true,
            persisted: true,
            records: host.records().length,
            compilations,
            sha256: createHash("sha256").update(bytes).digest("hex"),
          }),
        );
      } else if (p.command === "create") {
        if (
          typeof p.id !== "string" ||
          !/^[a-z0-9-]{1,80}$/.test(p.id) ||
          sessions.has(p.id) ||
          !["tools", "intent"].includes(p.interface)
        )
          throw Error("Session shape");
        const spec = validateSpec(p.spec),
          target = targetFor(spec, p.target);
        // The complete owner binding is written before any model proposal is processed.
        await persist(join(output, "compilations", p.id + "-owner.json"), {
          spec,
          target,
          interface: p.interface,
          compiler: compiler.manifest(),
          authority: host.authority(),
        });
        const session = await host.create(
          join(output, "workspaces", p.id),
          spec,
        );
        sessions.set(p.id, { session, spec, target, interface: p.interface });
        console.log(JSON.stringify({ ok: true, snapshot: session.snapshot() }));
      } else {
        const s = sessions.get(p.id);
        if (!s) throw Error("Unknown session");
        if (p.command === "submit") {
          let content = p.content,
            compilation = null,
            compilationFile = null;
          if (s.interface === "intent") {
            compilation = await compiler.compile(s.spec, s.target, content);
            compilationFile = `compile-${String(compilations++).padStart(4, "0")}.json`;
            await persist(join(output, "compilations", compilationFile), {
              id: p.id,
              checkpoint: p.checkpoint,
              ...compilation,
            });
            if (
              !compilation.response.ok ||
              !compilation.response.result.eligible
            ) {
              console.log(
                JSON.stringify({
                  ok: true,
                  acceptedProfile: false,
                  compilation,
                  compilationFile,
                  snapshot: s.session.snapshot(),
                }),
              );
              continue;
            }
            content = compilation.response.result.plan;
          }
          // Expected profile denials are distinguished from unexpected checker/I/O failures by the evaluator's independent oracle.
          let acceptedProfile = true,
            snapshot = s.session.snapshot();
          try {
            snapshot = await s.session.submit(p.checkpoint, content);
          } catch {
            acceptedProfile = false;
          }
          console.log(
            JSON.stringify({
              ok: true,
              acceptedProfile,
              compilation,
              compilationFile,
              snapshot,
            }),
          );
        } else if (p.command === "replay") {
          const loaded = await host.resume(
            join(output, "workspaces", p.id),
            p.checkpoint,
          );
          console.log(
            JSON.stringify({ ok: true, snapshot: loaded.snapshot() }),
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
