// Dependency-free, client-side research-preview calculations.
// NOT a PCS certificate verifier, Lean kernel, digital signature verifier or policy authority.
// Do not use this module to authorize contributors or accept production evidence.
const plain = value => value !== null && typeof value === "object" && !Array.isArray(value);
const numeric = (value, name, min, max) => {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new Error(name + " must be a finite number from " + min + " to " + max + ".");
  }
  return value;
};
const integer = (value, name, min, max) => {
  const result = numeric(value, name, min, max);
  if (!Number.isInteger(result)) throw new Error(name + " must be an integer.");
  return result;
};
const array = (value, name, max) => {
  if (!Array.isArray(value) || value.length === 0 || value.length > max) {
    throw new Error(name + " must have between 1 and " + max + " items.");
  }
  return value;
};
const countKeys = (record, allowed, label) => {
  if (!plain(record)) throw new Error(label + " must be a JSON object.");
  const unknown = Object.keys(record).filter(key => !allowed.includes(key));
  if (unknown.length) throw new Error(label + " has unsupported fields: " + unknown.join(", "));
};
export function evaluateTrace(input) {
  countKeys(input, ["policy", "events"], "Trace input");
  countKeys(input.policy, ["forbidden_action", "max_cumulative_risk"], "Policy");
  const forbidden = integer(input.policy.forbidden_action, "forbidden_action", 0, 100000);
  const limit = integer(input.policy.max_cumulative_risk, "max_cumulative_risk", 0, 100000);
  const events = array(input.events, "events", 64);
  let risk = 0;
  let firstFailure = null;
  const rows = events.map((event, index) => {
    countKeys(event, ["action", "risk"], "Event " + (index + 1));
    const action = integer(event.action, "Event action", 0, 100000);
    const increment = integer(event.risk, "Event risk", 0, 100000);
    risk += increment;
    const forbiddenTriggered = action === forbidden;
    const limitExceeded = risk > limit;
    const passed = !forbiddenTriggered && !limitExceeded;
    if (!passed && firstFailure === null) {
      firstFailure = "Step " + (index + 1) + ": " + (forbiddenTriggered ? "forbidden action " + forbidden : "cumulative risk " + risk + " exceeds " + limit);
    }
    return {step: index + 1, action, increment, cumulative_risk: risk, passed};
  });
  return {
    kind: "trace",
    verdict: firstFailure === null ? "PASS" : "FAIL",
    conclusion: firstFailure || ("All " + rows.length + " recorded steps satisfy the selected policy."),
    checked: "Local arithmetic over the supplied JSON events; action " + forbidden + " excluded and risk <= " + limit + ".",
    limits: "The event log is an input, not an authenticated observation. No signature, Lean theorem, source-to-binary correspondence, environment fidelity, or deployed-agent behavior was verified.",
    steps: rows
  };
}
export function evaluateModel(input) {
  countKeys(input, ["model", "tolerance", "observations"], "Model input");
  countKeys(input.model, ["dose_mg", "volume_l", "elimination_per_h"], "Model");
  const dose = numeric(input.model.dose_mg, "dose_mg", 0.000001, 1000000);
  const volume = numeric(input.model.volume_l, "volume_l", 0.000001, 1000000);
  const k = numeric(input.model.elimination_per_h, "elimination_per_h", 0, 1000);
  const tolerance = numeric(input.tolerance, "tolerance", 0, 100);
  const observations = array(input.observations, "observations", 64);
  let firstFailure = null;
  const rows = observations.map((item, index) => {
    countKeys(item, ["time_h", "concentration_mg_per_l"], "Observation " + (index + 1));
    const time = numeric(item.time_h, "time_h", 0, 100000);
    const supplied = numeric(item.concentration_mg_per_l, "concentration_mg_per_l", 0, 1000000);
    const predicted = (dose / volume) * Math.exp(-k * time);
    const difference = Math.abs(supplied - predicted);
    const passed = difference <= tolerance;
    if (!passed && firstFailure === null) firstFailure = "Observation " + (index + 1) + " differs by " + difference.toPrecision(5) + " mg/L (tolerance " + tolerance + ").";
    return {time_h: time, observed: supplied, predicted, absolute_difference: difference, passed};
  });
  return {
    kind: "model",
    verdict: firstFailure === null ? "PASS" : "FAIL",
    conclusion: firstFailure || ("All " + rows.length + " supplied predictions match the declared synthetic model within tolerance."),
    checked: "Recomputed C(t) = dose/volume * exp(-k*t) in the local browser for each input observation.",
    limits: "This checks a synthetic numeric example, not empirical truth, data provenance, environment replay, Lean proof, signature validity, or independent scientific reproduction.",
    steps: rows
  };
}
export const examples = Object.freeze({
  trace_pass: {
    policy: {forbidden_action: 7, max_cumulative_risk: 4},
    events: [{action: 1, risk: 1}, {action: 2, risk: 1}, {action: 3, risk: 2}]
  },
  trace_fail: {
    policy: {forbidden_action: 7, max_cumulative_risk: 4},
    events: [{action: 1, risk: 1}, {action: 7, risk: 1}, {action: 3, risk: 4}]
  },
  model_pass: {
    model: {dose_mg: 20, volume_l: 10, elimination_per_h: 0.1},
    tolerance: 0.0001,
    observations: [
      {time_h: 0, concentration_mg_per_l: 2},
      {time_h: 1, concentration_mg_per_l: 1.80967483607},
      {time_h: 2, concentration_mg_per_l: 1.63746150616}
    ]
  },
  model_fail: {
    model: {dose_mg: 20, volume_l: 10, elimination_per_h: 0.1},
    tolerance: 0.0001,
    observations: [
      {time_h: 0, concentration_mg_per_l: 2},
      {time_h: 1, concentration_mg_per_l: 2.1}
    ]
  }
});
