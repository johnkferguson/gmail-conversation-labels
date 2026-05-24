/**
 * Gmail Smart Labeller — main processing routines.
 *
 * `processNewEmails()` runs on the polling trigger; `processExistingThreads()`
 * is run manually to backfill historical mail.
 */

/**
 * Process new email threads and apply labels. Called by the polling trigger.
 * Batches Gmail label writes and the cache write to minimize API calls.
 */
function processNewEmails() {
  const startTime = Date.now();

  try {
    const labels = {
      inbound: getOrCreateLabel(CONFIG.labels.inbound),
      outbound: getOrCreateLabel(CONFIG.labels.outbound),
      conversation: getOrCreateLabel(CONFIG.labels.conversation),
    };

    const searchQuery = buildOptimizedSearchQuery();
    const threads = GmailApp.search(searchQuery, 0, CONFIG.polling.maxThreadsPerRun);

    if (threads.length === 0) {
      if (CONFIG.debug.enableLogging) {
        Logger.log("No new threads to process");
      }
      return;
    }

    /** @type {{ inbound: GoogleAppsScript.Gmail.GmailThread[], outbound: GoogleAppsScript.Gmail.GmailThread[], conversation: GoogleAppsScript.Gmail.GmailThread[] }} */
    const threadBatches = { inbound: [], outbound: [], conversation: [] };

    for (const thread of threads) {
      if (Date.now() - startTime > CONFIG.polling.timeoutMs) {
        if (CONFIG.debug.enableLogging) {
          Logger.log("Reached timeout limit, stopping processing");
        }
        break;
      }

      if (ThreadCache.isProcessed(thread)) continue;

      const messageCount = thread.getMessageCount();
      if (messageCount === 0) continue;

      const existingLabels = thread.getLabels().map((label) => label.getName());
      const hasInbound = existingLabels.includes(CONFIG.labels.inbound);
      const hasOutbound = existingLabels.includes(CONFIG.labels.outbound);
      const hasConversation = existingLabels.includes(CONFIG.labels.conversation);

      // Already fully labeled — record in cache and skip.
      if ((hasInbound || hasOutbound) && hasConversation) {
        const applied = [];
        if (hasInbound) applied.push(CONFIG.labels.inbound);
        if (hasOutbound) applied.push(CONFIG.labels.outbound);
        if (hasConversation) applied.push(CONFIG.labels.conversation);
        ThreadCache.markProcessed(thread, applied);
        continue;
      }

      const appliedLabels = [];

      // Inbound vs Outbound from the first message.
      const firstMessage = getMessagesSelectively(thread, 1)[0];
      const firstSender = firstMessage.getFrom();
      if (!hasInbound && !hasOutbound) {
        if (firstSender.indexOf(CONFIG.userEmail) !== -1) {
          threadBatches.outbound.push(thread);
          appliedLabels.push(CONFIG.labels.outbound);
        } else {
          threadBatches.inbound.push(thread);
          appliedLabels.push(CONFIG.labels.inbound);
        }
      } else {
        if (hasInbound) appliedLabels.push(CONFIG.labels.inbound);
        if (hasOutbound) appliedLabels.push(CONFIG.labels.outbound);
      }

      // Conversation: both sides participated, or the latest message reverses
      // the original direction.
      if (!hasConversation && messageCount >= 2) {
        const messages = getMessagesSelectively(thread, 3, true);

        let youParticipated = false;
        let someoneElseParticipated = false;
        for (const message of messages) {
          if (message.getFrom().indexOf(CONFIG.userEmail) !== -1) {
            youParticipated = true;
          } else {
            someoneElseParticipated = true;
          }
          if (youParticipated && someoneElseParticipated) break;
        }

        const lastMessage = messages[messages.length - 1];
        const lastIsFromUser = lastMessage.getFrom().indexOf(CONFIG.userEmail) !== -1;

        const isConversationThread =
          (youParticipated && someoneElseParticipated) ||
          (hasInbound && messages.length >= 2 && lastIsFromUser) ||
          (hasOutbound && messages.length >= 2 && !lastIsFromUser);

        if (isConversationThread) {
          threadBatches.conversation.push(thread);
          appliedLabels.push(CONFIG.labels.conversation);
        }
      } else if (hasConversation) {
        appliedLabels.push(CONFIG.labels.conversation);
      }

      ThreadCache.markProcessed(thread, appliedLabels);
    }

    if (threadBatches.inbound.length > 0) labels.inbound.addToThreads(threadBatches.inbound);
    if (threadBatches.outbound.length > 0) labels.outbound.addToThreads(threadBatches.outbound);
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
      MailApp.sendEmail(CONFIG.userEmail, "Gmail Smart Labeller Error", errorMessage);
    }
  }
}

/**
 * Backfill historical unlabeled threads. Run manually; resumes naturally on
 * each invocation because labeled threads drop out of the search query.
 */
function processExistingThreads() {
  const startTime = Date.now();

  try {
    const labels = {
      inbound: getOrCreateLabel(CONFIG.labels.inbound),
      outbound: getOrCreateLabel(CONFIG.labels.outbound),
      conversation: getOrCreateLabel(CONFIG.labels.conversation),
    };

    // Always paginate from offset 0: each batch labels the threads it processes,
    // so they drop out of this query on the next call.
    const searchQuery = `-label:${CONFIG.labels.inbound} -label:${CONFIG.labels.outbound} -label:${CONFIG.labels.conversation}`;
    const threads = GmailApp.search(searchQuery, 0, CONFIG.polling.maxThreadsPerRun);

    if (threads.length === 0) {
      Logger.log("No existing threads found to process");
      return;
    }

    /** @type {GoogleAppsScript.Gmail.GmailThread[]} */
    const currentBatch = [];
    /** @type {{ inbound: GoogleAppsScript.Gmail.GmailThread[], outbound: GoogleAppsScript.Gmail.GmailThread[], conversation: GoogleAppsScript.Gmail.GmailThread[] }} */
    const threadBatches = { inbound: [], outbound: [], conversation: [] };

    for (const thread of threads) {
      try {
        if (Date.now() - startTime > CONFIG.polling.timeoutMs) {
          if (CONFIG.debug.enableLogging) {
            Logger.log("Reached timeout limit, stopping processing");
          }
          break;
        }

        if (ThreadCache.isProcessed(thread)) continue;

        currentBatch.push(thread);
        const messages = thread.getMessages();
        if (messages.length === 0) continue;

        const appliedLabels = [];

        const firstSender = messages[0].getFrom();
        if (firstSender.indexOf(CONFIG.userEmail) !== -1) {
          threadBatches.outbound.push(thread);
          appliedLabels.push(CONFIG.labels.outbound);
        } else {
          threadBatches.inbound.push(thread);
          appliedLabels.push(CONFIG.labels.inbound);
        }

        if (messages.length >= 2) {
          let youParticipated = false;
          let someoneElseParticipated = false;
          for (const message of messages) {
            if (message.getFrom().indexOf(CONFIG.userEmail) !== -1) {
              youParticipated = true;
            } else {
              someoneElseParticipated = true;
            }
            if (youParticipated && someoneElseParticipated) break;
          }
          if (youParticipated && someoneElseParticipated) {
            threadBatches.conversation.push(thread);
            appliedLabels.push(CONFIG.labels.conversation);
          }
        }

        ThreadCache.markProcessed(thread, appliedLabels);
      } catch (e) {
        Logger.log(`Error processing thread: ${e.toString()}`);
      }
    }

    if (threadBatches.inbound.length > 0) labels.inbound.addToThreads(threadBatches.inbound);
    if (threadBatches.outbound.length > 0) labels.outbound.addToThreads(threadBatches.outbound);
    if (threadBatches.conversation.length > 0) {
      labels.conversation.addToThreads(threadBatches.conversation);
    }

    if (CONFIG.debug.enableLogging) {
      Logger.log(`Processed ${currentBatch.length} existing threads`);
    }

    if (threads.length < CONFIG.polling.maxThreadsPerRun) {
      Logger.log("Completed processing all existing threads");
    } else {
      Logger.log("More existing threads remain. Run processExistingThreads() again to continue.");
    }
  } catch (error) {
    const errorMessage = `Error in processExistingThreads: ${error.toString()}`;
    Logger.log(errorMessage);
    if (CONFIG.debug.sendErrorEmails) {
      MailApp.sendEmail(CONFIG.userEmail, "Gmail Smart Labeller Error", errorMessage);
    }
  }
}
