import { readFile, stat } from "node:fs/promises";
import { summarizePlaytest } from "../src/playtest";
const path = process.argv[2];
if (!path)
  throw Error(
    "Usage: npm run playtest:analyze -- <local-export.json>. No file is uploaded.",
  );
if ((await stat(path)).size > 1000000)
  throw Error("Playtest file exceeds 1 MB limit");
const raw = await readFile(path, "utf8");
if (raw.length > 1000000) throw Error("Playtest file exceeds 1 MB limit");
console.log(JSON.stringify(summarizePlaytest(JSON.parse(raw)), null, 2));
