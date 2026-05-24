/**
 * Gmail Smart Labeller — exponential-backoff retry.
 *
 * Gmail API quotas and Apps Script "Service invoked too many times" errors
 * surface as exceptions from GmailApp.search / label.addToThreads / similar.
 * They're usually transient and clear within seconds. Wrap risky calls in
 * `withRetry` to absorb them; permission and auth errors are not retried.
 */

/**
 * Heuristic for transient errors worth retrying.
 *
 * @param {unknown} error
 * @returns {boolean}
 */
function isRetryableError(error) {
  const msg = String(error).toLowerCase();
  // Hard fails — don't retry these.
  if (
    msg.includes("permission") ||
    msg.includes("access denied") ||
    msg.includes("unauthorized") ||
    msg.includes("not found")
  ) {
    return false;
  }
  // Known transient signals from the Apps Script / Gmail API surface.
  return (
    msg.includes("rate limit") ||
    msg.includes("too many") ||
    msg.includes("backend error") ||
    msg.includes("service invoked too many times") ||
    msg.includes("internal error") ||
    msg.includes("timeout") ||
    msg.includes("temporarily")
  );
}

/**
 * Call `fn`; on a retryable error, sleep with exponential backoff and try
 * again, up to `retries` additional attempts. Non-retryable errors are
 * re-thrown immediately. Returns `fn`'s return value on success.
 *
 * @template T
 * @param {() => T} fn
 * @param {{ retries?: number, baseDelayMs?: number, label?: string }} [opts]
 * @returns {T}
 */
function withRetry(fn, opts = {}) {
  const retries = opts.retries ?? 3;
  const baseDelayMs = opts.baseDelayMs ?? 1000;
  const label = opts.label ?? "operation";

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return fn();
    } catch (error) {
      lastError = error;
      if (!isRetryableError(error) || attempt === retries) {
        throw error;
      }
      const delay = baseDelayMs * 2 ** attempt;
      Logger.log(
        `${label} failed (attempt ${attempt + 1}/${retries + 1}): ${String(error)}. Retrying in ${delay}ms.`
      );
      Utilities.sleep(delay);
    }
  }
  throw lastError;
}
