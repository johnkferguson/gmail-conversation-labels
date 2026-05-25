import { describe, expect, it } from "vitest";
import { loadScripts } from "./loader.js";

const { classifyThread } = loadScripts(["src/email-header.js", "src/classifier.js"]);

const me = ["me@example.com"];
const meHeader = '"Me" <me@example.com>';
const friendHeader = '"Friend" <friend@example.com>';

describe("classifyThread — primary direction", () => {
  it("outbound when first message is from the user", () => {
    const result = classifyThread({
      firstSender: meHeader,
      messages: [{ from: meHeader }],
      userEmails: me,
    });
    expect(result.primary).toBe("outbound");
  });

  it("inbound when first message is from someone else", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }],
      userEmails: me,
    });
    expect(result.primary).toBe("inbound");
  });

  it("respects an existing outbound label even if the first sender looks inbound", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }],
      userEmails: me,
      existingLabels: { outbound: true },
    });
    expect(result.primary).toBe("outbound");
  });

  it("respects an existing inbound label even if the first sender looks outbound", () => {
    const result = classifyThread({
      firstSender: meHeader,
      messages: [{ from: meHeader }],
      userEmails: me,
      existingLabels: { inbound: true },
    });
    expect(result.primary).toBe("inbound");
  });
});

describe("classifyThread — conversation detection", () => {
  it("false for a single-message thread", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }],
      userEmails: me,
    });
    expect(result.isConversation).toBe(false);
  });

  it("true when both parties participated", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }, { from: meHeader }],
      userEmails: me,
    });
    expect(result.isConversation).toBe(true);
  });

  it("false when only the user sent multiple messages with no reply yet", () => {
    const result = classifyThread({
      firstSender: meHeader,
      messages: [{ from: meHeader }, { from: meHeader }],
      userEmails: me,
    });
    expect(result.isConversation).toBe(false);
  });

  it("false when only an external sender sent multiple messages with no user reply", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }, { from: friendHeader }],
      userEmails: me,
    });
    expect(result.isConversation).toBe(false);
  });

  it("inbound thread becomes a conversation once the user replies", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }, { from: friendHeader }, { from: meHeader }],
      userEmails: me,
      existingLabels: { inbound: true },
    });
    expect(result.isConversation).toBe(true);
  });

  it("outbound thread becomes a conversation once an external reply arrives", () => {
    const result = classifyThread({
      firstSender: meHeader,
      messages: [{ from: meHeader }, { from: meHeader }, { from: friendHeader }],
      userEmails: me,
      existingLabels: { outbound: true },
    });
    expect(result.isConversation).toBe(true);
  });

  it("preserves an existing conversation label even for a one-message sample", () => {
    const result = classifyThread({
      firstSender: meHeader,
      messages: [{ from: meHeader }],
      userEmails: me,
      existingLabels: { conversation: true },
    });
    expect(result.isConversation).toBe(true);
  });

  it("inbound + sampled-only-self does NOT spuriously fire conversation", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }, { from: friendHeader }],
      userEmails: me,
      existingLabels: { inbound: true },
    });
    expect(result.isConversation).toBe(false);
  });
});

describe("classifyThread — email matching", () => {
  it('handles standard "Name" <addr> header format', () => {
    const result = classifyThread({
      firstSender: '"John K." <john@example.com>',
      messages: [{ from: '"John K." <john@example.com>' }],
      userEmails: ["john@example.com"],
    });
    expect(result.primary).toBe("outbound");
  });

  it("no longer false-matches on substring overlap", () => {
    // Previously, `notjohn@example.com` matched `john@example.com` as a
    // substring of the entire From header. With exact-address matching, the
    // parsed address `notjohn@example.com` doesn't equal `john@example.com`
    // and the thread classifies as inbound.
    const result = classifyThread({
      firstSender: '"Spam" <notjohn@example.com>',
      messages: [{ from: '"Spam" <notjohn@example.com>' }],
      userEmails: ["john@example.com"],
    });
    expect(result.primary).toBe("inbound");
  });

  it("matches case-insensitively (header uppercase, config lowercase)", () => {
    const result = classifyThread({
      firstSender: '"John K." <John@Example.COM>',
      messages: [{ from: '"John K." <John@Example.COM>' }],
      userEmails: ["john@example.com"],
    });
    expect(result.primary).toBe("outbound");
  });

  it("matches case-insensitively (header lowercase, config mixed-case)", () => {
    const result = classifyThread({
      firstSender: "john@example.com",
      messages: [{ from: "john@example.com" }],
      userEmails: ["John@Example.com"],
    });
    expect(result.primary).toBe("outbound");
  });

  it("ignores the display name when matching — only the parsed address counts", () => {
    // The display name contains the user's address as a substring, but the
    // actual From address belongs to someone else. Must classify as inbound.
    const result = classifyThread({
      firstSender: '"Mentioning john@example.com in their name" <stranger@example.org>',
      messages: [{ from: '"Mentioning john@example.com in their name" <stranger@example.org>' }],
      userEmails: ["john@example.com"],
    });
    expect(result.primary).toBe("inbound");
  });
});

describe("classifyThread — multiple user identities", () => {
  const identities = ["me@gmail.com", "me@mydomain.com", "me@workspace.example"];
  const aliasHeader = '"Me Workspace" <me@workspace.example>';
  const secondaryHeader = '"Me Domain" <me@mydomain.com>';
  const externalHeader = '"Friend" <friend@example.com>';

  it("classifies as outbound when first sender matches the first listed identity", () => {
    const result = classifyThread({
      firstSender: '"Me Gmail" <me@gmail.com>',
      messages: [{ from: '"Me Gmail" <me@gmail.com>' }],
      userEmails: identities,
    });
    expect(result.primary).toBe("outbound");
  });

  it("classifies as outbound when first sender matches a non-first identity", () => {
    const result = classifyThread({
      firstSender: secondaryHeader,
      messages: [{ from: secondaryHeader }],
      userEmails: identities,
    });
    expect(result.primary).toBe("outbound");
  });

  it("classifies as outbound when sender matches the last listed identity", () => {
    const result = classifyThread({
      firstSender: aliasHeader,
      messages: [{ from: aliasHeader }],
      userEmails: identities,
    });
    expect(result.primary).toBe("outbound");
  });

  it("classifies as inbound when sender matches none of the identities", () => {
    const result = classifyThread({
      firstSender: externalHeader,
      messages: [{ from: externalHeader }],
      userEmails: identities,
    });
    expect(result.primary).toBe("inbound");
  });

  it("detects conversation when user replies from a different identity than thread started with", () => {
    // Friend opened a thread, user replied from their workspace alias —
    // should still classify as a conversation.
    const result = classifyThread({
      firstSender: externalHeader,
      messages: [{ from: externalHeader }, { from: aliasHeader }],
      userEmails: identities,
      existingLabels: { inbound: true },
    });
    expect(result.isConversation).toBe(true);
  });

  it("empty userEmails list → every message classifies as inbound (no self defined)", () => {
    const result = classifyThread({
      firstSender: '"Me" <me@gmail.com>',
      messages: [{ from: '"Me" <me@gmail.com>' }],
      userEmails: [],
    });
    expect(result.primary).toBe("inbound");
    expect(result.isConversation).toBe(false);
  });
});
