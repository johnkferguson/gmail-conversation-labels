/**
 * Gmail Smart Labeller — main processing routines.
 *
 * `processNewEmails()` runs on the polling trigger; `processExistingThreads()`
 * is run manually to backfill historical mail. Both delegate the actual
 * classification decision to `classifyThread()` and focus on Gmail I/O:
 * search, batch labeling, and caching.
 */

/**
 * Process new email threads and apply labels. Called by the polling trigger.
 *
 * Wrapped in a user-scoped lock so two overlapping trigger runs can't
 * double-process the same threads. If the lock can't be acquired
 * immediately, this invocation no-ops — the in-flight run is handling things.
 */
function processNewEmails() {
  const lock = LockService.getUserLock();
  if (!lock.tryLock(0)) {
    if (CONFIG.debug.enableLogging) {
      Logger.log("processNewEmails skipped — another run is already in progress");
    }
    return;
  }

  const startTime = Date.now();

  try {
    const labels = {
      inbound: getOrCreateLabel(CONFIG.labels.inbound),
      outbound: getOrCreateLabel(CONFIG.labels.outbound),
      conversation: getOrCreateLabel(CONFIG.labels.conversation),
    };

    const threads = GmailApp.search(
      buildOptimizedSearchQuery(),
      0,
      CONFIG.polling.maxThreadsPerRun
    );

    if (threads.length === 0) {
      if (CONFIG.debug.enableLogging) {
        Logger.log("No new threads to process");
      }
      return;
    }

    /** @type {{ inbound: GoogleAppsScript.Gmail.GmailThread[], outbound: GoogleAppsScript.Gmail.GmailThread[], conversation: GoogleAppsScript.Gmail.GmailThread[] }} */
    const threadBatches = { inbound: [], outbound: [], conversation: [] };
    const cacheBatch = ThreadCache.newBatch();

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

      const existingLabelNames = thread.getLabels().map((label) => label.getName());
      const existingLabels = {
        inbound: existingLabelNames.includes(CONFIG.labels.inbound),
        outbound: existingLabelNames.includes(CONFIG.labels.outbound),
        conversation: existingLabelNames.includes(CONFIG.labels.conversation),
      };

      // Already fully labeled — record in cache and skip.
      if ((existingLabels.inbound || existingLabels.outbound) && existingLabels.conversation) {
        const applied = [];
        if (existingLabels.inbound) applied.push(CONFIG.labels.inbound);
        if (existingLabels.outbound) applied.push(CONFIG.labels.outbound);
        applied.push(CONFIG.labels.conversation);
        cacheBatch.mark(thread, applied);
        continue;
      }

      // Sample messages: first + (up to two more, including the latest) so the
      // classifier sees both ends of the conversation.
      const sampledMessages =
        messageCount === 1
          ? getMessagesSelectively(thread, 1)
          : getMessagesSelectively(thread, 3, true);
      const messageSamples = sampledMessages.map((m) => ({ from: m.getFrom() }));

      const { primary, isConversation } = classifyThread({
        firstSender: sampledMessages[0].getFrom(),
        messages: messageSamples,
        userEmail: CONFIG.userEmail,
        existingLabels,
      });

      const appliedLabels = [];
      if (!existingLabels.inbound && !existingLabels.outbound) {
        threadBatches[primary].push(thread);
        appliedLabels.push(CONFIG.labels[primary]);
      } else {
        if (existingLabels.inbound) appliedLabels.push(CONFIG.labels.inbound);
        if (existingLabels.outbound) appliedLabels.push(CONFIG.labels.outbound);
      }

      if (isConversation && !existingLabels.conversation) {
        threadBatches.conversation.push(thread);
        appliedLabels.push(CONFIG.labels.conversation);
      } else if (existingLabels.conversation) {
        appliedLabels.push(CONFIG.labels.conversation);
      }

      cacheBatch.mark(thread, appliedLabels);
    }

    if (threadBatches.inbound.length > 0) labels.inbound.addToThreads(threadBatches.inbound);
    if (threadBatches.outbound.length > 0) labels.outbound.addToThreads(threadBatches.outbound);
    if (threadBatches.conversation.length > 0) {
      labels.conversation.addToThreads(threadBatches.conversation);
    }
    cacheBatch.flush();

    if (CONFIG.debug.enableLogging) {
      Logger.log(
        `Labeled ${threadBatches.inbound.length} inbound, ${threadBatches.outbound.length} outbound, and ${threadBatches.conversation.length} conversation threads`
      );
    }
  } catch (error) {
    const errorMessage = `Error in processNewEmails: ${error.toString()}`;
    Logger.log(errorMessage);
    sendErrorEmail("Gmail Smart Labeller Error", errorMessage);
  } finally {
    lock.releaseLock();
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
    const cacheBatch = ThreadCache.newBatch();

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

        const messageSamples = messages.map((m) => ({ from: m.getFrom() }));

        const { primary, isConversation } = classifyThread({
          firstSender: messages[0].getFrom(),
          messages: messageSamples,
          userEmail: CONFIG.userEmail,
        });

        const appliedLabels = [CONFIG.labels[primary]];
        threadBatches[primary].push(thread);

        if (isConversation) {
          threadBatches.conversation.push(thread);
          appliedLabels.push(CONFIG.labels.conversation);
        }

        cacheBatch.mark(thread, appliedLabels);
      } catch (e) {
        Logger.log(`Error processing thread: ${e.toString()}`);
      }
    }

    if (threadBatches.inbound.length > 0) labels.inbound.addToThreads(threadBatches.inbound);
    if (threadBatches.outbound.length > 0) labels.outbound.addToThreads(threadBatches.outbound);
    if (threadBatches.conversation.length > 0) {
      labels.conversation.addToThreads(threadBatches.conversation);
    }
    cacheBatch.flush();

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
    sendErrorEmail("Gmail Smart Labeller Error", errorMessage);
  }
}
