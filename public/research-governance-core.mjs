// Evidence labels are derived from server replay, never from a caller's claimed success.
// A manifest records provenance; it does not authorize training or scientific acceptance.
export const GOVERNANCE_VERSION='pcs-research-lineage-v1';
const hashPattern=/^[0-9a-f]{64}$/;
export function qualityLabels(session,replayed,{origin='unverified-client',independentlyChecked=false}={}){
 if(!session||!Array.isArray(session.events)||!replayed||!Array.isArray(replayed.transitions)||!hashPattern.test(replayed.goal_sha256)||session.catalog_sha256!==replayed.catalog_sha256||session.mission_id!==replayed.mission_id)throw Error('Unbound research replay');
 if(!['unverified-client','synthetic-fixture','consented-account'].includes(origin))throw Error('Unknown participant provenance');
 const hints=session.events.filter(e=>e.kind==='hint').length,undo=session.events.filter(e=>e.kind==='undo').length;
 const invalid=replayed.transitions.filter(t=>t.status==='invalid').length;
 if(hints!==replayed.hints||invalid!==replayed.invalid_attempts)throw Error('Inconsistent research labels');
 return {origin,participant_authenticity:'not established by replay',trajectory:replayed.completed?'complete':'partial',verification:independentlyChecked?'independent-kernel-replay':'archived-state-replay',assistance:hints?'assisted':'no-recorded-hints',hint_events:hints,undo_events:undo,invalid_actions:invalid,valid_actions:replayed.transitions.length-invalid,goal_sha256:replayed.goal_sha256,catalog_sha256:replayed.catalog_sha256,mission_id:replayed.mission_id,training_eligible:false,required_intake:'Fresh kernel replay, license, withdrawal and evaluation-firewall checks'};
}
export async function sha256(value){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value))),x=>x.toString(16).padStart(2,'0')).join('');}
export function canonical(value){
 if(value===null||typeof value!=='object')return JSON.stringify(value);
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
 return '{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
}
export async function exportManifest(entries,catalogSha){
 if(!Array.isArray(entries)||entries.length>25||!hashPattern.test(catalogSha))throw Error('Invalid bounded export');
 const membership=[];
 for(const entry of entries){
  if(typeof entry.id!=='string'||entry.license!=='CC0-1.0'||entry.adult_consented!==true||entry.training_consented!==true||entry.session?.catalog_sha256!==catalogSha)throw Error('Unconsented or mismatched export entry');
  membership.push({id:entry.id,session_sha256:await sha256(canonical(entry.session)),goal_sha256:entry.quality?.goal_sha256||null});
 }
 membership.sort((a,b)=>a.id.localeCompare(b.id));
 if(new Set(membership.map(x=>x.id)).size!==membership.length)throw Error('Duplicate export membership');
 return {format:GOVERNANCE_VERSION,catalog_sha256:catalogSha,membership,membership_sha256:await sha256(canonical(membership)),export_sha256:await sha256(canonical(entries)),consent_scope:'pcs-bridge-adult-cc0-optin-v1',training_eligible:false,prior_exports_recalled:false,model_unlearning:false,limitation:'Downloadable lineage only. Register each export, dataset and model in the local lineage ledger; future withdrawal must be applied before use.'};
}
export function withdrawalReceipt(ids){
 if(!Array.isArray(ids)||ids.length>1000||ids.some(x=>typeof x!=='string'||!/^[0-9a-f-]{36}$/.test(x))||new Set(ids).size!==ids.length)throw Error('Invalid withdrawal membership');
 return {format:'pcs-research-withdrawal-v1',withdrawn_entry_ids:[...ids].sort(),scope:'active account-linked Bridge Builder and Memory Workshop donations',active_records_deleted:true,prior_exports_recalled:false,model_unlearning:false,action_required:'Import this receipt into every dataset lineage ledger; quarantine affected datasets and checkpoints for future use. Prior copies, backups and trained weights are not erased.'};
}
