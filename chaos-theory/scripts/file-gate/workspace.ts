/** Versioned real CSV artifacts. Host/filesystem trusted; checkpoints are unsigned and caller-retained. */
import fs from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { join, resolve, basename, dirname } from "node:path";
import { deepStrictEqual } from "node:assert";
import { z } from "../../src/schema";
import { hashArtifact } from "../../src/research";
import {
  encodeJournal,
  decodeJournal,
  readBoundedFile,
} from "../durable-recovery";
import { root } from "../lean-plan-process";
import { startFileAuthority, fileHash } from "./native";
import { validateSpec, fileSchema, type File, type Outcome } from "./model";
const sha = z.string().regex(/^[a-f0-9]{64}$/);
const mode = z.enum(["guarded", "capability-control"]);
export const checkpointSchema = z
  .object({
    format: z.literal("file-gate-checkpoint-v1"),
    sessionId: z.string().uuid(),
    manifestDigest: sha,
    generation: z.number().int().min(0).max(4),
    recordDigest: sha,
    snapshotHash: sha,
  })
  .strict();
export type Checkpoint = z.infer<typeof checkpointSchema>;
const outcomeSchema = z
  .object({
    permitted: z.array(z.boolean()).max(16),
    executed: z.array(z.boolean()).max(16),
    invalid: z.array(z.boolean()).max(16),
    files: z.array(fileSchema).max(4),
    inspected: z.array(z.string()).max(4),
  })
  .strict();
const descriptorSchema = z
  .object({
    format: z.literal("file-gate-workspace-v1"),
    sessionId: z.string().uuid(),
    mode,
    authorityHash: sha,
    spec: z.unknown(),
    initial: outcomeSchema,
    snapshotHash: sha,
    digest: sha,
  })
  .strict();
const recordSchema = z
  .object({
    format: z.literal("file-gate-commit-v1"),
    sessionId: z.string().uuid(),
    generation: z.number().int().min(1).max(4),
    previousDigest: sha,
    content: z.string().max(16384),
    outcome: outcomeSchema,
    snapshotHash: sha,
    digest: sha,
  })
  .strict();
async function seal<T extends object>(value: T) {
  return { ...value, digest: await hashArtifact(value) };
}
async function unseal(value: { digest: string }) {
  const { digest, ...body } = value;
  if ((await hashArtifact(body)) !== digest)
    throw Error("Artifact digest mismatch");
}
async function read(path: string) {
  return decodeJournal(await readBoundedFile(path));
}
async function sync(path: string) {
  const h = await fs.open(path, "r");
  try {
    await h.sync();
  } finally {
    await h.close();
  }
}
async function publish(directory: string, name: string, value: unknown) {
  const path = join(directory, `.pending-${randomUUID()}.json`),
    h = await fs.open(path, "wx", 0o600);
  try {
    await h.writeFile(encodeJournal(value));
    await h.sync();
  } finally {
    await h.close();
  }
  // Deliberately leave evidence after uncertain failures. No stale lock or mutable HEAD exists.
  await fs.link(path, join(directory, name));
  await sync(directory);
  await fs.unlink(path);
  await sync(directory);
}
async function directory(path: string) {
  const s = await fs.lstat(path);
  if (!s.isDirectory() || s.isSymbolicLink())
    throw Error("Invalid workspace directory");
}
async function listing(path: string) {
  await directory(path);
  const names = await fs.readdir(path);
  if (
    names.length > 128 ||
    names.some(
      (n) =>
        !["session.json", "snapshots"].includes(n) &&
        !/^commit-[1-4]\.json$/.test(n) &&
        !/^\.pending-[a-f0-9-]{36}\.json$/.test(n),
    )
  )
    throw Error("Unexpected workspace entry");
  if (!names.includes("session.json") || !names.includes("snapshots"))
    throw Error("Incomplete workspace");
  const records = names.filter((n) => /^commit-/.test(n)).sort();
  for (let n = 1; n <= records.length; n++)
    if (records[n - 1] !== `commit-${n}.json`) throw Error("Receipt gap");
  return records;
}
async function verifyFiles(path: string, digest: string, files: File[]) {
  await directory(join(path, "snapshots"));
  const snapshot = join(path, "snapshots", digest);
  await directory(snapshot);
  deepStrictEqual(
    (await fs.readdir(snapshot)).sort(),
    files.map((_, i) => `file-${i}.csv`).sort(),
  );
  for (const [i, file] of files.entries())
    deepStrictEqual(
      await readBoundedFile(join(snapshot, `file-${i}.csv`), 8192),
      Buffer.from(file.bytes, "utf8"),
      "CSV artifact changed",
    );
  if ((await hashArtifact(files)) !== digest)
    throw Error("Snapshot content address mismatch");
}
async function writeFiles(path: string, files: File[]) {
  const digest = await hashArtifact(files),
    parent = join(path, "snapshots"),
    temp = join(parent, `.stage-${randomUUID()}`);
  await fs.mkdir(temp, { mode: 0o700 });
  for (const [i, f] of files.entries()) {
    const h = await fs.open(join(temp, `file-${i}.csv`), "wx", 0o600);
    try {
      await h.writeFile(Buffer.from(f.bytes));
      await h.sync();
    } finally {
      await h.close();
    }
  }
  await sync(temp);
  try {
    await fs.rename(temp, join(parent, digest));
  } catch (e) {
    if (
      !["EEXIST", "ENOTEMPTY"].includes((e as NodeJS.ErrnoException).code ?? "")
    )
      throw e;
    await verifyFiles(path, digest, files);
    await fs.rm(temp, { recursive: true });
  }
  await sync(parent);
  await verifyFiles(path, digest, files);
  return digest;
}
function cp(
  sessionId: string,
  manifestDigest: string,
  generation: number,
  recordDigest: string,
  snapshotHash: string,
): Checkpoint {
  return {
    format: "file-gate-checkpoint-v1",
    sessionId,
    manifestDigest,
    generation,
    recordDigest,
    snapshotHash,
  };
}
export async function createFileHost() {
  const lean = await startFileAuthority(),
    m = lean.manifest();
  const sources: { [path: string]: string } = {};
  for (const p of [
    "scripts/file-gate/model.ts",
    "scripts/file-gate/native.ts",
    "scripts/file-gate/workspace.ts",
    "scripts/durable-recovery.ts",
    "scripts/lean-plan-process.ts",
    "src/research.ts",
    "src/schema.ts",
    "src/contracts.ts",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
  ])
    sources[p] = await fileHash(join(root, p));
  for (const [p, hash] of Object.entries(m.pins))
    if (p.endsWith(".lean")) sources[`formal/${basename(p)}`] = hash;
  const authority = {
      compiler: m.pins[m.executable],
      version: m.versionString,
      sources,
      audits: [...m.modelAudit, ...m.decoderAudit, ...m.filePolicyAudit],
    },
    authorityHash = await hashArtifact(authority);
  let closed = false;
  const active = new Set<Promise<unknown>>();
  async function track<T>(p: Promise<T>) {
    active.add(p);
    try {
      return await p;
    } finally {
      active.delete(p);
    }
  }
  async function sourcePins() {
    if (closed) throw Error("File host closed");
    for (const [p, h] of Object.entries(sources))
      if ((await fileHash(join(root, p))) !== h)
        throw Error("File authority source changed");
  }
  async function load(path: string, raw: unknown, recover: boolean) {
    await sourcePins();
    const anchor = checkpointSchema.parse(raw),
      names = await listing(path);
    const d = descriptorSchema.parse(await read(join(path, "session.json")));
    await unseal(d);
    if (
      d.authorityHash !== authorityHash ||
      d.sessionId !== anchor.sessionId ||
      d.digest !== anchor.manifestDigest
    )
      throw Error("Workspace authority/checkpoint mismatch");
    const spec = validateSpec(d.spec);
    const records: z.infer<typeof recordSchema>[] = [];
    for (const name of names) {
      const r = recordSchema.parse(await read(join(path, name)));
      await unseal(r);
      records.push(r);
    }
    const native = await lean.authorize(
      spec,
      records.map((r) => r.content),
    );
    deepStrictEqual(d.initial, native.initial);
    if ((await hashArtifact(d.initial.files)) !== d.snapshotHash)
      throw Error("Initial content address");
    let outcome: Outcome = d.initial;
    const checkpoints = [
      cp(d.sessionId, d.digest, 0, d.digest, d.snapshotHash),
    ];
    await verifyFiles(path, d.snapshotHash, d.initial.files);
    for (const [i, r] of records.entries()) {
      if (
        r.sessionId !== d.sessionId ||
        r.generation !== i + 1 ||
        r.previousDigest !== checkpoints.at(-1)!.recordDigest
      )
        throw Error("Receipt chain mismatch");
      outcome =
        native.outcomes[i][d.mode === "guarded" ? "guarded" : "control"];
      deepStrictEqual(r.outcome, outcome);
      if ((await hashArtifact(outcome.files)) !== r.snapshotHash)
        throw Error("CSV binding mismatch");
      await verifyFiles(path, r.snapshotHash, outcome.files);
      checkpoints.push(
        cp(d.sessionId, d.digest, i + 1, r.digest, r.snapshotHash),
      );
    }
    if (anchor.generation >= checkpoints.length)
      throw Error("Rollback below retained checkpoint");
    deepStrictEqual(
      checkpoints[anchor.generation],
      anchor,
      "Retained checkpoint mismatch",
    );
    const latest = checkpoints.at(-1)!;
    if (!recover && latest.generation !== anchor.generation)
      throw Error("Stale checkpoint; use explicit recover");
    async function stable(withNext = false) {
      await sourcePins();
      deepStrictEqual(
        await listing(path),
        withNext ? [...names, `commit-${names.length + 1}.json`] : names,
        "Concurrent journal update",
      );
      deepStrictEqual(await read(join(path, "session.json")), d);
      await verifyFiles(path, d.snapshotHash, d.initial.files);
      for (const [i, r] of records.entries()) {
        deepStrictEqual(await read(join(path, names[i])), r);
        await verifyFiles(path, r.snapshotHash, r.outcome.files);
      }
    }
    await stable();
    return { descriptor: d, records, outcome, latest, stable };
  }
  function opened(path: string, state: Awaited<ReturnType<typeof load>>) {
    let current = state,
      poisoned = false,
      tail = Promise.resolve();
    const view = () => ({
      checkpoint: structuredClone(current.latest),
      mode: current.descriptor.mode,
      verificationAuthority: current.descriptor.mode === "guarded",
      outcome: structuredClone(current.outcome),
      artifacts: current.outcome.files.map((f, i) => ({
        id: f.id,
        sha256: createHash("sha256").update(f.bytes).digest("hex"),
        path: join(
          path,
          "snapshots",
          current.latest.snapshotHash,
          `file-${i}.csv`,
        ),
      })),
    });
    return {
      snapshot: view,
      async submit(expected: unknown, content: unknown) {
        const anchor = checkpointSchema.parse(expected);
        if (typeof content !== "string")
          throw Error("Original model text required");
        const task = tail.then(async () => {
          if (poisoned) throw Error("Uncertain publication; reopen/recover");
          deepStrictEqual(anchor, current.latest, "Stale checkpoint");
          const fresh = await load(path, anchor, false),
            texts = [...fresh.records.map((r) => r.content), content];
          const native = await lean.authorize(fresh.descriptor.spec, texts);
          const outcome =
            native.outcomes.at(-1)![
              fresh.descriptor.mode === "guarded" ? "guarded" : "control"
            ];
          await fresh.stable();
          const snapshotHash = await writeFiles(path, outcome.files);
          const record = await seal({
            format: "file-gate-commit-v1" as const,
            sessionId: anchor.sessionId,
            generation: anchor.generation + 1,
            previousDigest: anchor.recordDigest,
            content,
            outcome,
            snapshotHash,
          });
          await fresh.stable();
          await verifyFiles(path, snapshotHash, outcome.files);
          poisoned = true;
          await publish(path, `commit-${record.generation}.json`, record);
          await fresh.stable(true);
          await sourcePins();
          await verifyFiles(path, snapshotHash, outcome.files);
          deepStrictEqual(
            await read(join(path, `commit-${record.generation}.json`)),
            record,
          );
          current = {
            ...fresh,
            records: [...fresh.records, record],
            outcome,
            latest: cp(
              anchor.sessionId,
              anchor.manifestDigest,
              record.generation,
              record.digest,
              snapshotHash,
            ),
          };
          poisoned = false;
          return view();
        });
        tail = task.then(
          () => {},
          () => {},
        );
        return track(task);
      },
    };
  }
  async function create(
    path: string,
    value: unknown,
    variant: "guarded" | "capability-control",
  ) {
    await sourcePins();
    const spec = validateSpec(value),
      initial = (await lean.authorize(spec, [])).initial;
    const target = resolve(path);
    await fs.mkdir(target, { mode: 0o700 });
    await sync(dirname(target));
    await fs.mkdir(join(target, "snapshots"), { mode: 0o700 });
    const snapshotHash = await writeFiles(target, initial.files),
      d = await seal({
        format: "file-gate-workspace-v1" as const,
        sessionId: randomUUID(),
        mode: variant,
        authorityHash,
        spec,
        initial,
        snapshotHash,
      });
    await publish(target, "session.json", d);
    const checkpoint = cp(d.sessionId, d.digest, 0, d.digest, snapshotHash);
    return opened(target, await load(target, checkpoint, false));
  }
  return {
    authority: () => structuredClone({ ...authority, hash: authorityHash }),
    manifest: lean.manifest,
    records: lean.records,
    create: (path: string, spec: unknown) =>
      track(create(path, spec, "guarded")),
    createControlFixture: (path: string, spec: unknown) =>
      track(create(path, spec, "capability-control")),
    async resume(path: string, checkpoint: unknown) {
      return opened(
        resolve(path),
        await load(resolve(path), checkpoint, false),
      );
    },
    async recover(path: string, checkpoint: unknown) {
      return opened(resolve(path), await load(resolve(path), checkpoint, true));
    },
    async close() {
      closed = true;
      await Promise.allSettled([...active]);
      await lean.close();
    },
  };
}
