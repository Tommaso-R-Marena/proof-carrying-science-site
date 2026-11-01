// Release-reviewed model identity, independent of the file's self-reported hash.
// Delivery of this script/browser remains a trust dependency. A digest is not
// proof that the model's proposals are correct; each edit still needs checking.
export const REPAIR_MODEL_DIGEST='1202f553597d3e946a99f38131656ee06a0ed2937ef2da2ae9aea93df33af4ee';
function freeze(value){
  if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value);}
  return value;
}
export async function verifiedRepairModel(input){
  // Capture before awaiting: callers cannot replace mutable weights mid-check.
  const model=structuredClone(input);
  if(model?.format!=='pcs-learned-semantic-repair-policy-v1'||
    model.authority!=='NONE_UNTRUSTED_PROPOSALS_ONLY'||
    !Array.isArray(model.weights)||model.weights.length!==384||
    !model.weights.every(x=>typeof x==='number'&&Number.isFinite(x))||
    model.model_digest_sha256!==REPAIR_MODEL_DIGEST)
    throw Error('Unrecognized repair model');
  const payload=Object.fromEntries(Object.entries(model).filter(([key])=>key!=='model_digest_sha256'));
  const digest=[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(payload))))]
    .map(b=>b.toString(16).padStart(2,'0')).join('');
  if(digest!==REPAIR_MODEL_DIGEST)throw Error('Repair model digest mismatch');
  return freeze(model);
}
