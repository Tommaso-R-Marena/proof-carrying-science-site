/** Metadata compatibility checks only. These tests do not supply or mock a Lean verdict. */
import fs from "node:fs/promises";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import {
  checkStudySources,
  studySourceNames,
} from "../scripts/file-gate/source-profile";
import { fileHash } from "../scripts/file-gate/native";
import { root } from "../scripts/lean-plan-process";
async function fixture() {
  const e = JSON.parse(
    await fs.readFile(
      join(root, "evidence/general-file-gate-v1/live/protocol.json"),
      "utf8",
    ),
  );
  const r = JSON.parse(
    await fs.readFile(
      join(root, "evidence/general-file-gate-v1/live/report.json"),
      "utf8",
    ),
  ).report;
  const current = Object.fromEntries(
    await Promise.all(
      studySourceNames.map(async (n) => [n, await fileHash(join(root, n))]),
    ),
  );
  return {
    recorded: e.protocol.sources,
    current,
    recovery: r.collectionRecovery,
    expected: {
      protocolHash: e.sha256,
      modelCalls: r.calls.length,
      episodes: r.episodes.length,
    },
  };
}
describe("pinned observer collection repair", () => {
  it("recognizes exactly the preserved historical study and approved repair", async () => {
    const f = await fixture();
    expect(
      await checkStudySources(f.recorded, f.current, f.recovery, f.expected),
    ).toBe(true);
  });
  it("accepts exact current sources without historical fallback", async () => {
    const f = await fixture();
    expect(
      await checkStudySources(f.current, f.current, undefined, f.expected),
    ).toBe(false);
  });
  it("rejects an unknown historical observer hash", async () => {
    const f = await fixture();
    f.recorded["scripts/file-gate/bridge.ts"] = "0".repeat(64);
    await expect(
      checkStudySources(f.recorded, f.current, f.recovery, f.expected),
    ).rejects.toThrow();
  });
  it("rejects an unapproved current observer", async () => {
    const f = await fixture();
    f.current["scripts/file-gate/evaluate.py"] = "0".repeat(64);
    await expect(
      checkStudySources(f.recorded, f.current, f.recovery, f.expected),
    ).rejects.toThrow();
  });
  it("rejects a mixed enforcement-source profile even when both maps agree on the changed core", async () => {
    const f = await fixture();
    f.recorded["scripts/file-gate/model.ts"] = f.current[
      "scripts/file-gate/model.ts"
    ] = "0".repeat(64);
    await expect(
      checkStudySources(f.recorded, f.current, f.recovery, f.expected),
    ).rejects.toThrow();
  });
  it("rejects missing loss disclosure, wrong protocol binding and invented call counts", async () => {
    const f = await fixture();
    for (const recovery of [
      undefined,
      { ...f.recovery, originalNativeLedgerRetained: true },
      { ...f.recovery, originalProtocolHash: "0".repeat(64) },
      { ...f.recovery, modelCallsRecovered: 0 },
    ])
      await expect(
        checkStudySources(f.recorded, f.current, recovery, f.expected),
      ).rejects.toThrow();
  });
});
