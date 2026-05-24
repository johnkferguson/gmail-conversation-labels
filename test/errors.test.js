import { beforeEach, describe, expect, it } from "vitest";
import { loadScripts } from "./loader.js";
import { makeLogger } from "./mocks/logger.js";
import { makePropertiesService } from "./mocks/properties.js";

function makeMailApp() {
  /** @type {{to: string, subject: string, body: string}[]} */
  const sent = [];
  return {
    sendEmail: (to, subject, body) => {
      sent.push({ to, subject, body });
    },
    _sent: sent,
  };
}

function loadErrors(configOverrides = {}) {
  const props = makePropertiesService();
  const logger = makeLogger();
  const mailApp = makeMailApp();
  const ctx = loadScripts(
    ["src/errors.js"],
    {
      PropertiesService: props,
      Logger: logger,
      MailApp: mailApp,
      CONFIG: {
        userEmail: "me@example.com",
        debug: {
          sendErrorEmails: true,
          errorEmailThrottleHours: 1,
          ...configOverrides,
        },
      },
    },
    ["LAST_ERROR_EMAIL_KEY"]
  );
  return { ctx, props, logger, mailApp };
}

describe("sendErrorEmail", () => {
  let ctx;
  let props;
  let mailApp;
  let logger;

  beforeEach(() => {
    ({ ctx, props, mailApp, logger } = loadErrors());
  });

  it("sends an email when no prior send is recorded", () => {
    ctx.sendErrorEmail("Boom", "Stack trace…");
    expect(mailApp._sent).toEqual([
      { to: "me@example.com", subject: "Boom", body: "Stack trace…" },
    ]);
    expect(props._store.get(ctx.LAST_ERROR_EMAIL_KEY)).toBeDefined();
  });

  it("is a no-op when sendErrorEmails is disabled", () => {
    ({ ctx, props, mailApp } = loadErrors({ sendErrorEmails: false }));
    ctx.sendErrorEmail("Boom", "");
    expect(mailApp._sent).toEqual([]);
    expect(props._store.size).toBe(0);
  });

  it("throttles within the configured window", () => {
    ctx.sendErrorEmail("First", "");
    ctx.sendErrorEmail("Second", "");
    ctx.sendErrorEmail("Third", "");
    expect(mailApp._sent).toHaveLength(1);
    expect(mailApp._sent[0].subject).toBe("First");
    // Throttled sends should log
    expect(logger._logs.some((m) => m.includes("throttled"))).toBe(true);
  });

  it("sends again after the throttle window elapses", () => {
    const { ctx, props, mailApp } = loadErrors({ errorEmailThrottleHours: 1 });
    // Seed a "last sent" 90 minutes ago
    props._store.set("lastErrorEmailTimestamp", String(Date.now() - 90 * 60 * 1000));
    ctx.sendErrorEmail("LateOne", "");
    expect(mailApp._sent).toHaveLength(1);
  });

  it("uses errorEmailThrottleHours from CONFIG (default 1) when undefined", () => {
    // With throttleHours undefined, should default to 1h. Seed 30 min ago → throttled.
    const { ctx, props, mailApp } = loadErrors({ errorEmailThrottleHours: undefined });
    props._store.set("lastErrorEmailTimestamp", String(Date.now() - 30 * 60 * 1000));
    ctx.sendErrorEmail("StillTooSoon", "");
    expect(mailApp._sent).toEqual([]);
  });
});
