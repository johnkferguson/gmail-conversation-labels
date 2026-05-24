/**
 * Gmail Smart Labeler - Cache Module
 *
 * Handles thread caching to avoid redundant processing and reduce API calls.
 */

// Cache module using IIFE pattern for Apps Script
var CacheModule = (() => {
  /**
   * Caching utilities to avoid redundant processing
   */
  const ThreadCache = {
    /**
     * Check if a thread has already been processed and has no new messages
     *
     * @param {GmailThread} thread - The thread to check
     * @return {boolean} True if the thread has been processed and has no new messages
     */
    isProcessed: (thread) => {
      const props = PropertiesService.getUserProperties();
      const cachedData = props.getProperty(CONFIG.caching.threadCacheKeyPrefix + thread.getId());

      if (!cachedData) return false;

      try {
        const data = JSON.parse(cachedData);
        if (thread.getLastMessageDate().getTime() > data.lastMessageTimestamp) {
          return false;
        }
        return true;
      } catch (e) {
        return false;
      }
    },

    /**
     * Mark a thread as processed with its applied labels
     * Also stores the timestamp of the last message for change detection
     *
     * @param {GmailThread} thread - The thread to mark
     * @param {Array<string>} appliedLabels - Array of label names applied to thread
     */
    markProcessed: (thread, appliedLabels) => {
      const props = PropertiesService.getUserProperties();
      props.setProperty(
        CONFIG.caching.threadCacheKeyPrefix + thread.getId(),
        JSON.stringify({
          labels: appliedLabels,
          timestamp: new Date().getTime(),
          lastMessageTimestamp: thread.getLastMessageDate().getTime(),
        })
      );
    },

    /**
     * Clean up old cached thread records to avoid hitting storage limits
     * Should be run periodically (e.g., once a day or week)
     */
    cleanup: () => {
      const props = PropertiesService.getUserProperties();
      const allProps = props.getProperties();

      // Get all thread cache keys
      const cacheKeys = Object.keys(allProps).filter((key) =>
        key.startsWith(CONFIG.caching.threadCacheKeyPrefix)
      );

      // Skip if under limit
      if (cacheKeys.length <= CONFIG.caching.maxCachedThreads) {
        return;
      }

      // Get expiration timestamp (30 days ago)
      const expirationTime =
        new Date().getTime() - CONFIG.caching.threadCacheRetentionDays * 24 * 60 * 60 * 1000;

      // Find and delete expired entries
      const keysToDelete = [];

      for (const key of cacheKeys) {
        try {
          const data = JSON.parse(allProps[key]);
          if (data.timestamp < expirationTime) {
            keysToDelete.push(key);
          }
        } catch (e) {
          // Invalid JSON, just delete it
          keysToDelete.push(key);
        }
      }

      // Delete expired keys
      if (keysToDelete.length > 0) {
        props.deleteAllProperties(keysToDelete);

        if (CONFIG.debug.enableLogging) {
          Logger.log(`Cleaned up ${keysToDelete.length} expired thread cache entries`);
        }
      }
    },
  };

  /**
   * Daily cleanup function called by trigger
   */
  function cleanupCache() {
    ThreadCache.cleanup();
  }

  /**
   * Set up daily trigger to clean up thread cache
   * This prevents hitting storage quotas
   */
  function setupCleanupTrigger() {
    try {
      // Delete any existing triggers for cleanup
      const triggers = ScriptApp.getProjectTriggers();
      for (let i = 0; i < triggers.length; i++) {
        if (triggers[i].getHandlerFunction() === "cleanupCache") {
          ScriptApp.deleteTrigger(triggers[i]);
        }
      }

      // Create a new trigger to run daily
      ScriptApp.newTrigger("cleanupCache")
        .timeBased()
        .everyDays(1)
        .atHour(2) // 2 AM
        .create();

      Logger.log("Cache cleanup trigger set up to run daily at 2 AM");
    } catch (error) {
      Logger.log(`Error setting up cleanup trigger: ${error.toString()}`);
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

  // Public API
  return {
    ThreadCache: ThreadCache,
    cleanupCache: cleanupCache,
    setupCleanupTrigger: setupCleanupTrigger,
    resetTracking: resetTracking,
  };
})();
