/** Original synthesized SFX, created only after a user gesture; no audio assets or network. */
export class AudioBus {
  private context: AudioContext | undefined;
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
  play(kind: "fire" | "hit" | "win" | "click") {
    if (this.mute || !this.context || this.context.state !== "running") return;
    const c = this.context,
      o = c.createOscillator(),
      g = c.createGain();
    o.type = kind === "fire" ? "triangle" : "sine";
    o.frequency.setValueAtTime(
      kind === "win"
        ? 440
        : kind === "hit"
          ? 100
          : kind === "click"
            ? 600
            : 260,
      c.currentTime,
    );
    o.frequency.exponentialRampToValueAtTime(
      kind === "win" ? 880 : 65,
      c.currentTime + 0.12,
    );
    g.gain.setValueAtTime(0.055, c.currentTime);
    g.gain.exponentialRampToValueAtTime(0.001, c.currentTime + 0.16);
    o.connect(g).connect(c.destination);
    o.start();
    o.stop(c.currentTime + 0.18);
  }
}
