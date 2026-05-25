import { describe, expect, it } from "vitest";
import { loadScripts } from "./loader.js";

function load(config) {
  return loadScripts(["src/user-emails.js"], { CONFIG: config });
}

describe("getUserEmails — preferred array shape", () => {
  it("returns the userEmails array when set", () => {
    const ctx = load({ userEmails: ["a@example.com", "b@example.com"] });
    expect(ctx.getUserEmails()).toEqual(["a@example.com", "b@example.com"]);
  });

  it("returns a single-element array when userEmails has one entry", () => {
    const ctx = load({ userEmails: ["only@example.com"] });
    expect(ctx.getUserEmails()).toEqual(["only@example.com"]);
  });

  it("array form takes precedence over legacy userEmail when both are set", () => {
    const ctx = load({
      userEmails: ["new@example.com"],
      userEmail: "legacy@example.com",
    });
    expect(ctx.getUserEmails()).toEqual(["new@example.com"]);
  });
});

describe("getUserEmails — legacy string shape", () => {
  it("wraps a legacy userEmail string in a one-element array", () => {
    const ctx = load({ userEmail: "legacy@example.com" });
    expect(ctx.getUserEmails()).toEqual(["legacy@example.com"]);
  });
});

describe("getUserEmails — degenerate inputs", () => {
  it("returns [] when neither field is set", () => {
    const ctx = load({});
    expect(ctx.getUserEmails()).toEqual([]);
  });

  it("returns [] when userEmails is an empty array and userEmail is unset", () => {
    const ctx = load({ userEmails: [] });
    expect(ctx.getUserEmails()).toEqual([]);
  });

  it("falls back to legacy userEmail when userEmails is an empty array", () => {
    const ctx = load({ userEmails: [], userEmail: "legacy@example.com" });
    expect(ctx.getUserEmails()).toEqual(["legacy@example.com"]);
  });

  it("returns [] when userEmail is an empty string", () => {
    const ctx = load({ userEmail: "" });
    expect(ctx.getUserEmails()).toEqual([]);
  });

  it("ignores non-array userEmails values", () => {
    const ctx = load({ userEmails: "not-an-array" });
    expect(ctx.getUserEmails()).toEqual([]);
  });
});
