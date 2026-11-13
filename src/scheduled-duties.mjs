/**
 * Execute scheduled maintenance sequentially, but independently.
 *
 * The caller is responsible for scheduling frequency and for implementing
 * transactional/idempotent maintenance operations. A failed duty does not block
 * later duties; any failure rejects the scheduled event after all duties run,
 * so operational metrics must not report an unsuccessful maintenance run as OK.
 *
 * We log only the duty's stable identifier and generic error category, not
 * SQL fragments or user data which provider errors may contain.
 */
export async function runScheduledDuties(env, duties, reportFailure = console.error) {
  const failed = [];
  for (const [name, duty] of duties) {
    try {
      await duty(env);
    } catch (error) {
      failed.push(name);
      const errorType = ['Error','TypeError','RangeError','SyntaxError','ReferenceError','AggregateError'].includes(error?.name) ? error.name : 'Error';
      reportFailure('PCS Commons scheduled duty failed', { duty: name, error_type: errorType });
    }
  }
  if (failed.length) {
    throw new Error(`PCS scheduled maintenance failed: ${failed.join(', ')}`);
  }
}
