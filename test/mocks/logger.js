export function makeLogger() {
  /** @type {string[]} */
  const logs = [];
  return {
    log: (msg) => {
      logs.push(String(msg));
    },
    _logs: logs,
  };
}
