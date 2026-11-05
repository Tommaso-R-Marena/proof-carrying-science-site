/** Separate qualified Lean process. No caller-supplied executable/verdict/transport callback. */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { deepStrictEqual } from "node:assert";
import { buildLeanPlan, root } from "../lean-plan-process";
import { z } from "../../src/schema";
import { fileSchema, replay, validateSpec, type Spec } from "./model";
export const names = [
  "denied_unchanged",
  "write_exact_permission",
  "inspect_exact_permission",
  "protected_cell_step",
  "protected_cell_run",
  "bounded_step",
  "bounded_run",
  "write_requires_current_inspection",
  "write_consumes_inspection",
  "second_write_requires_reinspection",
  "run_append",
  "legal_value_reachable",
];
export async function fileHash(path: string) {
  return createHash("sha256")
    .update(await fs.readFile(path))
    .digest("hex");
}
const outcome = z
  .object({
    permitted: z.array(z.boolean()).max(16),
    executed: z.array(z.boolean()).max(16),
    invalid: z.array(z.boolean()).max(16),
    files: z.array(fileSchema).max(4),
    inspected: z.array(z.string()).max(4),
  })
  .strict();
const resultSchema = z
  .object({
    kind: z.literal("file-policy-result-v1"),
    request: z.unknown(),
    initial: outcome,
    outcomes: z
      .array(z.object({ guarded: outcome, control: outcome }).strict())
      .max(4),
  })
  .strict();
export async function startFileAuthority() {
  const built = await buildLeanPlan(),
    m = built.manifest;
  const paths = ["formal/FilePolicy.lean", "formal/FilePolicyMain.lean"].map(
    (p) => join(root, p),
  );
  const before = await Promise.all(paths.map(fileHash));
  for (const p of paths)
    if (
      /\b(sorry|admit|axiom|unsafe|native_decide)\b/.test(
        (await fs.readFile(p, "utf8")).replace(/--[^\n]*/g, ""),
      )
    )
      throw Error("Unapproved proof escape");
  const log = execFileSync(
    m.executable,
    ["-o", join(m.directory, "FilePolicy.olean"), "formal/FilePolicy.lean"],
    { cwd: root, env: built.env, encoding: "utf8", timeout: 60000 },
  );
  const audits = log.trim().split("\n"),
    found: string[] = [];
  for (const line of audits) {
    const match = line.match(
      /^'FilePolicy\.([^']+)' (?:does not depend on any axioms|depends on axioms: \[([^\]]+)\])$/,
    );
    if (
      !match ||
      !names.includes(match[1]) ||
      found.includes(match[1]) ||
      (match[2]?.split(", ") ?? []).some(
        (a) => !["propext", "Quot.sound"].includes(a),
      )
    )
      throw Error("Unexpected generalized theorem audit");
    found.push(match[1]);
  }
  deepStrictEqual(found, names);
  execFileSync(m.executable, ["formal/FilePolicyMain.lean"], {
    cwd: root,
    env: built.env,
    timeout: 60000,
  });
  deepStrictEqual(
    await Promise.all(paths.map(fileHash)),
    before,
    "Formal source changed during build",
  );
  const pinned = {
    ...m.pins,
    ...Object.fromEntries(
      await Promise.all(
        [...paths, join(m.directory, "FilePolicy.olean")].map(async (p) => [
          p,
          await fileHash(p),
        ]),
      ),
    ),
  } as { [p: string]: string };
  const manifest = {
    ...m,
    kind: "general-file-policy-build-v1",
    pins: pinned,
    filePolicyAudit: audits,
  };
  const child = spawn(m.executable, ["--run", "formal/FilePolicyMain.lean"], {
    cwd: root,
    env: built.env,
    stdio: ["pipe", "pipe", "pipe"],
  });
  let failure: Error | null = null,
    queue = Promise.resolve();
  let pending: {
    resolve: (s: string) => void;
    reject: (e: Error) => void;
  } | null = null;
  const ended = new Promise<void>((r) => child.once("close", () => r()));
  const records: unknown[] = [];
  function fail(e: Error) {
    failure ??= e;
    pending?.reject(e);
    pending = null;
    child.kill();
  }
  child.on("error", fail);
  child.on("close", () => fail(Error("File authority exited")));
  child.stderr.on("data", () => fail(Error("File authority diagnostic")));
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!pending || Buffer.byteLength(line) > 500000) {
      fail(Error("Unexpected file authority output"));
      return;
    }
    const p = pending;
    pending = null;
    p.resolve(line);
  });
  async function pins() {
    if (failure) throw failure;
    for (const [path, expected] of Object.entries(pinned))
      if ((await fileHash(path)) !== expected) {
        const e = Error("File authority source/object changed");
        fail(e);
        throw e;
      }
  }
  return {
    manifest: () => structuredClone(manifest),
    records: () => structuredClone(records),
    async authorize(value: unknown, texts: string[]) {
      const spec: Spec = validateSpec(value),
        plans = [...texts];
      const request = { kind: "file-policy-request-v1", ...spec, plans };
      const task = queue.then(async () => {
        if (
          plans.length > 4 ||
          plans.some(
            (s) =>
              typeof s !== "string" ||
              s.length > 16384 ||
              new TextDecoder().decode(new TextEncoder().encode(s)) !== s,
          )
        )
          throw Error("Plan bounds or Unicode");
        const wire = JSON.stringify(request);
        if (Buffer.byteLength(wire) > 250000) throw Error("Envelope bounds");
        await pins();
        const line = await new Promise<string>((resolve, reject) => {
          const timer = setTimeout(
            () => fail(Error("File authority timeout")),
            20000,
          );
          pending = {
            resolve: (s) => {
              clearTimeout(timer);
              resolve(s);
            },
            reject: (e) => {
              clearTimeout(timer);
              reject(e);
            },
          };
          child.stdin.write(wire + "\n", (e) => {
            if (e) fail(e);
          });
        });
        await pins();
        const response = z
          .union([
            z.object({ ok: z.literal(false) }).strict(),
            z.object({ ok: z.literal(true), result: resultSchema }).strict(),
          ])
          .parse(JSON.parse(line));
        records.push({ request, response });
        if (!response.ok) throw Error("Lean rejected file plan/profile");
        const r = response.result;
        deepStrictEqual(r.request, request);
        deepStrictEqual(r.initial, replay(spec, [], true));
        deepStrictEqual(
          r.outcomes,
          plans.map((_, i) => ({
            guarded: replay(spec, plans.slice(0, i + 1), true),
            control: replay(spec, plans.slice(0, i + 1), false),
          })),
        );
        return r;
      });
      queue = task.then(
        () => {},
        () => {},
      );
      return task;
    },
    async close() {
      fail(Error("File authority closed"));
      await queue;
      const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
      await ended;
      clearTimeout(timer);
    },
  };
}
