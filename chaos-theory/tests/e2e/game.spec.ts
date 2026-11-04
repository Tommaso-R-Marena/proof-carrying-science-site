import { readFile, writeFile, mkdir } from "node:fs/promises";
import { verifyScenario } from "../../src/research";
import { test, expect, type Page } from "@playwright/test";
import {
  nextWaypoint,
  blocked,
  verifyReplay,
  lineOfSight,
  EMPTY_INPUT,
  type Input,
  type GameState,
} from "../../src/sim";
declare global {
  interface Window {
    __chaos: {
      getState: () => GameState;
      advance: (a: Partial<Input>[]) => void;
      manual: (v: boolean) => void;
      getReplay: () => unknown;
    };
  }
}
const errors: string[] = [];
test.beforeEach(async ({ page }) => {
  errors.length = 0;
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
});
test.afterEach(() => {
  expect(errors).toEqual([]);
});
async function freeze(page: Page) {
  await page.locator("canvas").waitFor();
  await page.evaluate(() => window.__chaos.manual(true));
}
async function state(page: Page) {
  return page.evaluate(() => window.__chaos.getState());
}
async function advance(page: Page, n: number, input: Partial<Input> = {}) {
  await page.evaluate(
    ({ n, input }) =>
      window.__chaos.advance(Array.from({ length: n }, () => input)),
    { n, input },
  );
}
async function drive(page: Page, to: { x: number; y: number }, gadget = 0) {
  for (let i = 0; i < 160; i++) {
    const s = await state(page);
    if (s.status !== "playing")
      throw new Error(`Run ended at ${s.player.x},${s.player.y}: ${s.status}`);
    if (Math.hypot(s.player.x - to.x, s.player.y - to.y) < 42) return;
    const p = nextWaypoint(s, s.player, to);
    if (!p) throw new Error("No reachable route");
    const dx = p.x - s.player.x,
      dy = p.y - s.player.y,
      n = Math.hypot(dx, dy);
    const enemy = s.bots
      .filter((b) => b.kind === "sentinel")
      .sort(
        (a, b) =>
          Math.hypot(a.x - s.player.x, a.y - s.player.y) -
          Math.hypot(b.x - s.player.x, b.y - s.player.y),
      )[0];
    const ax = enemy.x - s.player.x,
      ay = enemy.y - s.player.y,
      an = Math.hypot(ax, ay) || 1;
    await advance(page, 6, {
      x: dx / n,
      y: dy / n,
      aimX: ax / an,
      aimY: ay / an,
      fire:
        gadget === 0 &&
        Math.hypot(ax, ay) < 240 &&
        lineOfSight(s, s.player, enemy),
      gadget: gadget as Input["gadget"],
      dash: i % 24 === 0,
    });
  }
  throw new Error("Route took too long");
}
async function interact(page: Page) {
  await advance(page, 1, { interact: false });
  await advance(page, 1, { interact: true });
}
async function beacon(page: Page) {
  const s = await state(page);
  const sign = s.props.find((p) => p.kind === "sign")!;
  await drive(page, { x: sign.x - 80, y: sign.y });
  await advance(page, 1, { fire: false });
  await advance(page, 1, { gadget: 3, fire: true, aimX: 1, aimY: 0 });
  await advance(page, 1, { gadget: 3, fire: false });
}
async function begin(page: Page, mission = "mailroom") {
  // Stop before tick 1 so manual controllers do not depend on browser loading speed.
  // This only switches input scheduling; every world transition still uses valid inputs.
  await page.evaluate(() => {
    const observer = new MutationObserver(() => {
      if (document.querySelector("canvas")) {
        window.__chaos.manual(true);
        observer.disconnect();
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  });
  if (mission === "mailroom")
    await page.getByRole("button", { name: "Play now" }).click();
  else {
    await page.getByRole("button", { name: "Choose a mission" }).click();
    await page
      .getByRole("article")
      .filter({
        has: page.getByRole("heading", {
          name: mission === "vault" ? "Vault Panic" : "Reactor Rush",
        }),
      })
      .getByRole("button", { name: "Play mission" })
      .click();
  }
  await freeze(page);
  expect((await state(page)).tick).toBe(0);
}
test("title, menus, settings, privacy and local persistence", async ({
  page,
}) => {
  await expect(page.getByRole("heading", { name: /SMALL BOT/ })).toBeVisible();
  await page.screenshot({
    path: `evidence/mailroom-v3/menu-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Options ↗" }).click();
  await page.getByLabel("Mute sound").check();
  await page.getByLabel("Reduce motion").check();
  await page.reload();
  await page.getByRole("button", { name: "Options ↗" }).click();
  await expect(page.getByLabel("Mute sound")).toBeChecked();
  await expect(page.getByLabel("Reduce motion")).toBeChecked();
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await page.getByRole("button", { name: "How to play" }).click();
  await expect(
    page.getByRole("heading", { name: "1. Move & dash" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await page.getByRole("button", { name: "Research & privacy" }).click();
  await page.getByText("What gets uploaded?").click();
  await expect(page.getByText(/Nothing automatically/)).toBeVisible();
  await page.getByRole("button", { name: "← Back", exact: true }).click();
  await page.getByRole("button", { name: "Credits" }).click();
  await expect(page.getByText(/No third-party art/)).toBeVisible();
});
test("visible keyboard movement, aim, gadgets and pause", async ({ page }) => {
  await begin(page);
  await page.evaluate(() => window.__chaos.manual(false));
  const initial = await state(page);
  await page.keyboard.down("d");
  await expect
    .poll(async () => (await state(page)).player.x)
    .toBeGreaterThan(initial.player.x + 35);
  await page.keyboard.up("d");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Game paused" })).toBeVisible();
  const before = (await state(page)).tick;
  await page.evaluate(() =>
    window.__chaos.advance(Array.from({ length: 60 }, () => ({ x: 1 }))),
  );
  expect((await state(page)).tick).toBe(before);
  await page.getByRole("button", { name: "Resume" }).click();
  await page.evaluate(() => window.__chaos.manual(true));
  await page.evaluate(() => window.__chaos.manual(false));
  await page.getByRole("button", { name: /Gadget 1:/ }).click();
  await page.keyboard.down("j");
  await expect
    .poll(async () => (await state(page)).shots.length)
    .toBeGreaterThan(0);
  await page.keyboard.up("j");
  await page.getByRole("button", { name: /Gadget 2:/ }).click();
  await page.keyboard.down("j");
  await expect.poll(async () => (await state(page)).decoy).not.toBeNull();
  await page.keyboard.up("j");
  await page.evaluate(() => window.__chaos.manual(true));
  await page.screenshot({
    path: `evidence/mailroom-v3/gadgets-${test.info().project.name}.png`,
    fullPage: true,
  });
});
for (const secondRoute of ["sorter", "carried"] as const) {
  test(`mailroom completed through valid inputs (${secondRoute}); export scenario and fixture comparison`, async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Options ↗" }).click();
    await page.getByLabel("Keep research scenarios this session").check();
    await page.getByRole("button", { name: "← Back", exact: true }).click();
    await begin(page);
    await beacon(page);
    expect((await state(page)).events.length).toBe(1);
    await page.screenshot({
      path: `evidence/mailroom-v3/${secondRoute}/live-arena-${test.info().project.name}.png`,
      fullPage: true,
    });
    // Quiet first haul: lure security away, hack a useful shortcut, follow the redirected parcel.
    await advance(page, 1, { gadget: 1, fire: true, aimX: 0, aimY: 1 });
    await advance(page, 1, { fire: false });
    await drive(page, { x: 395, y: 300 }, 3);
    await advance(page, 1, { fire: false });
    await advance(page, 1, { gadget: 2, fire: true });
    await advance(page, 1, { fire: false });
    const dock = (await state(page)).props.find((p) => p.id === "dock-b")!;
    await drive(page, dock, 3);
    for (let i = 0; i < 30 && !(await state(page)).mail!.loose; i++)
      await advance(page, 6, { fire: false });
    await interact(page);
    expect((await state(page)).mail!.carrying).toBe(true);
    await drive(page, { x: 120, y: 470 });
    await interact(page);
    expect((await state(page)).mail!.banked).toBe(1);
    await page.screenshot({
      path: `evidence/mailroom-v3/${secondRoute}/first-haul-${test.info().project.name}.png`,
      fullPage: true,
    });
    // Two active interceptions use real foam shots and E, with every bot still running.
    for (let haul = 1; haul < 3; haul++) {
      // Defense can delay interception; the real 75-second round still bounds this controller.
      for (let j = 0; j < 480 && !(await state(page)).mail!.carrying; j++) {
        const s = await state(page),
          c = s.bots.find((b) => b.kind === "courier")!;
        if (s.status !== "playing")
          throw Error("Mailroom ended before three hauls: " + s.status);
        const d = Math.hypot(c.x - s.player.x, c.y - s.player.y);
        const threat = s.bots
          .filter(
            (b) =>
              b.kind === "sentinel" &&
              b.arriving === 0 &&
              b.stun < 25 &&
              lineOfSight(s, s.player, b),
          )
          .sort(
            (a, b) =>
              Math.hypot(a.x - s.player.x, a.y - s.player.y) -
              Math.hypot(b.x - s.player.x, b.y - s.player.y),
          )[0];
        if (
          threat &&
          Math.hypot(threat.x - s.player.x, threat.y - s.player.y) < 160
        ) {
          if (s.player.cooldowns[1] === 0) {
            const dirs = [
              [1, 0],
              [0, 1],
              [-1, 0],
              [0, -1],
            ];
            const dir = dirs.find(
              ([x, y]) =>
                !blocked(s, s.player.x + x * 150, s.player.y + y * 150) &&
                lineOfSight(s, s.player, {
                  x: s.player.x + x * 150,
                  y: s.player.y + y * 150,
                }),
            );
            if (dir) {
              await advance(page, 1, { fire: false });
              await advance(page, 1, {
                gadget: 1,
                fire: true,
                aimX: dir[0],
                aimY: dir[1],
              });
              continue;
            }
          }
          const tx = threat.x - s.player.x,
            ty = threat.y - s.player.y,
            n = Math.hypot(tx, ty) || 1;
          await advance(page, 6, {
            gadget: 0,
            fire: true,
            aimX: tx / n,
            aimY: ty / n,
          });
          continue;
        }

        if (c.carrying && c.stun > 0 && d < 60) {
          await interact(page);
          break;
        }
        const target = nextWaypoint(s, s.player, c) ?? c;
        const dx = target.x - s.player.x,
          dy = target.y - s.player.y,
          n = Math.hypot(dx, dy) || 1;
        const aimX = (c.x - s.player.x) / (d || 1),
          aimY = (c.y - s.player.y) / (d || 1);
        await advance(page, 6, {
          x: d > 45 ? dx / n : 0,
          y: d > 45 ? dy / n : 0,
          aimX,
          aimY,
          gadget: 0,
          fire: c.carrying && d < 300,
          dash: j % 22 === 0,
        });
      }
      expect(
        (await state(page)).mail!.carrying,
        JSON.stringify(await state(page)),
      ).toBe(true);
      if (haul === 1 && secondRoute === "sorter") {
        await drive(page, { x: 590, y: 300 });
        await advance(page, 1, { fire: false });
        await advance(page, 1, { gadget: 1, fire: true, aimX: 1, aimY: 0 });
        await advance(page, 1, { fire: false });
        await advance(page, 1, { gadget: 2, fire: true });
        await advance(page, 1, { fire: false });
        expect(
          (await state(page)).props.find((p) => p.kind === "conveyor")!.active,
        ).toBe(true);
        await interact(page);
        expect((await state(page)).mail!.transit).toBe("moving");
        await drive(page, { x: 360, y: 360 }, 3);
        for (
          let n = 0;
          n < 50 && (await state(page)).mail!.transit !== "ready";
          n++
        )
          await advance(page, 3, { fire: false });
        await page.screenshot({
          path: `evidence/mailroom-v3/${secondRoute}/sorter-${test.info().project.name}.png`,
          fullPage: true,
        });
        await interact(page);
        expect((await state(page)).mail!.carrying).toBe(true);
      }
      await drive(page, { x: 120, y: 470 });
      await interact(page);
      if (haul === 1)
        await page.screenshot({
          path: `evidence/mailroom-v3/${secondRoute}/backup-${test.info().project.name}.png`,
          fullPage: true,
        });
    }
    expect((await state(page)).mail!.banked).toBe(3);
    expect((await state(page)).status).toBe("playing");
    expect((await state(page)).mail!.secondRoute).toBe(secondRoute);
    await page.screenshot({
      path: `evidence/mailroom-v3/${secondRoute}/escape-${test.info().project.name}.png`,
      fullPage: true,
    });
    await drive(page, { x: 850, y: 300 });
    await interact(page);

    const exportedReplay = await page.evaluate(() =>
      window.__chaos.getReplay(),
    );
    const independentReplay = verifyReplay(exportedReplay);
    expect(independentReplay.valid, independentReplay.reason).toBe(true);
    expect(independentReplay.state!.mail!.banked).toBe(3);
    await mkdir("results", { recursive: true });
    await writeFile(
      `results/mailroom-${secondRoute}-replay-${test.info().project.name}.json`,
      JSON.stringify(
        await page.evaluate(() => window.__chaos.getReplay()),
        null,
        2,
      ),
    );
    const completed = await state(page);
    await writeFile(
      `results/mailroom-${secondRoute}-run-${test.info().project.name}.json`,
      JSON.stringify(
        {
          kind: "automated valid-input browser play, not a human study",
          seed: completed.seed,
          ticks: completed.tick,
          gameSeconds: completed.tick / 60,
          score: completed.score,
          hearts: completed.player.hp,
          banked: completed.mail!.banked,
          methods: completed.mail!.methods,
          backup: completed.bots.some((b) => b.id === "backup"),
          secondRoute: completed.mail!.secondRoute,
          escaped:
            completed.status === "won" &&
            completed.mail!.escapeDeadline !== null,
          events: completed.events,
        },
        null,
        2,
      ),
    );
    expect((await state(page)).mail!.methods.sort()).toEqual([
      "intercept",
      "redirect",
    ]);
    await expect(
      page.getByRole("heading", { name: "Mayhem complete!" }),
    ).toBeVisible();
    await page.screenshot({
      path: `evidence/mailroom-v3/${secondRoute}/victory-${test.info().project.name}.png`,
      fullPage: true,
    });
    await page
      .getByRole("button", { name: "Research Lab", exact: true })
      .click();
    await expect(page.getByText(/Real-model test not run/)).toBeVisible();
    await page.getByRole("button", { name: "Run fixture comparison" }).click();
    await expect(page.getByText(/Tool guard blocked execution/)).toBeVisible();
    await page.screenshot({
      path: `evidence/mailroom-v3/${secondRoute}/research-lab-${test.info().project.name}.png`,
      fullPage: true,
    });
    const dl = page.waitForEvent("download");
    await page.getByRole("button", { name: "Export scenario JSON" }).click();
    const artifact = await dl;
    expect(artifact.suggestedFilename()).toMatch(/^scenario-.*\.json$/);
    const data = JSON.parse(await readFile((await artifact.path())!, "utf8"));
    expect((await verifyScenario(data)).family).toBe("delivery-sign");
  });
}
test("vault complete through valid movement, notice, collection and escape", async ({
  page,
}) => {
  await begin(page, "vault");
  await beacon(page);
  await drive(page, { x: 790, y: 165 });
  await interact(page);
  expect((await state(page)).phase).toBe(1);
  await drive(page, { x: 640, y: 300 });
  const s = await state(page);
  if (!s.props.find((p) => p.kind === "door")!.active) {
    await advance(page, 1, { fire: false });
    await advance(page, 1, { fire: true, gadget: 2 });
  }
  await drive(page, { x: 120, y: 500 });
  await interact(page);
  await expect(
    page.getByRole("heading", { name: "Mayhem complete!" }),
  ).toBeVisible();
});
test("reactor complete with three actual switches and core interaction", async ({
  page,
}) => {
  await begin(page, "reactor");
  for (const id of ["switch-1", "switch-2", "switch-3"]) {
    const p = (await state(page)).props.find((p) => p.id === id)!;
    await drive(page, p);
    await interact(page);
  }
  await drive(page, { x: 825, y: 455 });
  await interact(page);
  await expect(
    page.getByRole("heading", { name: "Mayhem complete!" }),
  ).toBeVisible();
});
test("timeout, retry and deterministic reset", async ({ page }) => {
  await begin(page);
  await advance(page, 4500, { ...EMPTY_INPUT });
  await expect(
    page.getByRole("heading", { name: "One more try?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Play again" }).click();
  await freeze(page);
  const s = await state(page);
  expect(s.status).toBe("playing");
  expect(s.player.hp).toBe(3);
  expect(s.events).toEqual([]);
  expect(s.score).toBe(0);
});
test("optional lab has no fabricated model results and no data uploads", async ({
  page,
}) => {
  const outgoing: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") outgoing.push(r.url());
  });
  await page.getByRole("button", { name: "Research Lab" }).click();
  await expect(page.getByText("No mapped trick yet.")).toBeVisible();
  await expect(page.getByText(/Real-model test not run/)).toBeVisible();
  expect(outgoing).toEqual([]);
});
test("narrow phone layout and genuine touch controls", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await page.screenshot({
    path: `evidence/mailroom-v3/mobile-menu-${test.info().project.name}.png`,
    fullPage: true,
  });
  await begin(page);
  await expect(
    page.getByRole("button", { name: "Move right", exact: true }),
  ).toBeVisible();
  await page.evaluate(() => window.__chaos.manual(false));
  const x = (await state(page)).player.x;
  const right = page.getByRole("button", { name: "Move right", exact: true });
  const box = (await right.boundingBox())!;
  const pos = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  if (test.info().project.name === "chromium") {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [{ ...pos, id: 1 }],
    });
    await expect
      .poll(async () => (await state(page)).player.x)
      .toBeGreaterThan(x + 25);
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await cdp.detach();
  } else {
    // Firefox's Playwright protocol has no equivalent held-touch API; exercise the same D-pad with a real pointer.
    await page.mouse.move(pos.x, pos.y);
    await page.mouse.down();
    await expect
      .poll(async () => (await state(page)).player.x)
      .toBeGreaterThan(x + 25);
    await page.mouse.up();
  }
  await page.evaluate(() => window.__chaos.manual(true));
  await page.screenshot({
    path: `evidence/mailroom-v3/mobile-arena-${test.info().project.name}.png`,
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("keyboard focus reaches primary action and all buttons have names", async ({
  page,
}) => {
  await page.keyboard.press("Tab");
  await expect(
    page.getByRole("button", { name: "Chaos Theory home" }),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.getByRole("button", { name: "Play now" })).toBeFocused();
  await page.keyboard.press("Enter");
  await page.locator("canvas").waitFor();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("button", { name: "Resume" })).toBeFocused();
  await page.keyboard.press(" ");
  await expect(page.getByRole("dialog", { name: "Game paused" })).toHaveCount(
    0,
  );
  const names = await page
    .locator("button")
    .evaluateAll((bs) =>
      bs.map((b) => b.getAttribute("aria-label") || b.textContent?.trim()),
    );
  expect(names.every(Boolean)).toBe(true);
});

test("storage denied still gives a playable game", async ({ page }) => {
  await page.addInitScript(() =>
    Object.defineProperty(window, "localStorage", {
      get() {
        throw new DOMException("Storage blocked", "SecurityError");
      },
    }),
  );
  await page.reload();
  await begin(page);
  expect((await state(page)).player.hp).toBe(3);
});
test("optional local playtest is consented, skippable, exportable and deletable without uploads", async ({
  page,
}) => {
  const posts: string[] = [];
  page.on("request", (r) => {
    if (r.method() === "POST") posts.push(r.url());
  });
  await page.getByRole("button", { name: "Play & give feedback" }).click();
  await expect(
    page.getByRole("button", { name: "Start a local playtest" }),
  ).toBeDisabled();
  await page.getByLabel("Record this session on this device").check();
  await page.getByRole("button", { name: "Start a local playtest" }).click();
  await freeze(page);
  await advance(page, 4500);
  await expect(
    page.getByRole("heading", { name: "One more try?" }),
  ).toBeVisible();
  await page.getByText("Feedback (optional)", { exact: true }).click();
  await page
    .getByLabel("Was the next step clear?")
    .selectOption("sometimes-unclear");
  await page.getByRole("button", { name: "Play again" }).click();
  await freeze(page);
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Home", exact: true }).click();
  await page.getByRole("button", { name: "Play & give feedback" }).click();
  await expect(page.getByText(/2 finished runs/)).toBeVisible();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export local observations" }).click();
  const file = await download;
  const data = JSON.parse(await readFile((await file.path())!, "utf8"));
  await writeFile(
    `results/playtest-${test.info().project.name}.json`,
    JSON.stringify(data, null, 2),
  );
  expect(data.mode).toBe("automated-test");
  expect(data.observations).toHaveLength(2);
  expect(data.observations[0].choice).toBe("retry-click");
  expect(data.observations[0].feedback.clarity).toBe("sometimes-unclear");
  expect(data.observations[1].outcome).toBe("abandoned");
  await page.screenshot({
    path: `evidence/mailroom-v3/playtest-${test.info().project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "Stop & delete observations" })
    .click();
  await expect(
    page.getByRole("button", { name: "Start a local playtest" }),
  ).toBeDisabled();
  expect(posts).toEqual([]);
});
