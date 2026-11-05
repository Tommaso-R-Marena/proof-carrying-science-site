/** Records one verified input tick per animation frame. This is automated replay, never human playtest evidence. */
import { createServer } from "vite";
import { chromium } from "@playwright/test";
import { mkdir, readFile, writeFile, copyFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { verifyReplay, checksum, type Replay } from "../src/sim";
const source = process.argv[2];
if (!source)
  throw Error(
    "Usage: npm run demo:record -- <mailroom-replay.json> (seed42, current build)",
  );
const raw = await readFile(source, "utf8");
if (raw.length > 2_000_000) throw Error("Replay too large");
const replay = JSON.parse(raw) as Replay;
const verified = verifyReplay(replay);
if (
  !verified.valid ||
  verified.state?.status !== "won" ||
  verified.state?.mode !== "heist" ||
  replay.mission !== "mailroom" ||
  replay.seed !== 42
)
  throw Error(
    "Requires a verified winning current-build Mailroom replay with seed42.",
  );
const output = `results/demo-${randomUUID()}`;
await mkdir(output, { recursive: true });
await writeFile(output + "/replay.json", raw, { flag: "wx" });
const server = await createServer({
  mode: "e2e",
  server: { host: "127.0.0.1", port: 5179, strictPort: true },
});
await server.listen();
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHAOS_CHROMIUM
    ? { executablePath: process.env.CHAOS_CHROMIUM }
    : {}),
});
try {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    recordVideo: { dir: output, size: { width: 1280, height: 900 } },
  });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("http://127.0.0.1:5179");
  // Freeze before the first game frame, then feed only the validated player actions. No world writes.
  await page.evaluate(() =>
    new MutationObserver(() => {
      if (document.querySelector("canvas")) window.__chaos.manual(true);
    }).observe(document.body, { childList: true, subtree: true }),
  );
  await page.getByRole("button", { name: "Play now" }).click();
  await page.locator("canvas").waitFor();
  await page.evaluate(() => {
    const tag = document.createElement("div");
    tag.textContent = "SILENT AUTOMATED INPUT REPLAY · NOT A HUMAN PLAYTEST";
    tag.style.cssText =
      "position:fixed;top:6px;right:12px;z-index:20;color:#f2dfb9;background:#102e36;padding:5px 8px;font:10px system-ui;pointer-events:none";
    document.body.append(tag);
  });
  const start = await page.evaluate(() => window.__chaos.getState());
  if (start.tick !== 0) throw Error("Replay must begin before tick1");
  const playbackTiming = await page.evaluate(async (inputs) => {
    const start = performance.now();
    for (const input of inputs) {
      window.__chaos.advance([input]);
      await new Promise<number>((resolve) => requestAnimationFrame(resolve));
    }
    return { wallMs: performance.now() - start, inputTicks: inputs.length };
  }, replay.inputs);
  await page.getByRole("heading", { name: "Mayhem complete!" }).waitFor();
  const final = await page.evaluate(() => window.__chaos.getState());
  final.paused = false;
  if (checksum(final) !== replay.finalChecksum || errors.length)
    throw Error("Recorded replay diverged: " + JSON.stringify(errors));
  // Hold the actual result card for readability in the recording.
  await page.waitForTimeout(1500);
  await page.screenshot({ path: output + "/completed.png" });
  const video = page.video()!;
  await context.close();
  await copyFile(await video.path(), output + "/mailroom.webm");
  await writeFile(
    output + "/report.json",
    JSON.stringify(
      {
        kind: "silent automated input replay, not human feedback",
        build: replay.build,
        seed: replay.seed,
        ticks: final.tick,
        gameSeconds: final.tick / 60,
        banked: final.mail!.banked,
        hearts: final.player.hp,
        methods: final.mail!.methods,
        secondRoute: final.mail!.secondRoute,
        escaped: final.status === "won" && final.mail!.escapeDeadline !== null,
        checksum: checksum(final),
        matchesVerifiedReplay: true,
        playbackTiming,
        renderCaveat:
          "One input tick per animation frame, nominally 60 fps; actual wall duration is reported separately. Rendering hit-stop does not delay the input feed. No audio is captured.",
      },
      null,
      2,
    ) + "\n",
    { flag: "wx" },
  );
  console.log(
    JSON.stringify({
      output,
      video: output + "/mailroom.webm",
      matchesVerifiedReplay: true,
    }),
  );
} finally {
  await browser.close();
  await server.close();
}
