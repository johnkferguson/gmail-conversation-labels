/**
 * Gmail Conversation Labels — config validator.
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

  // Accept either userEmails: string[] (preferred) or userEmail: string (legacy).
  // Validated directly from raw CONFIG so we can name the exact wrong field.
  // Cast to `any` because the template only declares the preferred shape but
  // we still handle the legacy one at runtime.
  /** @type {any} */
  const rawConfig = CONFIG;
  const userEmailsField = rawConfig.userEmails;
  const userEmailField = rawConfig.userEmail;
  const hasArrayShape = Array.isArray(userEmailsField);
  const hasLegacyShape = typeof userEmailField === "string" && userEmailField.length > 0;

  if (hasArrayShape) {
    if (userEmailsField.length === 0) {
      problems.push("userEmails is empty — add at least one address you send mail from.");
    } else {
      for (let i = 0; i < userEmailsField.length; i++) {
        const addr = userEmailsField[i];
        if (typeof addr !== "string" || addr.length === 0) {
          problems.push(`userEmails[${i}] must be a non-empty string.`);
        } else if (addr === "your.email@example.com") {
          problems.push(`userEmails[${i}] is the placeholder — replace with your real address.`);
        } else if (!addr.includes("@")) {
          problems.push(`userEmails[${i}] ("${addr}") doesn't look like an email address.`);
        }
      }
    }
  } else if (hasLegacyShape) {
    if (userEmailField === "your.email@example.com") {
      problems.push("userEmail is the placeholder — edit src/config.js with your real address.");
    } else if (!userEmailField.includes("@")) {
      problems.push(`userEmail "${userEmailField}" doesn't look like an email address.`);
    }
  } else {
    problems.push(
      'userEmails is not set — add `userEmails: ["you@example.com"]` to src/config.js (or the legacy `userEmail: "you@example.com"`).'
    );
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
