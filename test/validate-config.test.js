import { describe, expect, it } from "vitest";
import { loadScripts } from "./loader.js";

const validConfig = () => ({
  userEmails: ["me@example.com"],
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
  it("accepts a fully valid config (array shape)", () => {
    const ctx = loadValidator(validConfig());
    expect(() => ctx.validateConfig()).not.toThrow();
  });

  it("accepts a config with multiple userEmails", () => {
    const cfg = validConfig();
    cfg.userEmails = ["me@gmail.com", "me@mydomain.com", "me@workspace.example"];
    expect(() => loadValidator(cfg).validateConfig()).not.toThrow();
  });

  it("accepts the legacy userEmail string shape", () => {
    /** @type {any} */
    const cfg = validConfig();
    delete cfg.userEmails;
    cfg.userEmail = "legacy@example.com";
    expect(() => loadValidator(cfg).validateConfig()).not.toThrow();
  });
});

describe("validateConfig — userEmails", () => {
  it("rejects empty array", () => {
    const cfg = validConfig();
    cfg.userEmails = [];
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/userEmails is empty/);
  });

  it("rejects the placeholder value in the array", () => {
    const cfg = validConfig();
    cfg.userEmails = ["your.email@example.com"];
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/userEmails\[0\] is the placeholder/);
  });

  it("rejects entries without an @", () => {
    const cfg = validConfig();
    cfg.userEmails = ["me@example.com", "not-an-email"];
    expect(() => loadValidator(cfg).validateConfig()).toThrow(
      /userEmails\[1\] \("not-an-email"\) doesn't look like an email/
    );
  });

  it("rejects non-string entries", () => {
    const cfg = validConfig();
    /** @type {any} */ (cfg).userEmails = ["me@example.com", 42];
    expect(() => loadValidator(cfg).validateConfig()).toThrow(
      /userEmails\[1\] must be a non-empty string/
    );
  });

  it("rejects empty-string entries", () => {
    const cfg = validConfig();
    cfg.userEmails = ["me@example.com", ""];
    expect(() => loadValidator(cfg).validateConfig()).toThrow(
      /userEmails\[1\] must be a non-empty string/
    );
  });

  it("rejects when neither userEmails nor userEmail is set", () => {
    /** @type {any} */
    const cfg = validConfig();
    delete cfg.userEmails;
    expect(() => loadValidator(cfg).validateConfig()).toThrow(/userEmails is not set/);
  });
});

describe("validateConfig — legacy userEmail", () => {
  /** Build a config with only the legacy field (no userEmails). */
  function legacyConfig(value) {
    /** @type {any} */
    const cfg = validConfig();
    delete cfg.userEmails;
    cfg.userEmail = value;
    return cfg;
  }

  it("rejects the placeholder", () => {
    expect(() => loadValidator(legacyConfig("your.email@example.com")).validateConfig()).toThrow(
      /userEmail is the placeholder/
    );
  });

  it("rejects empty-string legacy value (treated as unset)", () => {
    expect(() => loadValidator(legacyConfig("")).validateConfig()).toThrow(/userEmails is not set/);
  });

  it("rejects non-email legacy strings", () => {
    expect(() => loadValidator(legacyConfig("not-an-email")).validateConfig()).toThrow(
      /userEmail "not-an-email" doesn't look like an email/
    );
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
    cfg.userEmails = [];
    cfg.polling.intervalMinutes = 0;
    cfg.labels.inbound = "";
    try {
      loadValidator(cfg).validateConfig();
      expect.fail("expected throw");
    } catch (err) {
      const msg = String(err);
      expect(msg).toMatch(/userEmails is empty/);
      expect(msg).toMatch(/intervalMinutes must be >= 1/);
      expect(msg).toMatch(/labels.inbound must be a non-empty/);
    }
  });
});
