/**
 * Configuration Template for Gmail Conversation Labels
 *
 * SETUP INSTRUCTIONS:
 * 1. Copy this file to config.js
 * 2. Replace the placeholder values with your actual configuration
 * 3. Do NOT commit your config.js file to source control
 */

// User-specific configuration
const USER_CONFIG = {
  // Every address you send mail from. Used to decide "is this from me?" when
  // labeling Inbound vs Outbound and detecting Conversations.
  //
  // Include all of:
  //   - your primary Gmail address
  //   - custom-domain "send mail as" identities
  //   - Workspace addresses
  //   - Google Group addresses you reply from
  //   - any plus-aliases you actually send from (e.g. you+work@gmail.com)
  //
  // Matched exactly (case-insensitive) against the address parsed out of each
  // From: header. List each alias you actually use — partial / domain-wildcard
  // matches don't work.
  userEmails: ["your.email@example.com"],

  // Legacy single-address form. Still accepted; prefer userEmails above.
  // userEmail: "your.email@example.com",
};

// Application configuration
const APP_CONFIG = {
  // Labels that will be created and applied to emails
  labels: {
    inbound: "Inbound",
    outbound: "Outbound",
    conversation: "Conversation",
  },

  // Polling configuration
  polling: {
    // How many minutes between checks (1 is minimum for Google Apps Script)
    intervalMinutes: 5,

    // Maximum number of threads to process per run
    maxThreadsPerRun: 50,

    // How far back the search looks on each run, in minutes.
    // Keep this >= intervalMinutes so a delayed/skipped run doesn't miss mail.
    searchWindowMinutes: 10,

    // Timeout safety (milliseconds) to avoid hitting script runtime limit
    timeoutMs: 25000,
  },

  // Debug options
  debug: {
    // Enable logging to Google Apps Script Logger
    enableLogging: true,

    // Enable email notifications on errors. Strongly recommended to keep on —
    // without it, failures are only visible in the Apps Script execution log.
    sendErrorEmails: true,

    // Minimum hours between error emails. Apps Script retries failed triggers,
    // so without throttling a single broken config can generate dozens of
    // identical alerts per hour.
    errorEmailThrottleHours: 1,
  },

  // Thread cache settings (stored in PropertiesService.getUserProperties)
  caching: {
    // Prefix for thread cache keys in user properties
    threadCacheKeyPrefix: "thread_",

    // Maximum cached threads before cleanup prunes expired entries
    maxCachedThreads: 500,

    // How long to retain a cached thread record
    threadCacheRetentionDays: 30,
  },
};

// Export combined configuration
const CONFIG = {
  ...USER_CONFIG,
  ...APP_CONFIG,
};
