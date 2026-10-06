// Browser-only external evaluation planning. This does NOT run PCS or verify proofs.
export const EVALUATION_FORMAT = "pcs-independent-pilot-draft-v1";
export const TRACKS = Object.freeze(["reproduce", "falsify", "trust_boundary"]);
export const TARGETS = Object.freeze(["browser_preview", "guided_draft", "package_inspector", "independent_pcs_cli"]);
export const OUTCOMES = Object.freeze(["not_run", "expected", "unexpected", "inconclusive"]);
export const DEFAULTS = Object.freeze({
  track: "falsify",
  target: "browser_preview",
  source_version: "not-known",
  claim: "The recorded AI-policy trace has no action 7 and never exceeds cumulative risk 4.",
  experiment: "Change a declared event action to 7; rerun the same local check.",
  expected: "The modified recorded trace fails its finite policy check.",
  observed: "not_run",
  assumptions: "This evaluates the submitted record, not whether a deployed system produced a faithful log.",
  limitations: "Browser-only demonstration. No Lean build or cryptographic certificate was verified.",
  evidence_reference: ""
});
const LIMITS = Object.freeze({
  claim: 1000, experiment: 1600, expected: 1000, assumptions: 1000,
  limitations: 1000, evidence_reference: 450, source_version: 80
});
const FIELDS = Object.keys(DEFAULTS);
const isPlain = x => x!==null && typeof x==="object" && !Array.isArray(x);
const text = (v, label, limit, optional=false) => {
  if(typeof v !== "string") throw new Error(label+" must be text.");
  const normalized=v.trim();
  if(normalized.length>limit || (!optional && normalized.length<12)) throw new Error(label+" must be "+(optional?"0":"12")+"–"+limit+" characters.");
  return normalized;
};
export function validatePilotInput(value) {
  if(!isPlain(value) || Object.keys(value).some(key=>!FIELDS.includes(key))) {
    throw new Error("Only the explicitly supported pilot-draft fields are accepted.");
  }
  const result = {...DEFAULTS, ...value};
  if(!TRACKS.includes(result.track)) throw new Error("Choose a supported evaluation track.");
  if(!TARGETS.includes(result.target)) throw new Error("Choose a supported test target.");
  if(!OUTCOMES.includes(result.observed)) throw new Error("Choose a supported observation status.");
  for(const [field,max] of Object.entries(LIMITS)){
    result[field]=text(result[field],field,max,field==="evidence_reference" || field==="source_version");
  }
  if(result.source_version!=="not-known" && !/^[a-f0-9]{7,40}$/i.test(result.source_version) && !/^[A-Za-z0-9._/-]{4,80}$/.test(result.source_version)){
    throw new Error("Use a version tag, commit hash, or 'not-known'.");
  }
  if(result.evidence_reference && /[\r\n]/.test(result.evidence_reference)) throw new Error("Evidence reference must be one line.");
  if(result.observed!=="not_run" && result.source_version==="not-known") {
    throw new Error("Provide the actual version or build identifier before reporting an executed result.");
  }
  return result;
}
export function makePilotDraft(value) {
  const plan = validatePilotInput(value);
  return {
    format:EVALUATION_FORMAT,
    data_handling:"browser_local_user_export",
    signed:false,
    authoritative:false,
    pcs_verdict:"NOT_EVALUATED",
    independent_verification:"NOT_ATTESTED",
    self_reported_observation:plan.observed,
    assessment:plan,
    next_steps: [
      "Reproduce on a pinned version and record tool/environment versions.",
      "Supply at least one negative control or counterexample when possible.",
      "Disclose all trust assumptions and unresolved failures.",
      "Do not infer Lean-kernel or deployed-agent soundness from a browser calculation.",
      "Share only non-sensitive results through an explicitly chosen channel."
    ]
  };
}
export function emailSummary(value) {
  const plan=validatePilotInput(value);
  // Keep email concise; attached JSON remains user-controlled.
  return [
    "Hello PCS team,",
    "",
    "I would like to independently evaluate a bounded PCS workflow.",
    "Track: "+plan.track,
    "Target: "+plan.target,
    "Version: "+plan.source_version,
    "Observed status (self-reported): "+plan.observed,
    "",
    "Claim: "+plan.claim,
    "",
    "Proposed falsification/reproduction: "+plan.experiment,
    "Expected outcome: "+plan.expected,
    "",
    "Trust assumptions: "+plan.assumptions,
    "Unresolved limitations: "+plan.limitations,
    plan.evidence_reference ? "Public, non-sensitive evidence reference: "+plan.evidence_reference : "",
    "",
    "This is a request for independent evaluation, not a statement of PCS verification.",
    "Please advise on a bounded pilot and any appropriate private handling of further materials."
  ].filter((s,i,a)=>!(s===""&&a[i-1]==="")).join("\n");
}
