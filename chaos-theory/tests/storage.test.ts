import { describe, it, expect } from "vitest";
import {
  loadProgress,
  saveProgress,
  freshProgress,
  dailySeed,
} from "../src/storage";
describe("private versioned progress", () => {
  it("survives unavailable or malformed storage", () => {
    expect(
      loadProgress({
        getItem() {
          throw Error("denied");
        },
      }),
    ).toEqual(freshProgress());
    for (const raw of [
      "{",
      "null",
      '{"version":2}',
      '{"version":1,"settings":{"mute":"true"},"bests":{"mailroom":-1}}',
    ])
      expect(loadProgress({ getItem: () => raw })).toEqual(freshProgress());
    expect(
      saveProgress(
        {
          setItem() {
            throw Error("quota");
          },
        },
        freshProgress(),
      ),
    ).toBe(false);
  });
  it("round trips settings and bounded scores but never event records", () => {
    const p = freshProgress();
    p.settings.mute = true;
    p.bests.vault = 3456;
    let saved = "";
    expect(
      saveProgress(
        {
          setItem(_k, v) {
            saved = v;
          },
        },
        p,
      ),
    ).toBe(true);
    expect(loadProgress({ getItem: () => saved })).toEqual(p);
    expect(saved).not.toContain("recent");
  });
  it("bounds scores and ignores unknown settings", () => {
    const p = loadProgress({
      getItem: () =>
        JSON.stringify({
          version: 1,
          settings: {
            mute: true,
            contrast: true,
            largeText: true,
            reducedMotion: true,
            research: true,
            evil: true,
          },
          bests: { mailroom: Infinity, vault: 10000001, reactor: 33 },
          recent: [{}],
        }),
    });
    expect(p.bests).toEqual({ mailroom: 0, vault: 0, reactor: 33 });
    expect(p.recent).toEqual([]);
    expect(Object.keys(p.settings)).toHaveLength(5);
  });
  it("daily seed uses UTC and is deterministic", () => {
    expect(dailySeed(new Date("2026-11-04T00:00:00Z"))).toBe(
      dailySeed(new Date("2026-11-04T23:59:59Z")),
    );
    expect(dailySeed(new Date("2026-11-05Z"))).not.toBe(
      dailySeed(new Date("2026-11-04Z")),
    );
  });
});
it("restores only bounded summaries and earned cosmetic unlocks", () => {
  const p = loadProgress({
    getItem: () =>
      JSON.stringify({
        version: 1,
        bests: { mailroom: 2000, vault: 2100 },
        cosmetic: "gold",
        history: [
          { mission: "mailroom", seed: 42, score: 2000, outcome: "won" },
          { mission: "bad", seed: 0, score: -5, outcome: "won" },
        ],
      }),
  });
  expect(p.history).toHaveLength(1);
  expect(p.cosmetic).toBe("gold");
  expect(
    loadProgress({ getItem: () => '{"version":1,"cosmetic":"gold"}' }).cosmetic,
  ).toBe("mint");
  expect(loadProgress({ getItem: () => "x".repeat(16001) })).toEqual(
    freshProgress(),
  );
});
