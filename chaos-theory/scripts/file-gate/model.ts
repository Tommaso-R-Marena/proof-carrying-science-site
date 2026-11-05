/** Strict small CSV/tool profile and independent TypeScript policy semantics. No filesystem effects. */
import { z } from "../../src/schema";
export const token = z.string().regex(/^[A-Za-z0-9:_-]{1,80}$/);
export const fileSchema = z
  .object({ id: token, bytes: z.string().max(8192) })
  .strict();
export const policySchema = z
  .object({
    inspectable: z.array(token).max(4),
    editable: z
      .array(z.object({ fileId: token, rowId: token }).strict())
      .min(1)
      .max(16),
    minimum: z.number().int().min(0).max(1000000),
    maximum: z.number().int().min(0).max(1000000),
    requireInspection: z.boolean(),
  })
  .strict();
export const specSchema = z
  .object({ files: z.array(fileSchema).min(1).max(4), policy: policySchema })
  .strict();
export type Spec = z.infer<typeof specSchema>;
export type File = z.infer<typeof fileSchema>;
export type Policy = z.infer<typeof policySchema>;
export type Row = { id: string; value: number };
export function natural(text: unknown): number | null {
  if (typeof text !== "string" || !/^(0|[1-9][0-9]{0,6})$/.test(text))
    return null;
  const n = Number(text);
  return n <= 1000000 ? n : null;
}
export function csv(raw: string): Row[] {
  if (
    Buffer.byteLength(raw) > 8192 ||
    !raw.startsWith("id,value\n") ||
    !raw.endsWith("\n")
  )
    throw Error("Use canonical id,value CSV with LF and a final newline");
  const lines = raw.split("\n").slice(1, -1),
    seen = new Set<string>();
  if (!lines.length || lines.length > 16) throw Error("CSV row count");
  return lines.map((line) => {
    const fields = line.split(","),
      value = natural(fields[1]);
    if (
      fields.length !== 2 ||
      !token.safeParse(fields[0]).success ||
      seen.has(fields[0]) ||
      value === null
    )
      throw Error("CSV row syntax, duplicate ID or value");
    seen.add(fields[0]);
    return { id: fields[0], value };
  });
}
export function encodeCSV(rows: Row[]) {
  return "id,value\n" + rows.map((r) => `${r.id},${r.value}\n`).join("");
}
export function validateSpec(raw: unknown): Spec {
  const s = specSchema.parse(raw),
    ids = s.files.map((f) => f.id);
  if (new Set(ids).size !== ids.length || s.policy.minimum > s.policy.maximum)
    throw Error("Policy or file identities");
  const rows = new Map(s.files.map((f) => [f.id, csv(f.bytes)]));
  if (
    new Set(s.policy.inspectable).size !== s.policy.inspectable.length ||
    s.policy.inspectable.some((id) => !rows.has(id))
  )
    throw Error("Inspectable IDs");
  const editable = s.policy.editable.map((c) => `${c.fileId}/${c.rowId}`);
  if (new Set(editable).size !== editable.length)
    throw Error("Duplicate editable cell");
  for (const c of s.policy.editable) {
    const r = rows.get(c.fileId)?.find((r) => r.id === c.rowId);
    if (!r || r.value < s.policy.minimum || r.value > s.policy.maximum)
      throw Error("Editable cell or initial bounds");
  }
  return s;
}
/** Independent lexical pass: reject duplicate/escaped-duplicate keys, numbers, lone surrogates and resource bombs. */
export function strictPlan(raw: string): { tool: string; args: unknown }[] {
  if (
    raw.length > 16384 ||
    new TextDecoder("utf-8", { fatal: true }).decode(
      new TextEncoder().encode(raw),
    ) !== raw
  )
    throw Error("Plan size or Unicode");
  let at = 0,
    nodes = 0;
  const ws = () => {
    while (/[ \t\r\n]/.test(raw[at] ?? "x")) at++;
  };
  const string = (): string => {
    if (raw[at++] !== '"') throw Error("JSON string");
    const start = at - 1;
    while (at < raw.length) {
      const c = raw[at++];
      if (c === "\\") at++;
      else if (c === '"') {
        const s: string = JSON.parse(raw.slice(start, at));
        if (new TextDecoder().decode(new TextEncoder().encode(s)) !== s)
          throw Error("Lone surrogate");
        return s;
      }
    }
    throw Error("Unterminated string");
  };
  const value = (depth: number): void => {
    if (++nodes > 1024 || depth > 32) throw Error("Plan structural bounds");
    ws();
    const c = raw[at];
    if (c === '"') {
      string();
      return;
    }
    if (c === "{" || c === "[") {
      at++;
      ws();
      const end = c === "{" ? "}" : "]",
        keys = new Set<string>();
      if (raw[at] === end) {
        at++;
        return;
      }
      for (;;) {
        if (c === "{") {
          const key = string();
          if (keys.has(key)) throw Error("Duplicate key");
          keys.add(key);
          ws();
          if (raw[at++] !== ":") throw Error("JSON colon");
        }
        value(depth + 1);
        ws();
        if (raw[at] === end) {
          at++;
          return;
        }
        if (raw[at++] !== ",") throw Error("JSON delimiter");
        ws();
      }
    }
    for (const literal of ["true", "false", "null"])
      if (raw.startsWith(literal, at)) {
        at += literal.length;
        return;
      }
    throw Error("Numbers or invalid JSON outside plan profile");
  };
  value(0);
  ws();
  if (at !== raw.length) throw Error("Trailing JSON bytes");
  return z
    .object({
      actions: z
        .array(
          z
            .object({ tool: z.string().min(1).max(64), args: z.unknown() })
            .strict(),
        )
        .max(8),
    })
    .strict()
    .parse(JSON.parse(raw)).actions;
}
export type Decoded =
  | { tool: "inspect_file"; fileId: string }
  | { tool: "set_value"; fileId: string; rowId: string; value: number }
  | { tool: "invalid" };
export function decode(
  files: File[],
  action: { tool: string; args: unknown },
): Decoded {
  try {
    if (action.tool === "inspect_file") {
      const a = z.object({ fileId: token }).strict().parse(action.args);
      if (!files.some((f) => f.id === a.fileId)) throw Error("Unknown file");
      return { tool: action.tool, ...a };
    }
    if (action.tool === "set_value") {
      const a = z
          .object({ fileId: token, rowId: token, value: z.string() })
          .strict()
          .parse(action.args),
        value = natural(a.value);
      if (
        value === null ||
        !files.some(
          (f) =>
            f.id === a.fileId && csv(f.bytes).some((r) => r.id === a.rowId),
        )
      )
        throw Error("Unknown cell or value");
      return { tool: action.tool, fileId: a.fileId, rowId: a.rowId, value };
    }
  } catch {
    /* Malformed actions have no effects in either arm. */
  }
  return { tool: "invalid" };
}
export type Outcome = {
  permitted: boolean[];
  executed: boolean[];
  invalid: boolean[];
  files: File[];
  inspected: string[];
};
export function replay(
  rawSpec: unknown,
  texts: string[],
  guarded: boolean,
): Outcome {
  const spec = validateSpec(rawSpec),
    data = new Map(spec.files.map((f) => [f.id, csv(f.bytes)])),
    inspected = new Set<string>();
  const out: Outcome = {
    permitted: [],
    executed: [],
    invalid: [],
    files: [],
    inspected: [],
  };
  if (texts.length > 4) throw Error("Submission budget");
  for (const text of texts)
    for (const raw of strictPlan(text)) {
      if (out.executed.length === 16) throw Error("Action budget");
      const a = decode(spec.files, raw),
        p = spec.policy;
      const allowed =
        a.tool === "inspect_file"
          ? p.inspectable.includes(a.fileId)
          : a.tool === "set_value" &&
            p.editable.some(
              (c) => c.fileId === a.fileId && c.rowId === a.rowId,
            ) &&
            (!p.requireInspection || inspected.has(a.fileId)) &&
            p.minimum <= a.value &&
            a.value <= p.maximum;
      const execute = a.tool !== "invalid" && (!guarded || allowed);
      out.permitted.push(allowed);
      out.executed.push(execute);
      out.invalid.push(a.tool === "invalid");
      if (execute && a.tool === "inspect_file") inspected.add(a.fileId);
      if (execute && a.tool === "set_value") {
        data.get(a.fileId)!.find((r) => r.id === a.rowId)!.value = a.value;
        inspected.delete(a.fileId);
      }
    }
  out.files = spec.files.map((f) => ({
    id: f.id,
    bytes: encodeCSV(data.get(f.id)!),
  }));
  out.inspected = spec.files
    .filter((f) => inspected.has(f.id))
    .map((f) => f.id);
  return out;
}
