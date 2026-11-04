import { it, expect } from "vitest";
import {
  createGame,
  step,
  EMPTY_INPUT,
  mailBeat,
  ROUND_TICKS,
  checksum,
  type GameState,
  type Input,
} from "../src/sim";
const input = (v: Partial<Input> = {}): Input => ({ ...EMPTY_INPUT, ...v });
function pressE(s: GameState) {
  step(s, input());
  step(s, input({ interact: true }));
}
function quiet(s: GameState) {
  s.bots.forEach((b) => (b.stun = ROUND_TICKS));
}
function bank(s: GameState) {
  s.mail!.carrying = true;
  s.player.x = 120;
  s.player.y = 470;
  pressE(s);
  quiet(s);
}
it("has three beats and requires a separate timed escape after the third bank", () => {
  const s = createGame("mailroom", 42);
  quiet(s);
  expect(mailBeat(s)).toBe(1);
  bank(s);
  expect(mailBeat(s)).toBe(2);
  bank(s);
  expect(mailBeat(s)).toBe(3);
  bank(s);
  expect(s.status).toBe("playing");
  expect(s.mail!.escapeDeadline).toBe(s.tick + 1080);
  s.player.x = 850;
  s.player.y = 300;
  pressE(s);
  expect(s.status).toBe("won");
});
it("expires the escape, freezes the deadline under pause and never grants late victory", () => {
  const s = createGame("mailroom", 42);
  quiet(s);
  bank(s);
  bank(s);
  bank(s);
  s.paused = true;
  const c = checksum(s);
  step(s, EMPTY_INPUT);
  expect(checksum(s)).toBe(c);
  s.paused = false;
  s.tick = s.mail!.escapeDeadline! - 1;
  s.player.x = 850;
  s.player.y = 300;
  step(s, input({ interact: true }));
  expect(s.status).toBe("lost");
});
it("offers a real optional express sorter only on the second haul and recovers a jammed parcel", () => {
  const s = createGame("mailroom", 42);
  quiet(s);
  s.mail!.banked = 1;
  s.mail!.carrying = true;
  s.player.x = 590;
  s.player.y = 300;
  pressE(s);
  expect(s.mail!.carrying).toBe(true);
  const gate = s.props.find((p) => p.id === "gate")!,
    belt = s.props.find((p) => p.kind === "conveyor")!;
  gate.active = true;
  belt.active = true;
  pressE(s);
  expect(s.mail!.carrying).toBe(false);
  expect(s.mail!.transit).toBe("moving");
  expect(s.mail!.secondRoute).toBe("sorter");
  gate.active = false;
  for (let i = 0; i < 70; i++) step(s, EMPTY_INPUT);
  expect(s.mail!.transit).toBe("jammed");
  expect(s.mail!.loose!.x).toBeGreaterThanOrEqual(502);
  gate.active = true;
  for (let i = 0; i < 70; i++) step(s, EMPTY_INPUT);
  expect(s.mail!.transit).toBe("ready");
  expect(s.mail!.loose).toEqual({ x: 360, y: 360 });
  s.player.x = 360;
  s.player.y = 360;
  pressE(s);
  expect(s.mail!.carrying).toBe(true);
  bank(s);
  expect(s.mail!.secondRoute).toBe("sorter");
});
it("allows the slower carried route without using the sorter", () => {
  const s = createGame("mailroom", 42);
  quiet(s);
  bank(s);
  bank(s);
  expect(s.mail!.secondRoute).toBe("carried");
  expect(s.mail!.transit).toBe("none");
});
it("combines an actual decoy, reversed belt and foam hit to move a guard, with a capped bonus", () => {
  const s = createGame("mailroom", 42),
    g = s.bots[1];
  s.player.x = 530;
  s.player.y = 300;
  g.x = 600;
  g.y = 300;
  s.decoy = { x: 640, y: 300, ttl: 360, serial: 5 };
  s.props.find((p) => p.kind === "conveyor")!.active = true;
  step(s, input({ fire: true, aimX: 1 }));
  for (let i = 0; i < 15 && g.stun === 0; i++) step(s, EMPTY_INPUT);
  expect(g.stun).toBeGreaterThan(0);
  expect(s.scored).toContain("return-to-sender");
  const x = g.x;
  for (let i = 0; i < 25; i++) step(s, EMPTY_INPUT);
  expect(g.x).toBeLessThan(x - 10);
  const before = s.breakdown.tricks;
  for (let i = 0; i < 10; i++) step(s, input({ fire: true, aimX: 1 }));
  expect(s.breakdown.tricks).toBe(before);
});
it("gives a guard a bounded double-take, then makes it recognize an unchanged decoy", () => {
  const s = createGame("mailroom", 42),
    g = s.bots[1];
  g.x = 600;
  g.y = 300;
  s.decoy = { x: 650, y: 300, ttl: 360, serial: 1 };
  step(s, EMPTY_INPUT);
  expect(g.reaction).toBe("doughnut");
  for (let i = 0; i < 235; i++) step(s, EMPTY_INPUT);
  expect(g.curiosity).toBe(0);
  expect(g.state).not.toBe("investigate");
  expect(s.decoy).not.toBeNull();
  s.decoy!.serial = 2;
  step(s, EMPTY_INPUT);
  expect(g.curiosity).toBeGreaterThan(0);
});
it("telegraphs backup as an arrival instead of pretending it has been stunned", () => {
  const s = createGame("mailroom", 42);
  for (let n = 0; n < 2; n++) {
    s.mail!.carrying = true;
    s.player.x = 120;
    s.player.y = 470;
    pressE(s);
  }
  const b = s.bots.find((b) => b.id === "backup")!;
  expect(b.arriving).toBeGreaterThan(0);
  expect(b.state).toBe("arriving");
  expect(b.stun).toBe(0);
});
it("foam can physically bump a loose parcel, and a closing gate cannot swallow it", () => {
  const s = createGame("mailroom", 42);
  quiet(s);
  s.bots[0].carrying = false;
  s.mail!.loose = { x: 650, y: 420 };
  s.player.x = 590;
  s.player.y = 420;
  step(s, { ...EMPTY_INPUT, fire: true, aimX: 1 });
  for (let i = 0; i < 10; i++) step(s, EMPTY_INPUT);
  expect(s.mail!.loose!.x).toBeGreaterThan(675);
  const gate = s.props.find((p) => p.id === "gate")!;
  gate.active = true;
  s.mail!.loose = { x: 465, y: 300 };
  s.player.x = 385;
  s.player.y = 300;
  step(s, { ...EMPTY_INPUT, gadget: 2, fire: true });
  expect(gate.active).toBe(true);
  expect(s.effects.some((e) => e.kind === "blocked")).toBe(true);
});
it("accepts a parcel from the visible belt edge and gives a recoverable jam at a closed gate", () => {
  const s = createGame("mailroom", 42);
  quiet(s);
  s.bots[0].carrying = false;
  s.mail!.banked = 1;
  s.mail!.carrying = true;
  s.player.x = 680;
  s.player.y = 320;
  s.props.find((p) => p.kind === "conveyor")!.active = true;
  pressE(s);
  expect(s.mail!.transit).toBe("moving");
  for (let i = 0; i < 40; i++) step(s, EMPTY_INPUT);
  expect(s.mail!.transit).toBe("jammed");
  expect(s.mail!.loose).not.toBeNull();
  expect(s.objective).toMatch(/Open the gate/);
});
