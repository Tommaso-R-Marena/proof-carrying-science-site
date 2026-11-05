/** Executes the actual Lean intent compiler; the existing file authority separately authorizes its exact plan. */
import fs from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { deepStrictEqual, equal } from "node:assert";
import { z } from "../../src/schema";
import { hashArtifact } from "../../src/research";
import { root } from "../lean-plan-process";
import { startFileAuthority, fileHash } from "../file-gate/native";
import { validateSpec } from "../file-gate/model";
import { expectedCompilation, targetFor } from "./model";
export const theoremNames = [
  "compile_exact",
  "eligible_exact",
  "compiled_length",
  "compiled_authorized",
  "compiled_exact_value",
  "compiled_protected",
  "compiled_bounded",
  "compiled_consumes_inspection",
  "compiled_append",
];
export async function buildIntentCompiler() {
  const base = await startFileAuthority(),
    m = base.manifest();
  await base.close();
  const env = { ...process.env, LEAN_PATH: m.directory };
  const files = [
    "formal/FileIntent.lean",
    "formal/FileIntentMain.lean",
    "scripts/file-intent/model.ts",
    "scripts/file-intent/native.ts",
  ];
  const pins = {
    ...m.pins,
    ...Object.fromEntries(
      await Promise.all(
        files.map(async (p) => [join(root, p), await fileHash(join(root, p))]),
      ),
    ),
  };
  const before = structuredClone(pins);
  const src = await fs.readFile(join(root, "formal/FileIntent.lean"), "utf8");
  if (
    /\b(sorry|admit|axiom|unsafe|native_decide)\b/.test(
      src.replace(/--[^\n]*/g, ""),
    )
  )
    throw Error("Unapproved proof escape");
  const audit = execFileSync(
    m.executable,
    ["-o", join(m.directory, "FileIntent.olean"), "formal/FileIntent.lean"],
    { cwd: root, env, encoding: "utf8", timeout: 60000 },
  )
    .trim()
    .split("\n");
  deepStrictEqual(
    audit.map((line) => {
      const match = line.match(
        /^'FileIntent\.([^']+)' (?:does not depend on any axioms|depends on axioms: \[([^\]]+)\])$/,
      );
      if (
        !match ||
        (match[2]?.split(", ") ?? []).some(
          (a) => !["propext", "Quot.sound"].includes(a),
        )
      )
        throw Error("Unexpected intent axiom audit");
      return match[1];
    }),
    theoremNames,
  );
  execFileSync(m.executable, ["formal/FileIntentMain.lean"], {
    cwd: root,
    env,
    timeout: 60000,
  });
  for (const [p, h] of Object.entries(before))
    equal(await fileHash(p), h, "Compiler input changed during build");
  pins[join(m.directory, "FileIntent.olean")] = await fileHash(
    join(m.directory, "FileIntent.olean"),
  );
  const manifest = {
    kind: "file-intent-build-v1",
    compiler: m.pins[m.executable],
    version: m.versionString,
    audit,
    oldAudits: [...m.modelAudit, ...m.decoderAudit, ...m.filePolicyAudit],
    sources: Object.fromEntries(
      await Promise.all(
        files.map(async (p) => [p, await fileHash(join(root, p))]),
      ),
    ),
  };
  async function checkPins() {
    for (const [p, h] of Object.entries(pins))
      equal(await fileHash(p), h, "Intent compiler source/object changed");
  }
  return {
    manifest: () => structuredClone(manifest),
    async compile(value: unknown, target: unknown, raw: string) {
      const spec = validateSpec(value),
        t = targetFor(spec, target);
      // Always ask real Lean, including malformed model text; no synthetic positive verdicts.
      if (typeof raw !== "string" || raw.length > 16384)
        throw Error("Transport bounds");
      const request = {
        kind: "file-intent-request-v1",
        policy: spec.policy,
        target: t,
        raw,
      };
      await checkPins();
      const line = execFileSync(
        m.executable,
        ["--run", "formal/FileIntentMain.lean"],
        {
          cwd: root,
          env,
          input: JSON.stringify(request) + "\n",
          encoding: "utf8",
          timeout: 20000,
          maxBuffer: 100000,
        },
      );
      await checkPins();
      const response = z
        .union([
          z.object({ ok: z.literal(false) }).strict(),
          z
            .object({
              ok: z.literal(true),
              result: z
                .object({
                  request: z.unknown(),
                  value: z.string(),
                  eligible: z.boolean(),
                  plan: z.string().nullable(),
                })
                .strict(),
            })
            .strict(),
        ])
        .parse(JSON.parse(line));
      let expected: ReturnType<typeof expectedCompilation> | null = null;
      try {
        expected = expectedCompilation(spec, t, raw);
      } catch {
        /* Independent parser rejection is compared, not treated as authorization. */
      }
      equal(response.ok, expected !== null, "Intent parser disagreement");
      if (response.ok) {
        deepStrictEqual(response.result.request, request);
        deepStrictEqual(
          {
            value: response.result.value,
            eligible: response.result.eligible,
            plan:
              response.result.plan === null
                ? null
                : JSON.parse(response.result.plan),
          },
          expected,
        );
      }
      return {
        request,
        response,
        compilerHash: await hashArtifact(manifest),
        rawHash: await hashArtifact(raw),
      };
    },
  };
}
