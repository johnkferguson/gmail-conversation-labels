/**
 * Gmail Smart Labeller — Apps Script entry points.
 *
 * Every function in this file is invoked by name — by the Apps Script editor's
 * "Run" dropdown or by time-driven triggers. They MUST stay as top-level
 * `function` declarations with stable names. Trigger handler names referenced
 * by string elsewhere are defined in constants.js.
 *
 * Setup flow for new users:
 *   1. Copy config.template.js → config.js, fill in `userEmail`.
 *   2. Run `setup()` once to create labels and register the polling trigger.
 *   3. (Optional) Run `processHistorical()` to label existing mail.
 *
 * @author John K. Ferguson
 */

/** Polling trigger handler — labels new mail. */
function main() {
  processNewEmails();
}

/** One-time setup: create labels, register triggers. */
function setup() {
  setupLabels();
  setupTrigger();
  setupCleanupTrigger();
  Logger.log("Gmail Smart Labeller successfully set up!");
  Logger.log("To process historical emails, run processHistorical().");
}

/** Manual run for testing without waiting for the trigger. */
function manualRun() {
  processNewEmails();
}

/** Label existing unlabeled threads. Run repeatedly until done. */
function processHistorical() {
  processExistingThreads();
}

/** Wipe the thread cache. All threads will be reprocessed on the next run. */
function resetCache() {
  resetTracking();
  Logger.log("Cache has been reset. All threads will be reprocessed.");
}

/** Daily cache cleanup trigger handler. */
function cleanupCache() {
  ThreadCache.cleanup();
}
