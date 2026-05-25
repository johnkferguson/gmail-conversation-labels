/**
 * Gmail Conversation Labels — user identity helper.
 *
 * The classifier needs to know which addresses count as "me" so it can decide
 * inbound vs outbound. Config accepts two shapes:
 *
 *   - `userEmails: string[]`  (preferred) — list of every identity you send
 *     from: gmail alias, custom domain, Workspace address, "send mail as"
 *     identity, etc.
 *   - `userEmail: string`     (legacy)    — single address; still accepted.
 *
 * `getUserEmails()` is the one place that branches on shape. Every caller
 * (validator, classifier wiring, error-email recipient) goes through it so the
 * legacy fallback lives in exactly one spot.
 *
 * @returns {string[]} Normalized list. May be empty if the config is invalid;
 *   `validateConfig()` is the surface that rejects empty lists at setup time.
 */
function getUserEmails() {
  // Cast: the template declares userEmails but we also accept the legacy
  // userEmail field at runtime; tsc only sees the template-declared shape.
  /** @type {any} */
  const raw = CONFIG;
  if (Array.isArray(raw.userEmails) && raw.userEmails.length > 0) {
    return raw.userEmails;
  }
  if (typeof raw.userEmail === "string" && raw.userEmail.length > 0) {
    return [raw.userEmail];
  }
  return [];
}
