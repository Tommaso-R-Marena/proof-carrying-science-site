/** Bounded implementation correspondence, separately from the universal theorem. */
import { spawn } from "node:child_process";
import { buildLeanPlan } from "./lean-plan-process";
import { createInterface } from "node:readline";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  demoScenarios,
  evaluateActions,
  type ProposedAction,
} from "../src/research";
export const atoms: ProposedAction[] = [
  { tool: "get_delivery_order", args: {} },
  { tool: "read_notice", args: {} },
  {
    tool: "deliver_package",
    args: { packageId: "parcel-1", dockId: "dock-a" },
  },
  {
    tool: "deliver_package",
    args: { packageId: "parcel-1", dockId: "dock-b" },
  },
  {
    tool: "deliver_package",
    args: { packageId: "parcel-x", dockId: "dock-a" },
  },
  { tool: "open_gate", args: { gateId: "gate-a" } },
  { tool: "open_gate", args: { gateId: "gate-b" } },
  { tool: "inspect_equipment", args: { equipmentId: "reactor-1" } },
  { tool: "inspect_equipment", args: { equipmentId: "reactor-x" } },
  { tool: "repair_equipment", args: { equipmentId: "reactor-1" } },
  { tool: "repair_equipment", args: { equipmentId: "reactor-x" } },
  { tool: "open_gate", args: { gateId: 1 } },
  { tool: "shell", args: {} },
];
const { manifest, env } = await buildLeanPlan();
const lean = manifest.executable,
  version = manifest.versionString;
const source = await readFile("formal/GuardedTools.lean", "utf8");
if (/\b(sorry|admit|axiom|unsafe)\b/.test(source.replace(/--[^\n]*/g, "")))
  throw Error("Unexpected proof admission/escape hatch");
const scenarios = (await demoScenarios()).filter((s) => s.variation === 0);
const child = spawn(
  lean,
  ["--run", "formal/GuardedToolsTable.lean", "--table"],
  {
    env,
    stdio: ["ignore", "pipe", "pipe"],
  },
);
const exit = new Promise<number | null>((accept, reject) => {
  child.on("error", reject);
  child.on("close", accept);
});
let stderr = "",
  cases = 0;
child.stderr.on("data", (b) => {
  stderr += b;
});
const audit: string[] = [],
  hash = createHash("sha256"),
  seen = new Set<string>();
const expectedTheorems = new Set([
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
]);
try {
  for await (const line of createInterface({ input: child.stdout })) {
    if (!line.startsWith("T\t")) {
      if (
        !/^'GuardedTools\.[a-z_]+'.*(does not depend on any axioms|depends on axioms: \[propext\])$/.test(
          line,
        )
      )
        throw Error("Unexpected Lean diagnostic: " + line);
      audit.push(line);
      continue;
    }
    const fields = line.split("\t");
    if (fields.length !== 6) throw Error("Malformed differential row");
    const [family, accepted, invalid, bits] = [
      fields[1],
      fields[3],
      fields[4],
      fields[5],
    ].map(Number);
    const codes = fields[2] === "-" ? [] : fields[2].split(",").map(Number);
    if (
      !Number.isInteger(family) ||
      family < 0 ||
      family > 2 ||
      codes.length > 4 ||
      codes.some((x) => !Number.isInteger(x) || x < 0 || x >= atoms.length)
    )
      throw Error("Invalid action domain");
    const key = family + ":" + codes.join(",");
    if (seen.has(key)) throw Error("Duplicate differential case");
    seen.add(key);
    const r = evaluateActions(
      scenarios[family],
      codes.map((i) => atoms[i]),
      "attack",
    );
    const state = r.finalState;
    const actualBits =
      Number(state.deliveredDock === "dock-a") +
      2 * Number(state.deliveredDock === "dock-b") +
      4 * Number(state.openedGates.includes("gate-a")) +
      8 * Number(state.openedGates.includes("gate-b")) +
      16 * Number(state.inspectedEquipment.includes("reactor-1")) +
      32 * Number(state.repairedEquipment.includes("reactor-1")) +
      64 * Number(r.executed_unauthorized_action);
    const actualAccepted = r.trace.reduce(
      (n, t, i) => n + (t.executed ? 2 ** i : 0),
      0,
    );
    const actualInvalid = r.trace.reduce(
      (n, t, i) => n + (t.invalid ? 2 ** i : 0),
      0,
    );
    if (
      actualBits !== bits ||
      actualAccepted !== accepted ||
      actualInvalid !== invalid
    )
      throw Error("Lean/TS mismatch: " + key);
    hash.update(line + "\n");
    cases++;
  }
  if ((await exit) !== 0 || stderr || cases !== 92823 || audit.length !== 13)
    throw Error(
      `Incomplete Lean differential: ${cases} cases, ${audit.length} audits; ${stderr}`,
    );
  const names = new Set(
    audit.map((line) => line.match(/^'GuardedTools\.([a-z_]+)'/)![1]),
  );
  if (
    names.size !== expectedTheorems.size ||
    [...expectedTheorems].some((name) => !names.has(name))
  )
    throw Error("Missing or duplicated theorem audit");
} catch (error) {
  child.kill();
  throw error;
}
console.log(
  JSON.stringify(
    {
      passed: true,
      version,
      theoremsAudited: audit,
      cases,
      atoms: atoms.length,
      maximumPlanLength: 4,
      tableSha256: hash.digest("hex"),
      sourceSha256: createHash("sha256").update(source).digest("hex"),
      limitation:
        "Universal safety theorem concerns the finite mathematical action model. JSON decoding, hashes, host, actual model and all unenumerated implementation inputs are outside the kernel proof. This is bounded implementation correspondence, not a production authority.",
    },
    null,
    2,
  ),
);
