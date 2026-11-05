/** Additional exact-answer refinement; never substitutes for the original file authority. */
import fs from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { deepStrictEqual, equal } from "node:assert";
import { z } from "../../src/schema";
import { root } from "../lean-plan-process";
import { startFileAuthority, fileHash } from "../file-gate/native";
import { csv, validateSpec } from "../file-gate/model";
import { decodeIntent, targetFor } from "../file-intent/model";
import { theoremNames as intentNames } from "../file-intent/native";
export const theoremNames = [
  "matches_exact",
  "rejects_wrong",
  "accepted_relation",
  "accepted_policy",
  "exact_output",
  "protected_output",
  "bounded_output",
  "history_exact_output",
  "safe_wrong_exists",
];
function audit(text: string, namespace: string, names: string[]) {
  const rows = text.trim().split("\n");
  deepStrictEqual(
    rows.map((line) => {
      const m = line.match(
        /^'([^']+)' (?:does not depend on any axioms|depends on axioms: \[([^\]]+)\])$/,
      );
      if (
        !m ||
        (m[2]?.split(", ") ?? []).some(
          (a) => !["propext", "Quot.sound"].includes(a),
        )
      )
        throw Error("Unexpected semantic proof dependency");
      return m[1];
    }),
    names.map((n) => namespace + "." + n),
  );
  return rows;
}
export async function buildConversionChecker() {
  const base = await startFileAuthority(),
    m = base.manifest();
  await base.close();
  const env = { ...process.env, LEAN_PATH: m.directory };
  const names = [
    "formal/FileIntent.lean",
    "formal/FileConversion.lean",
    "formal/FileConversionMain.lean",
    "scripts/conversion-gate/native.ts",
    "scripts/file-intent/model.ts",
  ];
  const pins = {
    ...m.pins,
    ...Object.fromEntries(
      await Promise.all(
        names.map(async (n) => [join(root, n), await fileHash(join(root, n))]),
      ),
    ),
  };
  for (const name of ["formal/FileIntent.lean", "formal/FileConversion.lean"]) {
    const src = (await fs.readFile(join(root, name), "utf8")).replace(
      /--[^\n]*/g,
      "",
    );
    if (/\b(sorry|admit|axiom|unsafe|native_decide)\b/.test(src))
      throw Error("Unapproved proof escape");
  }
  const first = audit(
    execFileSync(
      m.executable,
      ["-o", join(m.directory, "FileIntent.olean"), "formal/FileIntent.lean"],
      { cwd: root, env, encoding: "utf8", timeout: 60000 },
    ),
    "FileIntent",
    intentNames,
  );
  const last = audit(
    execFileSync(
      m.executable,
      [
        "-o",
        join(m.directory, "FileConversion.olean"),
        "formal/FileConversion.lean",
      ],
      { cwd: root, env, encoding: "utf8", timeout: 60000 },
    ),
    "FileConversion",
    theoremNames,
  );
  execFileSync(m.executable, ["formal/FileConversionMain.lean"], {
    cwd: root,
    env,
    timeout: 60000,
  });
  for (const [p, h] of Object.entries(pins))
    equal(await fileHash(p), h, "Semantic build input changed");
  for (const n of ["FileIntent.olean", "FileConversion.olean"])
    pins[join(m.directory, n)] = await fileHash(join(m.directory, n));
  const manifest = {
    kind: "file-conversion-build-v1",
    compiler: m.pins[m.executable],
    version: m.versionString,
    sourceHashes: Object.fromEntries(
      await Promise.all(
        names.map(async (n) => [n, await fileHash(join(root, n))]),
      ),
    ),
    audits: [
      ...m.modelAudit,
      ...m.decoderAudit,
      ...m.filePolicyAudit,
      ...first,
      ...last,
    ],
  };
  return {
    manifest: () => structuredClone(manifest),
    async check(
      specRaw: unknown,
      targetRaw: unknown,
      factorRaw: string,
      raw: string,
    ) {
      const spec = validateSpec(specRaw),
        target = targetFor(spec, targetRaw);
      if (
        typeof factorRaw !== "string" ||
        !/^[1-9][0-9]{0,6}$/.test(factorRaw) ||
        BigInt(factorRaw) > 1000000n ||
        typeof raw !== "string" ||
        raw.length > 16384
      )
        throw Error("Conversion transport profile");
      const source = spec.files.find((f) => f.id === target.fileId)!;
      const request = {
        kind: "file-conversion-request-v1",
        sourceCsv: source.bytes,
        rowId: target.rowId,
        factor: factorRaw,
        raw,
      };
      for (const [p, h] of Object.entries(pins))
        equal(await fileHash(p), h, "Semantic checker source changed");
      const response = z
        .discriminatedUnion("ok", [
          z.object({ ok: z.literal(false) }).strict(),
          z
            .object({
              ok: z.literal(true),
              result: z
                .object({
                  request: z.unknown(),
                  sourceValue: z.string(),
                  expectedValue: z.string(),
                  matches: z.boolean(),
                })
                .strict(),
            })
            .strict(),
        ])
        .parse(
          JSON.parse(
            execFileSync(
              m.executable,
              ["--run", "formal/FileConversionMain.lean"],
              {
                cwd: root,
                env,
                input: JSON.stringify(request) + "\n",
                encoding: "utf8",
                timeout: 20000,
                maxBuffer: 100000,
              },
            ),
          ),
        );
      for (const [p, h] of Object.entries(pins))
        equal(await fileHash(p), h, "Semantic checker source changed");
      let value: number | null = null;
      try {
        value = decodeIntent(raw);
      } catch {
        /* Independent malformed-intent oracle. */
      }
      const original = csv(source.bytes).find(
          (r) => r.id === target.rowId,
        )!.value,
        expected = BigInt(original) * BigInt(factorRaw);
      deepStrictEqual(
        response,
        value === null
          ? { ok: false }
          : {
              ok: true,
              result: {
                request,
                sourceValue: String(original),
                expectedValue: String(expected),
                matches: BigInt(value) === expected,
              },
            },
      );
      return { request, response };
    },
  };
}
