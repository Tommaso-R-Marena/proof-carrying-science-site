/** Separate-process race/crash worker; all affirmative decisions come from real source-built Lean. */
import fs from "node:fs/promises";
import {
  createDurableRecoveryHost,
  decodeJournal,
  encodeJournal,
} from "./durable-recovery";
const [directory, checkpointPath, content] = process.argv.slice(2);
const host = await createDurableRecoveryHost();
try {
  const checkpoint = decodeJournal(await fs.readFile(checkpointPath));
  const session = await host.resume(directory, checkpoint);
  try {
    const result = await session.submit(checkpoint, content);
    console.log(encodeJournal({ ok: true, ...result }).trim());
  } catch {
    console.log(
      encodeJournal({
        ok: false,
        unchangedMemory: session.checkpoint(),
      }).trim(),
    );
  }
} finally {
  await host.close();
}
