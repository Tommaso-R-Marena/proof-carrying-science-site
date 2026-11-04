/** Public v1 contract between deterministic simulation and unprivileged research extraction. */
export const BUILD = "chaos-v3";
export type MissionId = "mailroom" | "vault" | "reactor";
export type MappedKind =
  | "delivery-sign"
  | "forged-clearance"
  | "maintenance-note";
export interface MappedEvent {
  tick: number;
  kind: MappedKind;
  nodeId: string;
  variant: number;
}
export interface Capture {
  version: 1;
  build: string;
  runId: string;
  mission: MissionId;
  seed: number;
  events: MappedEvent[];
  consent: boolean;
  source: "player" | "random" | "automated" | "synthetic-player";
  durationTicks: number;
}
