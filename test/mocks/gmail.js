/**
 * Minimal mocks for the bits of GmailApp / GmailThread / GmailMessage / GmailLabel
 * the code under test actually calls. Test inspection hooks (e.g. `_added`) are
 * prefixed with underscore.
 */

/**
 * @typedef {{ getFrom: () => string }} MockMessage
 * @typedef {{ getName: () => string, addToThreads: (t: object[]) => void, _added: object[] }} MockLabel
 */

/**
 * @param {{ from?: string }} [opts]
 * @returns {MockMessage}
 */
export function makeMessage(opts = {}) {
  const from = opts.from ?? "x@example.com";
  return {
    getFrom: () => from,
  };
}

/**
 * @param {{ id?: string, lastMessageDate?: Date, messages?: MockMessage[], labels?: string[] }} [opts]
 */
export function makeThread(opts = {}) {
  const id = opts.id ?? `t-${Math.random().toString(36).slice(2, 9)}`;
  const lastMessageDate = opts.lastMessageDate ?? new Date("2026-01-01T00:00:00Z");
  const messages = opts.messages ?? [];
  const labels = opts.labels ?? [];
  return {
    getId: () => id,
    getLastMessageDate: () => lastMessageDate,
    getMessages: () => messages,
    getMessageCount: () => messages.length,
    getLabels: () => labels.map((name) => ({ getName: () => name })),
  };
}

/**
 * @param {string} name
 * @returns {MockLabel}
 */
export function makeLabel(name) {
  /** @type {object[]} */
  const added = [];
  return {
    getName: () => name,
    addToThreads: (threads) => {
      added.push(...threads);
    },
    _added: added,
  };
}

/**
 * Build a GmailApp stub. Pass per-test overrides for search results, label
 * lookups, etc.
 *
 * @param {{ searchResults?: object[], userLabels?: Record<string, object> }} [opts]
 */
export function makeGmailApp(opts = {}) {
  const searchResults = opts.searchResults ?? [];
  const userLabels = opts.userLabels ?? {};
  /** @type {Map<string, object>} */
  const labelStore = new Map(Object.entries(userLabels));
  /** @type {string[]} */
  const created = [];
  return {
    search: () => searchResults,
    getUserLabelByName: (name) => labelStore.get(name) ?? null,
    createLabel: (name) => {
      const label = makeLabel(name);
      labelStore.set(name, label);
      created.push(name);
      return label;
    },
    _labelStore: labelStore,
    _created: created,
  };
}
