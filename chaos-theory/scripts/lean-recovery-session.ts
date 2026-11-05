/** Opt-in research gate: actual Lean raw-text verdict AND existing TS semantics, before publication. */
import { deepStrictEqual } from "node:assert";
import { verifyScenario } from "../src/research";
import {
  createRecoverySession,
  type RecoverySnapshot,
} from "./recovery-session";
import { startLeanPlanProcess } from "./lean-plan-process";
export async function createLeanRecoveryHost() {
  const lean = await startLeanPlanProcess();
  let closed = false;
  return {
    manifest: lean.manifest,
    records: lean.records,
    async close() {
      closed = true;
      await lean.close();
    },
    async createSession(value: unknown) {
      if (closed) throw Error("Lean recovery host closed");
      const s = structuredClone(await verifyScenario(value));
      let published = (await createRecoverySession(s)).snapshot();
      let texts: string[] = [],
        tail = Promise.resolve();
      return {
        snapshot: () => structuredClone(published),
        async submit(
          expectedHead: string,
          content: unknown,
        ): Promise<RecoverySnapshot> {
          const task = tail.then(async () => {
            if (closed) throw Error("Lean recovery host closed");
            if (expectedHead !== published.head)
              throw Error("Stale recovery head");
            if (typeof content !== "string")
              throw Error("Raw model text required");
            const candidateTexts = [...texts, content];
            const checked = await lean.authorize(s.family, candidateTexts);
            // Stage in fresh memory. Disagreement never mutates the published session.
            const staged = await createRecoverySession(s);
            for (const commit of published.commits)
              await staged.submit(
                staged.snapshot().head,
                JSON.stringify({ actions: commit.plan }),
              );
            const candidate = await staged.submit(expectedHead, content);
            const expected = checked.outcomes.at(-1)!;
            deepStrictEqual(candidate.result.state, expected.state);
            deepStrictEqual(
              candidate.result.trace.map((t) => t.executed),
              expected.accepted,
            );
            deepStrictEqual(
              candidate.result.trace.map((t) => t.invalid),
              expected.invalid,
            );
            if (
              candidate.result.completed !== expected.completed ||
              candidate.result.unsafe !== expected.violated
            )
              throw Error("Lean/TS decision mismatch");
            if (closed || published.head !== expectedHead)
              throw Error("Stale or closed recovery session");
            published = candidate;
            texts = candidateTexts;
            return structuredClone(published);
          });
          tail = task.then(
            () => {},
            () => {},
          );
          return task;
        },
      };
    },
  };
}
