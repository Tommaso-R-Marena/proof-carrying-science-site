/** Optional mastery goals. They never change the heist rules or unlock tool permissions. */
import type { GameState } from "./sim";
export const JOBS = [
  {
    id: "first-escape",
    title: "Clock off",
    icon: "✉",
    goal: "Stash three parcels and catch the tram.",
    tip: "Your hideout is on the left. The tram is on the right.",
  },
  {
    id: "express",
    title: "Express delivery",
    icon: "↗",
    goal: "Escape after using the express sorter on haul two.",
    tip: "Reverse the belt, send with E, and collect at the catch tray.",
  },
  {
    id: "smooth",
    title: "Smooth operator",
    icon: "◇",
    goal: "Escape without losing a heart.",
    tip: "Use walls and a doughnut decoy to stay out of sight.",
  },
  {
    id: "mixed",
    title: "Two ways to steal",
    icon: "⇄",
    goal: "Escape using both a fake notice and a foam interception.",
    tip: "A redirected parcel waits in the orange bay. Foam + E snatches one.",
  },
  {
    id: "sender",
    title: "Return to sender",
    icon: "↶",
    goal: "Escape after a decoy, reversed belt and foam combo.",
    tip: "Lure a guard onto a reversed belt, then hit it with foam.",
  },
  {
    id: "gentle",
    title: "No shots fired",
    icon: "☮",
    goal: "Escape without firing foam.",
    tip: "Fake notices, remote switches and decoys are enough.",
  },
] as const;
export type JobId = (typeof JOBS)[number]["id"];
export function isJobId(id: unknown): id is JobId {
  return JOBS.some((j) => j.id === id);
}
export function completedJobs(s: GameState): JobId[] {
  if (
    s.mode !== "heist" ||
    s.mission !== "mailroom" ||
    s.status !== "won" ||
    s.mail?.banked !== 3 ||
    s.mail.escapeDeadline === null
  )
    return [];
  const m = s.mail;
  return JOBS.filter(
    (j) =>
      j.id === "first-escape" ||
      (j.id === "express" && m.secondRoute === "sorter") ||
      (j.id === "smooth" && m.clean && s.player.hp === 3) ||
      (j.id === "mixed" &&
        m.methods.includes("redirect") &&
        m.methods.includes("intercept")) ||
      (j.id === "sender" && s.scored.includes("return-to-sender")) ||
      (j.id === "gentle" && !s.usedGadgets.includes(0)),
  ).map((j) => j.id);
}
export function nextJob(earned: readonly string[]): (typeof JOBS)[number] {
  return JOBS.find((j) => !earned.includes(j.id)) ?? JOBS[0];
}
/** Actual game state drives the lesson; no scripted success or frame countdown grants progress. */
export function lesson(s: GameState): {
  step: number;
  title: string;
  help: string;
} {
  if (s.status === "won")
    return {
      step: 4,
      title: "First delivery done!",
      help: "The night shift adds guards, three parcels and a getaway.",
    };
  if (s.mail?.carrying)
    return {
      step: 3,
      title: "Bring it home",
      help: "Go to your hideout on the left. Press E beside it to deliver.",
    };
  if (s.mail?.loose)
    return {
      step: 2,
      title: "Pick up your parcel",
      help: "Move close to the parcel in the orange bay, then press E.",
    };
  if (s.props.find((p) => p.kind === "sign")?.active)
    return {
      step: 1,
      title: "Meet the courier",
      help: "Follow the arrow to the orange bay. The courier will bring a parcel.",
    };
  return {
    step: 0,
    title: "Fool the courier",
    help: "Move to the arrow sign. Choose Fake notice (4), then Fire. No need to aim at it.",
  };
}
