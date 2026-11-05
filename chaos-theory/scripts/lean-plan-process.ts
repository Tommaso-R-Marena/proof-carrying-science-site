/** Research-only source-built Lean process. No caller-supplied verdict or transport callback. */
import { execFileSync, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline";
import { z } from "../src/schema";
import type { Family } from "../src/research";
export const root = fileURLToPath(new URL("../", import.meta.url));
// Qualified Linux x86-64 Lean 4.28.0 executable, confirmed in the SHA-checked CI toolchain.
export const QUALIFIED_LEAN_SHA256 =
  "3e0d0d3d801675359f2d4cf9815bfdb417b20b92fdd9d48b3b14c95bbae28bbf";
function wellFormed(s: string) {
  for (let i = 0; i < s.length; i++) {
    const n = s.charCodeAt(i);
    if (n >= 0xd800 && n <= 0xdbff) {
      const m = s.charCodeAt(++i);
      if (!(m >= 0xdc00 && m <= 0xdfff)) return false;
    } else if (n >= 0xdc00 && n <= 0xdfff) return false;
  }
  return true;
}
export const modelTheorems = [
  "denied_unchanged",
  "authorized_exact_effect",
  "step_safe",
  "arbitrary_proposals_safe",
  "run_append",
  "arbitrary_repair_safe",
  "protected_step",
  "protected_run",
  "protected_state_invariant",
  "legal_completion_exists",
  "safe_completion_exists",
  "completion_bound",
  "late_inspection_does_not_erase_violation",
];
export const decoderTheorems = [
  "delivery_exact",
  "gate_exact",
  "inspection_exact",
  "repair_exact",
  "decoded_json_protected",
  "decoded_plan_protected",
  "accepted_effects_exact",
  "accepted_effects_protected",
];
async function hash(path: string) {
  const h = createHash("sha256");
  for await (const b of createReadStream(path)) h.update(b);
  return h.digest("hex");
}
function audit(log: string, ns: string, names: string[], allow: string[]) {
  const found = new Set<string>();
  for (const line of log.trim().split("\n")) {
    const m = line.match(
      /^'([^']+)' (?:does not depend on any axioms|depends on axioms: \[([^\]]+)\])$/,
    );
    if (!m || !m[1].startsWith(ns + "."))
      throw Error("Unexpected Lean build diagnostic");
    const name = m[1].slice(ns.length + 1);
    if (
      found.has(name) ||
      !names.includes(name) ||
      (m[2]?.split(", ") ?? []).some((a) => !allow.includes(a))
    )
      throw Error("Unexpected theorem or axiom dependency");
    found.add(name);
  }
  if (found.size !== names.length) throw Error("Missing named theorem audit");
}
export async function buildLeanPlan() {
  const selected = process.env.PCS_LEAN ?? "lean";
  const executable = await realpath(
    selected.includes("/")
      ? resolve(selected)
      : execFileSync("which", [selected], { encoding: "utf8" }).trim(),
  );
  if (
    process.platform !== "linux" ||
    process.arch !== "x64" ||
    (await hash(executable)) !== QUALIFIED_LEAN_SHA256
  )
    throw Error(
      "Unapproved Lean compiler bytes; use the qualified Linux x86-64 4.28.0 release",
    );
  const version = execFileSync(executable, ["--version"], {
    encoding: "utf8",
  }).trim();
  if (!version.startsWith("Lean (version 4.28.0,"))
    throw Error("Lean 4.28.0 required");
  await mkdir(join(root, "results"), { recursive: true });
  const directory = await mkdtemp(join(root, "results/lean-plan-"));
  const env = { ...process.env, LEAN_PATH: directory };
  const files = [
    "GuardedTools.lean",
    "GuardedToolsTable.lean",
    "GuardedJson.lean",
    "GuardedJsonMain.lean",
  ].map((n) => join(root, "formal", n));
  for (const path of files)
    if (
      /\b(sorry|admit|axiom|unsafe)\b/.test(
        (await readFile(path, "utf8")).replace(/--[^\n]*/g, ""),
      )
    )
      throw Error("Proof admission/escape hatch");
  const modelAudit = execFileSync(
    executable,
    ["-o", join(directory, "GuardedTools.olean"), "formal/GuardedTools.lean"],
    { cwd: root, env, encoding: "utf8", timeout: 60_000 },
  );
  audit(modelAudit, "GuardedTools", modelTheorems, ["propext"]);
  const decoderAudit = execFileSync(
    executable,
    ["-o", join(directory, "GuardedJson.olean"), "formal/GuardedJson.lean"],
    { cwd: root, env, encoding: "utf8", timeout: 60_000 },
  );
  audit(decoderAudit, "GuardedJson", decoderTheorems, [
    "propext",
    "Classical.choice",
    "Quot.sound",
  ]);
  execFileSync(executable, ["formal/GuardedJsonMain.lean"], {
    cwd: root,
    env,
    timeout: 60_000,
  });
  const pinned = [
    executable,
    ...files,
    join(directory, "GuardedTools.olean"),
    join(directory, "GuardedJson.olean"),
  ];
  const pins = Object.fromEntries(
    await Promise.all(pinned.map(async (p) => [p, await hash(p)])),
  );
  if (pins[executable] !== QUALIFIED_LEAN_SHA256)
    throw Error("Lean compiler changed during build");
  const manifest = {
    version: 1,
    kind: "research-lean-plan-build",
    executable,
    directory,
    versionString: version,
    pins,
    modelAudit: modelAudit.trim().split("\n"),
    decoderAudit: decoderAudit.trim().split("\n"),
    limitation:
      "Unsigned build record, not an immutable root. Lean compiler/runtime, standard libraries and host remain trusted. Parser correctness and cryptography are outside the kernel proof.",
  };
  await writeFile(
    join(directory, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    { flag: "wx" },
  );
  return { manifest, env };
}
const outcomeSchema = z
  .object({
    accepted: z.array(z.boolean()).max(16),
    invalid: z.array(z.boolean()).max(16),
    state: z
      .object({
        deliveredDock: z.literal("dock-a").nullable(),
        openedGates: z.array(z.literal("gate-a")).max(16),
        inspectedEquipment: z.array(z.literal("reactor-1")).max(16),
        repairedEquipment: z.array(z.literal("reactor-1")).max(16),
      })
      .strict(),
    completed: z.boolean(),
    violated: z.literal(false),
  })
  .strict();
const responseSchema = z.union([
  z.object({ ok: z.literal(false), error: z.literal("rejected") }).strict(),
  z
    .object({
      ok: z.literal(true),
      result: z
        .object({
          kind: z.literal("lean-plan-result-v1"),
          family: z.enum([
            "delivery-sign",
            "forged-clearance",
            "maintenance-note",
          ]),
          plans: z.array(z.string()).max(4),
          outcomes: z.array(outcomeSchema).max(4),
        })
        .strict(),
    })
    .strict(),
]);
export type LeanPlanResult = Extract<
  z.infer<typeof responseSchema>,
  { ok: true }
>["result"];
export async function startLeanPlanProcess() {
  const { manifest, env } = await buildLeanPlan();
  const child = spawn(
    manifest.executable,
    ["--run", "formal/GuardedJsonMain.lean", "--serve"],
    { cwd: root, env, stdio: ["pipe", "pipe", "pipe"] },
  );
  const exited = new Promise<void>((accept) =>
    child.on("close", () => accept()),
  );
  let failure: Error | null = null;
  let pending: {
    resolve: (s: string) => void;
    reject: (e: Error) => void;
  } | null = null;
  let queue = Promise.resolve();
  const records: {
    request: { kind: string; family: Family; plans: string[] };
    response: z.infer<typeof responseSchema>;
  }[] = [];
  const fail = (e: Error) => {
    failure ??= e;
    pending?.reject(e);
    pending = null;
    child.kill();
  };
  child.on("error", fail);
  child.on("close", () => {
    if (!failure) fail(Error("Lean process exited"));
  });
  child.stderr.on("data", () => fail(Error("Lean process diagnostic")));
  createInterface({ input: child.stdout }).on("line", (line) => {
    if (!pending || Buffer.byteLength(line) > 150_000) {
      fail(Error("Unexpected Lean process output"));
      return;
    }
    const p = pending;
    pending = null;
    p.resolve(line);
  });
  const checkPins = async () => {
    for (const [path, expected] of Object.entries(manifest.pins))
      if ((await hash(path)) !== expected) {
        const e = Error("Lean source or build artifact changed");
        fail(e);
        throw e;
      }
  };
  return {
    manifest: () => structuredClone(manifest),
    records: () => structuredClone(records),
    async authorize(family: Family, plans: string[]): Promise<LeanPlanResult> {
      // Copy before the first await; strings are immutable and no caller object becomes authoritative.
      const request = {
        kind: "lean-plan-request-v1",
        family,
        plans: [...plans],
      };
      const run = queue.then(async () => {
        if (failure) throw failure;
        if (
          request.plans.length > 4 ||
          request.plans.some(
            (p) => typeof p !== "string" || p.length > 16384 || !wellFormed(p),
          )
        )
          throw Error("Strict plan size/Unicode profile");
        const text = JSON.stringify(request);
        if (Buffer.byteLength(text) > 100000) throw Error("Lean envelope size");
        await checkPins();
        if (failure) throw failure;
        let timer: ReturnType<typeof setTimeout>;
        const reply = await new Promise<string>((resolve, reject) => {
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
          timer = setTimeout(() => fail(Error("Lean process timeout")), 15_000);
          child.stdin.write(text + "\n", (e) => {
            if (e) fail(e);
          });
        });
        await checkPins();
        const response = responseSchema.parse(JSON.parse(reply));
        records.push({ request, response });
        if (!response.ok)
          throw Error("Lean rejected strict plan profile or history");
        const r = response.result;
        if (
          r.family !== family ||
          JSON.stringify(r.plans) !== JSON.stringify(request.plans) ||
          r.outcomes.length !== request.plans.length
        ) {
          const e = Error("Lean response binding mismatch");
          fail(e);
          throw e;
        }
        return r;
      });
      queue = run.then(
        () => {},
        () => {},
      );
      return run;
    },
    async close() {
      fail(Error("Lean process closed"));
      await queue;
      const timer = setTimeout(() => child.kill("SIGKILL"), 2000);
      await exited;
      clearTimeout(timer);
    },
  };
}
