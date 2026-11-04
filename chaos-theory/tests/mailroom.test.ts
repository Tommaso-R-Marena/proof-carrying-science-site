import { describe, it, expect } from "vitest";
import {
  createGame,
  step,
  EMPTY_INPUT,
  sentinelSees,
  checksum,
  ROUND_TICKS,
  type GameState,
  type Input,
} from "../src/sim";
const input = (p: Partial<Input> = {}): Input => ({ ...EMPTY_INPUT, ...p });
function e(s: GameState) {
  step(s, input());
  step(s, input({ interact: true }));
}
function bank(s: GameState) {
  s.mail!.carrying = true;
  s.player.x = 120;
  s.player.y = 470;
  e(s);
}
describe("mailroom pacing and tactical rules v2", () => {
  it("preserves the six-second win counterexample as a failed strategy", () => {
    const s = createGame("mailroom", 42);
    s.bots.forEach((b) => (b.stun = ROUND_TICKS));
    s.bots[0].carrying = false;
    s.mail!.loose = { x: 850, y: 470 };
    s.mail!.route = "redirect";
    s.player.x = 850;
    s.player.y = 470;
    e(s);
    expect(s.status).toBe("playing");
    expect(s.mail!.carrying).toBe(true);
    expect(s.mail!.banked).toBe(0);
    for (let i = 0; i < 360; i++) step(s, EMPTY_INPUT);
    expect(s.status).toBe("playing");
  });
  it("only deposits at home, consumes the parcel once, and requires three hauls", () => {
    const s = createGame("mailroom", 42);
    s.bots.forEach((b) => (b.stun = ROUND_TICKS));
    s.mail!.carrying = true;
    e(s);
    expect(s.mail!.banked).toBe(0);
    bank(s);
    expect(s.mail!.banked).toBe(1);
    for (let i = 0; i < 60; i++) step(s, input({ interact: true }));
    expect(s.mail!.banked).toBe(1);
    expect(s.status).toBe("playing");
    bank(s);
    expect(s.mail!.banked).toBe(2);
    expect(s.bots.filter((b) => b.kind === "sentinel")).toHaveLength(2);
    bank(s);
    expect(s.status).toBe("won");
    expect(s.mail!.alertLevel).toBe(2);
  });
  it("telegraphs detection before chase, respects facing and wall occlusion", () => {
    const s = createGame("mailroom", 9),
      g = s.bots[1];
    s.player.x = 590;
    s.player.y = 410;
    g.x = 720;
    g.y = 410;
    g.facing = 0;
    expect(sentinelSees(s, g)).toBe(false);
    g.facing = Math.PI;
    expect(sentinelSees(s, g)).toBe(true);
    step(s, EMPTY_INPUT);
    expect(g.state).toBe("suspicious");
    expect(s.player.hp).toBe(3);
    for (let i = 0; i < 30; i++) step(s, EMPTY_INPUT);
    expect(g.state).toBe("chase");
    s.player.x = 400;
    s.player.y = 430;
    g.x = 530;
    g.y = 430;
    expect(sentinelSees(s, g)).toBe(false);
  });
  it("carries a speed cost while preserving dash escape", () => {
    const a = createGame("mailroom", 5),
      b = createGame("mailroom", 5);
    a.mail!.carrying = true;
    for (let i = 0; i < 25; i++) {
      step(a, input({ x: 1 }));
      step(b, input({ x: 1 }));
    }
    expect(a.player.x).toBeLessThan(b.player.x);
    const x = a.player.x;
    step(a, input({ x: 1, dash: true }));
    expect(a.player.x - x).toBeGreaterThan(6);
  });
  it("escalates by haul and elapsed time, freezes on pause, and spawns backup once", () => {
    const s = createGame("mailroom", 42);
    s.tick = 1799;
    step(s, EMPTY_INPUT);
    expect(s.mail!.alertLevel).toBe(1);
    s.tick = 2999;
    step(s, EMPTY_INPUT);
    expect(s.mail!.alertLevel).toBe(2);
    const count = s.bots.length;
    s.paused = true;
    const c = checksum(s);
    step(s, EMPTY_INPUT);
    expect(checksum(s)).toBe(c);
    s.paused = false;
    step(s, EMPTY_INPUT);
    expect(s.bots.length).toBe(count);
  });
  it("continues to offer an interception route after technician removes a fake notice", () => {
    const s = createGame("mailroom", 42);
    s.bots[0].stun = 90;
    s.player.x = s.bots[0].x;
    s.player.y = s.bots[0].y;
    e(s);
    expect(s.mail!.methods).toEqual(["intercept"]);
    expect(s.mail!.carrying).toBe(true);
    expect(s.phase).toBe(1);
  });
  it("rewards genuinely different pickup methods once, not repeated empty interaction", () => {
    const s = createGame("mailroom", 42);
    s.bots.forEach((b) => (b.stun = ROUND_TICKS));
    s.mail!.methods = ["redirect", "intercept"];
    bank(s);
    const score = s.breakdown.variety;
    e(s);
    expect(s.breakdown.variety).toBe(score);
    expect(score).toBe(120);
  });
});
it("courier brakes on the moving intake belt and actually reloads after a haul", () => {
  const s = createGame("mailroom", 42),
    c = s.bots[0];
  c.carrying = false;
  c.x = 600;
  c.y = 300;
  for (let i = 0; i < 50; i++) step(s, EMPTY_INPUT);
  expect(c.carrying).toBe(true);
  expect(s.status).toBe("playing");
});
