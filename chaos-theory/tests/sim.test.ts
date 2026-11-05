import { describe, expect, it } from "vitest";
import {
  blocked,
  checksum,
  createGame,
  createReplay,
  dailySeed,
  EMPTY_INPUT,
  GADGETS,
  gadgetTarget,
  lineOfSight,
  nextWaypoint,
  pause,
  random,
  ROUND_TICKS,
  step,
  verifyReplay,
  type GameState,
  type Input,
  type Point,
} from "../src/sim";
import type { MissionId } from "../src/contracts";

const input = (overrides: Partial<Input> = {}): Input => ({
  ...EMPTY_INPUT,
  ...overrides,
});
function ticks(s: GameState, n: number, action = EMPTY_INPUT) {
  for (let i = 0; i < n; i++) step(s, action);
}
function isolated(mission: MissionId = "mailroom") {
  const s = createGame(mission, 42);
  s.bots.forEach((b) => (b.stun = ROUND_TICKS));
  return s;
}
function use(s: GameState, gadget: Input["gadget"]) {
  step(s, input({ gadget, fire: true }));
  step(s, input({ gadget }));
}
function pressE(s: GameState) {
  step(s, input({ interact: true }));
  step(s, EMPTY_INPUT);
}
function walk(s: GameState, target: Point, stop = 30, limit = 1800) {
  for (
    let j = 0;
    j < limit &&
    Math.hypot(s.player.x - target.x, s.player.y - target.y) > stop &&
    s.status === "playing";
    j++
  ) {
    const waypoint = nextWaypoint(s, s.player, target);
    if (!waypoint) throw new Error("Player route unreachable");
    const dx = waypoint.x - s.player.x,
      dy = waypoint.y - s.player.y,
      d = Math.hypot(dx, dy);
    step(s, input({ x: dx / d, y: dy / d }));
  }
  expect(
    Math.hypot(s.player.x - target.x, s.player.y - target.y),
  ).toBeLessThanOrEqual(stop + 4);
}

describe("fixed-step movement and lifecycle", () => {
  it("accelerates, decelerates and normalizes diagonal speed", () => {
    const s = isolated();
    ticks(s, 60, input({ x: 1, y: 1 }));
    expect(Math.hypot(s.player.vx, s.player.vy)).toBeCloseTo(215, 3);
    ticks(s, 60);
    expect(Math.abs(s.player.vx)).toBeLessThan(0.001);
    expect(s.tick).toBe(120);
  });
  it("dash has duration, cooldown and cannot tunnel through a thin wall", () => {
    const s = isolated();
    s.solids = [{ x: 150, y: 40, w: 5, h: 520 }];
    step(s, input({ x: 1, dash: true }));
    expect(s.player.dashTicks).toBe(11);
    expect(s.player.dashCooldown).toBe(75);
    ticks(s, 30, input({ x: 1, dash: true }));
    expect(s.player.x).toBeLessThan(139);
    expect(s.player.dashTicks).toBe(0);
    expect(s.player.dashCooldown).toBe(45);
    expect(blocked(s, s.player.x, s.player.y)).toBe(false);
  });
  it("pause freezes all state and resuming advances one tick", () => {
    const s = createGame("vault", 4);
    pause(s, true);
    const before = checksum(s);
    ticks(s, 400);
    expect(checksum(s)).toBe(before);
    pause(s, false);
    step(s, EMPTY_INPUT);
    expect(s.tick).toBe(1);
  });
  it("timeout and terminal states do not repeat scoring or advance", () => {
    const s = isolated();
    ticks(s, ROUND_TICKS);
    expect(s.status).toBe("lost");
    expect(s.timeLeft).toBe(0);
    const before = checksum(s);
    ticks(s, 200, input({ interact: true, fire: true }));
    expect(checksum(s)).toBe(before);
  });
  it("restart restores independent transient state, not shared arrays", () => {
    const a = createGame("reactor", 3),
      b = createGame("reactor", 3);
    use(a, 0);
    expect(a.shots.length).toBeGreaterThan(0);
    expect(b.shots).toEqual([]);
    expect(checksum(createGame("reactor", 3))).toBe(checksum(b));
  });
  it("invalid input fails without changing state", () => {
    for (const bad of [
      input({ x: NaN }),
      input({ aimY: Infinity }),
      { ...input(), gadget: 6 },
      { ...input(), command: "win" },
      { ...input(), fire: "true" },
    ]) {
      const s = isolated(),
        before = checksum(s);
      expect(() => step(s, bad as Input)).toThrow();
      expect(checksum(s)).toBe(before);
    }
  });
  it("bounds clamp even hostile movement magnitudes", () => {
    const s = isolated();
    s.solids = [];
    ticks(s, 500, input({ x: -1e9, y: -1e9 }));
    expect(s.player.x).toBeGreaterThanOrEqual(34);
    expect(s.player.y).toBeGreaterThanOrEqual(34);
  });
});

describe("navigation and robot state machines", () => {
  it("LOS is occluded by solids and closed doors", () => {
    const s = createGame("vault", 1);
    expect(lineOfSight(s, { x: 500, y: 300 }, { x: 700, y: 300 })).toBe(false);
    s.props.find((p) => p.kind === "door")!.active = true;
    expect(lineOfSight(s, { x: 500, y: 300 }, { x: 700, y: 300 })).toBe(true);
    expect(lineOfSight(s, { x: 500, y: 100 }, { x: 700, y: 100 })).toBe(false);
  });
  it("BFS navigates around barriers and reports unreachable closed vault", () => {
    const s = createGame("vault", 1);
    expect(nextWaypoint(s, s.player, { x: 815, y: 145 })).toBeNull();
    s.props.find((p) => p.kind === "door")!.active = true;
    expect(nextWaypoint(s, s.player, { x: 815, y: 145 })).not.toBeNull();
  });
  it.each(["mailroom", "vault", "reactor"] as const)(
    "all key mission targets are reachable after opening doors: %s",
    (mission) => {
      const s = createGame(mission, 9);
      s.props
        .filter((p) => p.kind === "door")
        .forEach((p) => (p.active = true));
      for (const target of s.props)
        expect(nextWaypoint(s, s.player, target)).not.toBeNull();
    },
  );
  it("courier follows altered destination and eventually drops parcel at B", () => {
    const s = createGame("mailroom", 3);
    s.bots[1].stun = ROUND_TICKS;
    s.bots[2].stun = ROUND_TICKS;
    const notice = s.props.find((p) => p.kind === "sign")!;
    notice.active = true;
    ticks(s, 900);
    expect(s.props.find((p) => p.id === "dock-b")!.active).toBe(true);
    expect(s.bots[0].carrying).toBe(false);
  });
  it("courier retries delivery after completing the intended route", () => {
    const s = createGame("mailroom", 3);
    s.bots.slice(1).forEach((b) => (b.stun = ROUND_TICKS));
    ticks(s, 1000);
    expect(s.props.find((p) => p.id === "dock-a")!.active).toBe(true);
    expect(s.status).toBe("playing");
  });
  it("sentinel chases visible player, honors dash immunity, loses sight and investigates decoy", () => {
    const s = isolated("vault");
    s.solids = [];
    s.props.find((p) => p.kind === "door")!.active = true;
    const guard = s.bots[1];
    guard.stun = 0;
    guard.x = 140;
    guard.y = 300;
    step(s, input({ dash: true }));
    expect(guard.state).toBe("chase");
    expect(s.player.hp).toBe(3);
    s.decoy = { x: 200, y: 400, ttl: 120 };
    step(s, EMPTY_INPUT);
    expect(guard.state).toBe("investigate");
    s.decoy = null;
    guard.x = 800;
    guard.y = 500;
    ticks(s, 90);
    expect(guard.state).toBe("patrol");
  });
  it("sentinel contact damages once per invulnerability window and eventually loses", () => {
    const s = isolated();
    s.solids = [];
    s.props = s.props.filter((p) => p.kind !== "door");
    const guard = s.bots[1];
    guard.stun = 0;
    for (let i = 0; i < 250; i++) {
      guard.x = s.player.x + 5;
      guard.y = s.player.y;
      step(s, EMPTY_INPUT);
    }
    expect(s.player.hp).toBe(0);
    expect(s.status).toBe("lost");
    expect(s.breakdown.damage).toBe(-300);
  });
  it("technician repairs altered signage only after reaching it and waiting", () => {
    const s = isolated(),
      tech = s.bots[2],
      sign = s.props.find((p) => p.kind === "sign")!;
    sign.active = true;
    tech.stun = 0;
    tech.x = sign.x;
    tech.y = sign.y;
    ticks(s, 299);
    expect(sign.active).toBe(true);
    step(s, EMPTY_INPUT);
    expect(sign.active).toBe(false);
  });
});

describe("four gadgets and environmental interactions", () => {
  it("foam shots hit, knock back and stun without duplicate farming", () => {
    const s = isolated();
    s.solids = [];
    const b = s.bots[0];
    b.x = 190;
    b.y = 300;
    b.stun = 0;
    use(s, 0);
    ticks(s, 15);
    expect(b.stun).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThan(190);
    expect(s.breakdown.tricks).toBe(100);
    ticks(s, 50, input({ fire: true }));
    expect(s.breakdown.tricks).toBe(100);
    expect(s.usedGadgets).toEqual([0]);
  });
  it("foam cannot pass through a solid obstacle", () => {
    const s = isolated();
    s.solids = [{ x: 160, y: 260, w: 10, h: 90 }];
    use(s, 0);
    ticks(s, 20);
    expect(s.shots).toEqual([]);
    expect(s.breakdown.tricks).toBe(0);
  });
  it("decoy requires reachable placement, lasts six seconds, and respects cooldown", () => {
    const s = isolated();
    s.solids = [];
    use(s, 1);
    expect(s.decoy?.x).toBe(270);
    expect(s.player.cooldowns[1]).toBe(299);
    const id = s.nextEffectId;
    use(s, 1);
    expect(s.nextEffectId).toBe(id);
    ticks(s, 360);
    expect(s.decoy).toBeNull();
    const blockedState = isolated();
    blockedState.solids = [{ x: 250, y: 250, w: 50, h: 100 }];
    use(blockedState, 1);
    expect(blockedState.decoy).toBeNull();
    expect(blockedState.player.cooldowns[1]).toBe(0);
  });
  it("hacker enforces range and flips switches, conveyors and doors", () => {
    const s = isolated("reactor"),
      sw = s.props.find((p) => p.kind === "switch")!;
    use(s, 2);
    expect(sw.active).toBe(false);
    expect(s.player.cooldowns[2]).toBe(0);
    s.player.x = sw.x;
    s.player.y = sw.y + 60;
    use(s, 2);
    expect(sw.active).toBe(true);
    expect(s.player.cooldowns[2]).toBe(119);
    const conveyor = s.props.find((p) => p.kind === "conveyor")!;
    s.player.x = conveyor.x;
    s.player.y = conveyor.y;
    s.player.cooldowns[2] = 0;
    use(s, 2);
    expect(conveyor.active).toBe(true);
    const door = s.props.find((p) => p.kind === "door")!;
    s.player.x = door.x;
    s.player.y = door.y + 60;
    s.player.cooldowns[2] = 0;
    use(s, 2);
    expect(door.active).toBe(true);
  });
  it("device preview and runtime choose nearest eligible target, not prop order", () => {
    const s = isolated("reactor");
    s.player.x = 700;
    s.player.y = 180;
    const before = checksum(s);
    expect(gadgetTarget(s, 2)?.id).toBe("gate");
    expect(checksum(s)).toBe(before);
    use(s, 2);
    expect(s.props.find((p) => p.id === "gate")!.active).toBe(true);
    expect(s.props.find((p) => p.id === "switch-3")!.active).toBe(false);
  });
  it("device target selection rejects occluded and out-of-range non-door targets", () => {
    const s = isolated();
    expect(gadgetTarget(s, 3)).toBeUndefined();
    s.player.x = 290;
    s.player.y = 300;
    expect(gadgetTarget(s, 3)?.id).toBe("notice");
    s.solids.push({ x: 310, y: 200, w: 10, h: 200 });
    expect(gadgetTarget(s, 3)).toBeUndefined();
    use(s, 3);
    expect(s.events).toEqual([]);
  });
  it("door cannot close through an actor", () => {
    const s = isolated("vault"),
      door = s.props.find((p) => p.kind === "door")!;
    door.active = true;
    s.player.x = door.x;
    s.player.y = door.y;
    use(s, 2);
    expect(door.active).toBe(true);
    expect(blocked(s, s.player.x, s.player.y)).toBe(false);
  });
  it.each(["mailroom", "vault", "reactor"] as const)(
    "beacon creates exactly one typed mapping at the sign: %s",
    (mission) => {
      const s = isolated(mission),
        sign = s.props.find((p) => p.kind === "sign")!;
      s.player.x = sign.x - 60;
      s.player.y = sign.y;
      use(s, 3);
      expect(sign.active).toBe(true);
      expect(s.events).toHaveLength(1);
      expect(s.events[0].nodeId).toBe("notice");
      expect(s.events[0].kind).toBe(
        mission === "mailroom"
          ? "delivery-sign"
          : mission === "vault"
            ? "forged-clearance"
            : "maintenance-note",
      );
      s.player.cooldowns[3] = 0;
      use(s, 3);
      expect(s.events).toHaveLength(1);
    },
  );
  it("beacon cannot create mapping from empty space or through a wall", () => {
    const s = isolated();
    use(s, 3);
    expect(s.events).toEqual([]);
    s.player.x = 290;
    s.solids = [{ x: 310, y: 200, w: 10, h: 200 }];
    use(s, 3);
    expect(s.events).toEqual([]);
  });
  it("gadget metadata covers all four useful tools", () => {
    expect(GADGETS).toHaveLength(4);
    expect(new Set(GADGETS.map((g) => g.name)).size).toBe(4);
    for (const g of GADGETS) expect(g.cooldown).toBeGreaterThan(0);
  });
});

describe("mission completion via movement and valid action inputs", () => {
  it("mailroom requires three carried parcels stashed at home, never a one-click dock win", () => {
    const s = isolated(),
      courier = s.bots[0],
      stash = s.props.find((p) => p.id === "stash")!;
    s.props.find((p) => p.kind === "door")!.active = true;
    for (let n = 0; n < 3; n++) {
      // Isolate individual pickup/bank rules. Full active-bot completion is browser tested.
      courier.carrying = true;
      courier.stun = ROUND_TICKS;
      walk(s, courier, 45);
      pressE(s);
      expect(s.mail!.carrying).toBe(true);
      walk(s, s.props.find((p) => p.id === "dock-b")!, 45);
      pressE(s);
      expect(s.status).toBe("playing");
      walk(s, stash, 45);
      pressE(s);
      expect(s.mail!.banked).toBe(n + 1);
      s.bots.forEach((b) => (b.stun = ROUND_TICKS));
      if (n < 2) expect(s.status).toBe("playing");
    }
    expect(s.status).toBe("playing");
    expect(s.mail!.escapeDeadline).not.toBeNull();
    walk(s, s.props.find((p) => p.id === "getaway")!, 45);
    pressE(s);
    expect(s.status).toBe("won");
    expect(s.breakdown.objective).toBe(1200);
    const before = checksum(s);
    pressE(s);
    expect(checksum(s)).toBe(before);
  });
  it("vault requires opening gate, grabbing relic and returning to exit", () => {
    const s = isolated("vault"),
      sign = s.props.find((p) => p.kind === "sign")!;
    walk(s, sign, 90);
    use(s, 3);
    expect(s.props.find((p) => p.kind === "door")!.active).toBe(true);
    walk(s, s.props.find((p) => p.kind === "vault")!, 50);
    pressE(s);
    expect(s.phase).toBe(1);
    walk(s, s.props.find((p) => p.kind === "exit")!, 50);
    pressE(s);
    expect(s.status).toBe("won");
  });
  it("reactor needs all three relays before the core can be stopped", () => {
    const s = isolated("reactor"),
      core = s.props.find((p) => p.kind === "core")!;
    walk(s, core, 50);
    pressE(s);
    expect(s.status).toBe("playing");
    for (const sw of s.props.filter((p) => p.kind === "switch")) {
      walk(s, sw, 50);
      pressE(s);
    }
    expect(s.phase).toBe(3);
    walk(s, core, 50);
    pressE(s);
    expect(s.status).toBe("won");
  });
});

describe("determinism, bounded replay and input fuzzing", () => {
  it("same seed produces the same PRNG stream and replay", () => {
    const a = createGame("mailroom", 7),
      b = createGame("mailroom", 7);
    for (let i = 0; i < 100; i++) expect(random(a)).toBe(random(b));
    const actions = Array.from({ length: 240 }, (_, i) =>
      input({ x: i < 120 ? 1 : -1, fire: i % 4 === 0 }),
    );
    const replay = createReplay("mailroom", 7, actions);
    expect(verifyReplay(replay).valid).toBe(true);
    expect(createReplay("mailroom", 7, actions)).toEqual(replay);
    expect(replay.checksums).toHaveLength(4);
  });
  it("rejects incompatible builds, altered inputs, hashes, oversized logs and malformed replays", () => {
    const replay = createReplay("reactor", 3, [input({ x: 1 })]);
    for (const bad of [
      null,
      {},
      { ...replay, build: "future" },
      { ...replay, version: 2 },
      { ...replay, inputs: [input({ x: -1 })] },
      { ...replay, finalChecksum: "forged" },
      { ...replay, inputs: Array(ROUND_TICKS + 1).fill(EMPTY_INPUT) },
      { ...replay, checksums: [{ tick: 1, value: "forged" }] },
    ])
      expect(verifyReplay(bad).valid).toBe(false);
  });
  it("daily seed is deterministic UTC-labelled data and validates format", () => {
    expect(dailySeed("2026-11-04")).toBe(dailySeed("2026-11-04"));
    expect(dailySeed("2026-11-04")).not.toBe(dailySeed("2026-11-05"));
    expect(() => dailySeed("today")).toThrow();
    expect(() => createGame("mailroom", NaN)).toThrow();
    expect(() => createGame("unknown" as MissionId, 1)).toThrow();
  });
  it("6,000 randomized input steps stay finite and in bounds across all missions", () => {
    let rng = 0x12345678;
    const rand = () => {
      rng ^= rng << 13;
      rng ^= rng >>> 17;
      rng ^= rng << 5;
      return (rng >>> 0) / 4294967296;
    };
    for (const mission of ["mailroom", "vault", "reactor"] as const) {
      const s = createGame(mission, 22);
      for (let n = 0; n < 2000; n++) {
        step(
          s,
          input({
            x: rand() * 2 - 1,
            y: rand() * 2 - 1,
            aimX: rand() * 2 - 1,
            aimY: rand() * 2 - 1,
            fire: rand() < 0.2,
            interact: rand() < 0.1,
            dash: rand() < 0.05,
            gadget: Math.floor(rand() * 4) as Input["gadget"],
          }),
        );
        for (const p of [s.player, ...s.bots]) {
          expect(Number.isFinite(p.x) && Number.isFinite(p.y)).toBe(true);
          expect(p.x).toBeGreaterThanOrEqual(22);
          expect(p.x).toBeLessThanOrEqual(938);
          expect(p.y).toBeGreaterThanOrEqual(22);
          expect(p.y).toBeLessThanOrEqual(578);
        }
        expect(s.events.length).toBeLessThanOrEqual(1);
        expect(s.effects.length).toBeLessThanOrEqual(80);
        expect(s.score).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
