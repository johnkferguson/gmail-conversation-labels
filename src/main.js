/**
 * Gmail Smart Labeler
 *
 * This script automatically labels email threads as:
 * - "Inbound" (emails sent to you)
 * - "Outbound" (emails sent by you)
 * - "Conversation" (back-and-forth email exchanges)
 *
 * SETUP INSTRUCTIONS:
 * 1. Edit configuration variables in the CONFIG section of config.js
 * 2. Run setup() to create necessary Gmail labels and triggers
 * 3. Optionally, run processHistorical() to label existing emails
 *
 * IMPORTANT NOTES:
 * - Time-driven triggers are subject to quota limits
 * - The script runs as the account that created the trigger
 * - Gmail API does not support true "push notifications" in Apps Script
 *   without complex setup involving Cloud Pub/Sub (see documentation)
 *
 * @author John K. Ferguson
 * @version 1.1
 */

// Main entry point module using IIFE pattern for Apps Script
var MainModule = (() => {
  /**
   * Main entry point function - called by time-driven trigger
   * Processes new email threads and applies appropriate labels
   */
  function main() {
    ProcessorsModule.processNewEmails();
  }

  /**
   * Set up the application
   * Creates necessary labels and sets up time-based trigger
   */
  function setup() {
    GmailUtilsModule.setupLabels();
    GmailUtilsModule.setupTrigger();
    CacheModule.setupCleanupTrigger();

    Logger.log("Gmail Smart Labeler successfully set up!");
    Logger.log("To process historical emails, run the processHistorical() function.");
  }

  /**
   * Manual run function for testing
   * Processes new emails without waiting for the trigger
   */
  function manualRun() {
    ProcessorsModule.processNewEmails();
  }

  /**
   * Process historical emails
   * Labels existing threads that haven't been processed yet
   */
  function processHistorical() {
    ProcessorsModule.processExistingThreads();
  }

  /**
   * Reset all caching data
   * Only needed if you want to start fresh
   */
  function resetCache() {
    CacheModule.resetTracking();
    Logger.log("Cache has been reset. All threads will be reprocessed.");
  }

  // Only exposing the functions we want to be publicly available
  return {
    main: main,
    setup: setup,
    manualRun: manualRun,
    processHistorical: processHistorical,
    resetCache: resetCache,
  };
})();

/**
 * Main entry point called by the trigger
 */
function main() {
  MainModule.main();
}

/**
 * Set up the application
 */
function setup() {
  MainModule.setup();
}

/**
 * Manually run the main email processing function
 */
function manualRun() {
  MainModule.manualRun();
}

/**
 * Process existing unlabeled threads in batches
 */
function processHistorical() {
  MainModule.processHistorical();
}

/**
 * Reset cache tracking
 */
function resetCache() {
  MainModule.resetCache();
}

/**
 * Daily cleanup function called by trigger
 */
function cleanupCache() {
  CacheModule.ThreadCache.cleanup();
}
