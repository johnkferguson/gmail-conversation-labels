/**
 * Gmail Smart Labeler - Processors Module
 * 
 * Contains the main processing functions for email labeling.
 */

// Processors module using IIFE pattern for Apps Script
var ProcessorsModule = (function() {
  /**
   * Main function to process and label new email threads
   * This will be called by the trigger
   * Optimized to minimize Gmail API calls
   */
  function processNewEmails() {
    const startTime = new Date().getTime();
    
    try {
      // Get all needed labels at once (more efficient)
      const labels = {
        inbound: GmailUtilsModule.getOrCreateLabel(CONFIG.labels.inbound),
        outbound: GmailUtilsModule.getOrCreateLabel(CONFIG.labels.outbound),
        conversation: GmailUtilsModule.getOrCreateLabel(CONFIG.labels.conversation),
      };
      
      // Use optimized search query
      const searchQuery = GmailUtilsModule.buildOptimizedSearchQuery();
      const threads = GmailApp.search(searchQuery, 0, CONFIG.polling.maxThreadsPerRun);
      
      if (threads.length === 0) {
        if (CONFIG.debug.enableLogging) {
          Logger.log("No new threads to process");
        }
        return;
      }
      
      // Track threads that will get each label
      const threadBatches = {
        inbound: [],
        outbound: [],
        conversation: [],
      };
      
      // Process each thread
      for (let i = 0; i < threads.length; i++) {
        const thread = threads[i];
        const threadId = thread.getId();
        
        // Skip if we're approaching the timeout
        if (new Date().getTime() - startTime > CONFIG.polling.timeoutMs) {
          if (CONFIG.debug.enableLogging) {
            Logger.log("Reached timeout limit, stopping processing");
          }
          break;
        }
        
        // Skip if already processed (cached)
        if (CacheModule.ThreadCache.isProcessed(threadId)) {
          continue;
        }
        
        // Get minimal messages necessary
        const messageCount = thread.getMessageCount();
        
        // Skip empty threads
        if (messageCount === 0) continue;
        
        // Check for existing labels
        const existingLabels = thread.getLabels().map((label) => label.getName());
        const hasInbound = existingLabels.includes(CONFIG.labels.inbound);
        const hasOutbound = existingLabels.includes(CONFIG.labels.outbound);
        const hasConversation = existingLabels.includes(CONFIG.labels.conversation);
        
        // CASE 1: Thread is already fully labeled - we should skip but also cache it
        if ((hasInbound || hasOutbound) && hasConversation) {
          const appliedLabels = [];
          if (hasInbound) appliedLabels.push(CONFIG.labels.inbound);
          if (hasOutbound) appliedLabels.push(CONFIG.labels.outbound);
          if (hasConversation) appliedLabels.push(CONFIG.labels.conversation);
          
          CacheModule.ThreadCache.markProcessed(threadId, appliedLabels);
          continue;
        }
        
        const appliedLabels = [];
        
        // Start with just the first message
        const firstMessages = GmailUtilsModule.getMessagesSelectively(thread, 1);
        const firstMessage = firstMessages[0];
        const firstSender = firstMessage.getFrom();
        
        // CASE 2: Need to determine Inbound/Outbound (first message in thread)
        if (!hasInbound && !hasOutbound) {
          // Check if the first message is from you
          if (firstSender.indexOf(CONFIG.userEmail) !== -1) {
            threadBatches.outbound.push(thread);
            appliedLabels.push(CONFIG.labels.outbound);
          } else {
            threadBatches.inbound.push(thread);
            appliedLabels.push(CONFIG.labels.inbound);
          }
        } else {
          // Already has one of these labels, add it to our tracking
          if (hasInbound) appliedLabels.push(CONFIG.labels.inbound);
          if (hasOutbound) appliedLabels.push(CONFIG.labels.outbound);
        }
        
        // CASE 3: Need to determine if this is a Conversation
        if (!hasConversation && messageCount >= 2) {
          // For more complex conversation detection cases, we need more messages
          // Get just enough messages to determine the conversation status
          let isConversationThread = false;
          
          // First, try the optimized conversation detection
          if (messageCount >= 2) {
            // Get the necessary messages including the latest one to catch replies
            const messages = GmailUtilsModule.getMessagesSelectively(thread, 3, true); // Include latest message
            
            // Check if you and someone else have both participated
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
            
            // Case 3.1: Complete conversation - both parties participated
            if (youParticipated && someoneElseParticipated) {
              isConversationThread = true;
            }
            // Case 3.2: Inbound thread and you are replying
            else if (
              hasInbound &&
              messages.length >= 2 &&
              messages[messages.length - 1].getFrom().indexOf(CONFIG.userEmail) !== -1
            ) {
              isConversationThread = true;
            }
            // Case 3.3: Outbound thread and someone else is replying
            else if (
              hasOutbound &&
              messages.length >= 2 &&
              messages[messages.length - 1].getFrom().indexOf(CONFIG.userEmail) === -1
            ) {
              isConversationThread = true;
            }
          }
          
          if (isConversationThread) {
            threadBatches.conversation.push(thread);
            appliedLabels.push(CONFIG.labels.conversation);
          }
        } else if (hasConversation) {
          // Already has the conversation label, add it to our tracking
          appliedLabels.push(CONFIG.labels.conversation);
        }
        
        // Cache the thread as processed
        CacheModule.ThreadCache.markProcessed(threadId, appliedLabels);
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
    const startTime = new Date().getTime();
    
    try {
      // Get all needed labels
      const labels = {
        inbound: GmailUtilsModule.getOrCreateLabel(CONFIG.labels.inbound),
        outbound: GmailUtilsModule.getOrCreateLabel(CONFIG.labels.outbound),
        conversation: GmailUtilsModule.getOrCreateLabel(CONFIG.labels.conversation),
      };
      
      // Search for emails that don't have our labels
      const searchQuery = `-label:${CONFIG.labels.inbound} -label:${CONFIG.labels.outbound} -label:${CONFIG.labels.conversation}`;
      
      // Get count of threads to process
      const totalToProcess = GmailApp.search(searchQuery).length;
      
      // Skip if nothing to process
      if (totalToProcess === 0) {
        Logger.log("No existing threads found to process");
        return;
      }
      
      // Get the user properties to track progress
      const props = PropertiesService.getUserProperties();
      let processedTotal = parseInt(props.getProperty("existingThreadsProcessed") || "0");
      
      // Get next batch to process
      const threads = GmailApp.search(
        searchQuery,
        processedTotal,
        CONFIG.polling.maxThreadsPerRun
      );
      
      if (threads.length === 0) {
        Logger.log("All existing threads have been processed");
        return;
      }
      
      // Process current batch
      const currentBatch = [];
      
      // Thread batches for different labels
      const threadBatches = {
        inbound: [],
        outbound: [],
        conversation: [],
      };
      
      // Process each thread in the batch
      for (let i = 0; i < threads.length; i++) {
        try {
          const thread = threads[i];
          const threadId = thread.getId();
          
          // Skip if we're approaching the timeout
          if (new Date().getTime() - startTime > CONFIG.polling.timeoutMs) {
            if (CONFIG.debug.enableLogging) {
              Logger.log("Reached timeout limit, stopping processing");
            }
            break;
          }
          
          // Skip if already processed (cached)
          if (CacheModule.ThreadCache.isProcessed(threadId)) {
            continue;
          }
          
          currentBatch.push(thread);
          
          // Get messages in the thread
          const messages = thread.getMessages();
          
          // Skip empty threads
          if (messages.length === 0) continue;
          
          const appliedLabels = [];
          
          // Determine if Inbound or Outbound based on first message
          const firstMessage = messages[0];
          const firstSender = firstMessage.getFrom();
          
          // Check if the first message is from you
          if (firstSender.indexOf(CONFIG.userEmail) !== -1) {
            threadBatches.outbound.push(thread);
            appliedLabels.push(CONFIG.labels.outbound);
          } else {
            threadBatches.inbound.push(thread);
            appliedLabels.push(CONFIG.labels.inbound);
          }
          
          // Determine if it's a Conversation
          if (messages.length >= 2) {
            // Check if you and someone else have both participated
            let youParticipated = false;
            let someoneElseParticipated = false;
            
            for (const message of messages) {
              const fromAddress = message.getFrom();
              if (fromAddress.indexOf(CONFIG.userEmail) !== -1) {
                youParticipated = true;
              } else {
                someoneElseParticipated = true;
              }
              
              // If both participated, it's a conversation
              if (youParticipated && someoneElseParticipated) {
                break;
              }
            }
            
            // If both participated, it's a conversation
            if (youParticipated && someoneElseParticipated) {
              threadBatches.conversation.push(thread);
              appliedLabels.push(CONFIG.labels.conversation);
            }
          }
          
          // Cache the thread as processed
          CacheModule.ThreadCache.markProcessed(threadId, appliedLabels);
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
      
      // Update progress
      processedTotal += currentBatch.length;
      props.setProperty("existingThreadsProcessed", processedTotal.toString());
      
      if (CONFIG.debug.enableLogging) {
        Logger.log(
          `Processed ${currentBatch.length} existing threads (total: ${processedTotal} of ${totalToProcess})`
        );
      }
      
      // Check if we're done
      if (processedTotal >= totalToProcess) {
        props.deleteProperty("existingThreadsProcessed");
        Logger.log("Completed processing all existing threads");
      } else {
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

  // Public API
  return {
    processNewEmails: processNewEmails,
    processExistingThreads: processExistingThreads
  };
})();
