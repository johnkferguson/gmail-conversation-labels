import { describe, expect, it } from "vitest";
import { loadScripts } from "./loader.js";
import { makeGmailApp, makeMessage, makeThread } from "./mocks/gmail.js";
import { makeLogger } from "./mocks/logger.js";
import { makeScriptApp } from "./mocks/script-app.js";

/**
 * @param {{ gmailApp?: ReturnType<typeof makeGmailApp>, scriptApp?: ReturnType<typeof makeScriptApp>, config?: object }} [opts]
 */
function loadGmailUtils(opts = {}) {
  const { gmailApp = makeGmailApp(), scriptApp = makeScriptApp(), config } = opts;
  const logger = makeLogger();
  const ctx = loadScripts(["src/constants.js", "src/gmail-utils.js"], {
    GmailApp: gmailApp,
    ScriptApp: scriptApp,
    Logger: logger,
    CONFIG: config ?? {
      labels: { inbound: "Inbound", outbound: "Outbound", conversation: "Conversation" },
      polling: { searchWindowMinutes: 10, intervalMinutes: 5 },
    },
  });
  return { ctx, gmailApp, scriptApp, logger };
}

describe("buildOptimizedSearchQuery", () => {
  it("composes the query from the configured window and label names", () => {
    const { ctx } = loadGmailUtils();
    expect(ctx.buildOptimizedSearchQuery()).toBe(
      "newer_than:10m -label:Inbound -label:Outbound -label:Conversation"
    );
  });

  it("honors renamed labels", () => {
    const { ctx } = loadGmailUtils({
      config: {
        labels: { inbound: "In", outbound: "Out", conversation: "Convo" },
        polling: { searchWindowMinutes: 3, intervalMinutes: 1 },
      },
    });
    expect(ctx.buildOptimizedSearchQuery()).toBe("newer_than:3m -label:In -label:Out -label:Convo");
  });
});

describe("getMessagesSelectively", () => {
  it("returns [] for an empty thread", () => {
    const { ctx } = loadGmailUtils();
    expect(ctx.getMessagesSelectively(makeThread({ messages: [] }))).toEqual([]);
  });

  it("returns the only message when there's just one", () => {
    const { ctx } = loadGmailUtils();
    const m = makeMessage({ from: "a@x.com" });
    expect(ctx.getMessagesSelectively(makeThread({ messages: [m] }), 5)).toEqual([m]);
  });

  it("returns the first message when maxToRetrieve=1", () => {
    const { ctx } = loadGmailUtils();
    const ms = [
      makeMessage({ from: "a@x.com" }),
      makeMessage({ from: "b@x.com" }),
      makeMessage({ from: "c@x.com" }),
    ];
    expect(ctx.getMessagesSelectively(makeThread({ messages: ms }), 1)).toEqual([ms[0]]);
  });

  it("returns the first N when not requesting the latest", () => {
    const { ctx } = loadGmailUtils();
    const ms = [
      makeMessage({ from: "a@x.com" }),
      makeMessage({ from: "b@x.com" }),
      makeMessage({ from: "c@x.com" }),
      makeMessage({ from: "d@x.com" }),
    ];
    const out = ctx.getMessagesSelectively(makeThread({ messages: ms }), 2);
    expect(out).toEqual([ms[0], ms[1]]);
  });

  it("includes the latest message alongside earlier ones when includeLatest=true", () => {
    const { ctx } = loadGmailUtils();
    const ms = [
      makeMessage({ from: "a@x.com" }),
      makeMessage({ from: "b@x.com" }),
      makeMessage({ from: "c@x.com" }),
      makeMessage({ from: "d@x.com" }),
    ];
    const out = ctx.getMessagesSelectively(makeThread({ messages: ms }), 3, true);
    expect(out).toEqual([ms[0], ms[1], ms[3]]);
  });

  it("does not duplicate the latest when count already covers the whole thread", () => {
    const { ctx } = loadGmailUtils();
    const ms = [makeMessage({ from: "a@x.com" }), makeMessage({ from: "b@x.com" })];
    const out = ctx.getMessagesSelectively(makeThread({ messages: ms }), 3, true);
    expect(out).toEqual([ms[0], ms[1]]);
  });
});

describe("getOrCreateLabel", () => {
  it("returns an existing label when present", () => {
    const existing = { getName: () => "Inbound" };
    const gmailApp = makeGmailApp({ userLabels: { Inbound: existing } });
    const { ctx } = loadGmailUtils({ gmailApp });
    expect(ctx.getOrCreateLabel("Inbound")).toBe(existing);
    expect(gmailApp._created).toEqual([]);
  });

  it("creates a label when missing", () => {
    const gmailApp = makeGmailApp();
    const { ctx } = loadGmailUtils({ gmailApp });
    const label = ctx.getOrCreateLabel("Newish");
    expect(label.getName()).toBe("Newish");
    expect(gmailApp._created).toEqual(["Newish"]);
  });
});

describe("setupTrigger", () => {
  it("deletes existing main triggers and registers a new time-based one", () => {
    const scriptApp = makeScriptApp({ existingTriggers: ["main", "cleanupCache", "main"] });
    const { ctx } = loadGmailUtils({ scriptApp });
    ctx.setupTrigger();
    expect(scriptApp._deleted).toEqual(["main", "main"]);
    expect(scriptApp._created).toEqual([
      { handler: "main", type: "time", opts: { everyMinutes: 5 } },
    ]);
  });
});
