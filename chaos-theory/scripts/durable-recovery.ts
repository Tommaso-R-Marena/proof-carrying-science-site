/** Research-only crash-recoverable synthetic sessions. No OS/host immutability claim. */
import fs from "node:fs/promises";
import { constants } from "node:fs";
import { randomUUID, createHash } from "node:crypto";
import { basename, dirname, join, resolve } from "node:path";
import { deepStrictEqual } from "node:assert";
import { z } from "../src/schema";
import { canonicalize, hashArtifact, verifyScenario } from "../src/research";
import { createLeanRecoveryHost } from "./lean-recovery-session";
import { root } from "./lean-plan-process";
import type { RecoverySnapshot } from "./recovery-session";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const uuid = z.string().uuid();
const generation = z.number().int().min(0).max(4);
const descriptorSchema = z
  .object({
    format: z.literal("lean-recovery-journal-v1"),
    sessionId: uuid,
    authorityHash: digest,
    scenario: z.unknown(),
    initial: z.unknown(),
    digest,
  })
  .strict();
const recordSchema = z
  .object({
    format: z.literal("lean-recovery-record-v1"),
    sessionId: uuid,
    generation: generation.refine((n) => n > 0),
    previousDigest: digest,
    content: z.string().max(16384),
    snapshot: z.unknown(),
    digest,
  })
  .strict();
export const checkpointSchema = z
  .object({
    format: z.literal("lean-recovery-checkpoint-v1"),
    sessionId: uuid,
    manifestDigest: digest,
    generation,
    recordDigest: digest,
    snapshotHead: digest,
  })
  .strict();
export type JournalCheckpoint = z.infer<typeof checkpointSchema>;
type Record = z.infer<typeof recordSchema>;
const manifestName = "session.json";
const commitName = (n: number) => `commit-${n}.json`;
const pending = /^\.pending-[a-f0-9-]{36}\.json$/;
const maxFile = 500_000;

export function encodeJournal(value: unknown) {
  return canonicalize(value) + "\n";
}
/** Require one exact JSON encoding; duplicate keys and parser-normalized values fail. */
export function decodeJournal(bytes: Uint8Array): unknown {
  if (bytes.length > maxFile) throw Error("Journal file exceeds bounds");
  const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  const value: unknown = JSON.parse(text);
  if (encodeJournal(value) !== text) throw Error("Noncanonical journal bytes");
  return value;
}
export async function readBoundedFile(path: string, maximum = maxFile) {
  const handle = await fs.open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile() || stat.size > maximum)
      throw Error("Invalid journal file");
    // Stay bounded even if another process grows the file after stat().
    const buffer = Buffer.alloc(maximum + 1);
    let used = 0;
    while (used < buffer.length) {
      const { bytesRead } = await handle.read(
        buffer,
        used,
        buffer.length - used,
        used,
      );
      if (bytesRead === 0) break;
      used += bytesRead;
    }
    if (used > maximum) throw Error("Journal file exceeds bounds");
    return buffer.subarray(0, used);
  } finally {
    await handle.close();
  }
}
async function read(path: string) {
  const bytes = await readBoundedFile(path);
  return { bytes, value: decodeJournal(bytes) };
}
async function entries(directory: string) {
  const stat = await fs.lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink())
    throw Error("Invalid journal directory");
  const names = await fs.readdir(directory);
  if (
    names.length > 128 ||
    names.some(
      (n) =>
        n !== manifestName &&
        !/^commit-[1-4]\.json$/.test(n) &&
        !pending.test(n),
    )
  )
    throw Error("Unexpected journal entry");
  for (const name of names) {
    const stat = await fs.lstat(join(directory, name));
    if (!stat.isFile() || stat.isSymbolicLink())
      throw Error("Invalid journal entry");
  }
  const committed = names.filter((n) => !pending.test(n)).sort();
  if (!committed.includes(manifestName))
    throw Error("Incomplete journal initialization");
  const count = committed.length - 1;
  for (let n = 1; n <= count; n++)
    if (!committed.includes(commitName(n))) throw Error("Journal gap");
  return { committed, ignoredPending: names.length - committed.length };
}
async function syncDirectory(directory: string) {
  const h = await fs.open(directory, "r");
  try {
    await h.sync();
  } finally {
    await h.close();
  }
}
/** Hard-link publication is atomic create-if-absent: a competing writer cannot overwrite it. */
async function publish(directory: string, name: string, value: unknown) {
  const encoded = encodeJournal(value);
  if (Buffer.byteLength(encoded) > maxFile)
    throw Error("Journal file exceeds bounds");
  const temporary = join(directory, `.pending-${randomUUID()}.json`);
  const handle = await fs.open(temporary, "wx", 0o600);
  let linked = false;
  try {
    await handle.writeFile(encoded, "utf8");
    await handle.sync();
    await handle.close();
    await fs.link(temporary, join(directory, name));
    linked = true;
    await syncDirectory(directory);
  } finally {
    await handle.close();
    // After link, an error may mean committed-but-not-acknowledged. Never remove that commit.
    if (!linked) await fs.unlink(temporary).catch(() => {});
  }
  await fs.unlink(temporary);
  await syncDirectory(directory);
}
async function checkDigest(value: { digest: string }) {
  const { digest, ...body } = value;
  if ((await hashArtifact(body)) !== digest)
    throw Error("Journal digest mismatch");
}
async function sealed<T extends object>(body: T) {
  return { ...body, digest: await hashArtifact(body) };
}
function checkpoint(
  sessionId: string,
  manifestDigest: string,
  recordDigest: string,
  s: RecoverySnapshot,
): JournalCheckpoint {
  return {
    format: "lean-recovery-checkpoint-v1",
    sessionId,
    manifestDigest,
    generation: s.generation,
    recordDigest,
    snapshotHead: s.head,
  };
}

export async function createDurableRecoveryHost() {
  const lean = await createLeanRecoveryHost();
  let closed = false;
  const inFlight = new Set<Promise<unknown>>();
  async function tracked<T>(task: Promise<T>): Promise<T> {
    inFlight.add(task);
    try {
      return await task;
    } finally {
      inFlight.delete(task);
    }
  }
  try {
    const m = lean.manifest();
    // Bind source closure, not build-directory paths, so a fresh independently built process can replay.
    const runtimeSources = [
      "scripts/durable-recovery.ts",
      "scripts/lean-plan-process.ts",
      "scripts/lean-recovery-session.ts",
      "scripts/recovery-session.ts",
      "scripts/safety-ablation.ts",
      "src/research.ts",
      "src/schema.ts",
      "src/contracts.ts",
      "package.json",
      "package-lock.json",
      "tsconfig.json",
    ];
    const sources: { [name: string]: string } = {};
    for (const path of runtimeSources)
      sources[path] = createHash("sha256")
        .update(await fs.readFile(join(root, path)))
        .digest("hex");
    for (const [path, hash] of Object.entries(m.pins))
      if (path.endsWith(".lean"))
        sources[`formal/${basename(path)}`] = digest.parse(hash);
    const authority = {
      compiler: digest.parse(m.pins[m.executable]),
      version: m.versionString,
      modelAudit: m.modelAudit,
      decoderAudit: m.decoderAudit,
      sources,
    };
    const authorityHash = await hashArtifact(authority);
    const ensureOpen = () => {
      if (closed) throw Error("Durable host closed");
    };
    async function unchangedSources() {
      ensureOpen();
      for (const [path, expected] of Object.entries(sources)) {
        if (
          createHash("sha256")
            .update(await fs.readFile(join(root, path)))
            .digest("hex") !== expected
        )
          throw Error("Journal authority source changed");
      }
    }
    async function load(
      directory: string,
      rawAnchor: unknown,
      allowSuffix: boolean,
    ) {
      await unchangedSources();
      const anchor = checkpointSchema.parse(rawAnchor);
      const listing = await entries(directory);
      const descriptorFile = await read(join(directory, manifestName));
      const descriptor = descriptorSchema.parse(descriptorFile.value);
      await checkDigest(descriptor);
      if (descriptor.authorityHash !== authorityHash)
        throw Error("Journal authority mismatch");
      if (
        descriptor.sessionId !== anchor.sessionId ||
        descriptor.digest !== anchor.manifestDigest
      )
        throw Error("Journal checkpoint identity mismatch");
      const scenario = await verifyScenario(descriptor.scenario);
      const session = await lean.createSession(scenario);
      deepStrictEqual(session.snapshot(), descriptor.initial);
      const checkpoints = [
        checkpoint(
          descriptor.sessionId,
          descriptor.digest,
          descriptor.digest,
          session.snapshot(),
        ),
      ];
      const files = [{ name: manifestName, bytes: descriptorFile.bytes }];
      for (let n = 1; n < listing.committed.length; n++) {
        const name = commitName(n),
          file = await read(join(directory, name));
        const record = recordSchema.parse(file.value);
        await checkDigest(record);
        if (
          record.sessionId !== descriptor.sessionId ||
          record.generation !== n ||
          record.previousDigest !== checkpoints.at(-1)!.recordDigest
        )
          throw Error("Journal receipt chain mismatch");
        const snapshot = await session.submit(
          session.snapshot().head,
          record.content,
        );
        deepStrictEqual(snapshot, record.snapshot);
        checkpoints.push(
          checkpoint(
            descriptor.sessionId,
            descriptor.digest,
            record.digest,
            snapshot,
          ),
        );
        files.push({ name, bytes: file.bytes });
      }
      // An independently retained checkpoint detects truncation or substitution of its protected prefix.
      if (anchor.generation >= checkpoints.length)
        throw Error("Journal rollback below checkpoint");
      deepStrictEqual(checkpoints[anchor.generation], anchor);
      const latest = checkpoints.at(-1)!;
      if (!allowSuffix && latest.generation !== anchor.generation)
        throw Error("Stale journal checkpoint; explicit recovery required");
      await stable();
      async function stable() {
        await unchangedSources();
        deepStrictEqual(
          (await entries(directory)).committed,
          listing.committed,
          "Journal changed during replay",
        );
        for (const file of files)
          deepStrictEqual(
            (await read(join(directory, file.name))).bytes,
            file.bytes,
            "Journal bytes changed during replay",
          );
      }
      return {
        session,
        latest,
        stable,
        ignoredPending: listing.ignoredPending,
      };
    }
    function opened(
      directory: string,
      state: Awaited<ReturnType<typeof load>>,
    ) {
      let current = state.session.snapshot(),
        cp = state.latest,
        poisoned = false;
      let tail = Promise.resolve();
      return {
        snapshot: () => structuredClone(current),
        checkpoint: () => structuredClone(cp),
        ignoredPending: state.ignoredPending,
        async submit(rawExpected: unknown, rawContent: unknown) {
          // Freeze caller data before awaiting any source or disk IO.
          const expected = checkpointSchema.parse(rawExpected);
          if (typeof rawContent !== "string")
            throw Error("Raw model text required");
          const content = rawContent;
          const task = tail.then(async () => {
            ensureOpen();
            if (poisoned)
              throw Error("Journal outcome uncertain; reopen with checkpoint");
            deepStrictEqual(expected, cp, "Stale journal checkpoint");
            const fresh = await load(directory, expected, false);
            const candidate = await fresh.session.submit(
              fresh.session.snapshot().head,
              content,
            );
            const record: Record = await sealed({
              format: "lean-recovery-record-v1" as const,
              sessionId: cp.sessionId,
              generation: candidate.generation,
              previousDigest: cp.recordDigest,
              content,
              snapshot: candidate,
            });
            await fresh.stable();
            // From this point any storage error is uncertain; fail closed until fresh independent replay.
            poisoned = true;
            await publish(directory, commitName(candidate.generation), record);
            current = candidate;
            cp = checkpoint(
              cp.sessionId,
              cp.manifestDigest,
              record.digest,
              candidate,
            );
            poisoned = false;
            return {
              checkpoint: structuredClone(cp),
              snapshot: structuredClone(current),
            };
          });
          tail = task.then(
            () => {},
            () => {},
          );
          return tracked(task);
        },
      };
    }
    return {
      manifest: lean.manifest,
      authority: () => structuredClone({ ...authority, hash: authorityHash }),
      records: lean.records,
      async close() {
        closed = true;
        await Promise.allSettled([...inFlight]);
        await lean.close();
      },
      async create(path: string, value: unknown) {
        return tracked(
          (async () => {
            await unchangedSources();
            const directory = resolve(path),
              scenario = structuredClone(await verifyScenario(value));
            const initial = (await lean.createSession(scenario)).snapshot();
            const descriptor = await sealed({
              format: "lean-recovery-journal-v1" as const,
              sessionId: randomUUID(),
              authorityHash,
              scenario,
              initial,
            });
            await fs.mkdir(directory, { mode: 0o700 });
            await syncDirectory(dirname(directory));
            await publish(directory, manifestName, descriptor);
            const cp = checkpoint(
              descriptor.sessionId,
              descriptor.digest,
              descriptor.digest,
              initial,
            );
            return opened(directory, await load(directory, cp, false));
          })(),
        );
      },
      async resume(path: string, anchor: unknown) {
        return opened(resolve(path), await load(resolve(path), anchor, false));
      },
      /** Explicitly adopt only a fully reverified suffix after an uncertain acknowledgement/crash. */
      async recover(path: string, anchor: unknown) {
        return opened(resolve(path), await load(resolve(path), anchor, true));
      },
    };
  } catch (error) {
    await lean.close();
    throw error;
  }
}
