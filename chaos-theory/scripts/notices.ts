import { mkdir, readFile, writeFile } from "node:fs/promises";
const lock = JSON.parse(await readFile("package-lock.json", "utf8")) as {
  packages: Record<
    string,
    { version?: string; license?: string; dev?: boolean }
  >;
};
const rows = [];
for (const [path, p] of Object.entries(lock.packages)) {
  if (!path || p.dev) continue;
  const name = path.slice(path.lastIndexOf("node_modules/") + 13);
  rows.push(
    `| ${name} | ${p.version} | ${p.license ?? "See package license"} |`,
  );
}
const summary =
  "# Third-party notices\n\nOriginal game code, graphics, and synthesized sound are under the included MIT license. No downloaded art, music, fonts, or training data are included. Runtime dependency metadata from the exact lockfile is listed below. Complete runtime license texts are shipped in public/third-party-notices.txt and copied into the static build. Server-only dependencies are not bundled into gameplay. Development tooling has its own licenses in node_modules.\n\n| Package | Version | License |\n| --- | --- | --- |\n" +
  rows.sort().join("\n") +
  "\n";
await writeFile("THIRD_PARTY_NOTICES.md", summary);
let notices = summary;
for (const path of [
  "phaser/LICENSE.md",
  "eventemitter3/LICENSE",
  "zod/LICENSE",
  "openai/LICENSE",
  "openai/src/_vendor/partial-json-parser/LICENSE",
  "openai/src/_vendor/zod-to-json-schema/LICENSE",
  "openai/src/internal/qs/LICENSE.md",
])
  notices +=
    "\n\n" + path + "\n\n" + (await readFile("node_modules/" + path, "utf8"));
await mkdir("public", { recursive: true });
await writeFile(
  "public/third-party-notices.txt",
  notices.replace(/\r\n/g, "\n"),
);
await writeFile("public/LICENSE.txt", await readFile("LICENSE", "utf8"));
