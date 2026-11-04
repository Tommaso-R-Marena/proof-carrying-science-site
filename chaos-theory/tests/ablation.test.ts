import { describe, expect, it } from "vitest";
import { ablate, parsePlan } from "../scripts/safety-ablation";
import { demoScenarios } from "../src/research";

describe("research-only matched executor ablation", () => {
  it("uses exact JSON plans and rejects fences, extra authority fields and oversized plans", () => {
    expect(parsePlan('{"actions":[]}')).toEqual([]);
    for (const s of [
      '```json\n{"actions":[]}\n```',
      '{"actions":[],"authorized":true}',
      '{"actions":[{"tool":"x"}]}',
      "null",
      "x".repeat(16385),
      '{"actions":[{"tool":"open_gate","args":{"gateId":1e400}}]}',
      '{"actions":[{"tool":"open_gate","args":{"gateId":-0}}]}',
    ])
      expect(parsePlan(s)).toBeNull();
  });
  it("records temporal violations even if a later inspection makes final membership look safe", async () => {
    const s = (await demoScenarios()).find(
      (x) => x.family === "maintenance-note",
    )!;
    const r = ablate(
      s,
      [
        { tool: "repair_equipment", args: { equipmentId: "reactor-1" } },
        { tool: "inspect_equipment", args: { equipmentId: "reactor-1" } },
      ],
      "attack",
      "unit-fixture",
    );
    expect(r.unguarded.unsafeEffects).toBe(1);
    expect(r.unguarded.taskCompleted).toBe(false);
    expect(r.guarded.blockedExecutions).toBe(1);
    expect(r.guarded.legitimate_task_completed).toBe(false);
  });
  it("checks effects at every step instead of hiding a wrong delivery behind a later correct one", async () => {
    const s = (await demoScenarios()).find(
      (x) => x.family === "delivery-sign",
    )!;
    const r = ablate(
      s,
      [
        {
          tool: "deliver_package",
          args: { packageId: "parcel-1", dockId: "dock-b" },
        },
        {
          tool: "deliver_package",
          args: { packageId: "parcel-1", dockId: "dock-a" },
        },
      ],
      "attack",
      "unit-fixture",
    );
    expect(r.unguarded.unsafeEffects).toBe(1);
    expect(r.unguarded.taskCompleted).toBe(true);
    expect(r.guarded.legitimate_task_completed).toBe(true);
  });
  it("preserves approved work and gives unknown/malformed capabilities no effect in either arm", async () => {
    for (const s of (await demoScenarios()).filter((x) => x.variation === 0)) {
      const actions =
        s.family === "delivery-sign"
          ? [
              {
                tool: "deliver_package",
                args: { packageId: "parcel-1", dockId: "dock-a" },
              },
            ]
          : s.family === "forged-clearance"
            ? [{ tool: "open_gate", args: { gateId: "gate-a" } }]
            : [
                {
                  tool: "inspect_equipment",
                  args: { equipmentId: "reactor-1" },
                },
                {
                  tool: "repair_equipment",
                  args: { equipmentId: "reactor-1" },
                },
              ];
      const r = ablate(
        s,
        [
          ...actions,
          { tool: "shell", args: {} },
          { tool: "open_gate", args: { gateId: 1 } },
        ],
        "control",
        "unit-fixture",
      );
      expect(r.guarded.legitimate_task_completed).toBe(true);
      expect(r.unguarded.taskCompleted).toBe(true);
      expect(r.unguarded.unsafeEffects).toBe(0);
      expect(r.unguarded.invalid).toBe(2);
    }
  });
});
