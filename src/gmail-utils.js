/**
 * Gmail Smart Labeller — Gmail and trigger helpers.
 *
 * Thin wrappers around GmailApp and ScriptApp. Pure helpers (no
 * cross-cutting state) live in classifier.js instead.
 */

/**
 * Fetch up to `maxToRetrieve` messages from a thread, optionally including the
 * latest message regardless of position. Used by the classifier when we want
 * to check both the start and the tail of a long thread without loading every
 * message.
 *
 * Note: GmailApp's `getMessages()` loads the full thread; the "selective" part
 * is the array slicing. For genuinely selective fetches we'd need the Gmail
 * Advanced Service with `format: 'METADATA'`.
 *
 * @param {GoogleAppsScript.Gmail.GmailThread} thread
 * @param {number} maxToRetrieve
 * @param {boolean} includeLatest
 * @return {GoogleAppsScript.Gmail.GmailMessage[]}
 */
function getMessagesSelectively(thread, maxToRetrieve = 2, includeLatest = false) {
  const messageCount = thread.getMessageCount();
  const allMessages = thread.getMessages();

  if (messageCount === 0) return [];
  if (messageCount === 1 || maxToRetrieve === 1) return [allMessages[0]];

  if (includeLatest && messageCount > maxToRetrieve) {
    const earlyCount = maxToRetrieve - 1;
    const result = [];
    for (let i = 0; i < earlyCount && i < allMessages.length; i++) {
      result.push(allMessages[i]);
    }
    if (messageCount > earlyCount) {
      result.push(allMessages[messageCount - 1]);
    }
    return result;
  }

  const count = Math.min(messageCount, maxToRetrieve);
  return allMessages.slice(0, count);
}

/**
 * Build the Gmail search query used by `processNewEmails`. The window is
 * configured by `CONFIG.polling.searchWindowMinutes`; keep it >= the trigger
 * interval so a delayed/skipped run doesn't miss mail.
 *
 * @return {string}
 */
function buildOptimizedSearchQuery() {
  const windowMinutes = CONFIG.polling.searchWindowMinutes;
  return `newer_than:${windowMinutes}m -label:${CONFIG.labels.inbound} -label:${CONFIG.labels.outbound} -label:${CONFIG.labels.conversation}`;
}

/**
 * @param {string} labelName
 * @return {GoogleAppsScript.Gmail.GmailLabel}
 */
function getOrCreateLabel(labelName) {
  return GmailApp.getUserLabelByName(labelName) || GmailApp.createLabel(labelName);
}

function setupLabels() {
  try {
    getOrCreateLabel(CONFIG.labels.inbound);
    getOrCreateLabel(CONFIG.labels.outbound);
    getOrCreateLabel(CONFIG.labels.conversation);
    Logger.log("Labels have been set up successfully");
  } catch (error) {
    Logger.log(`Error setting up labels: ${error.toString()}`);
  }
}

/**
 * Register the polling trigger for `main`. Idempotent — removes any existing
 * trigger for the same handler first.
 */
function setupTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
      if (trigger.getHandlerFunction() === TRIGGER_HANDLER_MAIN) {
        ScriptApp.deleteTrigger(trigger);
      }
    }

    ScriptApp.newTrigger(TRIGGER_HANDLER_MAIN)
      .timeBased()
      .everyMinutes(CONFIG.polling.intervalMinutes)
      .create();

    Logger.log(`Trigger set up to run every ${CONFIG.polling.intervalMinutes} minute(s)`);
  } catch (error) {
    Logger.log(`Error setting up trigger: ${error.toString()}`);
  }
}
