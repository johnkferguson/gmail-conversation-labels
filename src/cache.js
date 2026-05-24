/**
 * Gmail Conversation Labels — thread cache.
 *
 * Caches "this thread has been processed and its last message is older than X"
 * in PropertiesService so re-runs skip threads that haven't changed since the
 * last pass.
 */

const ThreadCache = {
  /**
   * @param {GoogleAppsScript.Gmail.GmailThread} thread
   * @return {boolean} True if cached and no new messages have arrived since.
   */
  isProcessed(thread) {
    const props = PropertiesService.getUserProperties();
    const cachedData = props.getProperty(CONFIG.caching.threadCacheKeyPrefix + thread.getId());

    if (!cachedData) return false;

    try {
      const data = JSON.parse(cachedData);
      return thread.getLastMessageDate().getTime() <= data.lastMessageTimestamp;
    } catch (_e) {
      return false;
    }
  },

  /**
   * Mark a single thread as processed. For batches of threads (i.e. a polling
   * run), prefer `newBatch()` + `flush()` — each setProperty is a separate
   * PropertiesService call, while setProperties writes them all in one.
   *
   * @param {GoogleAppsScript.Gmail.GmailThread} thread
   * @param {string[]} appliedLabels
   */
  markProcessed(thread, appliedLabels) {
    const batch = ThreadCache.newBatch();
    batch.mark(thread, appliedLabels);
    batch.flush();
  },

  /**
   * Open a batch buffer for marking many threads as processed in one
   * PropertiesService write. Call `mark(thread, labels)` per thread, then
   * `flush()` once at the end.
   *
   * @returns {{
   *   mark: (thread: GoogleAppsScript.Gmail.GmailThread, appliedLabels: string[]) => void,
   *   flush: () => void,
   *   size: () => number
   * }}
   */
  newBatch() {
    /** @type {Record<string, string>} */
    const buffer = {};
    return {
      mark(thread, appliedLabels) {
        buffer[CONFIG.caching.threadCacheKeyPrefix + thread.getId()] = JSON.stringify({
          labels: appliedLabels,
          timestamp: Date.now(),
          lastMessageTimestamp: thread.getLastMessageDate().getTime(),
        });
      },
      flush() {
        if (Object.keys(buffer).length === 0) return;
        PropertiesService.getUserProperties().setProperties(buffer);
      },
      size() {
        return Object.keys(buffer).length;
      },
    };
  },

  /**
   * Prune cache entries older than the retention window. Bounded by
   * `maxCachedThreads` so we don't scan on every call.
   */
  cleanup() {
    const props = PropertiesService.getUserProperties();
    const allProps = props.getProperties();

    const cacheKeys = Object.keys(allProps).filter((key) =>
      key.startsWith(CONFIG.caching.threadCacheKeyPrefix)
    );

    if (cacheKeys.length <= CONFIG.caching.maxCachedThreads) {
      return;
    }

    const expirationTime =
      Date.now() - CONFIG.caching.threadCacheRetentionDays * 24 * 60 * 60 * 1000;

    const keysToDelete = [];
    for (const key of cacheKeys) {
      try {
        const data = JSON.parse(allProps[key]);
        if (data.timestamp < expirationTime) {
          keysToDelete.push(key);
        }
      } catch (_e) {
        keysToDelete.push(key);
      }
    }

    if (keysToDelete.length > 0) {
      for (const key of keysToDelete) {
        props.deleteProperty(key);
      }
      if (CONFIG.debug.enableLogging) {
        Logger.log(`Cleaned up ${keysToDelete.length} expired thread cache entries`);
      }
    }
  },
};

/**
 * Register a daily 2 AM trigger for cache cleanup. Idempotent — removes any
 * existing trigger first.
 */
function setupCleanupTrigger() {
  try {
    const triggers = ScriptApp.getProjectTriggers();
    for (const trigger of triggers) {
      if (trigger.getHandlerFunction() === TRIGGER_HANDLER_CLEANUP) {
        ScriptApp.deleteTrigger(trigger);
      }
    }

    ScriptApp.newTrigger(TRIGGER_HANDLER_CLEANUP).timeBased().everyDays(1).atHour(2).create();

    Logger.log("Cache cleanup trigger set up to run daily at 2 AM");
  } catch (error) {
    Logger.log(`Error setting up cleanup trigger: ${error.toString()}`);
  }
}

/**
 * Wipe all user properties (cache + any tracking). Use sparingly — this will
 * cause every thread to be reprocessed on the next run.
 */
function resetTracking() {
  PropertiesService.getUserProperties().deleteAllProperties();
  Logger.log("Tracking reset");
}
