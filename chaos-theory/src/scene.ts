import Phaser from "phaser";
import {
  blocked,
  lineOfSight,
  gadgetTarget,
  GADGETS,
  type GameState,
} from "./sim";
export interface SceneBridge {
  getState(): GameState | undefined;
  update(delta: number): void;
  aim(x: number, y: number): void;
  fire(active: boolean): void;
  reducedMotion(): boolean;
  cosmetic(): string;
}
const C = {
  mint: 0x8df7be,
  pink: 0xff86be,
  yellow: 0xffdb7a,
  blue: 0x93c6ff,
  ink: 0x101b2d,
};
/** Phaser renders the pure fixed-tick simulation; it never decides gameplay or research verdicts. */
export class ArenaScene extends Phaser.Scene {
  private g!: Phaser.GameObjects.Graphics;
  private labels: Phaser.GameObjects.Text[] = [];
  private cursor = 0;
  constructor(private bridge: SceneBridge) {
    super("arena");
  }
  create() {
    this.g = this.add.graphics();
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      this.bridge.aim(world.x, world.y);
    });
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => {
      const world = this.cameras.main.getWorldPoint(p.x, p.y);
      this.bridge.aim(world.x, world.y);
      this.bridge.fire(true);
    });
    this.input.on("pointerup", () => this.bridge.fire(false));
    this.input.mouse?.disableContextMenu();
  }
  private label(
    x: number,
    y: number,
    text: string,
    color = "#aebfd4",
    size = 10,
  ) {
    let l = this.labels[this.cursor++];
    if (!l) {
      l = this.add.text(x, y, text, {
        fontFamily: "Trebuchet MS, sans-serif",
        fontSize: size,
        color,
      });
      this.labels.push(l);
    }
    l.setPosition(x, y)
      .setText(text)
      .setColor(color)
      .setFontSize(size)
      .setVisible(true)
      .setOrigin(0.5);
  }
  update(_time: number, delta: number) {
    this.bridge.update(delta);
    const s = this.bridge.getState();
    if (!s) return;
    const compact = matchMedia("(max-width:760px)").matches;
    const camera = this.cameras.main;
    camera.setBounds(0, 0, 960, 600).setZoom(compact ? 1.55 : 1);
    camera.centerOn(compact ? s.player.x : 480, compact ? s.player.y : 300);
    const g = this.g;
    const motion = !this.bridge.reducedMotion();
    g.clear();
    this.cursor = 0;
    g.fillStyle(0x19263b).fillRect(0, 0, 960, 600);
    g.lineStyle(1, 0x2b3a51, 0.5);
    for (let x = 0; x <= 960; x += 40) g.lineBetween(x, 0, x, 600);
    for (let y = 0; y <= 600; y += 40) g.lineBetween(0, y, 960, y);
    g.fillStyle(
      s.mission === "mailroom"
        ? 0x263e47
        : s.mission === "vault"
          ? 0x342c4a
          : 0x393340,
      0.45,
    ).fillRoundedRect(30, 30, 900, 540, 20);
    for (const original of s.props) {
      const p = {
        ...original,
        x: original.x - original.w / 2,
        y: original.y - original.h / 2,
      };
      const cx = original.x,
        cy = original.y;
      g.fillStyle(0x0a1224, 0.5).fillRoundedRect(p.x + 4, p.y + 6, p.w, p.h, 7);
      if (p.kind === "conveyor") {
        g.fillStyle(0x30495c).fillRoundedRect(p.x, p.y, p.w, p.h, 8);
        g.lineStyle(3, C.blue, 0.6);
        for (let i = 10; i < p.w - 5; i += 24) {
          const n = (i + (motion ? s.tick / 4 : 0)) % Math.max(1, p.w - 12);
          g.lineBetween(p.x + n, p.y + 8, p.x + n + 7, cy);
          g.lineBetween(p.x + n + 7, cy, p.x + n, p.y + p.h - 8);
        }
        this.label(cx, p.y - 12, "SORTING BELT");
      } else if (p.kind === "door") {
        g.fillStyle(p.active ? 0x31594c : 0x805566).fillRoundedRect(
          p.x,
          p.y,
          p.w,
          p.h,
          5,
        );
        g.lineStyle(2, p.active ? C.mint : C.pink).strokeRoundedRect(
          p.x,
          p.y,
          p.w,
          p.h,
          5,
        );
        this.label(cx, cy, p.active ? "OPEN" : "LOCK", "#f1f5ff", 9);
      } else if (p.kind === "sign") {
        g.fillStyle(p.active ? 0x45856d : 0x40506b).fillRoundedRect(
          p.x,
          p.y,
          p.w,
          p.h,
          6,
        );
        g.lineStyle(2, p.active ? C.mint : C.blue).strokeRoundedRect(
          p.x,
          p.y,
          p.w,
          p.h,
          6,
        );
        this.label(
          cx,
          cy,
          p.active ? "→ B" : "→ A",
          p.active ? "#aaffd7" : "#93c6ff",
          16,
        );
        this.label(cx, p.y - 12, "DIRECTIVE NODE");
      } else if (p.kind === "switch") {
        g.fillStyle(p.active ? 0x284d48 : 0x566077).fillRoundedRect(
          p.x,
          p.y,
          p.w,
          p.h,
          6,
        );
        g.fillStyle(p.active ? C.mint : C.yellow).fillCircle(cx, cy, 9);
        this.label(cx, p.y - 12, p.active ? "OFF ✓" : "POWER ON");
      } else if (p.kind === "dock") {
        g.lineStyle(2, C.yellow, 0.8).strokeRoundedRect(p.x, p.y, p.w, p.h, 8);
        this.label(
          cx,
          cy,
          p.id.endsWith("b") ? "DOCK B" : "DOCK A",
          "#ffdb7a",
          12,
        );
      } else if (p.kind === "vault") {
        g.fillStyle(0x55518a).fillRoundedRect(p.x, p.y, p.w, p.h, 7);
        g.fillStyle(C.yellow).fillTriangle(
          cx,
          cy - 16,
          cx + 14,
          cy + 12,
          cx - 14,
          cy + 12,
        );
        this.label(cx, p.y - 12, p.active ? "RELIC TAKEN" : "MOON RELIC");
      } else if (p.kind === "core") {
        g.fillStyle(0x344756).fillRoundedRect(p.x, p.y, p.w, p.h, 9);
        g.lineStyle(3, C.pink).strokeCircle(cx, cy, Math.min(p.w, p.h) * 0.3);
        g.fillStyle(C.pink, 0.6).fillCircle(cx, cy, 8);
        this.label(cx, p.y - 12, "REACTOR");
      } else if (p.kind === "exit") {
        g.fillStyle(C.mint, 0.15).fillRoundedRect(p.x, p.y, p.w, p.h, 9);
        g.lineStyle(2, C.mint).strokeRoundedRect(p.x, p.y, p.w, p.h, 9);
        this.label(cx, cy, "EXIT", "#8df7be", 12);
      }
    }
    for (const r of s.solids) {
      g.fillStyle(0x0d1728, 0.6).fillRoundedRect(r.x + 4, r.y + 6, r.w, r.h, 5);
      g.fillStyle(0x394961).fillRoundedRect(r.x, r.y, r.w, r.h, 5);
      g.fillStyle(0x50627a).fillRoundedRect(r.x, r.y, r.w, Math.min(8, r.h), 3);
      g.lineStyle(1, 0x61728b, 0.5).strokeRoundedRect(r.x, r.y, r.w, r.h, 5);
    }
    // A quiet goal beacon and player-to-goal arrow are readable without relying on color.
    const goal = s.goal;
    if (goal) {
      const pulse = motion ? 4 + Math.sin(s.tick / 14) * 2 : 4;
      g.lineStyle(2, C.mint, 0.8).strokeCircle(goal.x, goal.y, 24 + pulse);
      g.fillStyle(C.mint).fillTriangle(
        goal.x - 5,
        goal.y - 42,
        goal.x + 5,
        goal.y - 42,
        goal.x,
        goal.y - 34,
      );
      this.label(goal.x, goal.y - 55, goal.label, "#baffda", 12);
    }
    for (const b of s.bots) {
      const color =
        b.kind === "courier"
          ? C.yellow
          : b.kind === "sentinel"
            ? C.pink
            : C.blue;
      const y =
        b.y + (b.stun || !motion ? 0 : Math.sin(s.tick / 7 + b.x) * 1.2);
      g.fillStyle(0x07101f, 0.45).fillEllipse(b.x, y + 15, 33, 12);
      g.fillStyle(0x51617a)
        .fillRoundedRect(b.x - 13, y + 8, 9, 12, 3)
        .fillRoundedRect(b.x + 4, y + 8, 9, 12, 3);
      g.fillStyle(color).fillRoundedRect(
        b.x - 16,
        y - 19,
        32,
        33,
        b.kind === "courier" ? 10 : 5,
      );
      g.fillStyle(C.ink).fillRoundedRect(b.x - 12, y - 12, 24, 11, 4);
      g.fillStyle(b.stun ? 0xffffff : C.mint)
        .fillCircle(b.x - 6, y - 7, 2)
        .fillCircle(b.x + 6, y - 7, 2);
      g.lineStyle(2, C.ink).lineBetween(b.x - 5, y + 6, b.x + 5, y + 6);
      if (b.carrying) {
        g.fillStyle(0xeec88a).fillRoundedRect(b.x - 10, y + 14, 20, 14, 3);
        g.lineStyle(2, 0xfff0cf).lineBetween(b.x, y + 14, b.x, y + 28);
      }
      if (b.stun) this.label(b.x, y - 32, "✧ STUN", "#ffffff", 10);
      else
        this.label(
          b.x,
          y - 32,
          b.state.toUpperCase(),
          b.kind === "sentinel" ? "#ffc2da" : "#bbcde4",
          9,
        );
    }
    for (const shot of s.shots) {
      g.fillStyle(C.mint).fillCircle(shot.x, shot.y, 5);
      g.lineStyle(2, 0xffffff, 0.7).strokeCircle(shot.x, shot.y, 6);
    }
    for (const e of s.effects) {
      const color = e.kind.includes("decoy")
        ? C.blue
        : e.kind.includes("hit")
          ? C.pink
          : C.mint;
      const radius = 10 + (60 - Math.min(60, e.ttl)) * 0.5;
      g.lineStyle(3, color, Math.min(1, e.ttl / 20)).strokeCircle(
        e.x,
        e.y,
        radius,
      );
      if (e.kind.includes("decoy")) {
        g.fillStyle(C.blue, 0.4).fillRoundedRect(e.x - 12, e.y - 17, 24, 32, 9);
        this.label(e.x, e.y - 28, "HEY, BOT!", "#93c6ff", 10);
      }
    }
    const p = s.player;
    if (compact && Math.hypot(s.goal.x - p.x, s.goal.y - p.y) > 90) {
      const a = Math.atan2(s.goal.y - p.y, s.goal.x - p.x);
      const bx = p.x + Math.cos(a) * 55,
        by = p.y + Math.sin(a) * 55;
      g.fillStyle(C.mint).fillTriangle(
        bx + Math.cos(a) * 10,
        by + Math.sin(a) * 10,
        bx + Math.cos(a + 2.3) * 8,
        by + Math.sin(a + 2.3) * 8,
        bx + Math.cos(a - 2.3) * 8,
        by + Math.sin(a - 2.3) * 8,
      );
    }
    const gadget = p.gadget;
    const range = gadget === 0 ? 90 : GADGETS[gadget].range;
    const tx = p.x + p.aimX * range,
      ty = p.y + p.aimY * range;
    const valid =
      !blocked(s, tx, ty, 12) && lineOfSight(s, p, { x: tx, y: ty });
    g.lineStyle(1, gadget === 0 ? C.mint : valid ? C.blue : C.pink, 0.35);
    g.lineBetween(p.x, p.y, tx, ty);
    if (gadget === 1) {
      g.strokeRoundedRect(tx - 12, ty - 17, 24, 32, 9);
      this.label(
        tx,
        ty + 28,
        valid ? "DECOY" : "BLOCKED",
        valid ? "#93c6ff" : "#ffb8d2",
        8,
      );
    } else if (gadget >= 2) {
      g.strokeCircle(p.x, p.y, range);
      const target = gadgetTarget(s, gadget as 2 | 3);
      if (target) {
        g.lineStyle(2, C.mint, 0.9).strokeRoundedRect(
          target.x - target.w / 2 - 4,
          target.y - target.h / 2 - 4,
          target.w + 8,
          target.h + 8,
          8,
        );
        this.label(
          target.x,
          target.y + target.h / 2 + 17,
          "IN RANGE · FIRE",
          "#8df7be",
          9,
        );
      }
    }
    if (!(p.invulnerable && s.tick % 8 < 3)) {
      g.fillStyle(0x07101f, 0.6).fillEllipse(p.x, p.y + 17, 35, 13);
      if (p.dashTicks) {
        g.fillStyle(C.mint, 0.2).fillCircle(p.x, p.y, 26);
      }
      g.fillStyle(0xe4f5ff).fillRoundedRect(p.x - 13, p.y - 16, 26, 31, 10);
      g.fillStyle(0x557c85).fillRoundedRect(p.x - 18, p.y - 6, 8, 19, 4);
      g.fillStyle(C.ink).fillRoundedRect(p.x - 10, p.y - 10, 20, 12, 5);
      g.fillStyle(C.mint)
        .fillCircle(p.x - 4, p.y - 4, 2)
        .fillCircle(p.x + 4, p.y - 4, 2);
      g.fillStyle(
        this.bridge.cosmetic() === "gold"
          ? C.yellow
          : this.bridge.cosmetic() === "pink"
            ? C.pink
            : C.mint,
      ).fillRoundedRect(p.x - 8, p.y + 8, 16, 5, 2);
      g.fillStyle(0x718ba1)
        .fillRoundedRect(p.x - 10, p.y + 13, 7, 7, 3)
        .fillRoundedRect(p.x + 3, p.y + 13, 7, 7, 3);
    }
    if (s.phase === 1 && (s.mission === "mailroom" || s.mission === "vault")) {
      g.fillStyle(C.yellow).fillRoundedRect(p.x + 10, p.y + 8, 15, 14, 3);
    }
    this.label(p.x, p.y + 34, "YOU", "#f5fbff", 9);
    const failure = s.effects.find(
      (e) => e.kind === "out-of-range" && e.ttl > 10,
    );
    if (failure)
      this.label(p.x, p.y - 45, "MOVE CLOSER TO A DEVICE", "#ffdb7a", 11);
    for (let i = this.cursor; i < this.labels.length; i++)
      this.labels[i].setVisible(false);
  }
}
