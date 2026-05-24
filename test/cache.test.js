import { beforeEach, describe, expect, it } from "vitest";
import { loadScripts } from "./loader.js";
import { makeThread } from "./mocks/gmail.js";
import { makeLogger } from "./mocks/logger.js";
import { makePropertiesService } from "./mocks/properties.js";
import { makeScriptApp } from "./mocks/script-app.js";

const baseConfig = () => ({
  caching: {
    threadCacheKeyPrefix: "thread_",
    maxCachedThreads: 5,
    threadCacheRetentionDays: 30,
  },
  debug: { enableLogging: false },
});

function loadCacheModule(overrides = {}) {
  const props = makePropertiesService();
  const logger = makeLogger();
  const scriptApp = makeScriptApp();
  const ctx = loadScripts(
    ["src/constants.js", "src/cache.js"],
    {
      PropertiesService: props,
      Logger: logger,
      ScriptApp: scriptApp,
      CONFIG: baseConfig(),
      ...overrides,
    },
    ["ThreadCache", "TRIGGER_HANDLER_CLEANUP"]
  );
  return { ctx, props, logger, scriptApp };
}

describe("ThreadCache.isProcessed / markProcessed", () => {
  let ctx;
  let props;

  beforeEach(() => {
    ({ ctx, props } = loadCacheModule());
  });

  it("returns false for a thread never seen before", () => {
    const thread = makeThread({ id: "abc" });
    expect(ctx.ThreadCache.isProcessed(thread)).toBe(false);
  });

  it("returns true after markProcessed when no new mail arrived", () => {
    const thread = makeThread({ id: "abc", lastMessageDate: new Date("2026-01-01") });
    ctx.ThreadCache.markProcessed(thread, ["Inbound"]);
    expect(ctx.ThreadCache.isProcessed(thread)).toBe(true);
  });

  it("returns false when the thread has a newer last message than the cache entry", () => {
    const original = makeThread({ id: "abc", lastMessageDate: new Date("2026-01-01") });
    ctx.ThreadCache.markProcessed(original, ["Inbound"]);
    const updated = makeThread({ id: "abc", lastMessageDate: new Date("2026-01-02") });
    expect(ctx.ThreadCache.isProcessed(updated)).toBe(false);
  });

  it("isProcessed is robust to corrupted JSON in the property store", () => {
    const thread = makeThread({ id: "abc" });
    props._store.set("thread_abc", "{not json");
    expect(ctx.ThreadCache.isProcessed(thread)).toBe(false);
  });

  it("markProcessed persists the applied labels and last-message timestamp", () => {
    const ts = new Date("2026-03-04T05:06:07Z").getTime();
    const thread = makeThread({ id: "xyz", lastMessageDate: new Date(ts) });
    ctx.ThreadCache.markProcessed(thread, ["Inbound", "Conversation"]);
    const stored = JSON.parse(props._store.get("thread_xyz"));
    expect(stored.labels).toEqual(["Inbound", "Conversation"]);
    expect(stored.lastMessageTimestamp).toBe(ts);
    expect(typeof stored.timestamp).toBe("number");
  });

  it("uses the configured key prefix", () => {
    const { ctx: customCtx, props: customProps } = loadCacheModule({
      CONFIG: { ...baseConfig(), caching: { ...baseConfig().caching, threadCacheKeyPrefix: "X-" } },
    });
    const thread = makeThread({ id: "abc" });
    customCtx.ThreadCache.markProcessed(thread, []);
    expect(customProps._store.has("X-abc")).toBe(true);
    expect(customProps._store.has("thread_abc")).toBe(false);
  });
});

describe("ThreadCache.cleanup", () => {
  it("is a no-op when under maxCachedThreads", () => {
    const { ctx, props } = loadCacheModule();
    for (let i = 0; i < 3; i++) {
      props._store.set(
        `thread_${i}`,
        JSON.stringify({ labels: [], timestamp: 0, lastMessageTimestamp: 0 })
      );
    }
    ctx.ThreadCache.cleanup();
    expect(props._store.size).toBe(3);
  });

  it("prunes entries older than retentionDays once over maxCachedThreads", () => {
    const { ctx, props } = loadCacheModule();
    const now = Date.now();
    const old = now - 31 * 24 * 60 * 60 * 1000;
    // 4 old, 3 recent → 7 total, threshold is 5
    for (let i = 0; i < 4; i++) {
      props._store.set(
        `thread_old_${i}`,
        JSON.stringify({ labels: [], timestamp: old, lastMessageTimestamp: old })
      );
    }
    for (let i = 0; i < 3; i++) {
      props._store.set(
        `thread_new_${i}`,
        JSON.stringify({ labels: [], timestamp: now, lastMessageTimestamp: now })
      );
    }
    ctx.ThreadCache.cleanup();
    expect(props._store.size).toBe(3);
    expect([...props._store.keys()].every((k) => k.startsWith("thread_new_"))).toBe(true);
  });

  it("drops entries with unparseable JSON when pruning", () => {
    const { ctx, props } = loadCacheModule();
    for (let i = 0; i < 5; i++) {
      props._store.set(`thread_ok_${i}`, JSON.stringify({ timestamp: Date.now() }));
    }
    props._store.set("thread_broken", "{not json");
    ctx.ThreadCache.cleanup();
    expect(props._store.has("thread_broken")).toBe(false);
  });

  it("ignores keys that don't match the configured prefix", () => {
    const { ctx, props } = loadCacheModule();
    for (let i = 0; i < 6; i++) {
      props._store.set(`thread_${i}`, JSON.stringify({ timestamp: 0, lastMessageTimestamp: 0 }));
    }
    props._store.set("unrelatedKey", "leave-me-alone");
    ctx.ThreadCache.cleanup();
    expect(props._store.get("unrelatedKey")).toBe("leave-me-alone");
  });
});

describe("setupCleanupTrigger / resetTracking", () => {
  it("setupCleanupTrigger removes prior cleanupCache triggers and registers a daily one", () => {
    const props = makePropertiesService();
    const logger = makeLogger();
    const scriptApp = makeScriptApp({ existingTriggers: ["cleanupCache", "main"] });
    const ctx = loadScripts(
      ["src/constants.js", "src/cache.js"],
      {
        PropertiesService: props,
        Logger: logger,
        ScriptApp: scriptApp,
        CONFIG: baseConfig(),
      },
      ["ThreadCache", "TRIGGER_HANDLER_CLEANUP"]
    );

    ctx.setupCleanupTrigger();

    expect(scriptApp._deleted).toEqual(["cleanupCache"]);
    expect(scriptApp._created).toEqual([
      { handler: "cleanupCache", type: "time", opts: { everyDays: 1, atHour: 2 } },
    ]);
  });

  it("resetTracking wipes all user properties", () => {
    const { ctx, props } = loadCacheModule();
    props._store.set("thread_a", "x");
    props._store.set("anything", "y");
    ctx.resetTracking();
    expect(props._store.size).toBe(0);
  });
});
