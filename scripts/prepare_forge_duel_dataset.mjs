// Export prep for consented synthetic human policy ranking experiments.
// The generator's deterministic oracle, not the human, supplies factual labels.
// Absolutely no identity, timestamps, or unreviewed free text are accepted.
import {readFileSync,writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {DUEL_VERSION,DUEL_ROUNDS,evaluateDuelSession,duelFor} from "../public/forge-duel-core.mjs";
export const LEARNING_FORMAT="pcs-forge-duel-learning-dataset-v1";
export function prepareForgeDuelDataset(data){
  if(!data||typeof data!=="object"||Array.isArray(data)||
     data.format!=="pcs-forge-duel-optin-research-dataset-v1"||
     !Array.isArray(data.entries)||data.entries.length>500)
    throw Error("Expected bounded owner-exported, deidentified Forge Duel dataset.");
  if(Object.keys(data).some(x=>["user_id","email","ip","username"].includes(x)))
    throw Error("Unexpected identity-bearing dataset field.");
  let rows=[],dissent=0,approved=0,uncertain=0;
  const counts=new Map();
  for(const entry of data.entries){
    if(!entry||typeof entry!=="object"||Array.isArray(entry)||
       Object.keys(entry).sort().join(",")!=="ballots,correct,limitations,uncertain,version")
      throw Error("Malformed verified duel replay; refuse raw identity fields.");
    const ballots=entry.ballots.map(b=>({
      seed:b.seed,round:b.round,version:b.version,choice:b.choice,
      reason:b.reason,confidence:b.confidence
    }));
    const verified=evaluateDuelSession({session_version:DUEL_VERSION,ballots});
    if(JSON.stringify(verified)!==JSON.stringify(entry))
      throw Error("Disagreement between stored server labels and independent replay.");
    for(const ballot of verified.ballots){
      const family=ballot.scenario_family;
      const split=family==="space"?"evaluation":"training"; // Entire world family withheld.
      const eligible=split==="training"&&ballot.correct&&ballot.reason!=="uncertain"&&ballot.confidence>=2;
      const group=ballot.seed+"/"+ballot.round;
      counts.set(group,(counts.get(group)||0)+1);
      if(!ballot.correct)dissent++;
      if(eligible)approved++;
      if(ballot.reason==="uncertain")uncertain++;
      rows.push({
        seed:ballot.seed,round:ballot.round,group,world:family,split,
        policy_A:ballot.policy_A,policy_B:ballot.policy_B,
        human_choice:ballot.choice,reason:ballot.reason,confidence:ballot.confidence,
        human_agreed_with_oracle:ballot.correct,oracle_winner:ballot.oracle_winner,
        oracle:ballot.oracle,eligible_for_synthetic_preference_training:eligible,
      });
    }
  }
  for(const row of rows)row.case_vote_count=counts.get(row.group);
  return {format:LEARNING_FORMAT,version:DUEL_VERSION,
    dataset_scope:"Human-reported preference explanations for deterministic synthetic safety-policy comparisons.",
    evaluation_holdout_world:"space",
    data_quality:{total_ballots:rows.length,unique_cases:counts.size,discordant_human_votes:dissent,
      high_confidence_correct_training_preferences:approved,uncertain_reason_votes:uncertain},
    limitations:[
      "A browser cannot prove a self-reported vote preceded access to the deterministic answer.",
      "Age is self-attested; gameplay may be automated, fabricated, or contaminated by known answers.",
      "The oracle can label all generated pairs without players: compare models against the exact oracle, not just humans.",
      "Full world-family holdout mitigates but cannot eliminate simulation-template leakage.",
      "These votes do not contain real Lean tactics, verified scientific conclusions, or deployed AI safety ground truth."
    ],rows};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  if(process.argv.length!==4)throw Error("Usage: node scripts/prepare_forge_duel_dataset.mjs OWNER_EXPORT.json OUTPUT.json");
  const input=JSON.parse(readFileSync(process.argv[2],"utf8"));
  writeFileSync(process.argv[3],JSON.stringify(prepareForgeDuelDataset(input),null,2)+"\n");
}
