/** A numeric answer only. Trusted host selects the cell; this module does not calculate a task answer. */
import { z } from "../../src/schema";
import {
  natural,
  strictPlan,
  token,
  validateSpec,
  csv,
  type Spec,
} from "../file-gate/model";
export const targetSchema = z.object({ fileId: token, rowId: token }).strict();
export type Target = z.infer<typeof targetSchema>;
export function targetFor(spec: Spec, raw: unknown): Target {
  const t = targetSchema.parse(raw);
  if (
    !spec.files.some(
      (f) => f.id === t.fileId && csv(f.bytes).some((r) => r.id === t.rowId),
    )
  )
    throw Error("Unknown target cell");
  return t;
}
export function decodeIntent(raw: string): number {
  if (typeof raw !== "string" || raw.length > 128) throw Error("Intent size");
  const action = strictPlan(
    '{"actions":[{"tool":"intent","args":' + raw + "}]}",
  )[0];
  const value = z
    .object({ value: z.string() })
    .strict()
    .parse(action.args).value;
  const n = natural(value);
  if (n === null) throw Error("Canonical bounded integer required");
  return n;
}
export function expectedCompilation(
  value: unknown,
  target: unknown,
  raw: string,
) {
  const spec = validateSpec(value),
    t = targetFor(spec, target),
    n = decodeIntent(raw),
    p = spec.policy;
  const eligible =
    p.editable.some((c) => c.fileId === t.fileId && c.rowId === t.rowId) &&
    n >= p.minimum &&
    n <= p.maximum &&
    (!p.requireInspection || p.inspectable.includes(t.fileId));
  const actions = [
    ...(p.requireInspection
      ? [{ tool: "inspect_file", args: { fileId: t.fileId } }]
      : []),
    { tool: "set_value", args: { ...t, value: String(n) } },
  ];
  return { value: String(n), eligible, plan: eligible ? { actions } : null };
}
