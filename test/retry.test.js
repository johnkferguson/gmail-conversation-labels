import { describe, expect, it } from "vitest";
import { loadScripts } from "./loader.js";
import { makeLogger } from "./mocks/logger.js";

function makeUtilities() {
  /** @type {number[]} */
  const sleeps = [];
  return {
    sleep: (ms) => {
      sleeps.push(ms);
    },
    _sleeps: sleeps,
  };
}

function loadRetry() {
  const logger = makeLogger();
  const utilities = makeUtilities();
  const ctx = loadScripts(["src/retry.js"], { Logger: logger, Utilities: utilities }, [
    "isRetryableError",
  ]);
  return { ctx, logger, utilities };
}

describe("isRetryableError", () => {
  const { ctx } = loadRetry();
  const { isRetryableError } = ctx;

  it.each([
    ["Rate Limit Exceeded", true],
    ["Service invoked too many times", true],
    ["Backend Error", true],
    ["Internal error: blah", true],
    ["Request timeout", true],
    ["Service temporarily unavailable", true],
    ["Access denied", false],
    ["Permission denied: foo", false],
    ["Unauthorized", false],
    ["Thread not found", false],
    ["Unrecognized: weird thing", false],
  ])("classifies %s correctly", (msg, expected) => {
    expect(isRetryableError(new Error(msg))).toBe(expected);
  });
});

describe("withRetry", () => {
  it("returns the result on first success", () => {
    const { ctx, utilities } = loadRetry();
    let calls = 0;
    const result = ctx.withRetry(() => {
      calls++;
      return "ok";
    });
    expect(result).toBe("ok");
    expect(calls).toBe(1);
    expect(utilities._sleeps).toEqual([]);
  });

  it("retries on transient errors with exponential backoff", () => {
    const { ctx, utilities } = loadRetry();
    let calls = 0;
    const result = ctx.withRetry(
      () => {
        calls++;
        if (calls < 3) throw new Error("Rate limit exceeded");
        return "eventually";
      },
      { baseDelayMs: 100 }
    );
    expect(result).toBe("eventually");
    expect(calls).toBe(3);
    expect(utilities._sleeps).toEqual([100, 200]);
  });

  it("re-throws non-retryable errors immediately", () => {
    const { ctx, utilities } = loadRetry();
    let calls = 0;
    expect(() =>
      ctx.withRetry(() => {
        calls++;
        throw new Error("Permission denied");
      })
    ).toThrow(/Permission denied/);
    expect(calls).toBe(1);
    expect(utilities._sleeps).toEqual([]);
  });

  it("gives up after the configured retry count", () => {
    const { ctx, utilities } = loadRetry();
    let calls = 0;
    expect(() =>
      ctx.withRetry(
        () => {
          calls++;
          throw new Error("Backend error");
        },
        { retries: 2, baseDelayMs: 10 }
      )
    ).toThrow(/Backend error/);
    expect(calls).toBe(3); // 1 initial + 2 retries
    expect(utilities._sleeps).toEqual([10, 20]);
  });

  it("uses the configured label in log lines", () => {
    const { ctx, logger } = loadRetry();
    let calls = 0;
    ctx.withRetry(
      () => {
        calls++;
        if (calls === 1) throw new Error("rate limit");
        return null;
      },
      { baseDelayMs: 1, label: "my-op" }
    );
    expect(logger._logs.some((m) => m.includes("my-op"))).toBe(true);
  });
});
