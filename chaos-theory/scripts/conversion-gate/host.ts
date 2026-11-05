/** Fixed exact-conversion refinement on top of the unchanged file authority. Trusted host/storage, unsigned retained receipts. */
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { join, resolve } from "node:path";
import { deepStrictEqual, equal } from "node:assert";
import { z } from "../../src/schema";
import { hashArtifact } from "../../src/research";
import { root } from "../lean-plan-process";
import {
  readBoundedFile,
  decodeJournal,
  encodeJournal,
} from "../durable-recovery";
import { fileHash } from "../file-gate/native";
import { validateSpec, strictPlan } from "../file-gate/model";
import { createFileHost, checkpointSchema } from "../file-gate/workspace";
import { buildIntentCompiler } from "../file-intent/native";
import { targetFor } from "../file-intent/model";
import { buildConversionChecker } from "./native";
const factor = z
  .string()
  .regex(/^[1-9][0-9]{0,6}$/)
  .refine((v) => BigInt(v) <= 1000000n);
const receiptSchema = z
  .object({
    format: z.literal("conversion-checkpoint-v1"),
    jobHash: z.string().regex(/^[a-f0-9]{64}$/),
    checkpoint: checkpointSchema,
  })
  .strict();
export async function createConversionHost() {
  const semantic = await buildConversionChecker(),
    intent = await buildIntentCompiler(),
    files = await createFileHost();
  const hostPath = join(root, "scripts/conversion-gate/host.ts"),
    hostHash = await fileHash(hostPath);
  const implementation = {
    semantic: semantic.manifest(),
    intent: intent.manifest(),
    authority: files.authority(),
    hostHash,
  };
  async function pin() {
    equal(await fileHash(hostPath), hostHash, "Conversion host changed");
  }
  function job(raw: unknown) {
    const v = z
        .object({ spec: z.unknown(), target: z.unknown(), factor })
        .strict()
        .parse(raw),
      spec = validateSpec(v.spec);
    return { spec, target: targetFor(spec, v.target), factor: v.factor };
  }
  async function save(path: string, value: unknown) {
    const h = await fs.open(path, "wx", 0o600);
    try {
      await h.writeFile(encodeJournal(value));
      await h.sync();
    } finally {
      await h.close();
    }
  }
  async function opened(
    path: string,
    owner: ReturnType<typeof job>,
    core: Awaited<ReturnType<typeof files.create>>,
  ) {
    const jobHash = await hashArtifact({ job: owner, implementation });
    const snapshot = () => ({
      format: "conversion-checkpoint-v1" as const,
      jobHash,
      checkpoint: core.snapshot().checkpoint,
    });
    return {
      receipt: snapshot,
      snapshot: core.snapshot,
      async submit(expected: unknown, raw: string) {
        await pin();
        const anchor = receiptSchema.parse(expected);
        deepStrictEqual(
          anchor,
          snapshot(),
          "Stale or substituted conversion job",
        );
        const check = await semantic.check(
          owner.spec,
          owner.target,
          owner.factor,
          raw,
        );
        if (!check.response.ok || !check.response.result.matches)
          return {
            accepted: false,
            check,
            receipt: snapshot(),
            snapshot: core.snapshot(),
          };
        const compilation = await intent.compile(owner.spec, owner.target, raw);
        if (
          !compilation.response.ok ||
          !compilation.response.result.eligible ||
          !compilation.response.result.plan
        )
          return {
            accepted: false,
            check,
            compilation,
            receipt: snapshot(),
            snapshot: core.snapshot(),
          };
        await save(join(path, "proposals", randomUUID() + ".json"), {
          jobHash,
          expected,
          raw,
          check,
          compilation,
        });
        await core.submit(anchor.checkpoint, compilation.response.result.plan);
        await pin();
        return {
          accepted: true,
          check,
          compilation,
          receipt: snapshot(),
          snapshot: core.snapshot(),
        };
      },
    };
  }
  async function reopen(
    directory: string,
    expected: unknown,
    recover: boolean,
  ) {
    await pin();
    const path = resolve(directory),
      receipt = receiptSchema.parse(expected),
      saved = decodeJournal(
        await readBoundedFile(join(path, "owner.json")),
      ) as { job: unknown; implementation: unknown };
    deepStrictEqual(
      saved.implementation,
      implementation,
      "Conversion implementation changed",
    );
    const owner = job(saved.job);
    equal(
      await hashArtifact({ job: owner, implementation }),
      receipt.jobHash,
      "Conversion job changed",
    );
    const descriptor = decodeJournal(
      await readBoundedFile(join(path, "data/session.json")),
    ) as { spec: unknown };
    deepStrictEqual(descriptor.spec, owner.spec);
    const core = await files[recover ? "recover" : "resume"](
      join(path, "data"),
      receipt.checkpoint,
    );
    // Independently recheck every committed version, even if the lower-level interface was invoked directly.
    for (let n = 1; n <= core.snapshot().checkpoint.generation; n++) {
      const record = decodeJournal(
        await readBoundedFile(join(path, "data", `commit-${n}.json`)),
      ) as { content: string };
      const actions = strictPlan(record.content),
        last = actions.at(-1);
      if (!last || last.tool !== "set_value")
        throw Error("Non-conversion history");
      const args = z
        .object({ fileId: z.string(), rowId: z.string(), value: z.string() })
        .strict()
        .parse(last.args);
      const raw = JSON.stringify({ value: args.value });
      const check = await semantic.check(
        owner.spec,
        owner.target,
        owner.factor,
        raw,
      );
      if (!check.response.ok || !check.response.result.matches)
        throw Error("Incorrect conversion in history");
      const c = await intent.compile(owner.spec, owner.target, raw);
      if (!c.response.ok || !c.response.result.plan)
        throw Error("Invalid conversion history");
      equal(
        record.content,
        c.response.result.plan,
        "History differs from checked conversion",
      );
    }
    return opened(path, owner, core);
  }
  return {
    manifest: () => structuredClone(implementation),
    async create(directory: string, value: unknown) {
      await pin();
      const owner = job(value),
        path = resolve(directory);
      await fs.mkdir(path, { mode: 0o700 });
      await fs.mkdir(join(path, "proposals"));
      await save(join(path, "owner.json"), { job: owner, implementation });
      const core = await files.create(join(path, "data"), owner.spec);
      return opened(path, owner, core);
    },
    resume: (directory: string, expected: unknown) =>
      reopen(directory, expected, false),
    recover: (directory: string, expected: unknown) =>
      reopen(directory, expected, true),
    async close() {
      await files.close();
    },
  };
}
