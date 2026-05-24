/**
 * Gmail Smart Labeller — config validator.
 *
 * Called from setup() so misconfiguration is caught before any triggers are
 * registered. Each problem is collected so the user gets the full picture in
 * one error rather than a one-at-a-time discovery loop.
 *
 * @throws {Error} with all problems joined into a multi-line message.
 */
function validateConfig() {
  /** @type {string[]} */
  const problems = [];

  if (!CONFIG.userEmail || CONFIG.userEmail === "your.email@example.com") {
    problems.push("userEmail is not set — edit src/config.js and replace the placeholder.");
  } else if (!CONFIG.userEmail.includes("@")) {
    problems.push(`userEmail "${CONFIG.userEmail}" doesn't look like an email address.`);
  }

  const polling = CONFIG.polling ?? {};
  if (!(polling.intervalMinutes >= 1)) {
    problems.push("polling.intervalMinutes must be >= 1 (Apps Script's minimum trigger interval).");
  }
  if (!(polling.searchWindowMinutes >= polling.intervalMinutes)) {
    problems.push(
      `polling.searchWindowMinutes (${polling.searchWindowMinutes}) must be >= polling.intervalMinutes (${polling.intervalMinutes}) so a delayed/skipped run doesn't miss mail.`
    );
  }
  if (!(polling.maxThreadsPerRun > 0)) {
    problems.push("polling.maxThreadsPerRun must be > 0.");
  } else if (polling.maxThreadsPerRun > 100) {
    problems.push(
      `polling.maxThreadsPerRun (${polling.maxThreadsPerRun}) exceeds GmailLabel.addToThreads's 100-thread per-call cap.`
    );
  }
  if (!(polling.timeoutMs > 0)) {
    problems.push("polling.timeoutMs must be > 0 (in milliseconds).");
  }

  const labels = CONFIG.labels ?? {};
  for (const key of ["inbound", "outbound", "conversation"]) {
    if (!labels[key] || typeof labels[key] !== "string") {
      problems.push(`labels.${key} must be a non-empty string.`);
    }
  }

  const caching = CONFIG.caching ?? {};
  if (!caching.threadCacheKeyPrefix) {
    problems.push("caching.threadCacheKeyPrefix must be set.");
  }
  if (!(caching.maxCachedThreads > 0)) {
    problems.push("caching.maxCachedThreads must be > 0.");
  }
  if (!(caching.threadCacheRetentionDays > 0)) {
    problems.push("caching.threadCacheRetentionDays must be > 0.");
  }

  if (problems.length > 0) {
    throw new Error(
      `Config validation failed:\n  - ${problems.join("\n  - ")}\n\nFix src/config.js and run setup() again.`
    );
  }
}
