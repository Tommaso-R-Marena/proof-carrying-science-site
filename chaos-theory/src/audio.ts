/** Original layered Web Audio synthesis. No samples, downloads, or sound before a gesture. */
export class AudioBus {
  private context: AudioContext | undefined;
  private last = new Map<string, number>();
  mute = false;
  unlock() {
    if (this.mute) return;
    try {
      this.context ??= new AudioContext();
      void this.context.resume().catch(() => {});
    } catch {
      /* Audio is optional. */
    }
  }
  play(
    kind:
      | "fire"
      | "hit"
      | "win"
      | "click"
      | "splat"
      | "bank"
      | "snatch"
      | "alarm"
      | "hack"
      | "beacon"
      | "decoy",
  ) {
    const c = this.context;
    if (this.mute || !c || c.state !== "running") return;
    if (c.currentTime - (this.last.get(kind) ?? -10) < 0.07) return;
    this.last.set(kind, c.currentTime);
    const tone = (
      frequency: number,
      end: number,
      duration: number,
      delay = 0,
      type: OscillatorType = "triangle",
      volume = 0.055,
    ) => {
      const o = c.createOscillator(),
        g = c.createGain(),
        t = c.currentTime + delay;
      o.type = type;
      o.frequency.setValueAtTime(frequency, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(25, end), t + duration);
      g.gain.setValueAtTime(0.001, t);
      g.gain.linearRampToValueAtTime(volume, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.001, t + duration);
      o.connect(g).connect(c.destination);
      o.start(t);
      o.stop(t + duration + 0.02);
      o.onended = () => {
        o.disconnect();
        g.disconnect();
      };
    };
    if (kind === "bank" || kind === "win") {
      for (const [i, n] of [330, 440, 660, 880].entries())
        tone(n, n * 1.01, 0.18, i * 0.06, "sine", 0.045);
    } else if (kind === "splat") {
      tone(190, 55, 0.13, 0, "triangle", 0.08);
      tone(1050, 280, 0.065, 0, "sine", 0.035);
    } else if (kind === "hit") {
      tone(145, 45, 0.2, 0, "sawtooth", 0.045);
    } else if (kind === "fire") {
      tone(460, 95, 0.09);
      tone(1400, 240, 0.05, 0, "sine", 0.025);
    } else if (kind === "alarm") {
      tone(550, 500, 0.12, 0, "square", 0.025);
      tone(720, 650, 0.12, 0.18, "square", 0.025);
    } else if (kind === "decoy") {
      tone(350, 750, 0.14, 0, "sine", 0.04);
      tone(700, 400, 0.2, 0.12, "sine", 0.035);
    } else if (kind === "snatch") {
      tone(480, 800, 0.08);
      tone(800, 1200, 0.12, 0.07);
    } else if (kind === "beacon") {
      tone(250, 750, 0.16, 0, "sine", 0.04);
      tone(750, 950, 0.12, 0.08);
    } else if (kind === "hack") {
      tone(1300, 700, 0.035, 0, "square", 0.025);
      tone(700, 1400, 0.035, 0.06, "square", 0.025);
    } else tone(640, 400, 0.055, 0, "sine", 0.025);
  }
}
