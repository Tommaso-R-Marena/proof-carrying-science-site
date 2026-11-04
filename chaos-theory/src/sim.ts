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
  facing: number;
  awareness: number;
  arriving: number;
  reaction:
    | "none"
    | "double-take"
    | "grumble"
    | "doughnut"
    | "annoyed"
    | "lost"
    | "parcel-gone";
  reactionTicks: number;
  lookPause: number;
  noticeSeen: boolean;
  decoySeen: number;
  curiosity: number;
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
export interface MailRun {
  banked: number;
  carrying: boolean;
  loose: Point | null;
  route: "none" | "redirect" | "intercept";
  methods: ("redirect" | "intercept")[];
  alertLevel: number;
  clean: boolean;
  escapeDeadline: number | null;
  secondRoute: "undecided" | "carried" | "sorter";
  transit: "none" | "moving" | "jammed" | "ready";
  noise: (Point & { ttl: number }) | null;
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
  mail: MailRun | null;
  goal: Point & { label: string };
  decoy: (Point & { ttl: number; serial?: number }) | null;
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
    facing: Math.PI,
    awareness: 0,
    arriving: 0,
    reaction: "none",
    reactionTicks: 0,
    lookPause: 0,
    noticeSeen: false,
    decoySeen: -1,
    curiosity: 0,
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
    mail:
      mission === "mailroom"
        ? {
            banked: 0,
            carrying: false,
            loose: null,
            route: "none",
            methods: [],
            alertLevel: 0,
            clean: true,
            escapeDeadline: null,
            secondRoute: "undecided",
            transit: "none",
            noise: null,
          }
        : null,
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
    s.bots[2].x = 775;
    s.bots[2].y = 150;
    s.solids = [
      { x: 245, y: 90, w: 120, h: 105 },
      { x: 440, y: 90, w: 50, h: 145 },
      { x: 440, y: 365, w: 50, h: 140 },
      { x: 675, y: 85, w: 60, h: 115 },
    ];
    s.props = [
      prop("notice", "sign", 350, 300),
      prop("belt", "conveyor", 590, 300, 190, 80),
      prop("gate", "door", 465, 300, 50, 130),
      prop("dock-a", "dock", 850, 130, 80, 65),
      prop("dock-b", "dock", 850, 470, 80, 65),
      prop("stash", "exit", 120, 470, 115, 80),
      prop("getaway", "exit", 850, 300, 90, 90),
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
/** Actor-size-aware segment check: visual LOS alone can clip collision corners. */
function clearTravel(s: GameState, a: Point, b: Point): boolean {
  const n = Math.max(1, Math.ceil(distance(a, b) / 5));
  for (let i = 0; i <= n; i++)
    if (
      blocked(s, a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n, 13)
    )
      return false;
  return true;
}
/** Four-connected deterministic BFS. Unreachable targets explicitly return null. */
export function nextWaypoint(
  s: GameState,
  from: Point,
  to: Point,
): Point | null {
  if (clearTravel(s, from, to)) return to;
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
      s.decoy = { ...target, ttl: 360, serial: s.nextEffectId };
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
          [s.player, ...s.bots, ...(s.mail?.loose ? [s.mail.loose] : [])].some(
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
/** Actual guarded deposit/pickup loop. A parcel is consumed once and only at the stash. */
export function mailBeat(s: GameState): 1 | 2 | 3 {
  return s.mail!.banked === 0 ? 1 : s.mail!.banked === 1 ? 2 : 3;
}
function react(b: Bot, reaction: Bot["reaction"], ticks = 90, pause = 0) {
  b.reaction = reaction;
  b.reactionTicks = ticks;
  b.lookPause = pause;
}
function interactMail(s: GameState) {
  const m = s.mail!,
    p = s.player,
    c = s.bots.find((b) => b.kind === "courier")!,
    stash = s.props.find((p) => p.id === "stash")!;
  if (m.escapeDeadline !== null) {
    if (
      s.tick < m.escapeDeadline &&
      distance(p, s.props.find((p) => p.id === "getaway")!) < 70
    )
      win(s);
    return;
  }
  if (m.carrying) {
    const belt = s.props.find((p) => p.kind === "conveyor")!;
    if (
      m.banked === 1 &&
      Math.abs(p.x - belt.x) <= belt.w / 2 + 12 &&
      Math.abs(p.y - belt.y) <= belt.h / 2 + 12 &&
      belt.active
    ) {
      m.carrying = false;
      m.loose = { x: 590, y: 300 };
      m.transit = "moving";
      m.secondRoute = "sorter";
      s.phase = 0;
      m.noise = { x: 590, y: 300, ttl: 240 };
      m.alertLevel = 2;
      effect(s, "sorter", belt, 90);
      return;
    }
    if (distance(p, stash) > 70) return;
    m.carrying = false;
    m.banked++;
    s.phase = 0;
    m.transit = "none";
    award(s, "objective", 150, `bank:${m.banked}`);
    effect(s, "bank", stash, 90);
    if (m.methods.length === 2) award(s, "variety", 120, "mixed-route");
    if (m.banked === 2) {
      if (m.secondRoute === "undecided") m.secondRoute = "carried";
      award(s, "tricks", 100, "second-route");
    }
    s.props.find((p) => p.id === "dock-b")!.active = false;
    s.props.find((p) => p.kind === "sign")!.active = false;
    if (m.banked === 3) {
      m.escapeDeadline = Math.min(ROUND_TICKS, s.tick + 1080);
      effect(s, "getaway", s.props.find((p) => p.id === "getaway")!, 120);
    } else effect(s, "beat", stash, 100);
    return;
  }
  const intercepted = c.carrying && c.stun > 0 && distance(p, c) < 65;
  if (intercepted || (m.loose && distance(p, m.loose) < 65)) {
    const route = intercepted
      ? "intercept"
      : m.route === "intercept"
        ? "intercept"
        : "redirect";
    m.carrying = true;
    m.loose = null;
    m.transit = "none";
    m.route = route;
    s.phase = 1;
    if (intercepted) {
      c.carrying = false;
      c.timer = 0;
      react(c, "parcel-gone", 100, 18);
    }
    if (!m.methods.includes(route)) m.methods.push(route);
    award(s, "objective", 50, `pickup:${m.banked}`);
    effect(s, "snatch", p, 65);
  }
}
function updateMailParcel(s: GameState) {
  const m = s.mail;
  if (!m) return;
  if (m.noise && --m.noise.ttl <= 0) m.noise = null;
  if (!m.loose) return;
  if (m.transit === "moving" || m.transit === "jammed") {
    const belt = s.props.find((p) => p.kind === "conveyor")!;
    if (!belt.active) {
      m.transit = "none";
      effect(s, "jam", m.loose, 70);
      return;
    }
    const before = { ...m.loose };
    if (m.loose.x > 360) move(s, m.loose, -Math.min(3, m.loose.x - 360), 0);
    else move(s, m.loose, 0, Math.min(3, 360 - m.loose.y));
    if (m.loose.x <= 360 && m.loose.y >= 360) {
      m.loose = { x: 360, y: 360 };
      m.transit = "ready";
      effect(s, "sorter-arrived", m.loose, 90);
    } else if (before.x === m.loose.x && before.y === m.loose.y) {
      if (m.transit !== "jammed") effect(s, "jam", m.loose, 70);
      m.transit = "jammed";
    } else m.transit = "moving";
  } else if (m.transit !== "ready") {
    for (const belt of s.props.filter((p) => p.kind === "conveyor"))
      if (
        Math.abs(m.loose.x - belt.x) < belt.w / 2 &&
        Math.abs(m.loose.y - belt.y) < belt.h / 2
      )
        move(s, m.loose, belt.active ? -1.5 : 1.5, 0);
  }
}
export function sentinelSees(s: GameState, b: Bot): boolean {
  const d = distance(b, s.player);
  if (!lineOfSight(s, b, s.player)) return false;
  if (d < 65) return true;
  if (d > 190 + (s.mail?.alertLevel ?? 0) * 22) return false;
  const angle = Math.atan2(s.player.y - b.y, s.player.x - b.x);
  return (
    Math.abs(
      Math.atan2(Math.sin(angle - b.facing), Math.cos(angle - b.facing)),
    ) <
    Math.PI / 3
  );
}
function updateMailPressure(s: GameState) {
  if (!s.mail) return;
  const m = s.mail;
  const next = Math.min(
    2,
    Math.max(m.banked, s.tick >= 3000 ? 2 : s.tick >= 1800 ? 1 : 0),
  );
  if (next > m.alertLevel) {
    m.alertLevel = next;
    effect(s, "alarm", s.player, 100);
  }
  if (next === 2 && !s.bots.some((b) => b.id === "backup")) {
    const backup = bot("backup", "sentinel", 850, 190);
    backup.arriving = 180;
    s.bots.push(backup);
    effect(s, "backup", backup, 180);
  }
}
function interact(s: GameState): void {
  const p = s.player;
  if (s.mission === "mailroom") {
    interactMail(s);
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
  award(s, "objective", s.mail ? 600 : 1000, "win");
  award(s, "time", Math.floor(s.timeLeft * (s.mail ? 4 : 10)), "time");
  if (s.mail?.clean) award(s, "tricks", 150, "clean-haul");
  effect(s, "victory", s.player, 120);
  updateObjective(s);
}
function hurt(s: GameState): void {
  if (s.status !== "playing") return;
  const p = s.player;
  if (p.invulnerable > 0 || p.dashTicks > 0) return;
  p.hp--;
  if (s.mail) s.mail.clean = false;
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
    const m = s.mail!,
      courier = s.bots.find((b) => b.kind === "courier")!;
    const stash = s.props.find((p) => p.id === "stash")!;
    if (m.escapeDeadline !== null) {
      s.objective = "All parcels stashed! Catch the last tram. E at the exit.";
      s.goal = {
        ...s.props.find((p) => p.id === "getaway")!,
        label: "CATCH THE TRAM · E",
      };
    } else if (m.transit === "moving" || m.transit === "jammed") {
      s.objective =
        m.transit === "jammed"
          ? "Sorter jammed. Open the gate or grab your parcel with E."
          : "Parcel in the sorter! Collect it on the staff side.";
      s.goal = {
        ...m.loose!,
        label: m.transit === "jammed" ? "OPEN GATE · 3" : "FOLLOW YOUR PARCEL",
      };
    } else if (m.carrying) {
      s.objective =
        m.banked === 1
          ? "Choose: carry it home quietly, or reverse the belt + E for the noisy express route."
          : `Parcel secured! Take it home. E at your hideout. (${m.banked}/3 stashed)`;
      s.goal = { ...stash, label: "STASH PARCEL · E" };
    } else if (m.loose) {
      s.objective = `Parcel waiting! Grab it with E. (${m.banked}/3 stashed)`;
      s.goal = { ...m.loose, label: "GRAB PARCEL · E" };
    } else if (courier.stun > 0 && courier.carrying) {
      s.objective =
        "Courier stunned! Get close and press E to snatch its parcel.";
      s.goal = { ...courier, label: "SNATCH · E" };
    } else if (s.props.find((p) => p.kind === "sign")!.active) {
      s.objective = `Courier fooled. Meet it at the orange collection bay. (${m.banked}/3 stashed)`;
      s.goal = {
        ...s.props.find((p) => p.id === "dock-b")!,
        label: "COLLECTION BAY",
      };
    } else {
      s.objective = `Stash three parcels, then escape. Use 4 at the sign, or foam + E. (${m.banked}/3)`;
      s.goal = {
        ...s.props.find((p) => p.kind === "sign")!,
        label: "FOOL THE COURIER · 4",
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
  if (d > 0) {
    b.facing = Math.atan2(dy, dx);
    move(s, b, ((dx / d) * speed) / 60, ((dy / d) * speed) / 60);
  }
  return false;
}
function updateBot(s: GameState, b: Bot): void {
  const previous = b.state;
  b.reactionTicks = Math.max(0, b.reactionTicks - 1);
  if (b.arriving > 0) {
    b.arriving--;
    b.state = "arriving";
    return;
  }
  if (b.lookPause > 0 && b.stun === 0) {
    b.lookPause--;
    return;
  }
  if (b.stun > 0) {
    b.stun--;
    b.state = "stunned";
    return;
  }
  if (b.kind === "courier") {
    if (!s.mail) {
      b.state = "idle";
      return;
    }
    const m = s.mail;
    if (m.escapeDeadline !== null) {
      b.state = "idle";
      return;
    }
    if (!b.carrying) {
      if (m.carrying || m.loose) {
        b.state = "confused";
        return;
      }
      b.state = "collecting";
      if (distance(b, { x: 590, y: 300 }) < 30) {
        b.state = "loading";
        b.timer++;
        if (b.timer >= 45) {
          b.carrying = true;
          b.timer = 0;
          effect(s, "loaded", b, 45);
        }
      } else {
        b.timer = 0;
        navigate(s, b, { x: 590, y: 300 }, 100);
      }
      return;
    }
    const sign = s.props.find((p) => p.kind === "sign")!;
    const dock = s.props.find(
      (p) => p.id === (sign.active ? "dock-b" : "dock-a"),
    )!;
    if (sign.active !== b.noticeSeen) {
      b.noticeSeen = sign.active;
      react(b, "double-take", 90, 18);
      b.state = "reading";
      return;
    }
    b.state = sign.active ? "rerouted" : "delivery";
    if (navigate(s, b, dock, 78)) {
      b.carrying = false;
      b.timer = 0;
      dock.active = true;
      if (sign.active) {
        m.loose = { x: dock.x, y: dock.y };
        m.route = "redirect";
        effect(s, "parcel", dock, 70);
      } else {
        effect(s, "delivered", dock, 50);
      }
    }
  } else if (b.kind === "sentinel") {
    const patrols = [
      { x: 710, y: 300 },
      { x: 820, y: 470 },
      { x: 460, y: 360 },
      { x: 470, y: 100 },
    ];
    if (
      s.decoy &&
      distance(b, s.decoy) < 480 &&
      b.decoySeen !== (s.decoy.serial ?? -2)
    ) {
      b.decoySeen = s.decoy.serial ?? -2;
      b.curiosity = 180;
      react(b, "doughnut", 90, s.mail ? 12 : 0);
    }
    if (s.decoy && distance(b, s.decoy) < 480 && b.curiosity > 0) {
      if (s.mail) b.curiosity--;
      if (b.curiosity === 0) react(b, "annoyed", 100, 18);
      b.state = "investigate";
      navigate(s, b, s.decoy, 115);
    } else if (
      s.mail
        ? sentinelSees(s, b)
        : distance(b, s.player) < 185 && lineOfSight(s, b, s.player)
    ) {
      if (s.mail) {
        b.awareness = Math.min(60, b.awareness + 2);
        if (b.awareness < 60) {
          b.state = "suspicious";
          b.facing = Math.atan2(s.player.y - b.y, s.player.x - b.x);
          return;
        }
      }
      b.state = "chase";
      b.timer = 80;
      navigate(s, b, s.player, s.mail ? 125 + s.mail.alertLevel * 16 : 120);
      if (distance(b, s.player) < 29) hurt(s);
    } else if (s.mail?.noise && distance(b, s.mail.noise) < 500) {
      b.state = "investigate";
      navigate(s, b, s.mail.noise, 110);
    } else if (b.timer > 0) {
      b.awareness = Math.max(0, b.awareness - 1);
      b.timer--;
      b.state = "search";
      navigate(s, b, { x: b.targetX, y: b.targetY }, 95);
    } else {
      b.awareness = Math.max(0, b.awareness - 3);
      b.state = "patrol";
      if (previous === "search") react(b, "lost", 90, 12);
      if (
        navigate(
          s,
          b,
          patrols[b.patrol],
          s.mail ? 72 + s.mail.alertLevel * 10 : 65,
        )
      )
        b.patrol = (b.patrol + 1) % patrols.length;
    }
  } else {
    const changed = s.props.filter(
      (p) =>
        p.active &&
        (p.kind === "sign" ||
          p.kind === "switch" ||
          (s.mail && p.kind === "conveyor")),
    );
    const target = changed.sort((a, c) => distance(b, a) - distance(b, c))[0];
    if (target) {
      b.state = "repair";
      if (navigate(s, b, target, 52)) {
        if (b.timer === 0) react(b, "grumble", 110);
        b.timer++;
        if (b.timer >= 300) {
          target.active = false;
          b.timer = 0;
          effect(s, "repair", target, 50);
          if (s.mission === "vault" && target.kind === "sign") {
            const door = s.props.find((p) => p.kind === "door")!;
            // Never close a door on an actor, which could strand it in solid geometry.
            if (
              ![
                s.player,
                ...s.bots,
                ...(s.mail?.loose ? [s.mail.loose] : []),
              ].some(
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
      if (s.mail?.loose && distance(s.mail.loose, shot) < 22) {
        move(s, s.mail.loose, shot.vx / 15, shot.vy / 15);
        effect(s, "parcel-bump", s.mail.loose, 45);
        shot.ttl = 0;
        continue;
      }
      const target = s.bots.find(
        (b) => b.arriving === 0 && distance(b, shot) < 22,
      );
      if (target) {
        const combo =
          s.mail &&
          target.kind === "sentinel" &&
          target.state === "investigate" &&
          s.decoy &&
          s.props.some(
            (p) =>
              p.kind === "conveyor" &&
              p.active &&
              Math.abs(target.x - p.x) < p.w / 2 &&
              Math.abs(target.y - p.y) < p.h / 2,
          );
        if (combo) {
          award(s, "tricks", 150, "return-to-sender");
          effect(s, "combo-belt", target, 100);
          react(target, "annoyed", 100);
        }
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
/** A binary grid prevents tiny engine-specific transcendental/normalization differences from accumulating. */
function quantizeState(s: GameState): void {
  const q = (v: number) => Math.round(v * 65536) / 65536;
  for (const a of [
    s.player,
    ...s.bots,
    ...s.shots,
    ...s.effects,
    s.goal,
    ...(s.decoy ? [s.decoy] : []),
    ...(s.mail?.loose ? [s.mail.loose] : []),
    ...(s.mail?.noise ? [s.mail.noise] : []),
  ]) {
    a.x = q(a.x);
    a.y = q(a.y);
  }
  s.player.vx = q(s.player.vx);
  s.player.vy = q(s.player.vy);
  s.player.aimX = q(s.player.aimX);
  s.player.aimY = q(s.player.aimY);
  for (const b of s.bots) {
    b.facing = q(b.facing);
    b.targetX = q(b.targetX);
    b.targetY = q(b.targetY);
  }
  for (const p of s.shots) {
    p.vx = q(p.vx);
    p.vy = q(p.vy);
  }
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
  const burden = s.mail?.carrying && p.dashTicks === 0 ? 0.9 : 1;
  move(s, p, (p.vx / 60) * burden, (p.vy / 60) * burden);
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
  updateMailPressure(s);
  updateShots(s);
  updateMailParcel(s);
  if (s.mail?.escapeDeadline != null) {
    const remaining = s.mail.escapeDeadline - s.tick;
    if (remaining > 0 && remaining <= 300 && remaining % 60 === 0)
      effect(s, "time-warning", s.player, 25);
  }
  if (s.decoy && --s.decoy.ttl <= 0) s.decoy = null;
  for (const b of s.bots) {
    for (const belt of s.props.filter((q) => q.kind === "conveyor")) {
      if (
        !(
          b.kind === "courier" &&
          !b.carrying &&
          (b.state === "loading" || distance(b, { x: 590, y: 300 }) < 30)
        ) &&
        Math.abs(b.x - belt.x) < belt.w / 2 &&
        Math.abs(b.y - belt.y) < belt.h / 2
      )
        move(s, b, (belt.active ? -1 : 1) * 0.7, 0);
    }
    updateBot(s, b);
  }
  s.effects = s.effects.filter((e) => --e.ttl > 0);
  if (
    s.mail?.escapeDeadline !== null &&
    s.mail &&
    s.tick >= s.mail.escapeDeadline &&
    s.status === "playing"
  ) {
    s.status = "lost";
    s.objective = "The tram left. Retry and take a quicker escape route.";
  }
  if (s.status === "playing" && s.tick >= ROUND_TICKS) {
    s.status = "lost";
    s.objective = "Time up! Retry and try another trick.";
  }
  if (s.status === "playing") updateObjective(s);
  quantizeState(s);
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
