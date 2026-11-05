/** Encoding/schema tests only; real authorization is tested in the separate native suite. */
import { describe, it, expect } from "vitest";
import {
  decodeJournal,
  encodeJournal,
  checkpointSchema,
} from "../scripts/durable-recovery";
const bytes = (s: string) => new TextEncoder().encode(s);
describe("journal wire profile (no authority verdicts)", () => {
  it("retains exact whitespace and escaped spellings inside original plan text", () => {
    const v = {
      content: ' {"actions":[{"tool":"read_notice","args":{}}]}\n',
      label: "🙂é",
    };
    expect(decodeJournal(bytes(encodeJournal(v)))).toEqual(v);
  });
  it.each([
    '{"a":1,"a":1}\n',
    '{"a":1, "b":2}\n',
    '{"b":2,"a":1}\n',
    '{"a":-0}\n',
    '{"a":1e0}\n',
    '{"a":1}',
    '{"a":"\\u0061"}\n',
  ])("rejects noncanonical or ambiguous bytes %s", (s) => {
    expect(() => decodeJournal(bytes(s))).toThrow();
  });
  it("rejects malformed UTF-8, trailing bytes and oversized files", () => {
    for (const v of [
      new Uint8Array([0xff]),
      bytes("{}\ntrash"),
      new Uint8Array(500001),
    ])
      expect(() => decodeJournal(v)).toThrow();
  });
  it("rejects boolean generations, extra keys, invalid checkpoint identities and digests", () => {
    const cp = {
      format: "lean-recovery-checkpoint-v1",
      sessionId: "7fb44663-2501-4b77-b979-de5efb7adab1",
      manifestDigest: "a".repeat(64),
      generation: 0,
      recordDigest: "a".repeat(64),
      snapshotHead: "b".repeat(64),
    };
    expect(checkpointSchema.parse(cp)).toEqual(cp);
    for (const v of [
      { ...cp, generation: false },
      { ...cp, extra: true },
      { ...cp, sessionId: "x" },
      { ...cp, recordDigest: "é".repeat(64) },
    ])
      expect(() => checkpointSchema.parse(v)).toThrow();
  });
});
