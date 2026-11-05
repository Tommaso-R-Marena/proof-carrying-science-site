import { it, expect } from "vitest";
import {
  PlaytestRecorder,
  playtestSchema,
  summarizePlaytest,
} from "../src/playtest";
import { createGame, step, EMPTY_INPUT } from "../src/sim";
it("does nothing without consent and never stores raw input or personal fields", () => {
  const r = new PlaytestRecorder(),
    s = createGame("mailroom", 42);
  r.begin(s, 0);
  r.observe(s, 10);
  r.finish(s, 20, "abandoned");
  expect(r.snapshot()).toBeNull();
  r.optIn("automated-test", "fixture-session");
  r.begin(s, 100);
  step(s, { ...EMPTY_INPUT, x: 1, fire: true });
  r.observe(s, 200);
  r.finish(s, 300, "abandoned");
  const v = r.snapshot()!;
  expect(v.mode).toBe("automated-test");
  expect(v.observations[0].firstMoveMs).toBe(100);
  expect(v.observations[0].firstGadgetMs).toBe(100);
  expect(v.observations[0].wallMs).toBe(200);
  expect(JSON.stringify(v)).not.toMatch(/email|keyCode|userAgent/);
});
it("records once, counts actual retry clicks, validates optional feedback and deletes locally", () => {
  const r = new PlaytestRecorder(),
    s = createGame("mailroom", 42);
  r.optIn("automated-test", "fixture-session");
  r.begin(s, 0);
  r.finish(s, 1, "abandoned");
  r.finish(s, 2, "lost");
  r.choose("retry-click");
  r.feedback("clarity", "sometimes-unclear");
  expect(() => r.feedback("again", "script")).toThrow();
  expect(r.snapshot()!.observations).toHaveLength(1);
  expect(summarizePlaytest(r.snapshot()).retryClicks).toBe(1);
  r.clear();
  expect(r.snapshot()).toBeNull();
});
it("caps records and time, rejects malformed imports, and distinguishes missing observations", () => {
  const r = new PlaytestRecorder(),
    s = createGame("mailroom", 42);
  r.optIn("automated-test", "fixture-session");
  expect(summarizePlaytest(r.snapshot()).medianFirstMoveMs).toBeNull();
  for (let i = 0; i < 30; i++) {
    r.begin(s, 0);
    r.finish(s, 86400001, "abandoned");
  }
  expect(r.snapshot()!.observations).toHaveLength(20);
  expect(r.snapshot()!.observations[0].wallTimeCapped).toBe(true);
  expect(() =>
    playtestSchema.parse({ ...r.snapshot(), email: "do-not-record" }),
  ).toThrow();
  expect(() =>
    playtestSchema.parse({ ...r.snapshot(), consent: false }),
  ).toThrow();
});
it("records actual pickup/deposit/hit milestones and keeps skipped feedback separate from observed choices", () => {
  const r = new PlaytestRecorder(),
    s = createGame("mailroom", 42);
  s.bots[0].carrying = false;
  s.mail!.loose = { x: 120, y: 300 };
  r.optIn("automated-test", "fixture-milestones");
  r.optIn("automated-test", "must-not-reset");
  r.begin(s, 100);
  r.begin(s, 9999);
  step(s, { ...EMPTY_INPUT, interact: true });
  r.observe(s, 200);
  expect(s.mail!.carrying).toBe(true);
  s.player.x = 120;
  s.player.y = 470;
  step(s, EMPTY_INPUT);
  step(s, { ...EMPTY_INPUT, interact: true });
  s.player.hp = 2;
  r.observe(s, 300);
  r.finish(s, 400, "abandoned");
  const a = r.snapshot()!.observations[0];
  expect(a.firstPickupMs).toBe(100);
  expect(a.firstBankMs).toBe(200);
  expect(a.hits).toBe(1);
  expect(a.firstGadgetMs).toBeNull();
  expect(a.wallMs).toBe(300);
  expect(r.snapshot()!.session).toBe("fixture-milestones");
  r.feedback("tactics", "several");
  r.feedback("again", "yes");
  const report = summarizePlaytest(r.snapshot());
  expect(report.requestedAnother).toBe(1);
  expect(report.retryClicks).toBe(0);
  expect(report.clarityAnswers).toBe(0);
});
it("lets an optional answer be cleared back to skipped", () => {
  const r = new PlaytestRecorder(),
    s = createGame("mailroom", 42);
  r.optIn("automated-test", "fixture-skip");
  r.begin(s, 0);
  r.finish(s, 1, "abandoned");
  r.feedback("again", "yes");
  expect(summarizePlaytest(r.snapshot()).requestedAnother).toBe(1);
  r.feedback("again", null);
  expect(r.snapshot()!.observations[0].feedback.again).toBeNull();
  expect(summarizePlaytest(r.snapshot()).requestedAnother).toBe(0);
});
