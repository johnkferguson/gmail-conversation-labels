/**
 * Gmail Conversation Labels — From-header address extractor.
 *
 * `extractEmailAddress(header)` returns the lowercase email address from a
 * raw `From:` header value. Used by the classifier so we exact-match the
 * sender's address rather than substring-matching the entire header (which
 * would false-fire on display names that happen to contain the user's
 * address, and on overlapping addresses like `notjohn@x.com` vs `john@x.com`).
 *
 * Handled shapes:
 *   - `addr@domain.com`
 *   - `Name <addr@domain.com>`
 *   - `"Quoted Name" <addr@domain.com>`
 *   - `Name <addr@domain.com> (comment)`
 *
 * Pure string extraction — no validation, no throwing. Malformed input
 * returns the trimmed-lowercased input as-is, so it harmlessly fails to match
 * any real configured address.
 *
 * @param {string} header
 * @returns {string}
 */
function extractEmailAddress(header) {
  const angleMatch = header.match(/<([^>]+)>/);
  if (angleMatch) return angleMatch[1].trim().toLowerCase();
  return header.trim().toLowerCase();
}
