import { BUILD, type MappedEvent, type MissionId } from "./contracts";

export const WORLD = { width: 960, height: 600 } as const;
export const TICKS_PER_SECOND = 60;
export const ROUND_TICKS = 75 * TICKS_PER_SECOND;
export type Gadget = 0 | 1 | 2 | 3;
export const GADGETS = [
  {
    name: "Foam launcher",
    description: "Stun and bump a robot",
    cooldown: 42,
    range: 330,
    color: "#9df8da",
  },
  {
    name: "Holo decoy",
    description: "Lure the sentinel away",
    cooldown: 300,
    range: 150,
    color: "#cfabff",
  },
  {
    name: "Switch hacker",
    description: "Flip a nearby door or switch",
    cooldown: 120,
    range: 115,
    color: "#ffcf70",
  },
  {
    name: "Directive beacon",
    description: "Plant a fake notice at a sign",
    cooldown: 180,
    range: 120,
    color: "#79ddff",
  },
] as const;
export interface Point {
  x: number;
  y: number;
}
export interface Rect extends Point {
  w: number;
  h: number;
}
export interface Input {
  x: number;
  y: number;
  aimX: number;
  aimY: number;
  dash: boolean;
  fire: boolean;
  interact: boolean;
  gadget: Gadget;
}
export interface Player extends Point {
  vx: number;
  vy: number;
  hp: number;
  invulnerable: number;
  dashTicks: number;
  dashCooldown: number;
  gadget: Gadget;
  cooldowns: number[];
  aimX: number;
  aimY: number;
}
export type BotKind = "courier" | "sentinel" | "technician";
export interface Bot extends Point {
  id: string;
  kind: BotKind;
  state: string;
  stun: number;
  targetX: number;
  targetY: number;
  carrying: boolean;
  timer: number;
  patrol: number;
}
export type PropKind =
  | "sign"
  | "switch"
  | "door"
  | "conveyor"
  | "vault"
  | "core"
  | "exit"
  | "dock";
export interface Prop extends Rect {
  id: string;
  kind: PropKind;
  active: boolean;
  variant: number;
}
export interface Effect extends Point {
  id: number;
  kind: string;
  ttl: number;
}
export interface Shot extends Point {
  vx: number;
  vy: number;
  ttl: number;
}
export interface ScoreBreakdown {
  objective: number;
  time: number;
  variety: number;
  tricks: number;
  damage: number;
}
export interface GameState {
  version: 1;
  build: string;
  mission: MissionId;
  seed: number;
  rng: number;
  player: Player;
  bots: Bot[];
  solids: Rect[];
  props: Prop[];
  effects: Effect[];
  shots: Shot[];
  events: MappedEvent[];
  status: "playing" | "won" | "lost";
  paused: boolean;
  tick: number;
  timeLeft: number;
  score: number;
  breakdown: ScoreBreakdown;
  objective: string;
  phase: number;
  goal: Point & { label: string };
  decoy: (Point & { ttl: number }) | null;
  nextEffectId: number;
  usedGadgets: number[];
  scored: string[];
  interactHeld: boolean;
  fireHeld: boolean;
  dashHeld: boolean;
}
export const EMPTY_INPUT: Input = {
  x: 0,
  y: 0,
  aimX: 1,
  aimY: 0,
  dash: false,
  fire: false,
  interact: false,
  gadget: 0,
};

function prop(
  id: string,
  kind: PropKind,
  x: number,
  y: number,
  w = 46,
  h = 46,
): Prop {
  return { id, kind, x, y, w, h, active: false, variant: 0 };
}
function bot(id: string, kind: BotKind, x: number, y: number): Bot {
  return {
    id,
    kind,
    x,
    y,
    state: kind === "courier" ? "delivery" : "patrol",
    stun: 0,
    targetX: x,
    targetY: y,
    carrying: kind === "courier",
    timer: 0,
    patrol: 0,
  };
}
export function createGame(mission: MissionId, seed = 1): GameState {
  if (
    !["mailroom", "vault", "reactor"].includes(mission) ||
    !Number.isSafeInteger(seed) ||
    seed < 0 ||
    seed > 0xffffffff
  )
    throw new Error("Invalid mission or seed");
  const s: GameState = {
    version: 1,
    build: BUILD,
    mission,
    seed,
    rng: seed || 1,
    player: {
      x: 120,
      y: 300,
      vx: 0,
      vy: 0,
      hp: 3,
      invulnerable: 0,
      dashTicks: 0,
      dashCooldown: 0,
      gadget: 0,
      cooldowns: [0, 0, 0, 0],
      aimX: 1,
      aimY: 0,
    },
    bots: [
      bot("courier", "courier", 540, 360),
      bot("sentinel", "sentinel", 710, 300),
      bot("technician", "technician", 780, 95),
    ],
    solids: [],
    props: [],
    effects: [],
    shots: [],
    events: [],
    status: "playing",
    paused: false,
    tick: 0,
    timeLeft: 75,
    score: 0,
    breakdown: { objective: 0, time: 0, variety: 0, tricks: 0, damage: 0 },
    objective: "",
    phase: 0,
    goal: { x: 0, y: 0, label: "" },
    decoy: null,
    nextEffectId: 0,
    usedGadgets: [],
    scored: [],
    interactHeld: false,
    fireHeld: false,
    dashHeld: false,
  };
  if (mission === "mailroom") {
    s.solids = [
      { x: 245, y: 80, w: 145, h: 100 },
      { x: 430, y: 430, w: 175, h: 90 },
      { x: 655, y: 80, w: 55, h: 150 },
    ];
    s.props = [
      prop("notice", "sign", 350, 300),
      prop("belt", "conveyor", 590, 300, 190, 80),
      prop("gate", "door", 470, 180, 32, 105),
      prop("dock-a", "dock", 850, 130, 80, 65),
      prop("dock-b", "dock", 850, 470, 80, 65),
    ];
  } else if (mission === "vault") {
    s.solids = [
      { x: 585, y: 25, w: 40, h: 220 },
      { x: 585, y: 355, w: 40, h: 220 },
      { x: 245, y: 110, w: 170, h: 70 },
      { x: 245, y: 430, w: 170, h: 70 },
    ];
    s.props = [
      prop("notice", "sign", 470, 300),
      prop("gate", "door", 605, 300, 40, 110),
      prop("relic", "vault", 815, 145, 55, 55),
      prop("escape", "exit", 120, 500, 100, 65),
      prop("belt", "conveyor", 770, 400, 150, 55),
    ];
    s.bots[0].x = 720;
    s.bots[0].y = 480;
    s.bots[0].carrying = false;
  } else {
    s.solids = [
      { x: 230, y: 230, w: 140, h: 70 },
      { x: 460, y: 220, w: 50, h: 150 },
      { x: 655, y: 300, w: 90, h: 70 },
    ];
    s.props = [
      prop("switch-1", "switch", 290, 130),
      prop("switch-2", "switch", 510, 465),
      prop("switch-3", "switch", 780, 150),
      prop("notice", "sign", 440, 140),
      prop("reactor", "core", 825, 455, 90, 90),
      prop("gate", "door", 620, 190, 110, 28),
      prop("belt", "conveyor", 330, 380, 150, 55),
    ];
  }
  // Seed affects bounded patrol choices only; objectives and navigation remain feasible.
  s.bots[1].patrol = Math.floor(random(s) * 4);
  updateObjective(s);
  return s;
}
export function random(s: GameState): number {
  let x = s.rng;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  s.rng = x >>> 0;
  return s.rng / 4294967296;
}
export function dailySeed(date: string): number {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))
    throw new Error("Expected UTC date YYYY-MM-DD");
  return hashText(`pocket-mayhem:${date}`);
}
export function pause(s: GameState, value: boolean): void {
  s.paused = value;
}
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
function centerRect(p: Rect): Rect {
  return { x: p.x - p.w / 2, y: p.y - p.h / 2, w: p.w, h: p.h };
}
export function obstacles(s: GameState): Rect[] {
  return [
    ...s.solids,
    ...s.props.filter((p) => p.kind === "door" && !p.active).map(centerRect),
  ];
}
export function blocked(
  s: GameState,
  x: number,
  y: number,
  radius = 12,
): boolean {
  if (
    x < 22 + radius ||
    y < 22 + radius ||
    x > WORLD.width - 22 - radius ||
    y > WORLD.height - 22 - radius
  )
    return true;
  return obstacles(s).some(
    (r) =>
      x + radius > r.x &&
      x - radius < r.x + r.w &&
      y + radius > r.y &&
      y - radius < r.y + r.h,
  );
}
function move(
  s: GameState,
  p: Point,
  dx: number,
  dy: number,
  radius = 12,
): void {
  // Substeps prevent high-speed dash/projectile tunneling across thin geometry.
  const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 5));
  for (let i = 0; i < n; i++) {
    if (!blocked(s, p.x + dx / n, p.y, radius)) p.x += dx / n;
    if (!blocked(s, p.x, p.y + dy / n, radius)) p.y += dy / n;
  }
}
export function lineOfSight(s: GameState, a: Point, b: Point): boolean {
  const n = Math.max(1, Math.ceil(distance(a, b) / 8));
  for (let i = 0; i <= n; i++)
    if (blocked(s, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, 0))
      return false;
  return true;
}
/** Four-connected deterministic BFS. Unreachable targets explicitly return null. */
export function nextWaypoint(
  s: GameState,
  from: Point,
  to: Point,
): Point | null {
  if (lineOfSight(s, from, to) && !blocked(s, to.x, to.y, 12)) return to;
  const cell = 30,
    cols = 32,
    rows = 20;
  const index = (p: Point) =>
    Math.floor(p.y / cell) * cols + Math.floor(p.x / cell);
  const start = index(from),
    end = index(to);
  if (start === end) return null;
  const prev = new Int32Array(cols * rows).fill(-1),
    queue = [start];
  prev[start] = start;
  for (let qi = 0; qi < queue.length; qi++) {
    const id = queue[qi];
    if (id === end) break;
    const x = id % cols,
      y = Math.floor(id / cols);
    for (const [dx, dy] of [
      [1, 0],
      [0, 1],
      [-1, 0],
      [0, -1],
    ]) {
      const nx = x + dx,
        ny = y + dy,
        ni = ny * cols + nx;
      if (
        nx < 0 ||
        ny < 0 ||
        nx >= cols ||
        ny >= rows ||
        prev[ni] !== -1 ||
        blocked(s, nx * cell + cell / 2, ny * cell + cell / 2, 13)
      )
        continue;
      prev[ni] = id;
      queue.push(ni);
    }
  }
  if (prev[end] < 0) return null;
  let id = end;
  while (prev[id] !== start && id !== start) id = prev[id];
  return {
    x: (id % cols) * cell + cell / 2,
    y: Math.floor(id / cols) * cell + cell / 2,
  };
}
function effect(s: GameState, kind: string, point: Point, ttl = 32): void {
  s.effects.push({ id: s.nextEffectId++, kind, x: point.x, y: point.y, ttl });
  if (s.effects.length > 80) s.effects.shift();
}
function award(
  s: GameState,
  category: keyof ScoreBreakdown,
  amount: number,
  id: string,
): void {
  if (s.scored.includes(id)) return;
  s.scored.push(id);
  s.breakdown[category] += amount;
  s.score = Math.max(
    0,
    Object.values(s.breakdown).reduce((a, b) => a + b, 0),
  );
}
function recordMapping(s: GameState, p: Prop): void {
  if (s.events.some((e) => e.nodeId === p.id)) return;
  const kind =
    s.mission === "mailroom"
      ? "delivery-sign"
      : s.mission === "vault"
        ? "forged-clearance"
        : "maintenance-note";
  s.events.push({ tick: s.tick, kind, nodeId: p.id, variant: p.variant });
}
/** Shared deterministic targeting for runtime and preview; does not mutate state. */
export function gadgetTarget(s: GameState, g: 2 | 3): Prop | undefined {
  const p = s.player;
  return s.props
    .filter((q) =>
      g === 2
        ? q.kind === "switch" || q.kind === "door" || q.kind === "conveyor"
        : q.kind === "sign",
    )
    .filter(
      (q) =>
        distance(q, p) <= GADGETS[g].range &&
        (q.kind === "door" || lineOfSight(s, p, q)),
    )
    .sort((a, b) => distance(a, p) - distance(b, p))[0];
}
function useGadget(s: GameState, i: Input): void {
  const p = s.player,
    g = p.gadget;
  if (p.cooldowns[g] > 0) return;
  let used = false;
  if (g === 0) {
    s.shots.push({
      x: p.x,
      y: p.y,
      vx: p.aimX * 540,
      vy: p.aimY * 540,
      ttl: 36,
    });
    used = true;
    effect(s, "foam", p, 12);
  } else if (g === 1) {
    const target = {
      x: p.x + p.aimX * GADGETS[1].range,
      y: p.y + p.aimY * GADGETS[1].range,
    };
    if (!blocked(s, target.x, target.y, 12) && lineOfSight(s, p, target)) {
      s.decoy = { ...target, ttl: 360 };
      effect(s, "decoy", target, 360);
      used = true;
    } else effect(s, "blocked", p, 20);
  } else {
    const target = gadgetTarget(s, g);
    if (target) {
      if (g === 3) {
        target.active = true;
        target.variant = Math.floor(random(s) * 3);
        recordMapping(s, target);
      } else {
        const occupied =
          target.kind === "door" &&
          target.active &&
          [s.player, ...s.bots].some(
            (a) =>
              Math.abs(a.x - target.x) < target.w / 2 + 15 &&
              Math.abs(a.y - target.y) < target.h / 2 + 15,
          );
        if (occupied) {
          effect(s, "blocked", target, 25);
          return;
        }
        target.active = !target.active;
      }
      effect(s, g === 3 ? "beacon" : "hack", target, 55);
      award(s, "tricks", 80, `manipulate:${target.id}`);
      used = true;
      if (s.mission === "vault" && g === 3)
        s.props.find((q) => q.id === "gate")!.active = true;
    } else effect(s, "out-of-range", p, 30);
  }
  if (used) {
    p.cooldowns[g] = GADGETS[g].cooldown;
    if (!s.usedGadgets.includes(g)) {
      s.usedGadgets.push(g);
      award(s, "variety", 60, `gadget:${g}`);
    }
  }
  // Use the fixed typed action rather than an event-provided instruction.
  void i;
}
function interact(s: GameState): void {
  const p = s.player;
  if (s.mission === "mailroom") {
    const courier = s.bots.find((b) => b.kind === "courier")!;
    const dock = s.props.find((q) => q.id === "dock-b")!;
    if (
      s.phase === 0 &&
      courier.carrying &&
      courier.stun > 0 &&
      distance(p, courier) < 65
    ) {
      courier.carrying = false;
      s.phase = 1;
      effect(s, "parcel", p);
      award(s, "objective", 300, "parcel");
    } else if (
      s.phase === 0 &&
      !courier.carrying &&
      dock.active &&
      distance(p, dock) < 70
    ) {
      s.phase = 1;
      award(s, "objective", 300, "parcel");
      win(s);
    } else if (s.phase === 1 && distance(p, dock) < 70) win(s);
  } else if (s.mission === "vault") {
    const relic = s.props.find((q) => q.kind === "vault")!,
      exit = s.props.find((q) => q.kind === "exit")!;
    if (s.phase === 0 && distance(p, relic) < 70) {
      s.phase = 1;
      relic.active = true;
      award(s, "objective", 400, "relic");
      effect(s, "relic", p);
    } else if (s.phase === 1 && distance(p, exit) < 70) win(s);
  } else {
    const near = s.props
      .filter((q) => q.kind === "switch" && distance(p, q) < 70)
      .sort((a, b) => distance(p, a) - distance(p, b))[0];
    if (near && !near.active) {
      near.active = true;
      award(s, "tricks", 80, `manipulate:${near.id}`);
      effect(s, "hack", near);
    }
    const core = s.props.find((q) => q.kind === "core")!;
    if (
      s.props.filter((q) => q.kind === "switch").every((q) => q.active) &&
      distance(p, core) < 80
    )
      win(s);
  }
}
function win(s: GameState): void {
  if (s.status !== "playing") return;
  s.status = "won";
  award(s, "objective", 1000, "win");
  award(s, "time", Math.floor(s.timeLeft * 10), "time");
  effect(s, "victory", s.player, 120);
  updateObjective(s);
}
function hurt(s: GameState): void {
  if (s.status !== "playing") return;
  const p = s.player;
  if (p.invulnerable > 0 || p.dashTicks > 0) return;
  p.hp--;
  p.invulnerable = 100;
  award(s, "damage", -100, `hit:${p.hp}`);
  effect(s, "hurt", p, 28);
  if (p.hp <= 0) {
    s.status = "lost";
    s.objective = "Caught! Try another route or lure the guard away.";
  }
}
function updateObjective(s: GameState): void {
  if (s.status === "won") {
    s.objective = "Mayhem complete!";
    return;
  }
  if (s.mission === "mailroom") {
    const dock = s.props.find((q) => q.id === "dock-b")!,
      courier = s.bots[0];
    if (s.phase === 1) {
      s.objective = "Bring the parcel to Dock B. Press E at the yellow dock.";
      s.goal = { ...dock, label: "Deliver parcel · E" };
    } else if (!courier.carrying && dock.active) {
      s.objective =
        "The parcel is at Dock B! Go there and press E to pick it up.";
      s.goal = { ...dock, label: "Collect parcel · E" };
    } else if (s.props.find((q) => q.kind === "sign")!.active) {
      s.objective =
        "Courier redirected! Meet it at Dock B. Press E when the parcel arrives.";
      s.goal = { ...dock, label: "Meet the courier · Dock B" };
    } else {
      s.objective =
        "Trick the courier: use gadget 4 at the blue sign. Or foam it and press E.";
      s.goal = {
        ...s.props.find((q) => q.kind === "sign")!,
        label: "Fake sign · gadget 4",
      };
    }
  } else if (s.mission === "vault") {
    if (s.phase === 1) {
      s.objective = "Relic grabbed! Escape through the green pad. Press E.";
      s.goal = {
        ...s.props.find((q) => q.kind === "exit")!,
        label: "Escape · E",
      };
    } else if (s.props.find((q) => q.id === "gate")!.active) {
      s.objective = "Gate open! Grab the glowing relic. Press E.";
      s.goal = {
        ...s.props.find((q) => q.kind === "vault")!,
        label: "Grab relic · E",
      };
    } else {
      s.objective =
        "Open the vault: gadget 4 at the blue sign, or gadget 3 near its door.";
      s.goal = {
        ...s.props.find((q) => q.kind === "sign")!,
        label: "Forge clearance · gadget 4",
      };
    }
  } else {
    const switches = s.props.filter((q) => q.kind === "switch"),
      next = switches.find((q) => !q.active);
    s.phase = switches.filter((q) => q.active).length;
    if (next) {
      s.objective = `Disable the three relay switches (${s.phase}/3). Press E beside each.`;
      s.goal = { ...next, label: "Disable relay · E" };
    } else {
      s.objective =
        "All relays disabled! Shut down the reactor. Press E at the core.";
      s.goal = {
        ...s.props.find((q) => q.kind === "core")!,
        label: "Shut down · E",
      };
    }
  }
}
function navigate(s: GameState, b: Bot, target: Point, speed: number): boolean {
  b.targetX = target.x;
  b.targetY = target.y;
  if (distance(b, target) < 12) return true;
  const waypoint = nextWaypoint(s, b, target);
  if (!waypoint) {
    b.state = "blocked";
    return false;
  }
  const dx = waypoint.x - b.x,
    dy = waypoint.y - b.y,
    d = Math.hypot(dx, dy);
  if (d > 0) move(s, b, ((dx / d) * speed) / 60, ((dy / d) * speed) / 60);
  return false;
}
function updateBot(s: GameState, b: Bot): void {
  if (b.stun > 0) {
    b.stun--;
    b.state = "stunned";
    return;
  }
  if (b.kind === "courier") {
    if (s.mission !== "mailroom" || !b.carrying) {
      b.state = "idle";
      return;
    }
    const sign = s.props.find((q) => q.kind === "sign")!;
    const dock = s.props.find(
      (q) => q.id === (sign.active ? "dock-b" : "dock-a"),
    )!;
    b.state = sign.active ? "rerouted" : "delivery";
    if (navigate(s, b, dock, 74)) {
      b.carrying = false;
      dock.active = true;
      b.state = "delivered";
      effect(s, "parcel", dock, 60);
      if (dock.id === "dock-a") {
        // A new parcel arrives after a short bounded delay; no unwinnable first-run timer trap.
        b.timer = 180;
      }
    }
  } else if (b.kind === "sentinel") {
    const patrols = [
      { x: 710, y: 300 },
      { x: 820, y: 470 },
      { x: 460, y: 360 },
      { x: 470, y: 100 },
    ];
    if (s.decoy && distance(b, s.decoy) < 480) {
      b.state = "investigate";
      navigate(s, b, s.decoy, 115);
    } else if (distance(b, s.player) < 185 && lineOfSight(s, b, s.player)) {
      b.state = "chase";
      b.timer = 80;
      navigate(s, b, s.player, 120);
      if (distance(b, s.player) < 29) hurt(s);
    } else if (b.timer > 0) {
      b.timer--;
      b.state = "search";
      navigate(s, b, { x: b.targetX, y: b.targetY }, 95);
    } else {
      b.state = "patrol";
      if (navigate(s, b, patrols[b.patrol], 65))
        b.patrol = (b.patrol + 1) % patrols.length;
    }
  } else {
    const changed = s.props.filter(
      (p) => p.active && (p.kind === "sign" || p.kind === "switch"),
    );
    const target = changed.sort((a, c) => distance(b, a) - distance(b, c))[0];
    if (target) {
      b.state = "repair";
      if (navigate(s, b, target, 52)) {
        b.timer++;
        if (b.timer >= 300) {
          target.active = false;
          b.timer = 0;
          effect(s, "repair", target, 50);
          if (s.mission === "vault" && target.kind === "sign") {
            const door = s.props.find((p) => p.kind === "door")!;
            // Never close a door on an actor, which could strand it in solid geometry.
            if (
              ![s.player, ...s.bots].some(
                (a) =>
                  Math.abs(a.x - door.x) < 45 && Math.abs(a.y - door.y) < 80,
              )
            )
              door.active = false;
          }
        }
      } else b.timer = 0;
    } else {
      b.state = "idle";
      b.timer = 0;
    }
  }
}
function updateShots(s: GameState): void {
  for (const shot of s.shots) {
    shot.ttl--;
    for (let k = 0; k < 3 && shot.ttl > 0; k++) {
      shot.x += shot.vx / 180;
      shot.y += shot.vy / 180;
      if (blocked(s, shot.x, shot.y, 3)) {
        shot.ttl = 0;
        break;
      }
      const target = s.bots.find((b) => distance(b, shot) < 22);
      if (target) {
        target.stun = 180;
        target.state = "stunned";
        move(s, target, shot.vx / 18, shot.vy / 18);
        effect(s, "splat", target, 50);
        award(s, "tricks", 100, `stun:${target.id}`);
        shot.ttl = 0;
      }
    }
  }
  s.shots = s.shots.filter((p) => p.ttl > 0);
}
function normalized(input: Input): Input {
  if (
    !input ||
    typeof input !== "object" ||
    Object.keys(input).some(
      (k) =>
        ![
          "x",
          "y",
          "aimX",
          "aimY",
          "dash",
          "fire",
          "interact",
          "gadget",
        ].includes(k),
    ) ||
    ![input.x, input.y, input.aimX, input.aimY].every(Number.isFinite) ||
    !Number.isInteger(input.gadget) ||
    input.gadget < 0 ||
    input.gadget > 3 ||
    typeof input.fire !== "boolean" ||
    typeof input.dash !== "boolean" ||
    typeof input.interact !== "boolean"
  )
    throw new Error("Invalid player input");
  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  return {
    ...input,
    x: clamp(input.x),
    y: clamp(input.y),
    aimX: clamp(input.aimX),
    aimY: clamp(input.aimY),
  };
}
export function step(s: GameState, rawInput: Input): void {
  const i = normalized(rawInput);
  if (s.paused || s.status !== "playing") return;
  s.tick++;
  s.timeLeft = Math.max(0, (ROUND_TICKS - s.tick) / 60);
  const p = s.player;
  p.gadget = i.gadget;
  p.cooldowns = p.cooldowns.map((c) => Math.max(0, c - 1));
  p.dashCooldown = Math.max(0, p.dashCooldown - 1);
  p.invulnerable = Math.max(0, p.invulnerable - 1);
  const aim = Math.hypot(i.aimX, i.aimY);
  if (aim > 0.01) {
    p.aimX = i.aimX / aim;
    p.aimY = i.aimY / aim;
  }
  if (i.dash && !s.dashHeld && p.dashCooldown === 0) {
    p.dashTicks = 12;
    p.dashCooldown = 75;
    effect(s, "dash", p, 18);
  }
  const d = Math.max(1, Math.hypot(i.x, i.y)),
    ax = i.x / d,
    ay = i.y / d;
  if (p.dashTicks > 0) {
    p.dashTicks--;
    p.vx = (d > 1 || i.x || i.y ? ax : p.aimX) * 520;
    p.vy = (d > 1 || i.x || i.y ? ay : p.aimY) * 520;
  } else {
    p.vx += (ax * 215 - p.vx) * 0.28;
    p.vy += (ay * 215 - p.vy) * 0.28;
  }
  move(s, p, p.vx / 60, p.vy / 60);
  for (const belt of s.props.filter((q) => q.kind === "conveyor")) {
    if (
      Math.abs(p.x - belt.x) < belt.w / 2 &&
      Math.abs(p.y - belt.y) < belt.h / 2
    )
      move(s, p, (belt.active ? -1 : 1) * 1.5, 0);
  }
  if (i.fire && (!s.fireHeld || p.gadget === 0)) useGadget(s, i);
  if (i.interact && !s.interactHeld) interact(s);
  s.interactHeld = i.interact;
  s.fireHeld = i.fire;
  s.dashHeld = i.dash;
  updateShots(s);
  if (s.decoy && --s.decoy.ttl <= 0) s.decoy = null;
  for (const b of s.bots) {
    for (const belt of s.props.filter((q) => q.kind === "conveyor")) {
      if (
        Math.abs(b.x - belt.x) < belt.w / 2 &&
        Math.abs(b.y - belt.y) < belt.h / 2
      )
        move(s, b, (belt.active ? -1 : 1) * 0.7, 0);
    }
    if (
      b.kind === "courier" &&
      !b.carrying &&
      b.timer > 0 &&
      s.phase === 0 &&
      s.mission === "mailroom"
    ) {
      if (--b.timer === 0) {
        b.carrying = true;
        b.x = 540;
        b.y = 360;
      }
    }
    updateBot(s, b);
  }
  s.effects = s.effects.filter((e) => --e.ttl > 0);
  if (s.status === "playing" && s.tick >= ROUND_TICKS) {
    s.status = "lost";
    s.objective = "Time up! Retry and try another trick.";
  }
  if (s.status === "playing") updateObjective(s);
}
function hashText(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++)
    h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return h >>> 0;
}
/** Reproducibility checksum, NOT a cryptographic signature or proof of human play. */
export function checksum(s: GameState): string {
  return hashText(JSON.stringify(s)).toString(16).padStart(8, "0");
}
export interface Replay {
  version: 1;
  build: string;
  mission: MissionId;
  seed: number;
  inputs: Input[];
  checksums: { tick: number; value: string }[];
  finalChecksum: string;
}
export function createReplay(
  mission: MissionId,
  seed: number,
  inputs: Input[],
): Replay {
  if (inputs.length > ROUND_TICKS) throw new Error("Replay too long");
  const s = createGame(mission, seed),
    checksums: Replay["checksums"] = [];
  const clean = inputs.map(normalized);
  for (const i of clean) {
    step(s, i);
    if (s.tick % 60 === 0) checksums.push({ tick: s.tick, value: checksum(s) });
  }
  return {
    version: 1,
    build: BUILD,
    mission,
    seed,
    inputs: clean,
    checksums,
    finalChecksum: checksum(s),
  };
}
export function verifyReplay(raw: unknown): {
  valid: boolean;
  reason: string;
  state?: GameState;
} {
  try {
    if (!raw || typeof raw !== "object") throw new Error("Not a replay");
    const r = raw as Replay;
    if (
      r.version !== 1 ||
      r.build !== BUILD ||
      !Array.isArray(r.inputs) ||
      !Array.isArray(r.checksums) ||
      typeof r.finalChecksum !== "string" ||
      r.inputs.length > ROUND_TICKS
    )
      throw new Error("Unsupported or oversized replay");
    const expected = createReplay(r.mission, r.seed, r.inputs);
    if (
      JSON.stringify(expected.checksums) !== JSON.stringify(r.checksums) ||
      expected.finalChecksum !== r.finalChecksum
    )
      throw new Error("Replay checksum mismatch");
    const state = createGame(r.mission, r.seed);
    for (const i of r.inputs) step(state, i);
    return {
      valid: true,
      reason:
        "Compatible build and deterministic checksums match; not an authenticity claim",
      state,
    };
  } catch (e) {
    return {
      valid: false,
      reason: e instanceof Error ? e.message : "Invalid replay",
    };
  }
}
