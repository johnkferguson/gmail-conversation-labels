/**
 * In-memory mock for PropertiesService.getUserProperties().
 */

export function makePropertiesService() {
  /** @type {Map<string, string>} */
  const store = new Map();
  const userProps = {
    getProperty: (key) => (store.has(key) ? store.get(key) : null),
    setProperty: (key, value) => {
      store.set(key, value);
    },
    setProperties: (entries) => {
      for (const [k, v] of Object.entries(entries)) store.set(k, v);
    },
    getProperties: () => Object.fromEntries(store),
    deleteProperty: (key) => {
      store.delete(key);
    },
    deleteAllProperties: () => {
      store.clear();
    },
  };
  return {
    getUserProperties: () => userProps,
    _store: store,
  };
}
