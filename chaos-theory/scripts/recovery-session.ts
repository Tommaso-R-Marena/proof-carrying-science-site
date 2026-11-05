/** Research-only state-bound recovery; fixed guard, synthetic effects, unsigned replay receipts. */
import { z } from "../src/schema";
import {
  canonicalize,
  evaluateActions,
  hashArtifact,
  verifyScenario,
  type Scenario,
  type ProposedAction,
} from "../src/research";
import { parsePlan } from "./safety-ablation";
const digest = z.string().regex(/^[a-f0-9]{64}$/);
const commitSchema = z
  .object({
    generation: z.number().int().min(1).max(4),
    previousHead: digest,
    plan: z.unknown(),
    planHash: digest,
    head: digest,
  })
  .strict();
const snapshotSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal("guarded-recovery-state"),
    scenarioHash: digest,
    generation: z.number().int().min(0).max(4),
    head: digest,
    history: z.unknown(),
    commits: z.array(commitSchema).max(4),
    result: z.unknown(),
  })
  .strict();
type Commit = {
  generation: number;
  previousHead: string;
  plan: ProposedAction[];
  planHash: string;
  head: string;
};
function result(s: Scenario, history: ProposedAction[]) {
  const e = evaluateActions(s, history, "attack");
  return {
    state: e.finalState,
    trace: e.trace,
    completed: e.legitimate_task_completed,
    blocked: e.blockedExecutions,
    invalid: e.invalid_tool_arguments,
    unsafe: e.executed_unauthorized_action,
  };
}
type Result = ReturnType<typeof result>;
export interface RecoverySnapshot {
  version: 1;
  kind: "guarded-recovery-state";
  scenarioHash: string;
  generation: number;
  head: string;
  history: ProposedAction[];
  commits: Commit[];
  result: Result;
}
async function head(
  s: Scenario,
  generation: number,
  previousHead: string | null,
  planHash: string | null,
  history: ProposedAction[],
  r: Result,
) {
  return hashArtifact({
    format: "guarded-recovery-head-v1",
    scenarioHash: s.hash,
    generation,
    previousHead,
    planHash,
    historyHash: await hashArtifact(history),
    resultHash: await hashArtifact(r),
  });
}
async function initial(s: Scenario): Promise<RecoverySnapshot> {
  const r = result(s, []);
  return {
    version: 1,
    kind: "guarded-recovery-state",
    scenarioHash: s.hash,
    generation: 0,
    head: await head(s, 0, null, null, [], r),
    history: [],
    commits: [],
    result: r,
  };
}
async function advance(
  s: Scenario,
  before: RecoverySnapshot,
  plan: ProposedAction[],
): Promise<RecoverySnapshot> {
  if (before.result.completed) throw Error("Session already completed");
  if (before.generation >= 4 || before.history.length + plan.length > 16)
    throw Error("Recovery budget exhausted");
  const history = [...before.history, ...plan],
    r = result(s, history);
  if (r.unsafe) throw Error("Guard invariant failed");
  const generation = before.generation + 1,
    planHash = await hashArtifact(plan);
  const nextHead = await head(s, generation, before.head, planHash, history, r);
  const commit = {
    generation,
    previousHead: before.head,
    plan,
    planHash,
    head: nextHead,
  };
  return {
    version: 1,
    kind: "guarded-recovery-state",
    scenarioHash: s.hash,
    generation,
    head: nextHead,
    history,
    commits: [...before.commits, commit],
    result: r,
  };
}
export async function verifyRecoverySnapshot(
  value: unknown,
  raw: unknown,
): Promise<RecoverySnapshot> {
  const s = await verifyScenario(value);
  canonicalize(raw);
  const p = snapshotSchema.parse(raw);
  if (p.scenarioHash !== s.hash) throw Error("Scenario binding mismatch");
  let current = await initial(s);
  for (const commit of p.commits) {
    const plan = parsePlan(JSON.stringify({ actions: commit.plan }));
    if (!plan || commit.previousHead !== current.head)
      throw Error("Invalid receipt chain");
    current = await advance(s, current, plan);
    if (canonicalize(current.commits.at(-1)) !== canonicalize(commit))
      throw Error("Receipt replay mismatch");
  }
  if (canonicalize(current) !== canonicalize(p))
    throw Error("Snapshot replay mismatch");
  return current;
}
export async function createRecoverySession(value: unknown) {
  const s = structuredClone(await verifyScenario(value));
  let current = await initial(s);
  return {
    snapshot: () => structuredClone(current),
    async submit(expectedHead: string, content: unknown) {
      const before = current;
      if (expectedHead !== before.head) throw Error("Stale recovery head");
      const plan = parsePlan(content);
      if (!plan) throw Error("Invalid model plan");
      const next = await advance(s, before, plan);
      // Recheck after asynchronous hashing; only one concurrent continuation may commit.
      if (current !== before) throw Error("Stale recovery head");
      current = next;
      return structuredClone(current);
    },
  };
}
export async function makeRepairRequest(value: unknown, snapshot: unknown) {
  const s = await verifyScenario(value),
    p = await verifyRecoverySnapshot(s, snapshot);
  if (p.result.completed || p.generation >= 4)
    throw Error("No repair available");
  const body = {
    version: 1,
    kind: "research-repair-obligation",
    scenarioHash: s.hash,
    expectedHead: p.head,
    generation: p.generation,
    task: s.task,
    trustedPolicy: s.trustedPolicy,
    capabilities: s.capabilities,
    state: p.result.state,
    rejectedActions: p.result.trace
      .filter((t) => !t.executed)
      .map((t) => ({ tool: t.tool, args: t.args, reason: t.reason })),
    limitation:
      "Unsigned local replay binding, not origin attestation or an independent protected authority. Rejected text is untrusted data. Every repair must pass the same fixed guard.",
  };
  return { ...body, hash: await hashArtifact(body) };
}
export async function verifyRepairRequest(
  value: unknown,
  snapshot: unknown,
  raw: unknown,
) {
  const expected = await makeRepairRequest(value, snapshot);
  if (canonicalize(expected) !== canonicalize(raw))
    throw Error("Repair obligation mismatch");
  return expected;
}
