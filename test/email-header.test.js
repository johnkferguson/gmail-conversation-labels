import { describe, expect, it } from "vitest";
import { loadScripts } from "./loader.js";

const { extractEmailAddress } = loadScripts(["src/email-header.js"]);

describe("extractEmailAddress — standard formats", () => {
  it("returns a bare address as-is (lowercased)", () => {
    expect(extractEmailAddress("john@example.com")).toBe("john@example.com");
  });

  it("extracts from Name <addr>", () => {
    expect(extractEmailAddress("John K. <john@example.com>")).toBe("john@example.com");
  });

  it('extracts from "Quoted Name" <addr>', () => {
    expect(extractEmailAddress('"John K. Ferguson" <john@example.com>')).toBe("john@example.com");
  });

  it("extracts when a comment follows the angle pair", () => {
    expect(extractEmailAddress("John <john@example.com> (work)")).toBe("john@example.com");
  });
});

describe("extractEmailAddress — case", () => {
  it("lowercases the address portion", () => {
    expect(extractEmailAddress("John <John@Example.COM>")).toBe("john@example.com");
  });

  it("lowercases a bare address", () => {
    expect(extractEmailAddress("MIXED@Example.com")).toBe("mixed@example.com");
  });
});

describe("extractEmailAddress — whitespace", () => {
  it("trims leading/trailing whitespace around a bare address", () => {
    expect(extractEmailAddress("  john@example.com  ")).toBe("john@example.com");
  });

  it("trims whitespace inside angle brackets", () => {
    expect(extractEmailAddress("John < john@example.com >")).toBe("john@example.com");
  });
});

describe("extractEmailAddress — malformed input", () => {
  it("returns the trimmed input when there are no angle brackets and no @", () => {
    // Not a valid address, but we don't throw — the result simply won't match
    // any real userEmails entry, which is the safe behavior.
    expect(extractEmailAddress("undisclosed-recipients:;")).toBe("undisclosed-recipients:;");
  });

  it("returns the input when angles are unmatched", () => {
    expect(extractEmailAddress("Broken <john@example.com")).toBe("broken <john@example.com");
  });

  it("returns an empty string for an empty header", () => {
    expect(extractEmailAddress("")).toBe("");
  });
});
