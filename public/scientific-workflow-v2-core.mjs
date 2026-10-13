/** Browser exploration only. No verifier, training, upload or scientific authority. */
export const SPECIES = ['Adelie', 'Chinstrap', 'Gentoo'];
const HEADER = 'species,island,bill_length_mm,bill_depth_mm,flipper_length_mm,body_mass_g,sex,year';

export function parseMeasurements(csv) {
  if (typeof csv !== 'string' || csv.length > 2 * 1024 * 1024) throw Error('Dataset is unavailable or oversized.');
  const lines = csv.replace(/\r\n/g, '\n').trimEnd().split('\n');
  if (lines.shift() !== HEADER || lines.length > 4096) throw Error('Unsupported measurement table.');
  const points = [], excluded = [];
  lines.forEach((line, index) => {
    const row = line.split(',');
    if (row.length !== 8 || !SPECIES.includes(row[0])) throw Error('Malformed measurement row.');
    const parsed = [row[4], row[5]].map(value => {
      if (value === 'NA') return null;
      if (!/^\d+(?:\.\d+)?$/.test(value) || !Number.isFinite(Number(value)) || Number(value) <= 0) throw Error('Invalid measurement.');
      return Number(value);
    });
    if (parsed.includes(null)) { excluded.push(index + 1); return; }
    if (!/^\d{4}$/.test(row[7])) throw Error('Invalid measurement year.');
    points.push({row: index + 1, species: row[0], island: row[1], flipper: parsed[0], mass: parsed[1], sex: row[6], year: Number(row[7])});
  });
  return {points, total: lines.length, excluded};
}

export function filteredPoints(points, species) {
  if (species !== 'all' && !SPECIES.includes(species)) throw Error('Unknown species.');
  return species === 'all' ? points : points.filter(point => point.species === species);
}

export function exploratoryFit(points) {
  if (points.length < 2) return null;
  const meanX = points.reduce((s, p) => s + p.flipper, 0) / points.length;
  const meanY = points.reduce((s, p) => s + p.mass, 0) / points.length;
  const sxx = points.reduce((s, p) => s + (p.flipper - meanX) ** 2, 0);
  const syy = points.reduce((s, p) => s + (p.mass - meanY) ** 2, 0);
  const sxy = points.reduce((s, p) => s + (p.flipper - meanX) * (p.mass - meanY), 0);
  if (!sxx) return null;
  const slope = sxy / sxx, intercept = meanY - slope * meanX;
  return {slope, intercept, r2: syy ? sxy ** 2 / (sxx * syy) : null, points: points.length, verified: false};
}

export function checkRecordedCase(receipt, dataset, dataSha) {
  if (receipt?.format !== 'pcs-scientific-workflow-public-record-v2' || receipt.recorded_result_not_live_verification !== true
      || receipt.scientific_acceptance !== false || receipt.independent_human_review !== false
      || receipt.kernel_refinement_of_numerical_adapter !== false
      || receipt.pcs_package_valid !== true || receipt.independent_replay_consistent !== true
      || receipt.bounded_contract_satisfied !== true || receipt.domain_replay?.outcome !== 'PASS'
      || receipt.domain_replay.data_sha256 !== dataSha) throw Error('Recorded evidence does not match this case.');
  const reference = receipt.domain_replay.reference;
  if (reference?.total_rows !== dataset.total || reference.complete_rows !== dataset.points.length
      || JSON.stringify(reference.excluded_rows) !== JSON.stringify(dataset.excluded)) throw Error('Recorded row accounting differs from the displayed data.');
  const claims = new Map(receipt.claims?.map(claim => [claim.claim_id, claim.decision]));
  if (claims.get('C_slope_dimensions') !== 'COMPUTATIONALLY_SUPPORTED' || claims.get('C_intercept_dimensions') !== 'COMPUTATIONALLY_SUPPORTED'
      || claims.get('C_NUMERICAL') !== 'OPEN' || claims.get('C_EMPIRICAL') !== 'OPEN') throw Error('Recorded authority boundaries differ from this case.');
  return true;
}

export function checkNegativeCases(cases) {
  const keys=['falsified-dimension','signed-false-report','wrong-slope'];
  if(!cases||JSON.stringify(Object.keys(cases).sort())!==JSON.stringify(keys))throw Error('Recorded negative controls are incomplete.');
  for(const record of Object.values(cases)){
    if(record.format!=='pcs-scientific-workflow-public-record-v2'||record.recorded_result_not_live_verification!==true
      ||record.pcs_package_valid!==true||record.bounded_contract_satisfied!==false||record.scientific_acceptance!==false)throw Error('A negative control violates the recorded boundary.');
  }
  if(cases['wrong-slope'].domain_replay?.outcome!=='FAIL'||cases['wrong-slope'].independent_replay_consistent!==true
    ||cases['signed-false-report'].independent_replay_consistent!==false
    ||!cases['falsified-dimension'].claims?.some(claim=>claim.claim_id==='C_slope_dimensions'&&claim.decision==='FALSIFIED_OR_CHECK_FAILED'))throw Error('A negative control does not contain its stated failure.');
  return true;
}
