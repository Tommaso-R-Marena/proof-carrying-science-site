/** Original procedural postal-depot art. Decorative geometry never changes collision or verdicts. */
import type Phaser from "phaser";
import {
  gadgetTarget,
  mailBeat,
  GADGETS,
  blocked,
  type GameState,
  type Bot,
} from "./sim";
type Graphics = Phaser.GameObjects.Graphics;
type Label = (
  x: number,
  y: number,
  text: string,
  color?: string,
  size?: number,
) => void;
const P = {
  ink: 0x173b43,
  cream: 0xf2dfb9,
  paper: 0xfff4d5,
  orange: 0xef8354,
  teal: 0x338b83,
  mint: 0xa4ead5,
  red: 0xd34f54,
  blue: 0x509aac,
  shadow: 0x775e43,
};
function panel(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  r = 8,
) {
  g.fillStyle(P.shadow, 0.2).fillRoundedRect(x + 4, y + 7, w, h, r);
  g.fillStyle(color).fillRoundedRect(x, y, w, h, r);
  g.lineStyle(2, P.ink, 0.85).strokeRoundedRect(x, y, w, h, r);
}
function parcel(g: Graphics, x: number, y: number, size = 24, beat = 1) {
  panel(g, x - size / 2, y - size * 0.4, size, size * 0.8, 0xd5a16a, 3);
  g.fillStyle(beat === 2 ? P.blue : beat === 3 ? P.orange : P.paper).fillRect(
    x - 3,
    y - size * 0.4,
    6,
    size * 0.8,
  );
  g.fillStyle(P.paper).fillRoundedRect(x + 4, y - 4, size * 0.25, 6, 1);
  g.lineStyle(1, P.ink, 0.6).lineBetween(x - size / 2 + 4, y + 4, x - 5, y + 4);
}
function arrow(
  g: Graphics,
  x: number,
  y: number,
  right = true,
  color = P.paper,
) {
  const n = right ? 1 : -1;
  g.lineStyle(5, color, 0.8).lineBetween(x - 12 * n, y, x + 12 * n, y);
  g.lineBetween(x + 12 * n, y, x + 3 * n, y - 8).lineBetween(
    x + 12 * n,
    y,
    x + 3 * n,
    y + 8,
  );
}
function robot(
  g: Graphics,
  s: GameState,
  b: Bot | undefined,
  label: Label,
  motion: boolean,
  scarf: string,
) {
  const player = !b,
    a = b ?? s.player,
    x = a.x,
    y = a.y;
  if (b?.arriving) {
    g.fillStyle(P.red, 0.12).fillCircle(x, y, 27);
    g.lineStyle(3, P.red, 0.6).strokeCircle(x, y, 27);
    label(x, y, String(Math.ceil(b.arriving / 60)), "#a92e35", 21);
    return;
  }
  const age = s.tick,
    walking = b
      ? [
          "delivery",
          "rerouted",
          "patrol",
          "chase",
          "repair",
          "collecting",
          "investigate",
          "search",
        ].includes(b.state)
      : Math.hypot(s.player.vx, s.player.vy) > 20;
  const bounce =
    motion && walking ? Math.sin(age * 0.36 + (b ? b.x : 0)) * 2 : 0;
  const stunned = b && b.stun > 0;
  const color = player
    ? P.paper
    : b.kind === "courier"
      ? 0xf1b64e
      : b.kind === "sentinel"
        ? 0xda6864
        : 0x67aaa5;
  const torsoY = y + bounce;
  g.fillStyle(P.ink, 0.2).fillEllipse(x, y + 22, 45, 13);
  const stride = motion && walking ? Math.sin(age * 0.36) * 5 : 0;
  g.fillStyle(P.ink)
    .fillRoundedRect(x - 16, y + 13 + stride, 11, 13, 4)
    .fillRoundedRect(x + 5, y + 13 - stride, 11, 13, 4);
  panel(
    g,
    x - 20,
    torsoY - 21,
    40,
    40,
    color,
    player ? 15 : b!.kind === "courier" ? 11 : 7,
  );
  g.fillStyle(P.ink).fillRoundedRect(x - 16, torsoY - 13, 32, 15, 7);
  const lookX = player
    ? s.player.aimX * 3
    : b!.reactionTicks > 0 &&
        ["double-take", "lost", "doughnut"].includes(b!.reaction) &&
        motion
      ? Math.sin(age * 0.3) * 8
      : Math.cos(b!.facing) * 3;
  const lookY = player ? s.player.aimY * 2 : Math.sin(b!.facing) * 2;
  if (b?.state === "off-duty") {
    g.lineStyle(2, P.mint)
      .lineBetween(x - 12, torsoY - 6, x - 4, torsoY - 6)
      .lineBetween(x + 4, torsoY - 6, x + 12, torsoY - 6);
    label(x, y - 36, "zz", "#376d6c", 12);
  } else if (stunned) {
    g.lineStyle(2, P.paper);
    for (const dx of [-8, 8]) {
      g.lineBetween(x + dx - 3, torsoY - 9, x + dx + 3, torsoY - 3).lineBetween(
        x + dx + 3,
        torsoY - 9,
        x + dx - 3,
        torsoY - 3,
      );
    }
  } else if (
    b?.state === "chase" ||
    (b?.reaction === "annoyed" && b.reactionTicks > 0)
  ) {
    g.lineStyle(3, 0xffe5b8)
      .lineBetween(x - 12, torsoY - 10, x - 4, torsoY - 5)
      .lineBetween(x + 4, torsoY - 5, x + 12, torsoY - 10);
  } else {
    g.fillStyle(b?.state === "confused" ? P.paper : P.mint)
      .fillCircle(x - 8 + lookX, torsoY - 6 + lookY, 3)
      .fillCircle(x + 8 + lookX, torsoY - 6 + lookY, 3);
  }
  if (player) {
    g.fillStyle(
      scarf === "gold" ? 0xe8b650 : scarf === "pink" ? 0xdf739a : P.teal,
    ).fillRoundedRect(x - 17, torsoY + 6, 34, 7, 2);
    const tail = motion ? Math.sin(age * 0.4) * 3 : 0;
    g.fillTriangle(
      x - 15,
      torsoY + 8,
      x - 30,
      torsoY + 13 + tail,
      x - 24,
      torsoY + 3,
    );
    g.fillStyle(P.ink)
      .fillRoundedRect(x - 24, torsoY - 15, 6, 16, 3)
      .fillRoundedRect(x + 18, torsoY - 15, 6, 16, 3);
  } else if (b!.kind === "courier") {
    g.fillStyle(P.paper).fillTriangle(
      x - 22,
      torsoY - 20,
      x + 23,
      torsoY - 20,
      x + 14,
      torsoY - 30,
    );
    g.fillStyle(P.orange).fillCircle(x + 12, torsoY - 25, 3);
    g.lineStyle(3, P.ink).strokeCircle(x, torsoY + 9, 5);
  } else if (b!.kind === "sentinel") {
    g.fillStyle(P.ink).fillRoundedRect(x - 20, torsoY - 24, 40, 9, 3);
    g.fillStyle(b!.awareness > 0 ? P.red : P.paper).fillCircle(
      x,
      torsoY - 26,
      5,
    );
    g.fillStyle(P.paper).fillTriangle(
      x - 5,
      torsoY + 6,
      x + 5,
      torsoY + 6,
      x,
      torsoY + 15,
    );
  } else {
    const wrench =
      motion && b!.reaction === "grumble" && b!.reactionTicks > 0
        ? Math.sin(age * 0.28) * 9
        : 0;
    g.lineStyle(3, P.ink).lineBetween(
      x + 20,
      torsoY + 8,
      x + 28,
      torsoY - 4 + wrench,
    );
    g.strokeCircle(x + 30, torsoY - 8 + wrench, 5);
    g.lineBetween(x - 6, torsoY - 23, x - 6, torsoY - 31);
    g.fillStyle(P.orange).fillCircle(x - 6, torsoY - 33, 4);
  }
  if (
    b &&
    b.reactionTicks > 0 &&
    ["parcel-gone", "annoyed"].includes(b.reaction)
  ) {
    const lift = motion ? Math.sin(age * 0.25) * 3 : 0;
    g.lineStyle(4, P.ink)
      .lineBetween(x - 20, torsoY + 3, x - 30, torsoY - 14 + lift)
      .lineBetween(x + 20, torsoY + 3, x + 30, torsoY - 14 + lift);
    g.fillStyle(P.paper)
      .fillCircle(x - 30, torsoY - 14 + lift, 4)
      .fillCircle(x + 30, torsoY - 14 + lift, 4);
  }
  if (b?.carrying || (player && s.mail?.carrying)) {
    const carryX = player ? x : x + 20;
    parcel(g, carryX, torsoY + 14, player ? 36 : 27, mailBeat(s));
    if (player) {
      g.fillStyle(P.paper)
        .fillCircle(x - 21, torsoY + 13, 6)
        .fillCircle(x + 21, torsoY + 13, 6);
      g.lineStyle(2, P.teal)
        .strokeCircle(x - 21, torsoY + 13, 6)
        .strokeCircle(x + 21, torsoY + 13, 6);
    }
  }
  if (stunned) {
    for (let i = 0; i < 3; i++) {
      const a = (motion ? age * 0.09 : 0) + (i * Math.PI * 2) / 3;
      g.fillStyle(P.orange).fillCircle(
        x + Math.cos(a) * 22,
        y - 30 + Math.sin(a) * 6,
        3,
      );
    }
  } else if (b?.state === "suspicious" || b?.state === "chase") {
    label(x, y - 43, b.state === "chase" ? "!" : "?", "#a92e35", 22);
    g.fillStyle(P.ink, 0.3).fillRoundedRect(x - 21, y + 32, 42, 5, 2);
    g.fillStyle(P.red).fillRoundedRect(
      x - 21,
      y + 32,
      (42 * b.awareness) / 60,
      5,
      2,
    );
  }
  if (player) label(x, y + 40, "YOU", "#173b43", 10);
}
export function drawMailroom(
  g: Graphics,
  s: GameState,
  label: Label,
  motion: boolean,
  scarf: string,
) {
  const m = s.mail!,
    t = motion ? s.tick : 0;
  g.fillStyle(0x102f38).fillRect(0, 0, 960, 600);
  g.fillStyle(P.cream).fillRoundedRect(24, 24, 912, 552, 20);
  g.fillStyle(P.ink).fillRoundedRect(24, 24, 912, 53, 14);
  label(190, 49, "ODD POST / NIGHT SHIFT", "#f2dfb9", 17);
  label(
    803,
    49,
    m.alertLevel === 2
      ? "SECURITY: LOCKDOWN"
      : m.alertLevel === 1
        ? "SECURITY: SUSPICIOUS"
        : "SECURITY: BUSINESS AS USUAL",
    m.alertLevel ? "#ffc9a3" : "#a4ead5",
    10,
  );
  g.lineStyle(1, 0x9e8e6e, 0.18);
  for (let x = 55; x < 930; x += 40) g.lineBetween(x, 80, x, 565);
  for (let y = 100; y < 570; y += 40) g.lineBetween(35, y, 925, y);
  g.fillStyle(P.teal, 0.14).fillRoundedRect(50, 230, 365, 130, 17);
  g.fillStyle(P.orange, 0.15).fillRoundedRect(510, 220, 385, 160, 17);
  g.lineStyle(3, P.paper, 0.85)
    .strokeRoundedRect(50, 230, 365, 130, 17)
    .strokeRoundedRect(510, 220, 385, 160, 17);
  label(160, 211, "STAFF ONLY", "#376d6c", 13);
  label(720, 211, "SORT / SCAN / DISPATCH", "#9b573d", 13);
  for (let x = 550; x < 900; x += 80) arrow(g, x, 550, false, P.teal);
  // Wall furniture: original mail slots and time clock; deliberately outside collision routes.
  for (let i = 0; i < 7; i++) {
    g.fillStyle(P.paper).fillRoundedRect(55 + i * 24, 91, 18, 24, 3);
    g.lineStyle(2, P.teal).lineBetween(58 + i * 24, 101, 70 + i * 24, 101);
  }
  panel(g, 50, 145, 72, 48, P.orange, 5);
  label(86, 160, "TAKE A", "#173b43", 9);
  label(86, 179, "NUMBER", "#173b43", 9);
  for (const r of s.solids) {
    panel(g, r.x, r.y, r.w, r.h, 0x365a5b, 5);
    g.fillStyle(0x56807a).fillRect(r.x + 4, r.y + 4, r.w - 8, 9);
    for (let y = r.y + 35; y < r.y + r.h; y += 38) {
      g.fillStyle(P.ink).fillRect(r.x + 5, y, r.w - 10, 5);
      for (let x = r.x + 18; x < r.x + r.w - 5; x += 32)
        parcel(g, x, y - 12, 25);
    }
  }
  for (const p of s.props) {
    const x = p.x,
      y = p.y;
    if (p.kind === "conveyor") {
      panel(g, x - p.w / 2, y - p.h / 2, p.w, p.h, P.ink, 14);
      g.fillStyle(0x446968).fillRoundedRect(
        x - p.w / 2 + 8,
        y - p.h / 2 + 9,
        p.w - 16,
        p.h - 18,
        9,
      );
      for (let a = -p.w / 2 + 15; a < p.w / 2 - 12; a += 23) {
        const offset = (t * 0.9 * (p.active ? -1 : 1)) % 23;
        g.lineStyle(2, 0x71908a, 0.7).lineBetween(
          x + a + offset,
          y - p.h / 2 + 13,
          x + a + offset,
          y + p.h / 2 - 13,
        );
      }
      for (let a = -1; a <= 1; a++) parcel(g, x + a * 43, y, 27);
      label(
        x,
        y - p.h / 2 - 15,
        mailBeat(s) === 2
          ? p.active
            ? "EXPRESS · E TO SEND"
            : "EXPRESS · HACK 3 + E"
          : p.active
            ? "BELT REVERSED"
            : "PARCEL INTAKE",
        "#173b43",
        11,
      );
    } else if (p.kind === "door") {
      const left = x - p.w / 2;
      panel(g, left - 5, y - p.h / 2 - 7, p.w + 10, p.h + 14, P.ink, 5);
      if (!p.active) {
        g.fillStyle(0xe9b75f).fillRect(left + 6, y - p.h / 2, p.w - 12, p.h);
        for (let k = -p.h / 2 + 10; k < p.h / 2; k += 20)
          g.fillStyle(P.ink, 0.7).fillRect(left + 8, y + k, p.w - 16, 6);
        label(x, y, "LOCK", "#173b43", 10);
      } else {
        g.fillStyle(P.teal, 0.25).fillRect(
          left + 8,
          y - p.h / 2,
          p.w - 16,
          p.h,
        );
        for (let k = -1; k <= 1; k++) arrow(g, x, y + k * 30, true, P.mint);
      }
      label(x, y - p.h / 2 - 26, "SHORTCUT · 3", "#173b43", 11);
    } else if (p.kind === "sign") {
      panel(g, x - 26, y - 33, 52, 48, p.active ? P.teal : P.paper, 6);
      g.fillStyle(P.ink).fillRect(x - 4, y + 14, 8, 27);
      arrow(g, x, y - 8, true, p.active ? P.paper : P.orange);
      label(
        x,
        y - 54,
        p.active ? "OVERRIDE PLANTED" : "FAKE NOTICE · 4",
        "#173b43",
        12,
      );
      label(
        x,
        y + 54,
        p.active ? "COURIER → BAY B" : "GET CLOSE & FIRE",
        "#376d6c",
        10,
      );
    } else if (p.id === "dock-a") {
      panel(g, x - 47, y - 34, 94, 68, 0x9bad9b, 10);
      g.fillStyle(P.ink).fillRoundedRect(x - 34, y - 16, 68, 25, 5);
      label(x, y - 47, "APPROVED DISPATCH", "#173b43", 10);
      label(x, y + 20, "A", "#173b43", 20);
    } else if (p.id === "dock-b") {
      g.fillStyle(P.orange, 0.2).fillRoundedRect(x - 55, y - 45, 110, 90, 12);
      g.lineStyle(3, P.orange).strokeRoundedRect(x - 55, y - 45, 110, 90, 12);
      for (let a = -35; a < 45; a += 17)
        g.fillStyle(P.orange).fillRect(x + a, y + 34, 10, 5);
      label(x, y - 63, "COLLECTION BAY B", "#9b573d", 12);
      if (!m.loose) label(x, y, "WAITING…", "#9b573d", 10);
    } else if (p.id === "getaway") {
      panel(
        g,
        x - 46,
        y - 43,
        92,
        86,
        m.escapeDeadline !== null ? P.teal : 0x698a82,
        12,
      );
      g.fillStyle(P.ink).fillRoundedRect(x - 35, y - 28, 70, 35, 6);
      g.fillStyle(P.paper, 0.65)
        .fillRect(x - 27, y - 23, 24, 22)
        .fillRect(x + 3, y - 23, 24, 22);
      g.fillStyle(P.ink)
        .fillRoundedRect(x - 37, y + 35, 18, 9, 3)
        .fillRoundedRect(x + 19, y + 35, 18, 9, 3);
      label(x, y - 59, "LAST TRAM", "#173b43", 13);
      label(
        x,
        y + 21,
        m.escapeDeadline !== null
          ? "BOARD · E"
          : s.mode === "practice"
            ? "NIGHT SHIFT ONLY"
            : "AFTER 3 PARCELS",
        m.escapeDeadline !== null ? "#f2dfb9" : "#173b43",
        10,
      );
    } else if (p.id === "stash") {
      g.fillStyle(P.teal, 0.2).fillRoundedRect(x - 64, y - 53, 128, 106, 15);
      g.lineStyle(3, P.teal).strokeRoundedRect(x - 64, y - 53, 128, 106, 15);
      panel(g, x - 36, y - 15, 72, 40, P.teal, 8);
      g.fillStyle(P.ink).fillRoundedRect(x - 28, y - 12, 56, 10, 4);
      label(x, y - 37, "YOUR HIDEOUT", "#173b43", 12);
      for (let k = 0; k < 3; k++) {
        g.fillStyle(k < m.banked ? P.orange : P.paper).fillCircle(
          x - 22 + k * 22,
          y + 44,
          6,
        );
        if (k < m.banked) parcel(g, x - 24 + k * 24, y + 10, 19);
      }
      label(x, y + 71, "BRING PARCELS HERE · E", "#173b43", 10);
    }
  }
  if (mailBeat(s) === 2) {
    label(675, 560, "QUIET DETOUR ←", "#376d6c", 12);
    g.lineStyle(2, P.blue, 0.4)
      .lineBetween(360, 300, 590, 300)
      .lineBetween(360, 300, 360, 360);
    g.lineStyle(2, P.blue, 0.5).strokeRoundedRect(333, 338, 54, 44, 6);
    label(360, 404, "EXPRESS CATCH", "#376d6c", 10);
  }
  // Actual field of view is the same angle/radius/LOS rule used by the simulator.
  for (const b of s.bots.filter(
    (b) =>
      s.mode !== "practice" &&
      b.kind === "sentinel" &&
      b.stun === 0 &&
      b.arriving === 0,
  )) {
    const radius = 190 + m.alertLevel * 22;
    g.lineStyle(1, P.red, b.awareness > 0 ? 0.5 : 0.2).strokeCircle(
      b.x,
      b.y,
      65,
    );
    g.fillStyle(
      b.state === "chase" ? P.red : 0xd1a45b,
      b.state === "chase" ? 0.12 : 0.08,
    );
    g.beginPath().moveTo(b.x, b.y);
    for (let ray = 0; ray <= 24; ray++) {
      const a = b.facing - Math.PI / 3 + (ray * Math.PI) / 36;
      let d = 0;
      while (
        d < radius &&
        !blocked(s, b.x + Math.cos(a) * d, b.y + Math.sin(a) * d, 0)
      )
        d += 8;
      g.lineTo(
        b.x + Math.cos(a) * Math.min(d, radius),
        b.y + Math.sin(a) * Math.min(d, radius),
      );
    }
    g.closePath().fillPath();
  }

  if (m.loose) {
    const p = m.loose;
    g.fillStyle(P.orange, 0.15).fillCircle(p.x, p.y, 30);
    parcel(g, p.x, p.y, 36, mailBeat(s));
    label(p.x, p.y - 35, "GRAB · E", "#173b43", 13);
  }
  const sorted = [
    ...s.bots.map((b) => ({ y: b.y, bot: b })),
    { y: s.player.y, bot: undefined },
  ].sort((a, b) => a.y - b.y);
  for (const a of sorted) robot(g, s, a.bot, label, motion, scarf);
  const speaker = s.bots
    .filter((b) => b.reactionTicks > 0 && b.stun === 0 && b.arriving === 0)
    .sort(
      (a, b) =>
        Math.hypot(a.x - s.player.x, a.y - s.player.y) -
        Math.hypot(b.x - s.player.x, b.y - s.player.y),
    )[0];
  if (speaker) {
    const words = {
      none: "",
      "double-take": "Wait. Which bay?",
      grumble: "Who changed this?!",
      doughnut: "Free doughnuts?",
      annoyed: "Cardboard. Again.",
      lost: "Where did you go?",
      "parcel-gone": "My parcel!",
    };
    const text = words[speaker.reaction],
      w = Math.min(220, text.length * 7.5 + 20),
      x = Math.max(44, Math.min(916 - w, speaker.x - w / 2)),
      y = Math.max(90, Math.min(525, speaker.y - 76));
    panel(g, x, y, w, 32, P.paper, 9);
    g.fillStyle(P.paper).fillTriangle(
      x + w / 2 - 5,
      y + 32,
      x + w / 2 + 5,
      y + 27,
      speaker.x,
      y + 35,
    );
    label(x + w / 2, y + 15, text, "#173b43", 13);
  }

  for (const shot of s.shots) {
    g.fillStyle(P.teal, 0.18).fillCircle(shot.x - 5, shot.y, 10);
    g.fillStyle(P.paper).fillCircle(shot.x, shot.y, 6);
    g.lineStyle(2, P.teal).strokeCircle(shot.x, shot.y, 6);
  }
  for (const e of s.effects) {
    const age = Math.max(
      0,
      (e.kind === "bank"
        ? 90
        : e.kind === "snatch"
          ? 65
          : e.kind === "splat"
            ? 50
            : 55) - e.ttl,
    );
    if (
      ["splat", "bank", "snatch", "hurt", "hack", "beacon"].includes(e.kind)
    ) {
      const color =
        e.kind === "hurt" ? P.red : e.kind === "bank" ? P.orange : P.teal;
      const fade = Math.min(1, e.ttl / 18);
      for (let k = 0; k < 8; k++) {
        const a = (k * Math.PI) / 4 + e.id;
        const r = motion ? 8 + age * 1.3 : 14;
        g.fillStyle(k % 2 ? P.paper : color, fade).fillRoundedRect(
          e.x + Math.cos(a) * r - 3,
          e.y + Math.sin(a) * r - age * 0.15,
          6,
          6,
          2,
        );
      }
      const words: Record<string, string> = {
        splat: "POP!",
        bank: `STASHED!`,
        snatch: "GOT IT!",
        hurt: "OUCH!",
        hack: "CLICK!",
        beacon: "NEW ADDRESS!",
      };
      label(
        e.x +
          (e.kind === "splat" || e.kind === "snatch" || e.kind === "hack"
            ? 58
            : 0),
        e.y +
          (e.kind === "beacon"
            ? 82
            : e.kind === "bank"
              ? -85
              : e.kind === "splat" || e.kind === "snatch" || e.kind === "hack"
                ? -15
                : -45) -
          (motion ? age * 0.35 : 0),
        words[e.kind],
        e.kind === "hurt" ? "#a42e36" : "#173b43",
        e.kind === "bank" ? 24 : 17,
      );
    }
    if (e.kind === "backup" && e.ttl > 60) {
      g.lineStyle(3, P.red, 0.7).strokeCircle(
        e.x,
        e.y,
        28 + (motion ? Math.sin(t * 0.2) * 5 : 0),
      );
      label(e.x, e.y + 45, "BACKUP ARRIVING", "#a42e36", 11);
    }
    if (e.kind === "decoy") {
      const bounce = motion ? Math.sin(t * 0.2) * 5 : 0;
      g.fillStyle(P.blue, 0.25).fillRoundedRect(
        e.x - 18,
        e.y - 22 + bounce,
        36,
        42,
        12,
      );
      g.lineStyle(2, P.teal, 0.7).strokeRoundedRect(
        e.x - 18,
        e.y - 22 + bounce,
        36,
        42,
        12,
      );
      g.lineStyle(4, P.orange, 0.8).strokeCircle(e.x, e.y - 7 + bounce, 8);
    }
    if (e.kind === "out-of-range")
      label(s.player.x, s.player.y - 53, "A LITTLE CLOSER…", "#9b573d", 13);
  }
  const banners: Record<string, { priority: number; text: string }> = {
    "time-warning": {
      priority: 11,
      text: `TRAM LEAVES IN ${Math.max(0, Math.ceil(((m.escapeDeadline ?? s.tick) - s.tick) / 60))}!`,
    },
    getaway: { priority: 10, text: "LAST TRAM! GO, GO, GO!" },
    "combo-belt": { priority: 8, text: "RETURN TO SENDER!" },
    jam: { priority: 7, text: "JAMMED · GRAB IT WITH E" },
    "sorter-arrived": { priority: 6, text: "PARCEL ON STAFF SIDE" },
    sorter: { priority: 3, text: "EXPRESS SORTER: LOUD & FAST" },
    alarm: {
      priority: 2,
      text:
        m.alertLevel === 1
          ? "MISSING PARCELS. GUARDS ALERT."
          : "SECURITY IS ON THE LOOKOUT.",
    },
  };
  const banner = s.effects
    .filter((e) => Object.hasOwn(banners, e.kind) && e.ttl > 12)
    .sort(
      (a, b) =>
        banners[b.kind].priority - banners[a.kind].priority || b.id - a.id,
    )[0];
  if (banner) {
    g.fillStyle(P.paper, 0.95).fillRoundedRect(255, 83, 450, 27, 8);
    label(480, 96, banners[banner.kind].text, "#a42e36", 14);
  }
  const p = s.player,
    range = GADGETS[p.gadget].range;
  if (p.gadget === 2 || p.gadget === 3) {
    const target = gadgetTarget(s, p.gadget);
    g.lineStyle(1, P.teal, 0.25).strokeCircle(p.x, p.y, range);
    if (target) {
      g.lineStyle(3, P.teal, 0.85).strokeRoundedRect(
        target.x - target.w / 2 - 7,
        target.y - target.h / 2 - 7,
        target.w + 14,
        target.h + 14,
        12,
      );
    }
  } else if (p.gadget === 1) {
    const x = p.x + p.aimX * 150,
      y = p.y + p.aimY * 150;
    g.lineStyle(2, P.blue, 0.5).strokeRoundedRect(x - 18, y - 22, 36, 42, 12);
  }
  const goal = s.goal,
    d = Math.hypot(goal.x - p.x, goal.y - p.y);
  if (d > 80) {
    const a = Math.atan2(goal.y - p.y, goal.x - p.x);
    const x = p.x + Math.cos(a) * 60,
      y = p.y + Math.sin(a) * 60;
    g.fillStyle(P.teal).fillTriangle(
      x + Math.cos(a) * 9,
      y + Math.sin(a) * 9,
      x + Math.cos(a + 2.4) * 9,
      y + Math.sin(a + 2.4) * 9,
      x + Math.cos(a - 2.4) * 9,
      y + Math.sin(a - 2.4) * 9,
    );
  }
  g.lineStyle(2, P.teal, 0.5).strokeCircle(
    goal.x,
    goal.y,
    34 + (motion ? Math.sin(t * 0.08) * 3 : 0),
  );
}
