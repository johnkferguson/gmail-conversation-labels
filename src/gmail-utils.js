/**
 * Gmail Smart Labeler - Gmail Utilities Module
 * 
 * Helper functions for working with Gmail API and labels.
 */

// Gmail utilities module using IIFE pattern for Apps Script
var GmailUtilsModule = (function() {
  /**
   * Get only necessary messages based on what we need to check
   * 
   * @param {GmailThread} thread - The Gmail thread
   * @param {number} maxToRetrieve - Maximum number of messages to retrieve
   * @param {boolean} includeLatest - Whether to include the latest message in the thread
   * @return {Array<GmailMessage>} Messages from the thread
   */
  function getMessagesSelectively(thread, maxToRetrieve = 2, includeLatest = false) {
    const messageCount = thread.getMessageCount();
    const allMessages = thread.getMessages();
    
    if (messageCount === 0) {
      return [];
    } else if (messageCount === 1 || maxToRetrieve === 1) {
      // Only get first message if that's all we need
      return [allMessages[0]];
    } else if (includeLatest && messageCount > maxToRetrieve) {
      // For conversation detection in threads with multiple messages,
      // we need to ensure we get both early messages and the most recent one
      // This handles the case where someone emails multiple times and then gets a reply
      
      // Calculate how many early messages to get (leaving room for the latest)
      const earlyCount = maxToRetrieve - 1;
      const result = [];
      
      // Get early messages
      for (let i = 0; i < earlyCount; i++) {
        if (i < allMessages.length) {
          result.push(allMessages[i]);
        }
      }
      
      // Get the last message
      if (messageCount > earlyCount) {
        result.push(allMessages[messageCount - 1]);
      }
      
      return result;
    } else {
      // Standard case: just get the first N messages
      const count = Math.min(messageCount, maxToRetrieve);
      const result = [];
      
      for (let i = 0; i < count; i++) {
        result.push(allMessages[i]);
      }
      
      return result;
    }
  }

  /**
   * Build more efficient search queries to reduce results
   * 
   * @return {string} Optimized search query
   */
  function buildOptimizedSearchQuery() {
    // Search within more recent timeframe (last 3 minutes instead of 5)
    // Only exclude messages that already have our labels
    return `newer_than:3m -label:${CONFIG.labels.inbound} -label:${CONFIG.labels.outbound} -label:${CONFIG.labels.conversation}`;
  }

  /**
   * Efficiently check if a thread is a conversation
   * Only gets additional messages when absolutely needed
   * 
   * @param {GmailThread} thread - The Gmail thread to check
   * @param {string} firstSender - The sender of the first message
   * @return {boolean} True if the thread is a conversation
   */
  function isConversation(thread, firstSender) {
    const messageCount = thread.getMessageCount();
    
    // Not a conversation if there's only one message
    if (messageCount <= 1) {
      return false;
    }
    
    // Get all messages in the thread
    const messages = thread.getMessages();
    
    // Check if first message is from user
    const firstIsFromUser = firstSender.indexOf(CONFIG.userEmail) !== -1;
    
    // Get second message
    const secondMessage = messages[1];
    const secondSender = secondMessage.getFrom();
    const secondIsFromUser = secondSender.indexOf(CONFIG.userEmail) !== -1;
    
    // If senders are different, it's a conversation
    if (firstIsFromUser !== secondIsFromUser) {
      return true;
    }
    
    // If first two messages are from the same person, check a third
    // (but only if there are at least 3 messages)
    if (messageCount >= 3) {
      const thirdMessage = messages[2];
      const thirdSender = thirdMessage.getFrom();
      const thirdIsFromUser = thirdSender.indexOf(CONFIG.userEmail) !== -1;
      
      return thirdIsFromUser !== firstIsFromUser;
    }
    
    return false;
  }

  /**
   * Helper function to get or create a Gmail label
   * 
   * @param {string} labelName - The name of the label to get or create
   * @return {GmailLabel} The Gmail label object
   */
  function getOrCreateLabel(labelName) {
    let label = GmailApp.getUserLabelByName(labelName);

    // Create the label if it doesn't exist
    if (label === null) {
      label = GmailApp.createLabel(labelName);
    }

    return label;
  }

  /**
   * Set up required Gmail labels if they don't already exist
   */
  function setupLabels() {
    try {
      // Create all labels
      const inboundLabel = getOrCreateLabel(CONFIG.labels.inbound);
      const outboundLabel = getOrCreateLabel(CONFIG.labels.outbound);
      const conversationLabel = getOrCreateLabel(CONFIG.labels.conversation);

      Logger.log("Labels have been set up successfully");
    } catch (error) {
      Logger.log(`Error setting up labels: ${error.toString()}`);
    }
  }

  /**
   * Set up a time-based trigger to run the script regularly
   */
  function setupTrigger() {
    try {
      // Delete any existing triggers for this function
      const triggers = ScriptApp.getProjectTriggers();
      for (let i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === "main") {
          ScriptApp.deleteTrigger(triggers[i]);
        }
      }

      // Create a new trigger with the configured interval
      ScriptApp.newTrigger("main")
        .timeBased()
        .everyMinutes(CONFIG.polling.intervalMinutes)
        .create();

      Logger.log(
        `Trigger set up to run every ${CONFIG.polling.intervalMinutes} minute(s)`
      );
    } catch (error) {
      Logger.log(`Error setting up trigger: ${error.toString()}`);
    }
  }

  // Public API
  return {
    getMessagesSelectively: getMessagesSelectively,
    buildOptimizedSearchQuery: buildOptimizedSearchQuery,
    isConversation: isConversation,
    getOrCreateLabel: getOrCreateLabel,
    setupLabels: setupLabels,
    setupTrigger: setupTrigger
  };
})();
