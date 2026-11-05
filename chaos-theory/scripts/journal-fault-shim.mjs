/** Test-only filesystem fault hooks. Never produces or alters a verifier response. */
import fs from "node:fs/promises";
import process from "node:process";
import { setTimeout } from "node:timers";
import { join } from "node:path";
const original = {
  link: fs.link.bind(fs),
  open: fs.open.bind(fs),
  writeFile: fs.writeFile.bind(fs),
  access: fs.access.bind(fs),
};
const mode = process.env.PCS_JOURNAL_TEST_FAULT;
const directory = process.env.PCS_JOURNAL_TEST_DIRECTORY;
const marker = process.env.PCS_JOURNAL_TEST_MARKER;
async function pause() {
  await original.writeFile(marker, "actual publication boundary reached\n", {
    flag: "wx",
  });
  if (mode === "barrier") {
    for (let i = 0; i < 600; i++) {
      try {
        await original.access(marker + ".release");
        return;
      } catch {
        await new Promise((r) => setTimeout(r, 50));
      }
    }
    throw Error("Test barrier timed out");
  }
  await new Promise(() => {}); // Parent kills the whole process group; no synthetic success.
}
if (mode && directory && marker) {
  fs.link = async (source, destination) => {
    if (
      destination === join(directory, "commit-1.json") &&
      (mode === "before-link" || mode === "barrier")
    )
      await pause();
    const result = await original.link(source, destination);
    if (
      destination === join(directory, "commit-1.json") &&
      mode === "after-link"
    )
      await pause();
    return result;
  };
  if (mode === "sync-error" || mode === "after-sync") {
    fs.open = async (...args) => {
      const h = await original.open(...args);
      if (args[0] === directory && args[1] === "r") {
        const sync = h.sync.bind(h);
        h.sync = async () => {
          if (mode === "sync-error")
            throw Error("Injected directory synchronization error");
          await sync();
          await pause();
        };
      }
      return h;
    };
  }
}
