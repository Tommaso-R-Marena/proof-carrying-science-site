/** Optional local observation capture. No network, identifiers from people, raw keys, or human attestation. */
import { z } from "zod";
import { BUILD } from "./contracts";
import type { GameState } from "./sim";
const ms = z.number().int().min(0).max(86_400_000),
  count = z.number().int().min(0).max(1000000);
export const observationSchema = z
  .object({
    run: z.number().int().min(1).max(20),
    mission: z.enum(["mailroom", "vault", "reactor"]),
    seed: z.number().int().min(0).max(0xffffffff),
    outcome: z.enum(["won", "lost", "abandoned"]),
    wallMs: ms,
    wallTimeCapped: z.boolean(),
    gameTicks: z.number().int().min(0).max(5400),
    firstMoveMs: ms.nullable(),
    firstGadgetMs: ms.nullable(),
    firstPickupMs: ms.nullable(),
    firstBankMs: ms.nullable(),
    gadgets: count,
    failedGadgets: count,
    hits: z.number().int().min(0).max(3),
    banked: z.number().int().min(0).max(3),
    methods: z.array(z.enum(["redirect", "intercept"])).max(2),
    secondRoute: z.enum(["undecided", "carried", "sorter"]),
    escapePhaseReached: z.boolean(),
    score: count,
    choice: z
      .enum(["retry-click", "next-mission-click", "home-click"])
      .nullable(),
    feedback: z
      .object({
        clarity: z.enum(["clear", "sometimes-unclear", "unclear"]).nullable(),
        tactics: z.enum(["none", "one", "several"]).nullable(),
        again: z.enum(["yes", "unsure", "no"]).nullable(),
      })
      .strict(),
  })
  .strict();
export type Observation = z.infer<typeof observationSchema>;
export const playtestSchema = z
  .object({
    version: z.literal(1),
    build: z.literal(BUILD),
    source: z.literal("local-unattested"),
    mode: z.enum(["unattested-local", "automated-test"]),
    consent: z.literal(true),
    session: z
      .string()
      .min(1)
      .max(80)
      .regex(/^[a-zA-Z0-9_-]+$/),
    observations: z.array(observationSchema).max(20),
  })
  .strict();
export type PlaytestReport = z.infer<typeof playtestSchema>;
export class PlaytestRecorder {
  private report: PlaytestReport | null = null;
  private active: Observation | null = null;
  private started = 0;
  private position = { x: 0, y: 0 };
  private priorHp = 3;
  private effects = 0;
  get enabled() {
    return this.report !== null;
  }
  optIn(mode: PlaytestReport["mode"], id: string = crypto.randomUUID()) {
    if (this.report) return;
    this.report = playtestSchema.parse({
      version: 1,
      build: BUILD,
      source: "local-unattested",
      mode,
      consent: true,
      session: id,
      observations: [],
    });
  }
  clear() {
    this.report = null;
    this.active = null;
  }
  begin(s: GameState, now: number) {
    if (!this.report || this.active || this.report.observations.length >= 20)
      return;
    this.started = now;
    this.position = { x: s.player.x, y: s.player.y };
    this.priorHp = s.player.hp;
    this.effects = s.nextEffectId;
    this.active = {
      run: this.report.observations.length + 1,
      mission: s.mission,
      seed: s.seed,
      outcome: "abandoned",
      wallMs: 0,
      wallTimeCapped: false,
      gameTicks: 0,
      firstMoveMs: null,
      firstGadgetMs: null,
      firstPickupMs: null,
      firstBankMs: null,
      gadgets: 0,
      failedGadgets: 0,
      hits: 0,
      banked: 0,
      methods: [],
      secondRoute: "undecided",
      escapePhaseReached: false,
      score: 0,
      choice: null,
      feedback: { clarity: null, tactics: null, again: null },
    };
  }
  private elapsed(now: number) {
    return Math.round(Math.min(86400000, Math.max(0, now - this.started)));
  }
  observe(s: GameState, now: number) {
    const a = this.active;
    if (!a) return;
    const at = this.elapsed(now);
    if (
      a.firstMoveMs === null &&
      Math.hypot(s.player.x - this.position.x, s.player.y - this.position.y) > 1
    )
      a.firstMoveMs = at;
    const effects = s.effects.filter((e) => e.id >= this.effects);
    const uses = effects.filter((e) =>
      ["foam", "decoy", "hack", "beacon"].includes(e.kind),
    ).length;
    if (uses && a.firstGadgetMs === null) a.firstGadgetMs = at;
    a.gadgets += uses;
    a.failedGadgets += effects.filter((e) =>
      ["blocked", "out-of-range"].includes(e.kind),
    ).length;
    if (s.mail?.carrying && a.firstPickupMs === null) a.firstPickupMs = at;
    if (s.mail && s.mail.banked > 0 && a.firstBankMs === null)
      a.firstBankMs = at;
    a.hits += Math.max(0, this.priorHp - s.player.hp);
    this.priorHp = s.player.hp;
    this.effects = s.nextEffectId;
  }
  finish(s: GameState, now: number, outcome: Observation["outcome"]) {
    const a = this.active;
    if (!a || !this.report) return;
    this.observe(s, now);
    a.outcome = outcome;
    a.wallMs = this.elapsed(now);
    a.wallTimeCapped = now - this.started > 86400000;
    a.gameTicks = s.tick;
    a.banked = s.mail?.banked ?? 0;
    a.methods = [...(s.mail?.methods ?? [])];
    a.secondRoute = s.mail?.secondRoute ?? "undecided";
    a.escapePhaseReached = s.mail?.escapeDeadline !== null && !!s.mail;
    a.score = s.score;
    this.report.observations.push(observationSchema.parse(a));
    this.active = null;
  }
  choose(choice: NonNullable<Observation["choice"]>) {
    const a = this.report?.observations.at(-1);
    if (a) a.choice = choice;
  }
  feedback(key: keyof Observation["feedback"], value: string | null) {
    const a = this.report?.observations.at(-1);
    if (a) {
      const proposed = { ...a, feedback: { ...a.feedback, [key]: value } };
      a.feedback = observationSchema.parse(proposed).feedback;
    }
  }
  snapshot(): PlaytestReport | null {
    return this.report
      ? playtestSchema.parse(structuredClone(this.report))
      : null;
  }
}
export function summarizePlaytest(value: unknown) {
  const r = playtestSchema.parse(value);
  const a = r.observations;
  const complete = a.filter((x) => x.outcome !== "abandoned");
  const median = (v: (number | null)[]) => {
    const n = v.filter((x): x is number => x !== null).sort((x, y) => x - y);
    return n.length
      ? (n[Math.floor((n.length - 1) / 2)] + n[Math.ceil((n.length - 1) / 2)]) /
          2
      : null;
  };
  return {
    mode: r.mode,
    source: r.source,
    observations: a.length,
    completed: complete.length,
    won: a.filter((x) => x.outcome === "won").length,
    abandoned: a.filter((x) => x.outcome === "abandoned").length,
    retryClicks: a.filter((x) => x.choice === "retry-click").length,
    medianFirstMoveMs: median(a.map((x) => x.firstMoveMs)),
    medianFirstGadgetMs: median(a.map((x) => x.firstGadgetMs)),
    clarityAnswers: a.filter((x) => x.feedback.clarity !== null).length,
    requestedAnother: a.filter((x) => x.feedback.again === "yes").length,
    caveat:
      "Descriptive local observations only. Local source does not attest a human; automated-test records are synthetic. No study approval, causal comparison, or enjoyment finding follows.",
  };
}
