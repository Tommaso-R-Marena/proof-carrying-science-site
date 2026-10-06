import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const sql=readFileSync(new URL("../migrations/0017_curated_needed_tasks_and_roles.sql",import.meta.url),"utf8");
const schema=readFileSync(new URL("../migrations/0016_proof_quest_adult_consent.sql",import.meta.url),"utf8");
const html=readFileSync(new URL("../public/tasks.html",import.meta.url),"utf8");
const game=readFileSync(new URL("../public/arena-proof-quest.html",import.meta.url),"utf8");
const worker=readFileSync(new URL("../src/worker.js",import.meta.url),"utf8");

test("all eleven categories include actual bounded work with review rules",()=>{
 const ids=[...sql.matchAll(/INSERT OR IGNORE INTO tasks\(/g)];
 assert.equal(ids.length,33);
 for(const category of ["administrative","community","design","documentation","engineering","marketing","operations","outreach","research","review","security"]){
   assert.ok(sql.includes("'"+category+"'"),category);
 }
 assert.ok(sql.includes("verification_rule")&&sql.includes("acceptance_criteria"));
 assert.ok(html.includes("Take the evaluation")&&html.includes("Submit an application"));
});
test("all L0-L6 levels and all eleven role categories are seeded",()=>{
 for(let level=0;level<=6;level++)assert.ok(new RegExp(",\s*"+level+"\s*,'(?:open|approval|invite)'").test(sql),"L"+level);
 assert.equal([...sql.matchAll(/INSERT OR IGNORE INTO role_openings\(/g)].length,13);
 assert.ok(sql.includes("published"));
 assert.ok(sql.includes("Volunteer · no payment promised"));
});
test("no auto scientific authority or automatic payment granted by task catalog",()=>{
 assert.equal(sql.includes("'funded'"),false);
 assert.ok(sql.includes("'volunteer'"));
 assert.ok(sql.includes("'invite'"));
 assert.ok(sql.includes("'informative'"));
 assert.ok(!sql.includes("'hard','Informative"));
});
test("Proof Quest uses the nonidentifying age-consented schema",()=>{
 for(const token of ["ON DELETE CASCADE","UNIQUE(user_id,puzzle_id,puzzle_version,ordering_json)","consent_version","valid_order","hints_used"]){
   assert.ok(schema.includes(token),token);
 }
 for(const token of ["adults 18+ only","No account to play","id=\"questAdult\"","id=\"questConsent\""]){
   assert.ok(game.includes(token),token);
 }
});
test("server regrades and exports research only through Owner authority",()=>{
 for(const token of ["gradeOrder(body.puzzle_id,body.order,body.hints_used)","if(!isOwner(admin))","proof_quest_daily_cap","email_verification_required","adult_consent_required","DELETE FROM proof_order_research_attempts WHERE user_id=?"]){
   assert.ok(worker.includes(token),token);
 }
});
