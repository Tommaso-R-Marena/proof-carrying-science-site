import { it, expect } from "vitest";
import {
  createGame,
  step,
  EMPTY_INPUT,
  nextWaypoint,
  createReplay,
  verifyReplay,
  PRACTICE_TICKS,
  type GameState,
  type Input,
} from "../src/sim";
import { JOBS, completedJobs, nextJob, lesson } from "../src/jobs";
import { freshProgress, loadProgress, saveProgress } from "../src/storage";
import { PlaytestRecorder } from "../src/playtest";
function walk(s: GameState, to: { x: number; y: number }, inputs: Input[]) {
  for (
    let i = 0;
    i < 1800 && Math.hypot(s.player.x - to.x, s.player.y - to.y) > 40;
    i++
  ) {
    const p = nextWaypoint(s, s.player, to);
    if (!p) throw Error("No lesson route");
    const dx = p.x - s.player.x,
      dy = p.y - s.player.y,
      n = Math.hypot(dx, dy) || 1;
    const input = { ...EMPTY_INPUT, x: dx / n, y: dy / n, gadget: 3 as const };
    inputs.push(input);
    step(s, input);
  }
  expect(Math.hypot(s.player.x - to.x, s.player.y - to.y)).toBeLessThanOrEqual(
    41,
  );
}
it("teaches a real redirection, pickup and delivery entirely through valid inputs, then independently replays the lesson", () => {
  const s = createGame("mailroom", 42, "practice"),
    inputs: Input[] = [];
  const act = (i: Partial<Input> = {}) => {
    const v = { ...EMPTY_INPUT, ...i };
    inputs.push(v);
    step(s, v);
  };
  expect(lesson(s).step).toBe(0);
  walk(s, { x: 300, y: 300 }, inputs);
  act({ gadget: 3, fire: true });
  act();
  expect(lesson(s).step).toBe(1);
  walk(s, { x: 850, y: 470 }, inputs);
  for (let i = 0; i < 500 && !s.mail!.loose; i++) act();
  expect(lesson(s).step).toBe(2);
  act({ interact: true });
  act();
  expect(lesson(s).step).toBe(3);
  walk(s, { x: 120, y: 470 }, inputs);
  act({ interact: true });
  expect(s.status).toBe("won");
  expect(s.mail!.banked).toBe(1);
  expect(s.player.hp).toBe(3);
  expect(s.mail!.escapeDeadline).toBeNull();
  expect(lesson(s).step).toBe(4);
  expect(completedJobs(s)).toEqual([]);
  const replay = createReplay("mailroom", 42, inputs, "practice");
  expect(verifyReplay(replay).state?.status).toBe("won");
  expect(verifyReplay({ ...replay, mode: "heist" }).valid).toBe(false);
});
it("keeps lesson guard behavior, time budget and observations separate from actual heists", () => {
  const p = createGame("mailroom", 2, "practice"),
    normal = createGame("mailroom", 2);
  expect(p.props.find((q) => q.id === "gate")!.active).toBe(true);
  expect(normal.props.find((q) => q.id === "gate")!.active).toBe(false);
  for (let i = 0; i < 120; i++) step(p, EMPTY_INPUT);
  expect(p.bots[1].state).toBe("off-duty");
  expect(p.mail!.alertLevel).toBe(0);
  const recorder = new PlaytestRecorder();
  recorder.optIn("automated-test", "practice-exclusion");
  recorder.begin(p, 0);
  recorder.finish(p, 1, "abandoned");
  expect(recorder.snapshot()!.observations).toEqual([]);
  p.tick = PRACTICE_TICKS - 1;
  step(p, EMPTY_INPUT);
  expect(p.status).toBe("lost");
  expect(() => createGame("vault", 1, "practice")).toThrow();
  expect(() =>
    createReplay(
      "mailroom",
      1,
      Array.from({ length: PRACTICE_TICKS + 1 }, () => EMPTY_INPUT),
      "practice",
    ),
  ).toThrow();
  expect(
    verifyReplay({ ...createReplay("mailroom", 1, []), mode: "pretend-win" })
      .valid,
  ).toBe(false);
});
it("awards optional jobs only after actual heist escape conditions and never for lesson or incomplete state", () => {
  const s = createGame("mailroom", 1);
  expect(completedJobs(s)).toEqual([]);
  s.status = "won";
  expect(completedJobs(s)).toEqual([]);
  s.mail!.banked = 3;
  expect(completedJobs(s)).toEqual([]);
  s.mail!.escapeDeadline = 1000;
  s.mail!.secondRoute = "sorter";
  s.mail!.methods = ["redirect", "intercept"];
  s.scored.push("return-to-sender");
  expect(completedJobs(s)).toEqual(JOBS.map((j) => j.id));
  s.usedGadgets.push(0);
  s.mail!.clean = false;
  s.player.hp = 2;
  s.scored = [];
  s.mail!.methods = ["redirect"];
  s.mail!.secondRoute = "carried";
  expect(completedJobs(s)).toEqual(["first-escape"]);
  s.mode = "practice";
  expect(completedJobs(s)).toEqual([]);
  s.mode = "heist";
  s.mission = "vault";
  expect(completedJobs(s)).toEqual([]);
  expect(nextJob([]).id).toBe("first-escape");
  expect(nextJob(JOBS.map((j) => j.id)).id).toBe("first-escape");
});
it("retains earlier scores and roundtrips bounded optional mastery without granting tools or changing score rules", () => {
  const progress = freshProgress();
  progress.jobs = ["express", "smooth"];
  progress.lessonDone = true;
  let data = "";
  saveProgress(
    {
      setItem(_k, v) {
        data = v;
      },
    },
    progress,
  );
  expect(loadProgress({ getItem: () => data })).toEqual(progress);
  const corrupt = loadProgress({
    getItem: () =>
      JSON.stringify({
        version: 1,
        scoreRules: 3,
        jobs: ["express", "express", "invented"],
        lessonDone: "yes",
        bests: { mailroom: 2222 },
      }),
  });
  expect(corrupt.jobs).toEqual(["express"]);
  expect(corrupt.lessonDone).toBe(false);
  expect(corrupt.bests.mailroom).toBe(2222);
});
