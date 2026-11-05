/** Local operator CLI. Inputs/target/multiplier come from the owner, never from model instructions. */
import { resolve, join } from "node:path";
import { buildConversionChecker } from "./native";
import { createConversionHost } from "./host";
import {
  readBoundedFile,
  decodeJournal,
  encodeJournal,
} from "../durable-recovery";
const output = (value: unknown) => process.stdout.write(encodeJournal(value));
const [command, directory, ...args] = process.argv.slice(2);
if (
  !directory ||
  !["init", "apply", "convert", "show", "recover"].includes(command)
)
  throw Error(
    "Usage: cli.ts init NEW_DIR INPUT.csv RESOURCE ROW MULTIPLIER | apply DIR RECEIPT.json ANSWER.json | convert DIR RECEIPT.json | show DIR RECEIPT.json | recover DIR LAST_GOOD_RECEIPT.json",
  );
const host = await createConversionHost(),
  path = resolve(directory);
try {
  if (command === "init") {
    const [input, id, row, multiplier] = args;
    if (!input || !id || !row || !multiplier || args.length !== 4)
      throw Error(
        "init needs CSV, resource, editable row and positive multiplier",
      );
    const bytes = (await readBoundedFile(resolve(input), 8192)).toString(
      "utf8",
    );
    const s = await host.create(path, {
      spec: {
        files: [{ id, bytes }],
        policy: {
          inspectable: [id],
          editable: [{ fileId: id, rowId: row }],
          minimum: 0,
          maximum: 1000000,
          requireInspection: true,
        },
      },
      target: { fileId: id, rowId: row },
      factor: multiplier,
    });
    console.error(
      `Copied input. Only ${id}/${row} can change, and only to its ORIGINAL value times ${multiplier}. Save the receipt outside this workspace.`,
    );
    output(s.receipt());
  } else {
    if (!args[0] || args.length !== (command === "apply" ? 2 : 1))
      throw Error("Receipt path and, for apply, answer path required");
    const value = decodeJournal(await readBoundedFile(resolve(args[0]))) as {
      receipt?: unknown;
    };
    const receipt = value.receipt ?? value;
    const s = await host[command === "recover" ? "recover" : "resume"](
      path,
      receipt,
    );
    if (command === "apply" || command === "convert") {
      let raw: string;
      if (command === "convert") {
        const saved = decodeJournal(
          await readBoundedFile(join(path, "owner.json")),
        ) as { job: { spec: unknown; target: unknown; factor: string } };
        const checker = await buildConversionChecker();
        const reference = await checker.check(
          saved.job.spec,
          saved.job.target,
          saved.job.factor,
          '{"value":"0"}',
        );
        if (!reference.response.ok)
          throw Error("Cannot calculate exact answer");
        raw = JSON.stringify({
          value: reference.response.result.expectedValue,
        });
        console.error("Deterministic conversion using Lean; no model used.");
      } else
        raw = (await readBoundedFile(resolve(args[1]), 16384)).toString("utf8");
      const result = await s.submit(s.receipt(), raw);
      console.error(
        result.accepted
          ? `Accepted. Checked CSV: ${result.snapshot.artifacts[0].path}`
          : "Rejected. The last checked dataset stays active. See the structured reason in the output.",
      );
      output(result);
      if (!result.accepted) process.exitCode = 2;
    } else if (command === "show")
      output({ receipt: s.receipt(), snapshot: s.snapshot() });
    else output(s.receipt());
  }
} finally {
  await host.close();
}
