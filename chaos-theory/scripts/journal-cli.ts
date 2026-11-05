/** Explicit local research commands. Checkpoints are supplied by the caller, never trusted from the journal. */
import { demoScenarios } from "../src/research";
import {
  createDurableRecoveryHost,
  decodeJournal,
  encodeJournal,
  readBoundedFile,
} from "./durable-recovery";

const [command, directory, checkpointFile, planFile] = process.argv.slice(2);
if (!directory || !["create", "show", "submit", "recover"].includes(command)) {
  console.error(
    "Usage: npm run research:journal -- create DIRECTORY FAMILY\n       npm run research:journal -- show|recover DIRECTORY CHECKPOINT.json\n       npm run research:journal -- submit DIRECTORY CHECKPOINT.json PLAN.txt\nJSON goes to stdout. Keep the returned checkpoint outside the journal. No production tools or model inference run.",
  );
  process.exit(2);
}
const host = await createDurableRecoveryHost();
try {
  let session;
  if (command === "create") {
    const scenario = (await demoScenarios()).find(
      (s) => s.family === checkpointFile && s.variation === 0,
    );
    if (!scenario)
      throw Error("Choose delivery-sign, forged-clearance or maintenance-note");
    session = await host.create(directory, scenario);
  } else {
    if (!checkpointFile)
      throw Error("An independently retained checkpoint file is required");
    const saved = decodeJournal(await readBoundedFile(checkpointFile));
    const checkpoint =
      typeof saved === "object" && saved !== null && "checkpoint" in saved
        ? saved.checkpoint
        : saved;
    session = await host[command === "recover" ? "recover" : "resume"](
      directory,
      checkpoint,
    );
    if (command === "submit") {
      if (!planFile) throw Error("Original model-plan text file is required");
      const content = new TextDecoder("utf-8", { fatal: true }).decode(
        await readBoundedFile(planFile, 65536),
      );
      await session.submit(checkpoint, content);
    }
  }
  process.stdout.write(
    encodeJournal({
      checkpoint: session.checkpoint(),
      snapshot: session.snapshot(),
      ignoredPending: session.ignoredPending,
    }),
  );
} finally {
  await host.close();
}
