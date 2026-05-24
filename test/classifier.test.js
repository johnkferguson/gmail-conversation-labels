import { describe, expect, it } from "vitest";
import { loadScripts } from "./loader.js";

const { classifyThread } = loadScripts(["src/classifier.js"]);

const me = "me@example.com";
const meHeader = '"Me" <me@example.com>';
const friendHeader = '"Friend" <friend@example.com>';

describe("classifyThread — primary direction", () => {
  it("outbound when first message is from the user", () => {
    const result = classifyThread({
      firstSender: meHeader,
      messages: [{ from: meHeader }],
      userEmail: me,
    });
    expect(result.primary).toBe("outbound");
  });

  it("inbound when first message is from someone else", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }],
      userEmail: me,
    });
    expect(result.primary).toBe("inbound");
  });

  it("respects an existing outbound label even if the first sender looks inbound", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }],
      userEmail: me,
      existingLabels: { outbound: true },
    });
    expect(result.primary).toBe("outbound");
  });

  it("respects an existing inbound label even if the first sender looks outbound", () => {
    const result = classifyThread({
      firstSender: meHeader,
      messages: [{ from: meHeader }],
      userEmail: me,
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
      userEmail: me,
    });
    expect(result.isConversation).toBe(false);
  });

  it("true when both parties participated", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }, { from: meHeader }],
      userEmail: me,
    });
    expect(result.isConversation).toBe(true);
  });

  it("false when only the user sent multiple messages with no reply yet", () => {
    const result = classifyThread({
      firstSender: meHeader,
      messages: [{ from: meHeader }, { from: meHeader }],
      userEmail: me,
    });
    expect(result.isConversation).toBe(false);
  });

  it("false when only an external sender sent multiple messages with no user reply", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }, { from: friendHeader }],
      userEmail: me,
    });
    expect(result.isConversation).toBe(false);
  });

  it("inbound thread becomes a conversation once the user replies", () => {
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }, { from: friendHeader }, { from: meHeader }],
      userEmail: me,
      existingLabels: { inbound: true },
    });
    expect(result.isConversation).toBe(true);
  });

  it("outbound thread becomes a conversation once an external reply arrives", () => {
    const result = classifyThread({
      firstSender: meHeader,
      messages: [{ from: meHeader }, { from: meHeader }, { from: friendHeader }],
      userEmail: me,
      existingLabels: { outbound: true },
    });
    expect(result.isConversation).toBe(true);
  });

  it("preserves an existing conversation label even for a one-message sample", () => {
    const result = classifyThread({
      firstSender: meHeader,
      messages: [{ from: meHeader }],
      userEmail: me,
      existingLabels: { conversation: true },
    });
    expect(result.isConversation).toBe(true);
  });

  it("inbound + sampled-only-self does NOT spuriously fire conversation", () => {
    // existingLabels.inbound = true and last message is the friend's = no reversal,
    // and only one party participated = not a conversation.
    const result = classifyThread({
      firstSender: friendHeader,
      messages: [{ from: friendHeader }, { from: friendHeader }],
      userEmail: me,
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
      userEmail: "john@example.com",
    });
    expect(result.primary).toBe("outbound");
  });

  it("uses substring matching — this is a known limitation worth documenting", () => {
    // 'not-john@example.com' contains 'john@example.com' as a substring, so
    // the current implementation treats it as the user. If we ever switch to
    // strict address parsing, this assertion flips.
    const result = classifyThread({
      firstSender: '"Spam" <not-john@example.com>',
      messages: [{ from: '"Spam" <not-john@example.com>' }],
      userEmail: "john@example.com",
    });
    expect(result.primary).toBe("outbound");
  });
});
