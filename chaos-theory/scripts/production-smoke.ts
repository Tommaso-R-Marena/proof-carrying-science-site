/** Actual production browser smoke and frame sampling. No test controller or model calls. */
import { preview } from "vite";
import { chromium } from "@playwright/test";
import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { gzipSync } from "node:zlib";
const assets = [];
for (const name of await readdir("dist/assets")) {
  const data = await readFile("dist/assets/" + name);
  if (/__chaos|OPENAI_API_KEY|api\.openai\.com/.test(data.toString()))
    throw new Error(
      "Test controller or server-only adapter leaked into production assets",
    );
  assets.push({ name, bytes: data.length, gzipBytes: gzipSync(data).length });
}
const server = await preview({
  preview: { host: "127.0.0.1", port: 5180, strictPort: true },
});
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHAOS_CHROMIUM
    ? { executablePath: process.env.CHAOS_CHROMIUM }
    : {}),
});
try {
  const observations = [];
  for (const viewport of [
    { width: 1280, height: 900 },
    { width: 390, height: 844 },
  ]) {
    const page = await browser.newPage({ viewport });
    const errors: string[] = [];
    const external: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("request", (r) => {
      if (
        !r.url().startsWith("http://127.0.0.1:5180") &&
        !r.url().startsWith("data:")
      )
        external.push(r.url());
    });
    page.on("response", (r) => {
      if (r.status() >= 400) errors.push(`HTTP ${r.status()} ${r.url()}`);
    });
    await page.goto("http://127.0.0.1:5180");
    if (await page.evaluate(() => Object.hasOwn(window, "__chaos")))
      throw new Error("Production test controller exposed");
    await page.getByRole("button", { name: "Play now" }).click();
    await page.locator("canvas").waitFor();
    const samples = await page.evaluate<number[]>(
      `new Promise(resolve=>{const frames=[];let previous=0;function frame(t){if(previous)frames.push(t-previous);previous=t;if(frames.length>=120)resolve(frames);else requestAnimationFrame(frame);}requestAnimationFrame(frame);})`,
    );
    samples.sort((a, b) => a - b);
    const sum = samples.reduce((a, b) => a + b, 0);
    const sample = {
      viewport,
      frames: samples.length,
      meanMs: sum / samples.length,
      p95Ms: samples[Math.floor(samples.length * 0.95)],
      estimatedFPS: (1000 * samples.length) / sum,
    };
    await page.keyboard.press("Escape");
    await page.getByRole("dialog", { name: "Game paused" }).waitFor();
    await page.getByRole("button", { name: "Resume" }).click();
    for (let i = 0; i < 10; i++) {
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page.locator("canvas").waitFor();
      if ((await page.locator("canvas").count()) !== 1)
        throw new Error("Renderer duplicated on restart");
    }
    if (errors.length || external.length)
      throw new Error(JSON.stringify({ errors, external }));
    observations.push({
      ...sample,
      restarts: 10,
      consolePageErrors: errors.length,
      externalRequests: external.length,
      testController: false,
    });
    await page.close();
  }
  await mkdir("results", { recursive: true });
  const path = `results/production-${randomUUID()}.json`;
  const report = {
    version: 1,
    browser: await browser.version(),
    node: process.version,
    hardwareCaveat:
      "Headless browser on this shared Linux executor; viewport sizes do not emulate phone CPU/GPU or human input latency. requestAnimationFrame measures browser frame scheduling, not isolated render cost.",
    assets,
    observations,
  };
  await writeFile(path, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
  console.log(JSON.stringify({ path, ...report }, null, 2));
} finally {
  await browser.close();
  await new Promise<void>((resolve, reject) =>
    server.httpServer.close((e) => (e ? reject(e) : resolve())),
  );
}
