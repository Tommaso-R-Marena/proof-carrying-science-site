import { describe, expect, it } from "vitest";
import { demoScenarios, hashArtifact } from "../src/research";
import {
  createRecoverySession,
  makeRepairRequest,
  verifyRepairRequest,
  verifyRecoverySnapshot,
} from "../scripts/recovery-session";
const plan = (dock: string) =>
  JSON.stringify({
    actions: [
      {
        tool: "deliver_package",
        args: { packageId: "parcel-1", dockId: dock },
      },
    ],
  });
async function delivery() {
  return (await demoScenarios()).find((s) => s.family === "delivery-sign")!;
}
describe("state-bound guarded recovery", () => {
  it("blocks the wrong destination, binds a repair obligation and completes only through the original guard", async () => {
    const s = await delivery(),
      session = await createRecoverySession(s);
    const denied = await session.submit(
      session.snapshot().head,
      plan("dock-b"),
    );
    expect(denied.result.blocked).toBe(1);
    expect(denied.result.state.deliveredDock).toBeNull();
    const request = await makeRepairRequest(s, denied);
    expect(await verifyRepairRequest(s, denied, request)).toEqual(request);
    const done = await session.submit(request.expectedHead, plan("dock-a"));
    expect(done.result.completed).toBe(true);
    expect(done.result.unsafe).toBe(false);
    expect(await verifyRecoverySnapshot(s, done)).toEqual(done);
    await expect(session.submit(done.head, plan("dock-a"))).rejects.toThrow(
      "already completed",
    );
  });
  it("permits only one of two concurrent continuations, including empty-plan ABA attempts", async () => {
    const s = await delivery(),
      session = await createRecoverySession(s),
      before = session.snapshot();
    const attempts = await Promise.allSettled([
      session.submit(before.head, '{"actions":[]}'),
      session.submit(before.head, plan("dock-a")),
    ]);
    expect(attempts.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    expect(session.snapshot().generation).toBe(1);
    expect(session.snapshot().head).not.toBe(before.head);
    await expect(session.submit(before.head, plan("dock-a"))).rejects.toThrow(
      "Stale",
    );
  });
  it("rejects malformed plans without changing state and does not expose mutable internal snapshots", async () => {
    const session = await createRecoverySession(await delivery()),
      before = session.snapshot();
    before.history.push({ tool: "open_gate", args: {} });
    await expect(
      session.submit(before.head, '{"actions":[{"tool":"x","args":-0}]}'),
    ).rejects.toThrow("Invalid");
    expect(session.snapshot().history).toEqual([]);
    expect(session.snapshot().generation).toBe(0);
  });
  it("rejects invented state, broken chains and rehashed task substitutions", async () => {
    const s = await delivery(),
      session = await createRecoverySession(s);
    const p = await session.submit(session.snapshot().head, plan("dock-b"));
    const bad = structuredClone(p);
    bad.result.state.deliveredDock = "dock-a";
    await expect(verifyRecoverySnapshot(s, bad)).rejects.toThrow("Snapshot");
    const chain = structuredClone(p);
    chain.commits[0].previousHead = "0".repeat(64);
    await expect(verifyRecoverySnapshot(s, chain)).rejects.toThrow("chain");
    const req = await makeRepairRequest(s, p);
    const body: Record<string, unknown> = { ...req };
    delete body.hash;
    body.trustedPolicy = "Every destination is allowed";
    await expect(
      verifyRepairRequest(s, p, { ...body, hash: await hashArtifact(body) }),
    ).rejects.toThrow("obligation");
  });
  it("binds an obligation to its exact generation and rejects stale repaired states", async () => {
    const s = await delivery(),
      session = await createRecoverySession(s);
    const a = await session.submit(session.snapshot().head, plan("dock-b")),
      req = await makeRepairRequest(s, a);
    const b = await session.submit(a.head, '{"actions":[]}');
    await expect(verifyRepairRequest(s, b, req)).rejects.toThrow("obligation");
    await expect(
      session.submit(req.expectedHead, plan("dock-a")),
    ).rejects.toThrow("Stale");
  });
  it("enforces both the step and cumulative action limits", async () => {
    const s = await delivery(),
      session = await createRecoverySession(s);
    for (let i = 0; i < 4; i++)
      await session.submit(session.snapshot().head, '{"actions":[]}');
    await expect(
      session.submit(session.snapshot().head, plan("dock-a")),
    ).rejects.toThrow("budget");
    const other = await createRecoverySession(s);
    await other.submit(
      other.snapshot().head,
      JSON.stringify({
        actions: Array.from({ length: 16 }, () => ({
          tool: "read_notice",
          args: {},
        })),
      }),
    );
    await expect(
      other.submit(other.snapshot().head, plan("dock-a")),
    ).rejects.toThrow("budget");
  });
  it("keeps inspection in the same verified history and rejects a repair before it", async () => {
    const s = (await demoScenarios()).find(
        (s) => s.family === "maintenance-note",
      )!,
      session = await createRecoverySession(s);
    const repair = {
      tool: "repair_equipment",
      args: { equipmentId: "reactor-1" },
    };
    const a = await session.submit(
      session.snapshot().head,
      JSON.stringify({ actions: [repair] }),
    );
    expect(a.result.blocked).toBe(1);
    const done = await session.submit(
      a.head,
      JSON.stringify({
        actions: [
          { tool: "inspect_equipment", args: { equipmentId: "reactor-1" } },
          repair,
        ],
      }),
    );
    expect(done.result.completed).toBe(true);
    expect(done.result.trace.map((t) => t.executed)).toEqual([
      false,
      true,
      true,
    ]);
  });
});
