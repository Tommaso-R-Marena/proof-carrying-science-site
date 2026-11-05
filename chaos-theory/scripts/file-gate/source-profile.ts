/** Versioned observer compatibility only; this never returns an authorization verdict. */
import { deepStrictEqual, equal } from "node:assert";
import { hashArtifact } from "../../src/research";
export const studySourceNames = [
  "formal/FilePolicy.lean",
  "formal/FilePolicyMain.lean",
  "scripts/file-gate/model.ts",
  "scripts/file-gate/native.ts",
  "scripts/file-gate/workspace.ts",
  "scripts/file-gate/bridge.ts",
  "scripts/file-gate/oracle.py",
  "scripts/file-gate/protocol.py",
  "scripts/file-gate/evaluate.py",
  "scripts/file-gate/verify_evaluation.py",
  "scripts/local_runtime.py",
  "scripts/local_model_interactive.py",
  "scripts/replay_real_model.py",
];
const observers: { [name: string]: { original: string; repaired: string } } = {
  "scripts/file-gate/bridge.ts": {
    original:
      "3b719028b05dc27d24d2d692a925e11ee764d91e00cd84650a1a6e296657efae",
    repaired:
      "95d20ca77e95704f29decb15be9d150c4059bac766eb811ff3a0664b152e754f",
  },
  "scripts/file-gate/evaluate.py": {
    original:
      "ccd5a29c6965c3f3498af31851b8edc906390b34ad9cc89d0e452c7e6132e749",
    repaired:
      "82bad48e385e0ff632e509bdbfa625a6edf80ecf52144af45a9d03937ebc4f9d",
  },
};
type Recovery = {
  nativeLedgerProvenance?: string;
  originalNativeLedgerRetained?: boolean;
  newInferenceCalls?: number;
  originalProtocolHash?: string;
  modelCallsRecovered?: number;
  episodesRecovered?: number;
};
export async function checkStudySources(
  recorded: { [name: string]: string },
  current: { [name: string]: string },
  recovery: Recovery | undefined,
  expected: { protocolHash: string; modelCalls: number; episodes: number },
) {
  deepStrictEqual(Object.keys(recorded).sort(), [...studySourceNames].sort());
  deepStrictEqual(Object.keys(current).sort(), [...studySourceNames].sort());
  let observerRepair = false;
  for (const name of studySourceNames) {
    if (current[name] === recorded[name]) continue;
    equal(
      recorded[name],
      observers[name]?.original,
      `Unapproved historical source: ${name}`,
    );
    equal(
      current[name],
      observers[name]?.repaired,
      `Unapproved current observer: ${name}`,
    );
    observerRepair = true;
  }
  if (observerRepair) {
    equal(
      await hashArtifact(recorded),
      "626cf96405afee136effd04cc5af3d0764bc82de2562e11601bf19323f0b9960",
      "Unknown historical study source profile",
    );
    equal(recovery?.nativeLedgerProvenance, "fresh-lean-reconstruction");
    equal(recovery?.originalNativeLedgerRetained, false);
    equal(recovery?.newInferenceCalls, 0);
    equal(recovery?.originalProtocolHash, expected.protocolHash);
    equal(recovery?.modelCallsRecovered, expected.modelCalls);
    equal(recovery?.episodesRecovered, expected.episodes);
  }
  return observerRepair;
}
