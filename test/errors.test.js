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

/**
 * @param {object} [opts]
 * @param {Record<string, unknown>} [opts.debug]
 * @param {string[]} [opts.userEmails]
 * @param {string} [opts.userEmail] legacy single-address form
 */
function loadErrors(opts = {}) {
  const props = makePropertiesService();
  const logger = makeLogger();
  const mailApp = makeMailApp();
  /** @type {Record<string, unknown>} */
  const configBase = {
    debug: {
      sendErrorEmails: true,
      errorEmailThrottleHours: 1,
      ...(opts.debug ?? {}),
    },
  };
  if (opts.userEmails !== undefined) configBase.userEmails = opts.userEmails;
  if (opts.userEmail !== undefined) configBase.userEmail = opts.userEmail;
  if (opts.userEmails === undefined && opts.userEmail === undefined) {
    configBase.userEmails = ["me@example.com"];
  }
  const ctx = loadScripts(
    ["src/user-emails.js", "src/errors.js"],
    {
      PropertiesService: props,
      Logger: logger,
      MailApp: mailApp,
      CONFIG: configBase,
    },
    ["LAST_ERROR_EMAIL_KEY"]
  );
  return { ctx, props, logger, mailApp };
}

describe("sendErrorEmail — happy path with userEmails array", () => {
  let ctx;
  let props;
  let mailApp;
  let logger;

  beforeEach(() => {
    ({ ctx, props, mailApp, logger } = loadErrors());
  });

  it("sends an email to the first userEmails entry", () => {
    ctx.sendErrorEmail("Boom", "Stack trace…");
    expect(mailApp._sent).toEqual([
      { to: "me@example.com", subject: "Boom", body: "Stack trace…" },
    ]);
    expect(props._store.get(ctx.LAST_ERROR_EMAIL_KEY)).toBeDefined();
  });

  it("uses the FIRST address when multiple are configured", () => {
    ({ ctx, mailApp } = loadErrors({
      userEmails: ["primary@example.com", "alias@example.com"],
    }));
    ctx.sendErrorEmail("Boom", "");
    expect(mailApp._sent[0].to).toBe("primary@example.com");
  });

  it("is a no-op when sendErrorEmails is disabled", () => {
    ({ ctx, props, mailApp } = loadErrors({ debug: { sendErrorEmails: false } }));
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
    expect(logger._logs.some((m) => m.includes("throttled"))).toBe(true);
  });

  it("sends again after the throttle window elapses", () => {
    const { ctx, props, mailApp } = loadErrors();
    props._store.set("lastErrorEmailTimestamp", String(Date.now() - 90 * 60 * 1000));
    ctx.sendErrorEmail("LateOne", "");
    expect(mailApp._sent).toHaveLength(1);
  });

  it("uses errorEmailThrottleHours from CONFIG (default 1) when undefined", () => {
    const { ctx, props, mailApp } = loadErrors({
      debug: { errorEmailThrottleHours: undefined },
    });
    props._store.set("lastErrorEmailTimestamp", String(Date.now() - 30 * 60 * 1000));
    ctx.sendErrorEmail("StillTooSoon", "");
    expect(mailApp._sent).toEqual([]);
  });
});

describe("sendErrorEmail — legacy userEmail string", () => {
  it("resolves recipient via the back-compat path", () => {
    const { ctx, mailApp } = loadErrors({ userEmail: "legacy@example.com" });
    ctx.sendErrorEmail("Boom", "");
    expect(mailApp._sent[0].to).toBe("legacy@example.com");
  });
});

describe("sendErrorEmail — degenerate config", () => {
  it("skips and logs when no userEmails or userEmail is configured", () => {
    const { ctx, mailApp, logger } = loadErrors({ userEmails: [] });
    ctx.sendErrorEmail("Boom", "");
    expect(mailApp._sent).toEqual([]);
    expect(logger._logs.some((m) => m.includes("no user email configured"))).toBe(true);
  });
});
