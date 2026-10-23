// The beginner path reuses the same finite semantics and export format as the
// Countermodel Lab. A browser calculation never grants PCS authority.
import {COUNTERMODEL_VERSION, initialWorld, countermodelVerdict, exportLeanCountermodel}
  from './countermodel-core.mjs';
import {strictParse, exact} from './omega-core.mjs';

export const MISSION = 'implication-flip';
export const MAX_WITNESS_BYTES = 4096;
export const PREDICTIONS = Object.freeze(['intended', 'proposal', 'both', 'neither']);

export function makeWorld(used, authorized) {
  if (typeof used !== 'boolean' || typeof authorized !== 'boolean') throw Error('Choose yes or no for both facts.');
  const world = initialWorld();
  world.P[0] = used; world.Q[0] = authorized;
  return world;
}

export function inspectWorld(world) {
  // This tour intentionally covers exactly one tool call, not arbitrary agents.
  if (world?.n !== 1) throw Error('This first investigation supports one synthetic tool call.');
  const verdict = countermodelVerdict(MISSION, world);
  const failing = !verdict.left ? (!verdict.right ? 'both' : 'intended') : (!verdict.right ? 'proposal' : 'neither');
  return {...verdict, failing, kernel_executed: false, pcs_authority: false,
    scientific_acceptance: false, scope: 'one synthetic tool-call world'};
}

export function checkPrediction(world, prediction) {
  if (!PREDICTIONS.includes(prediction)) throw Error('Choose a prediction before checking.');
  const result = inspectWorld(world);
  return {...result, prediction_correct: prediction === result.failing};
}

export function witnessFor(world) {
  if (!inspectWorld(world).counterexample) throw Error('These facts do not show a difference. Change one fact and check again.');
  return {format: 'pcs-countermodel-witness-v1', version: COUNTERMODEL_VERSION,
    mission_id: MISSION, world: structuredClone(world)};
}

export function proofFor(world) {
  witnessFor(world);
  return exportLeanCountermodel(MISSION, world);
}

export function readWitness(raw) {
  const d = strictParse(raw, MAX_WITNESS_BYTES);
  exact(d, ['format', 'version', 'mission_id', 'world']);
  if (d.format !== 'pcs-countermodel-witness-v1' || d.version !== COUNTERMODEL_VERSION || d.mission_id !== MISSION)
    throw Error('Choose a First Investigation witness, not a full PCS package or another mission.');
  const result = inspectWorld(d.world);
  if (!result.counterexample) throw Error('The supplied facts do not show a difference between these rules.');
  // Recorded verdicts are not accepted as input. Recompute from the facts.
  return {world: structuredClone(d.world), result};
}
