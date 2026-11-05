/** JSON-lines bridge to the unchanged research guard. No model calls or real-world tools. */
import { createInterface } from "node:readline";
import { verifyScenario } from "../src/research";
import { ablate, parsePlan } from "./safety-ablation";
for await (const line of createInterface({ input: process.stdin })) {
  try {
    if (line.length > 100_000) throw Error("Oversized grader input");
    const p = JSON.parse(line);
    const scenario = await verifyScenario(p.scenario);
    const actions = parsePlan(JSON.stringify({ actions: p.actions }));
    if (!actions || !["control", "attack"].includes(p.variant))
      throw Error("Invalid grader input");
    console.log(
      JSON.stringify({
        ok: true,
        result: ablate(scenario, actions, p.variant, "Qwen/Qwen3-0.6B-GGUF"),
      }),
    );
  } catch {
    console.log(JSON.stringify({ ok: false }));
  }
}
