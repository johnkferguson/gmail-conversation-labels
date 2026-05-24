/**
 * vm-based loader for the Apps Script source files.
 *
 * The source under src/ relies on Apps Script globals (GmailApp, Logger,
 * PropertiesService, ...) being injected by the runtime. To test under Node,
 * we evaluate each file in a `vm` context populated with mocks.
 *
 * Top-level `function` declarations land on the context automatically (vm's
 * standard behavior), but top-level `const`/`let` declarations do NOT — they
 * are scoped to the script. Pass their names in `exposeNames` and the loader
 * will append capture statements so they become readable as properties of the
 * returned context.
 */

import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * @param {string[]} relativePaths - Paths relative to the repo root, e.g. ["src/cache.js"].
 * @param {Record<string, unknown>} [mocks] - Injected globals (GmailApp, CONFIG, ...).
 * @param {string[]} [exposeNames] - Names of top-level const/let bindings to copy onto the context.
 * @returns {vm.Context & Record<string, unknown>}
 */
export function loadScripts(relativePaths, mocks = {}, exposeNames = []) {
  const context = vm.createContext({
    console,
    ...mocks,
  });

  const parts = relativePaths.map((relPath) => readFileSync(resolve(repoRoot, relPath), "utf-8"));

  // Capture suffix runs in the same script as the source, so its top-level
  // const/let declarations are in scope when we copy them onto globalThis.
  const captureSuffix =
    exposeNames.length > 0
      ? `\n${exposeNames
          .map((name) => `try { globalThis[${JSON.stringify(name)}] = ${name}; } catch (_) {}`)
          .join("\n")}`
      : "";

  const combined = `${parts.join("\n")}${captureSuffix}`;
  vm.runInContext(combined, context, { filename: relativePaths.join(",") });
  return context;
}
