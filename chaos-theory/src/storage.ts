import type { Capture, MissionId } from "./contracts";
export interface Settings {
  mute: boolean;
  reducedMotion: boolean;
  contrast: boolean;
  largeText: boolean;
  research: boolean;
}
export interface RunSummary {
  mission: MissionId;
  seed: number;
  score: number;
  outcome: "won" | "lost";
  rules?: "chaos-v1" | "chaos-v2" | "chaos-v3";
}
export interface Progress {
  version: 1;
  scoreRules: 3;
  legacyMailroomBest: number;
  earned: ("mint" | "pink" | "gold")[];
  settings: Settings;
  bests: Record<MissionId, number>;
  recent: Capture[];
  history: RunSummary[];
  cosmetic: "mint" | "pink" | "gold";
}
export const STORAGE_KEY = "chaos-theory.v1";
export function freshProgress(): Progress {
  return {
    version: 1,
    scoreRules: 3,
    legacyMailroomBest: 0,
    earned: ["mint"],
    settings: {
      mute: false,
      reducedMotion: false,
      contrast: false,
      largeText: false,
      research: false,
    },
    bests: { mailroom: 0, vault: 0, reactor: 0 },
    recent: [],
    history: [],
    cosmetic: "mint",
  };
}
export function unlockedCosmetics(p: Progress): Progress["cosmetic"][] {
  const total =
    Object.values(p.bests).reduce((a, b) => a + b, 0) + p.legacyMailroomBest;
  return [
    ...new Set<Progress["cosmetic"]>([
      "mint",
      ...p.earned,
      ...(total > 0 ? ["pink" as const] : []),
      ...(total >= 4000 ? ["gold" as const] : []),
    ]),
  ];
}
export function loadProgress(storage: Pick<Storage, "getItem">): Progress {
  const p = freshProgress();
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw && raw.length > 16000) return p;
    const r = JSON.parse(raw ?? "null");
    if (!r || r.version !== 1) return p;
    for (const k of Object.keys(p.settings) as (keyof Settings)[])
      if (typeof r.settings?.[k] === "boolean") p.settings[k] = r.settings[k];
    for (const m of ["mailroom", "vault", "reactor"] as const)
      if (
        Number.isSafeInteger(r.bests?.[m]) &&
        r.bests[m] >= 0 &&
        r.bests[m] <= 1e7
      )
        p.bests[m] = r.bests[m];
    const legacy =
      Number.isSafeInteger(r.legacyMailroomBest) &&
      r.legacyMailroomBest >= 0 &&
      r.legacyMailroomBest <= 1e7
        ? r.legacyMailroomBest
        : 0;
    const oldTotal = Object.values(p.bests).reduce((a, b) => a + b, 0) + legacy;
    if (r.scoreRules !== 3) {
      if (oldTotal > 0) p.earned.push("pink");
      if (oldTotal >= 4000) p.earned.push("gold");
    }
    if (Array.isArray(r.earned))
      for (const e of r.earned.slice(0, 3))
        if (["mint", "pink", "gold"].includes(e) && !p.earned.includes(e))
          p.earned.push(e);
    if (r.scoreRules !== 3) {
      p.legacyMailroomBest = Math.max(legacy, p.bests.mailroom);
      p.bests.mailroom = 0;
    } else p.legacyMailroomBest = legacy;
    if (Array.isArray(r.history))
      for (const h of r.history.slice(0, 10)) {
        if (
          h &&
          ["mailroom", "vault", "reactor"].includes(h.mission) &&
          Number.isSafeInteger(h.seed) &&
          h.seed >= 0 &&
          h.seed <= 0xffffffff &&
          Number.isSafeInteger(h.score) &&
          h.score >= 0 &&
          h.score <= 1e7 &&
          ["won", "lost"].includes(h.outcome)
        )
          p.history.push({
            mission: h.mission,
            seed: h.seed,
            score: h.score,
            outcome: h.outcome,
            rules:
              h.rules === "chaos-v3"
                ? "chaos-v3"
                : h.rules === "chaos-v2"
                  ? "chaos-v2"
                  : "chaos-v1",
          });
      }
    if (unlockedCosmetics(p).includes(r.cosmetic)) p.cosmetic = r.cosmetic;
    // Event records never persist. Recent score summaries carry no raw events, names, or time stamps.
  } catch {
    /* Corrupt/private storage falls back to playable defaults. */
  }
  return p;
}
export function saveProgress(
  storage: Pick<Storage, "setItem">,
  p: Progress,
): boolean {
  try {
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        version: 1,
        scoreRules: 3,
        legacyMailroomBest: p.legacyMailroomBest,
        earned: p.earned,
        settings: p.settings,
        bests: p.bests,
        history: p.history.slice(0, 10),
        cosmetic: p.cosmetic,
      }),
    );
    return true;
  } catch {
    return false;
  }
}
export function dailySeed(date = new Date()): number {
  let h = 2166136261;
  for (const c of date.toISOString().slice(0, 10))
    h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
