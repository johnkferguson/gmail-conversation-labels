/**
 * Configuration Template for Gmail Smart Labeler
 * 
 * SETUP INSTRUCTIONS:
 * 1. Copy this file to Config.js
 * 2. Replace the placeholder values with your actual configuration
 * 3. Do NOT commit your Config.js file to source control
 */

// User-specific configuration
const USER_CONFIG = {
  // Your email address (required for determining Inbound vs Outbound)
  userEmail: 'your.email@example.com'
};

// Application configuration
const APP_CONFIG = {
  // Labels that will be created and applied to emails
  labels: {
    inbound: 'Inbound',
    outbound: 'Outbound',
    conversation: 'Conversation'
  },
  
  // Polling configuration
  polling: {
    // How many minutes between checks (1 is minimum for Google Apps Script)
    intervalMinutes: 1,
    
    // Maximum number of threads to process per run
    maxThreadsPerRun: 50,
    
    // Search query to find new emails
    // Checks emails from last 5 minutes to ensure we don't miss any
    searchQuery: 'newer_than:5m -label:Inbound -label:Outbound -label:Conversation',
    
    // Timeout safety (milliseconds) to avoid hitting script runtime limit
    timeoutMs: 25000
  },
  
  // Debug options
  debug: {
    // Enable logging to Google Apps Script Logger
    enableLogging: true,
    
    // Enable email notifications on errors
    sendErrorEmails: true
  }
};

// Export combined configuration
const CONFIG = {
  ...USER_CONFIG,
  ...APP_CONFIG
};
