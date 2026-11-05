/** Actual Lean lexical and arithmetic boundary checks, with an independent Python oracle. */
import fs from "node:fs/promises";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { equal } from "node:assert";
import { root } from "../lean-plan-process";
import { buildConversionChecker } from "./native";
const checker = await buildConversionChecker(),
  target = { fileId: "m", rowId: "x" };
const spec = {
  files: [{ id: "m", bytes: "id,value\nx,7\nkeep,42\n" }],
  policy: {
    inspectable: ["m"],
    editable: [target],
    minimum: 0,
    maximum: 1000000,
    requireInspection: true,
  },
};
const records = [];
for (const raw of [
  '{"value":"7000"}',
  '{"value":"8"}',
  ' {"value":"\\u0037\\u0030\\u0030\\u0030"}\n',
  '{"value":7000}',
  '{"value":"07000"}',
  '{"value":"-0"}',
  '{"value":"1.0"}',
  '{"value":"1000001"}',
  '{"value":"7000","value":"8"}',
  '{"value":"7000","\\u0076alue":"8"}',
  '{"value":"7000","verified":true}',
  '{"value":"٧٠٠٠"}',
  '{"value":"\\ud800"}',
  '{"value":"7000"}x',
])
  records.push(await checker.check(spec, target, "1000", raw));
for (const source of [0, 1, 1000000])
  for (const factor of [1, 1000000]) {
    const s = {
      ...spec,
      files: [{ id: "m", bytes: `id,value\nx,${source}\nkeep,42\n` }],
    };
    for (const value of [0, 1000000])
      records.push(
        await checker.check(
          s,
          target,
          String(factor),
          JSON.stringify({ value: String(value) }),
        ),
      );
  }
for (const f of ["0", "01", "-1", "1000001"]) {
  let rejected = false;
  try {
    await checker.check(spec, target, f, '{"value":"7000"}');
  } catch {
    rejected = true;
  }
  equal(rejected, true);
}
await fs.mkdir(join(root, "results"), { recursive: true });
const out = await fs.mkdtemp(join(root, "results/conversion-parser-"));
await fs.writeFile(
  join(out, "records.json"),
  JSON.stringify(records, null, 2) + "\n",
);
const python = JSON.parse(
  execFileSync(
    "python3",
    ["scripts/conversion-gate/verify-parser.py", join(out, "records.json")],
    { cwd: root, encoding: "utf8" },
  ),
);
equal(python.cases, records.length);
console.log(
  JSON.stringify(
    {
      passed: true,
      realLean: true,
      parserAndArithmeticCases: records.length,
      independentPythonCases: python.cases,
      invalidOwnerMultipliersRejected: 4,
      newInferenceCalls: 0,
      output: out,
    },
    null,
    2,
  ),
);
