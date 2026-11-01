import {CORE_SHA, preflightDispatch} from './lean-research.js';

// Per-isolate, short-lived observations. This is neither a dispatch reservation
// nor proof evidence: dispatch repeats the uncached source checks before POST.
const observations = new WeakMap();
export async function leanReadiness(env, {transport=fetch, now=Date.now()}={}) {
  if (!env.PCS_LEAN_GITHUB_TOKEN) return {status:'unavailable', reason:'not_configured', core_sha:CORE_SHA, pcs_authority:false};
  const cached=observations.get(env);
  if (cached && now>=cached.observed && now<cached.observed+30000) return cached.promise;
  const promise=(async()=>{
    try {
      await preflightDispatch(env,transport);
      return {status:'configured', readiness:'ready', observed_at:new Date(now).toISOString(),
        observation_max_age_seconds:30, core_sha:CORE_SHA, pcs_authority:false};
    } catch(error) {
      return {status:'unavailable', readiness:'unavailable', reason:error.readiness_code||'provider_unavailable',
        observed_at:new Date(now).toISOString(), observation_max_age_seconds:30, core_sha:CORE_SHA, pcs_authority:false};
    }
  })();
  observations.set(env,{observed:now,promise});
  return promise;
}
