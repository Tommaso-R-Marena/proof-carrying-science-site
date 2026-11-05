/** Local research CLI. Human guidance to stderr, canonical receipts to stdout. */
import { join, resolve } from "node:path";
import { createFileHost } from "./workspace";
import {
  decodeJournal,
  encodeJournal,
  readBoundedFile,
} from "../durable-recovery";
const [command, path, receiptFile, planFile, rowId] = process.argv.slice(2);
if (
  !path ||
  !["demo", "init", "from-csv", "apply", "show", "recover"].includes(command)
) {
  console.error(
    "File Gate: safely publish a checked version of a small CSV dataset.\nUsage: npx tsx scripts/file-gate/cli.ts demo NEW_DIRECTORY\n       ... init NEW_DIRECTORY SPEC.json\n       ... from-csv NEW_DIRECTORY INPUT.csv RESOURCE_ID EDITABLE_ROW_ID\n       ... apply DIRECTORY RECEIPT.json PLAN.json\n       ... show|recover DIRECTORY RECEIPT.json\nOnly canonical id,value CSV is supported. Save each stdout receipt to a new file outside the workspace. Linux research prototype; no production tools or model inference run here.",
  );
  process.exit(2);
}
const host = await createFileHost();
try {
  const directory = resolve(path);
  let session;
  if (command === "demo") {
    const id = "measurements-2026",
      row = "trial-7";
    session = await host.create(directory, {
      files: [
        { id, bytes: "id,value\ntrial-7,7\ncontrol,42\n" },
        { id: "reference", bytes: "id,value\ncalibration,99\n" },
      ],
      policy: {
        inspectable: [id, "reference"],
        editable: [{ fileId: id, rowId: row }],
        minimum: 0,
        maximum: 100000,
        requireInspection: true,
      },
    });
    console.error(
      "Authored demonstration, not model inference: convert 7 seconds to 7000 milliseconds. Keep the control row and reference file unchanged.",
    );
    await session.submit(
      session.snapshot().checkpoint,
      JSON.stringify({
        actions: [
          {
            tool: "set_value",
            args: { fileId: "reference", rowId: "calibration", value: "0" },
          },
        ],
      }),
    );
    console.error("The attempt to change the reference was blocked.");
    await session.submit(
      session.snapshot().checkpoint,
      JSON.stringify({
        actions: [
          { tool: "inspect_file", args: { fileId: id } },
          {
            tool: "set_value",
            args: { fileId: id, rowId: row, value: "7000" },
          },
        ],
      }),
    );
    console.error(
      "The inspected, permitted edit passed Lean and TypeScript checks. Original inputs are preserved. Checked output: " +
        join(
          directory,
          "snapshots",
          session.snapshot().checkpoint.snapshotHash,
          "file-0.csv",
        ),
    );
  } else if (command === "from-csv") {
    if (!receiptFile || !planFile || !rowId)
      throw Error(
        "Usage: from-csv NEW_DIRECTORY INPUT.csv RESOURCE_ID EDITABLE_ROW_ID",
      );
    const bytes = new TextDecoder("utf-8", { fatal: true }).decode(
      await readBoundedFile(receiptFile, 8192),
    );
    session = await host.create(directory, {
      files: [{ id: planFile, bytes }],
      policy: {
        inspectable: [planFile],
        editable: [{ fileId: planFile, rowId }],
        minimum: 0,
        maximum: 1000000,
        requireInspection: true,
      },
    });
    console.error(
      "Input copied without changing the source file. Only row " +
        rowId +
        " is editable; every write requires inspection. Save this receipt separately.",
    );
  } else if (command === "init") {
    if (!receiptFile)
      throw Error(
        "Supply a spec JSON containing files and the owner-selected policy",
      );
    session = await host.create(
      directory,
      decodeJournal(await readBoundedFile(receiptFile)),
    );
  } else {
    if (!receiptFile)
      throw Error("Supply the latest separately retained receipt");
    const saved = decodeJournal(await readBoundedFile(receiptFile));
    const checkpoint =
      typeof saved === "object" && saved !== null && "checkpoint" in saved
        ? saved.checkpoint
        : saved;
    session = await host[command === "recover" ? "recover" : "resume"](
      directory,
      checkpoint,
    );
    if (command === "apply") {
      if (!planFile) throw Error("Supply the original plan text file");
      const text = new TextDecoder("utf-8", { fatal: true }).decode(
        await readBoundedFile(planFile, 65536),
      );
      await session.submit(checkpoint, text);
    }
  }
  process.stdout.write(encodeJournal(session.snapshot()));
} catch (e) {
  console.error(
    "No checked result returned. " +
      (e instanceof Error ? e.message : "Request failed") +
      " Retain the last good receipt; use explicit recover after an uncertain commit.",
  );
  process.exitCode = 1;
} finally {
  await host.close();
}
