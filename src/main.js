/**
 * Gmail Smart Labeler
 *
 * This script automatically labels email threads as:
 * - "Inbound" (emails sent to you)
 * - "Outbound" (emails sent by you)
 * - "Conversation" (back-and-forth email exchanges)
 *
 * SETUP INSTRUCTIONS:
 * 1. Edit configuration variables in the CONFIG section below
 * 2. Run setupLabels() to create necessary Gmail labels if they don't exist
 * 3. Run setupTrigger() to create a time-based trigger that runs regularly
 * 4. Optionally, run processExistingThreads() to label existing emails
 *
 * IMPORTANT NOTES:
 * - Time-driven triggers are subject to quota limits
 * - The script runs as the account that created the trigger
 * - Gmail API does not support true "push notifications" in Apps Script
 *   without complex setup involving Cloud Pub/Sub (see documentation)
 *
 * @author John K. Ferguson
 * @version 1.0
 */

// Configuration is imported from Config.js
// See Config.template.js for setup instructions

/**
 * Main function to process and label new email threads
 * This will be called by the trigger
 */
function processNewEmails() {
  const startTime = new Date().getTime();

  try {
    // Get all needed labels at once (more efficient)
    const labels = {
      inbound: getOrCreateLabel(CONFIG.labels.inbound),
      outbound: getOrCreateLabel(CONFIG.labels.outbound),
      conversation: getOrCreateLabel(CONFIG.labels.conversation),
    };

    // Get threads that don't have our labels yet
    const threads = GmailApp.search(
      CONFIG.polling.searchQuery,
      0,
      CONFIG.polling.maxThreadsPerRun
    );

    if (threads.length === 0) {
      if (CONFIG.debug.enableLogging) {
        Logger.log("No new threads to process");
      }
      return;
    }

    // Create thread map to group messages by threadId (similar to n8n logic)
    const threadMap = new Map();

    // Track threads that will get each label
    const threadBatches = {
      inbound: [],
      outbound: [],
      conversation: [],
    };

    // Process each thread
    for (let i = 0; i < threads.length; i++) {
      const thread = threads[i];

      // Skip if we're approaching the timeout
      if (new Date().getTime() - startTime > CONFIG.polling.timeoutMs) {
        if (CONFIG.debug.enableLogging) {
          Logger.log("Reached timeout limit, stopping processing");
        }
        break;
      }

      // Get all messages in the thread
      const messages = thread.getMessages();

      // Skip empty threads
      if (messages.length === 0) continue;

      // Check for existing labels
      const existingLabels = thread.getLabels().map((label) => label.getName());
      const hasInbound = existingLabels.includes(CONFIG.labels.inbound);
      const hasOutbound = existingLabels.includes(CONFIG.labels.outbound);
      const hasConversation = existingLabels.includes(
        CONFIG.labels.conversation
      );

      // Store messages by threadId for conversation analysis
      const threadId = thread.getId();
      threadMap.set(threadId, messages);

      // CASE 1: Thread is already fully labeled
      if ((hasInbound || hasOutbound) && hasConversation) {
        continue;
      }

      // CASE 2: Need to determine Inbound/Outbound (first message in thread)
      if (!hasInbound && !hasOutbound) {
        const firstMessage = messages[0];
        const firstSender = firstMessage.getFrom();

        // Check if the first message is from you
        if (firstSender.indexOf(CONFIG.userEmail) !== -1) {
          threadBatches.outbound.push(thread);
        } else {
          threadBatches.inbound.push(thread);
        }
      }

      // CASE 3: Need to determine if this is a Conversation
      if (!hasConversation) {
        // Get all messages
        const threadMessages = messages;

        // Check if you and someone else have both participated
        let youParticipated = false;
        let someoneElseParticipated = false;

        for (const message of threadMessages) {
          const fromAddress = message.getFrom();
          if (fromAddress.indexOf(CONFIG.userEmail) !== -1) {
            youParticipated = true;
          } else {
            someoneElseParticipated = true;
          }

          // If we have both sides participating, stop checking
          if (youParticipated && someoneElseParticipated) {
            break;
          }
        }

        // Case 3.1: Complete conversation
        if (
          youParticipated &&
          someoneElseParticipated &&
          threadMessages.length >= 2
        ) {
          threadBatches.conversation.push(thread);
        }
        // Case 3.2: Inbound thread and you are replying
        else if (
          hasInbound &&
          threadMessages.length >= 2 &&
          threadMessages[threadMessages.length - 1]
            .getFrom()
            .indexOf(CONFIG.userEmail) !== -1
        ) {
          threadBatches.conversation.push(thread);
        }
        // Case 3.3: Outbound thread and someone else is replying
        else if (
          hasOutbound &&
          threadMessages.length >= 2 &&
          threadMessages[threadMessages.length - 1]
            .getFrom()
            .indexOf(CONFIG.userEmail) === -1
        ) {
          threadBatches.conversation.push(thread);
        }
      }
    }

    // Apply labels in batch operations (much more efficient)
    if (threadBatches.inbound.length > 0) {
      labels.inbound.addToThreads(threadBatches.inbound);
    }

    if (threadBatches.outbound.length > 0) {
      labels.outbound.addToThreads(threadBatches.outbound);
    }

    if (threadBatches.conversation.length > 0) {
      labels.conversation.addToThreads(threadBatches.conversation);
    }

    if (CONFIG.debug.enableLogging) {
      Logger.log(
        `Labeled ${threadBatches.inbound.length} inbound, ${threadBatches.outbound.length} outbound, and ${threadBatches.conversation.length} conversation threads`
      );
    }
  } catch (error) {
    const errorMessage = `Error in processNewEmails: ${error.toString()}`;
    Logger.log(errorMessage);

    if (CONFIG.debug.sendErrorEmails) {
      MailApp.sendEmail(
        CONFIG.userEmail,
        "Gmail Smart Labeler Error",
        errorMessage
      );
    }
  }
}

/**
 * Process existing unlabeled threads in batches
 * This should be run manually to label historical emails
 */
function processExistingThreads() {
  const batchSize = 100;
  const maxThreads = 2000; // Increased maximum threads
  let processedTotal = 0;
  const startTime = new Date().getTime();

  // Get all needed labels at once
  const labels = {
    inbound: getOrCreateLabel(CONFIG.labels.inbound),
    outbound: getOrCreateLabel(CONFIG.labels.outbound),
    conversation: getOrCreateLabel(CONFIG.labels.conversation),
  };

  try {
    // Build search query - explicit is:thread ensures we get all threads
    const searchQuery = `is:thread -label:${CONFIG.labels.inbound} -label:${CONFIG.labels.outbound} -label:${CONFIG.labels.conversation}`;

    // Get total count of matching threads
    const allThreads = GmailApp.search(searchQuery);
    const totalToProcess = allThreads.length;

    if (CONFIG.debug.enableLogging) {
      Logger.log(`Found ${totalToProcess} unlabeled threads to process`);
    }

    // Process in batches
    for (let i = 0; i < totalToProcess; i += batchSize) {
      // Get current batch (handles the last batch correctly if < batchSize)
      const endIndex = Math.min(i + batchSize, totalToProcess);
      const currentBatch = allThreads.slice(i, endIndex);

      if (CONFIG.debug.enableLogging) {
        Logger.log(
          `Processing batch ${i / batchSize + 1}: threads ${
            i + 1
          } to ${endIndex}`
        );
      }

      if (currentBatch.length === 0) {
        break; // No more unlabeled threads
      }

      const threadBatches = {
        inbound: [],
        outbound: [],
        conversation: [],
      };

      for (let j = 0; j < currentBatch.length; j++) {
        try {
          // Safety check for execution time
          if (new Date().getTime() - startTime > CONFIG.polling.timeoutMs) {
            if (CONFIG.debug.enableLogging) {
              Logger.log(
                `Reached timeout limit after ${processedTotal} threads, stopping historical processing`
              );
            }
            break;
          }

          const thread = currentBatch[j];
          const messages = thread.getMessages();

          // Skip empty threads
          if (messages.length === 0) continue;

          // First, determine Inbound/Outbound based on first message
          const firstMessage = messages[0];
          const firstSender = firstMessage.getFrom();

          // Check if the first message is from you
          if (firstSender.indexOf(CONFIG.userEmail) !== -1) {
            threadBatches.outbound.push(thread);
          } else {
            threadBatches.inbound.push(thread);
          }

          // Check if this is also a Conversation
          if (messages.length >= 2) {
            let youParticipated = false;
            let someoneElseParticipated = false;

            for (const message of messages) {
              const fromAddress = message.getFrom();
              if (fromAddress.indexOf(CONFIG.userEmail) !== -1) {
                youParticipated = true;
              } else {
                someoneElseParticipated = true;
              }

              // If we have both sides participating, stop checking
              if (youParticipated && someoneElseParticipated) {
                break;
              }
            }

            // If both participated, it's a conversation
            if (youParticipated && someoneElseParticipated) {
              threadBatches.conversation.push(thread);
            }
          }
        } catch (e) {
          // Skip any threads that cause errors
          Logger.log(`Error processing thread: ${e.toString()}`);
          continue;
        }
      }

      // Apply labels in batch
      if (threadBatches.inbound.length > 0) {
        labels.inbound.addToThreads(threadBatches.inbound);
      }

      if (threadBatches.outbound.length > 0) {
        labels.outbound.addToThreads(threadBatches.outbound);
      }

      if (threadBatches.conversation.length > 0) {
        labels.conversation.addToThreads(threadBatches.conversation);
      }

      processedTotal += currentBatch.length;

      if (CONFIG.debug.enableLogging) {
        Logger.log(
          `Processed ${currentBatch.length} existing threads (total: ${processedTotal} of ${totalToProcess})`
        );
      }

      // Pause to avoid hitting quotas
      Utilities.sleep(1000);

      // If we hit a timeout earlier, exit the loop
      if (new Date().getTime() - startTime > CONFIG.polling.timeoutMs) {
        break;
      }
    }

    Logger.log(
      `Completed processing ${processedTotal} existing threads out of ${totalToProcess} total`
    );

    // If we didn't process all threads, suggest running again
    if (processedTotal < totalToProcess) {
      Logger.log(
        `There are still ${
          totalToProcess - processedTotal
        } threads to process. Run processExistingThreads() again to continue.`
      );
    }
  } catch (error) {
    const errorMessage = `Error in processExistingThreads: ${error.toString()}`;
    Logger.log(errorMessage);

    if (CONFIG.debug.sendErrorEmails) {
      MailApp.sendEmail(
        CONFIG.userEmail,
        "Gmail Smart Labeler Error",
        errorMessage
      );
    }
  }
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
 * Set up a time-based trigger to run the script regularly
 */
function setupTrigger() {
  try {
    // Delete any existing triggers for this function
    const triggers = ScriptApp.getProjectTriggers();
    for (let i = 0; i < triggers.length; i++) {
      if (triggers[i].getHandlerFunction() === "processNewEmails") {
        ScriptApp.deleteTrigger(triggers[i]);
      }
    }

    // Create a new trigger with the configured interval
    ScriptApp.newTrigger("processNewEmails")
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

/**
 * Reset user properties tracking
 * Only needed if you want to start fresh
 */
function resetTracking() {
  PropertiesService.getUserProperties().deleteAllProperties();
  Logger.log("Tracking reset");
}

/**
 * Manually run the main email processing function
 * Useful for testing without waiting for the trigger
 */
function manualRun() {
  processNewEmails();
}
