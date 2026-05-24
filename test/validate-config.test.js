import { describe, expect, it } from "vitest";
import { loadScripts } from "./loader.js";

const validConfig = () => ({
  userEmail: "me@example.com",
  polling: {
    intervalMinutes: 5,
    searchWindowMinutes: 10,
    maxThreadsPerRun: 50,
    timeoutMs: 25000,
  },
  labels: {
    inbound: "Inbound",
    outbound: "Outbound",
    conversation: "Conversation",
  },
  caching: {
    threadCacheKeyPrefix: "thread_",
    maxCachedThreads: 500,
    threadCacheRetentionDays: 30,
  },
});

function loadValidator(config) {
  return loadScripts(["src/validate-config.js"], { CONFIG: config });
}

describe("validateConfig — passing", () => {
  it("accepts a fully valid config", () => {
    const ctx = loadValidator(validConfig());
    expect(() => ctx.validateConfig()).not.toThrow();
  });
});

describe("validateConfig — userEmail", () => {
  it("rejects the placeholder", () => {
    const cfg = validConfig();
    cfg.userEmail = "your.email@example.com";
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/userEmail is not set/);
  });

  it("rejects missing", () => {
    const cfg = validConfig();
    cfg.userEmail = "";
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/userEmail is not set/);
  });

  it("rejects non-email strings", () => {
    const cfg = validConfig();
    cfg.userEmail = "not-an-email";
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/doesn't look like an email/);
  });
});

describe("validateConfig — polling", () => {
  it("rejects intervalMinutes < 1", () => {
    const cfg = validConfig();
    cfg.polling.intervalMinutes = 0;
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/intervalMinutes must be >= 1/);
  });

  it("rejects searchWindowMinutes < intervalMinutes", () => {
    const cfg = validConfig();
    cfg.polling.intervalMinutes = 5;
    cfg.polling.searchWindowMinutes = 3;
    expect(() => loadValidator(cfg).validateConfig()).toThrow(
      /searchWindowMinutes \(3\) must be >= polling.intervalMinutes \(5\)/
    );
  });

  it("rejects maxThreadsPerRun > 100", () => {
    const cfg = validConfig();
    cfg.polling.maxThreadsPerRun = 150;
    expect(() => loadValidator(cfg).validateConfig()).toThrow(
      /maxThreadsPerRun \(150\) exceeds.*100-thread per-call cap/
    );
  });

  it("rejects maxThreadsPerRun <= 0", () => {
    const cfg = validConfig();
    cfg.polling.maxThreadsPerRun = 0;
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/maxThreadsPerRun must be > 0/);
  });

  it("rejects timeoutMs <= 0", () => {
    const cfg = validConfig();
    cfg.polling.timeoutMs = 0;
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/timeoutMs must be > 0/);
  });
});

describe("validateConfig — labels", () => {
  it("rejects empty inbound label", () => {
    const cfg = validConfig();
    cfg.labels.inbound = "";
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/labels.inbound must be a non-empty/);
  });

  it("rejects non-string outbound label", () => {
    const cfg = validConfig();
    /** @type {any} */ (cfg.labels).outbound = 42;
    expect(() => loadValidator(cfg).validateConfig()).toThrow(
      /labels.outbound must be a non-empty/
    );
  });
});

describe("validateConfig — caching", () => {
  it("rejects missing threadCacheKeyPrefix", () => {
    const cfg = validConfig();
    cfg.caching.threadCacheKeyPrefix = "";
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/threadCacheKeyPrefix must be set/);
  });

  it("rejects maxCachedThreads <= 0", () => {
    const cfg = validConfig();
    cfg.caching.maxCachedThreads = 0;
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/maxCachedThreads must be > 0/);
  });

  it("rejects retentionDays <= 0", () => {
    const cfg = validConfig();
    cfg.caching.threadCacheRetentionDays = 0;
    expect(() => loadValidator(cfg).validateConfig()).toThrow(
      /threadCacheRetentionDays must be > 0/
    );
  });
});

describe("validateConfig — aggregation", () => {
  it("reports all problems in one error message", () => {
    const cfg = validConfig();
    cfg.userEmail = "";
    cfg.polling.intervalMinutes = 0;
    cfg.labels.inbound = "";
    try {
      loadValidator(cfg).validateConfig();
      expect.fail("expected throw");
    } catch (err) {
      const msg = String(err);
      expect(msg).toMatch(/userEmail is not set/);
      expect(msg).toMatch(/intervalMinutes must be >= 1/);
      expect(msg).toMatch(/labels.inbound must be a non-empty/);
    }
  });
});
