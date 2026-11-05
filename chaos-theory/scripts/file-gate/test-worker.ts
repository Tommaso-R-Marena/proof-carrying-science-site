/** Real separately launched writer for process-crash and competing-commit tests. */
import { createFileHost } from "./workspace";
import { decodeJournal, readBoundedFile } from "../durable-recovery";
const [path, checkpointFile, text] = process.argv.slice(2);
const h = await createFileHost();
try {
  const anchor = decodeJournal(await readBoundedFile(checkpointFile)),
    s = await h.resume(path, anchor);
  try {
    console.log(
      JSON.stringify({ ok: true, snapshot: await s.submit(anchor, text) }),
    );
  } catch {
    console.log(JSON.stringify({ ok: false, snapshot: s.snapshot() }));
  }
} finally {
  await h.close();
}
