/**
 * Mock for ScriptApp — captures trigger creation/deletion so tests can
 * assert on what was registered.
 */

/**
 * @param {{ existingTriggers?: string[] }} [opts]
 */
export function makeScriptApp(opts = {}) {
  const existingTriggers = opts.existingTriggers ?? [];
  /** @type {{handler: string, type: string, opts: object}[]} */
  const created = [];
  /** @type {string[]} */
  const deleted = [];

  const triggers = existingTriggers.map((handler) => ({
    getHandlerFunction: () => handler,
    _handler: handler,
  }));

  return {
    getProjectTriggers: () => triggers,
    deleteTrigger: (trigger) => {
      deleted.push(trigger._handler ?? trigger.getHandlerFunction());
      const idx = triggers.indexOf(trigger);
      if (idx !== -1) triggers.splice(idx, 1);
    },
    newTrigger: (handler) => {
      const builder = {
        timeBased: () => builder,
        everyMinutes: (n) => {
          builder._opts = { everyMinutes: n };
          return builder;
        },
        everyDays: (n) => {
          builder._opts = { ...builder._opts, everyDays: n };
          return builder;
        },
        atHour: (h) => {
          builder._opts = { ...builder._opts, atHour: h };
          return builder;
        },
        create: () => {
          created.push({ handler, type: "time", opts: builder._opts ?? {} });
          return { getHandlerFunction: () => handler };
        },
        _opts: {},
      };
      return builder;
    },
    _created: created,
    _deleted: deleted,
  };
}
