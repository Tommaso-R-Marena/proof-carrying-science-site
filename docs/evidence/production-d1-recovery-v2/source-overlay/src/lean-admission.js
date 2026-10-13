// Trusted route admission, not proof authority. A single SQLite statement
// changes both existing quota keys or neither; no compensating refunds.
async function scopedKey(salt,scope,ip){
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${salt}:${scope}:${ip}`)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
export class LeanAdmissionError extends Error {
  constructor(status,message,code){super(message);this.status=status;this.code=code;}
}
export async function admitLeanProof(env,ip,{now=Date.now()}={}){
  if(typeof env.RATE_LIMIT_SALT!=='string'||!env.RATE_LIMIT_SALT||!env.COMMONS_DB?.prepare)
    throw new LeanAdmissionError(503,'Proof admission protection is unavailable.','rate_limit_unconfigured');
  if(typeof ip!=='string'||!Number.isSafeInteger(now)||now<86400000)
    throw new LeanAdmissionError(503,'Invalid trusted proof admission context.','rate_limit_unconfigured');
  const ipKey=await scopedKey(env.RATE_LIMIT_SALT,'public-lean-submit',ip);
  const globalKey=await scopedKey(env.RATE_LIMIT_SALT,'public-lean-global','PCS_PUBLIC_LEAN_GLOBAL');
  const issued=new Date(now).toISOString(),cutoff=new Date(now-86400000).toISOString();
  // MATERIALIZED is essential: checking eligibility twice while mutating the
  // last available slot could insert the first key but skip the second.
  const result=await env.COMMONS_DB.prepare(`
    WITH eligible AS MATERIALIZED (
      SELECT 1 AS ok WHERE
        NOT EXISTS (SELECT 1 FROM rate_limits WHERE key IN (?,?) AND (typeof(count)<>'integer' OR count<0))
        AND COALESCE((SELECT CASE WHEN window_start<? THEN 0 ELSE count END FROM rate_limits WHERE key=?),0)<2
        AND COALESCE((SELECT CASE WHEN window_start<? THEN 0 ELSE count END FROM rate_limits WHERE key=?),0)<12
    ), candidates AS MATERIALIZED (
      SELECT ? AS key, ? AS window_start, 1 AS count FROM eligible
      UNION ALL SELECT ?, ?, 1 FROM eligible
    )
    INSERT INTO rate_limits(key,window_start,count)
    SELECT key,window_start,count FROM candidates WHERE 1
    ON CONFLICT(key) DO UPDATE SET
      count=CASE WHEN rate_limits.window_start<? THEN 1 ELSE rate_limits.count+1 END,
      window_start=CASE WHEN rate_limits.window_start<? THEN excluded.window_start ELSE rate_limits.window_start END
    RETURNING key,count
  `).bind(ipKey,globalKey,cutoff,ipKey,cutoff,globalKey,ipKey,issued,globalKey,issued,cutoff,cutoff).all();
  const rows=result.results||[];
  if(rows.length===0)throw new LeanAdmissionError(429,'Too many proof requests. Please wait and try again.','rate_limited');
  if(rows.length!==2||new Set(rows.map(r=>r.key)).size!==2||!rows.some(r=>r.key===ipKey&&Number.isInteger(r.count)&&r.count>=1&&r.count<=2)||!rows.some(r=>r.key===globalKey&&Number.isInteger(r.count)&&r.count>=1&&r.count<=12))
    throw new LeanAdmissionError(503,'Proof admission state is invalid.','rate_limit_unconfigured');
  return {format:'pcs-lean-atomic-admission-v1',admitted:true,pcs_authority:false};
}
