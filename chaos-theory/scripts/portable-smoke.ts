/** Opens the real production file offline. Browser ownership and unsigned files are not immutable roots. */
import { chromium, firefox } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";
import { readFile, writeFile } from "node:fs/promises";
import { buildPortable } from "./portable-build";
import { verifyNoticePack } from "../src/notices";
const build = await buildPortable(),
  observations = [],
  tamperChecks = [];
for (const type of [chromium, firefox]) {
  const browser = await type.launch({
    headless: true,
    ...(type === chromium && process.env.CHAOS_CHROMIUM
      ? { executablePath: process.env.CHAOS_CHROMIUM }
      : {}),
  });
  try {
    for (const viewport of [
      { width: 1280, height: 900 },
      { width: 390, height: 844 },
    ]) {
      const context = await browser.newContext({ viewport, offline: true }),
        page = await context.newPage(),
        errors: string[] = [],
        external: string[] = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      page.on("console", (m) => {
        if (m.type() === "error") errors.push(m.text());
      });
      page.on("request", (r) => {
        if (
          !r.url().startsWith("file:") &&
          !r.url().startsWith("data:") &&
          !r.url().startsWith("blob:")
        )
          external.push(r.url());
      });
      await page.goto(pathToFileURL(resolve(build.file)).href);
      try {
        await page
          .getByRole("button", { name: "Play now" })
          .waitFor({ timeout: 5000 });
      } catch {
        throw Error(
          JSON.stringify({
            browser: type.name(),
            errors,
            external,
            kind: "portable start failed",
          }),
        );
      }
      if (await page.locator('script[src],link[rel="stylesheet"]').count())
        throw Error("External script/style in portable file.");
      if (await page.evaluate(() => Object.hasOwn(window, "__chaos")))
        throw Error("Test controller in portable file.");
      await page.getByRole("button", { name: "Play now" }).click();
      await page.locator("canvas").waitFor();
      await page.keyboard.down("d");
      await page.waitForTimeout(350);
      await page.keyboard.up("d");
      await page.keyboard.press("Escape");
      await page.getByRole("dialog", { name: "Game paused" }).waitFor();
      await page.getByRole("button", { name: "Retry", exact: true }).click();
      await page.locator("canvas").waitFor();
      if ((await page.locator("canvas").count()) !== 1)
        throw Error("Duplicate renderer.");
      await page.keyboard.press("Escape");
      await page.getByRole("button", { name: "Home", exact: true }).click();
      await page.getByRole("button", { name: "Help test AI" }).click();
      await page
        .getByLabel("Include this note in a downloadable evaluation pack")
        .check();
      await page
        .getByRole("button", { name: "Check export", exact: true })
        .click();
      await page.getByText(/Ready. Note only/).waitFor();
      const download = page.waitForEvent("download");
      await page
        .getByRole("button", { name: "Download research pack" })
        .click();
      const file = await (await download).path();
      if (!file) throw Error("No portable export file.");
      await verifyNoticePack(JSON.parse(await readFile(file, "utf8")));
      if (errors.length || external.length)
        throw Error(
          JSON.stringify({ browser: type.name(), viewport, errors, external }),
        );
      await page.screenshot({
        path: `${build.output}/${type.name()}-${viewport.width}.png`,
        fullPage: true,
      });
      observations.push({
        browser: type.name(),
        version: browser.version(),
        viewport,
        offline: true,
        pageErrors: errors.length,
        externalRequests: external.length,
        testController: false,
        localNoticeExportVerified: true,
      });
      await context.close();
    }
    const original = await readFile(build.file, "utf8");
    const tampered = original.replace(
      '<script type="module">',
      '<script type="module">/* altered code */',
    );
    const negativeFile = build.output + "/negative-script-tamper.html";
    await writeFile(negativeFile, tampered);
    const page = await browser.newPage();
    const violation = page.waitForEvent("console", {
      predicate: (m) =>
        /Content.Security.Policy|violates.*script-src|blocked.*script/i.test(
          m.text(),
        ),
      timeout: 5000,
    });
    await page.goto(pathToFileURL(resolve(negativeFile)).href);
    await violation;
    if (await page.getByRole("button", { name: "Play now" }).count())
      throw Error("Altered inline script was executed.");
    tamperChecks.push({
      browser: type.name(),
      modifiedCodeBlocked: true,
      policyUnchanged: true,
    });
    await page.close();
  } finally {
    await browser.close();
  }
}
const report = {
  version: 1,
  kind: "automated production-file smoke, not a human playtest",
  build,
  observations,
  tamperChecks,
};
await writeFile(
  build.output + "/smoke-report.json",
  JSON.stringify(report, null, 2) + "\n",
  { flag: "wx" },
);
console.log(
  JSON.stringify({ output: build.output, observations, tamperChecks }, null, 2),
);
