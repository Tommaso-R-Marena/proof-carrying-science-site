/** Deterministic simulation soak. No human or real-model observations. */
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { mkdir, writeFile } from "node:fs/promises";
import {
  createGame,
  EMPTY_INPUT,
  step,
  checksum,
  ROUND_TICKS,
  nextWaypoint,
} from "../src/sim";
import { BUILD, type MissionId } from "../src/contracts";

const start = performance.now(),
  before = process.memoryUsage();
const missions: MissionId[] = ["mailroom", "vault", "reactor"];
const rounds: {
  seed: number;
  mission: string;
  ticks: number;
  status: string;
  checksum: string;
  elapsedMs: number;
  maxEffects: number;
  maxShots: number;
}[] = [];
let totalTicks = 0;
for (let round = 0; round < 120; round++) {
  const mission = missions[round % missions.length],
    s = createGame(mission, round + 1000);
  const t = performance.now();
  let maxEffects = 0,
    maxShots = 0;
  for (let i = 0; i < ROUND_TICKS; i++) {
    // A simple deterministic active player: loop between waypoints, fire foam,
    // periodically dash. Idle scripted bots remain active, including contact damage.
    const targets = [
      { x: 120, y: 300 },
      { x: 170, y: 450 },
      { x: 170, y: 140 },
    ];
    const target = targets[Math.floor(i / 180) % targets.length];
    const waypoint = nextWaypoint(s, s.player, target);
    const dx = (waypoint?.x ?? s.player.x) - s.player.x,
      dy = (waypoint?.y ?? s.player.y) - s.player.y;
    const d = Math.max(1, Math.hypot(dx, dy));
    step(s, {
      ...EMPTY_INPUT,
      x: dx / d,
      y: dy / d,
      fire: i % 5 === 0,
      dash: i % 100 === 0,
      aimX: 1,
      aimY: 0,
    });
    for (const actor of [s.player, ...s.bots]) {
      if (
        !Number.isFinite(actor.x) ||
        !Number.isFinite(actor.y) ||
        actor.x < 22 ||
        actor.y < 22 ||
        actor.x > 938 ||
        actor.y > 578
      )
        throw new Error(`Invalid actor in round ${round}`);
    }
    maxEffects = Math.max(maxEffects, s.effects.length);
    maxShots = Math.max(maxShots, s.shots.length);
    if (s.effects.length > 80 || s.shots.length > 40 || s.events.length > 1)
      throw new Error("Transient state exceeded its bound");
    if (s.status !== "playing") break;
  }
  totalTicks += s.tick;
  rounds.push({
    seed: s.seed,
    mission,
    ticks: s.tick,
    status: s.status,
    checksum: checksum(s),
    elapsedMs: performance.now() - t,
    maxEffects,
    maxShots,
  });
}
const after = process.memoryUsage();
const report = {
  schemaVersion: 1,
  kind: "deterministic simulation soak, not human play or a browser memory-leak claim",
  build: BUILD,
  rounds: rounds.length,
  totalTicks,
  simulatedSeconds: totalTicks / 60,
  elapsedMs: performance.now() - start,
  memoryBefore: before,
  memoryAfter: after,
  memoryCaveat:
    "RSS/heap include Node garbage collection and test allocations. Bounded transient-state checks establish limits, not absence of all memory leaks.",
  invariants: {
    finiteInBoundsActors: true,
    boundedEffects: true,
    boundedShots: true,
    atMostOneMappingPerRound: true,
  },
  results: rounds,
};
await mkdir("results", { recursive: true });
const output = `results/soak-${randomUUID()}.json`;
await writeFile(output, JSON.stringify(report, null, 2) + "\n", { flag: "wx" });
console.log(
  JSON.stringify({
    rounds: report.rounds,
    totalTicks,
    elapsedMs: report.elapsedMs,
    artifact: output,
  }),
);
