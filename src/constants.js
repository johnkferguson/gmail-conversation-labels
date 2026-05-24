/**
 * Gmail Conversation Labels — shared constants.
 *
 * Apps Script trigger handler names. These MUST match the actual top-level
 * function names in main.js exactly, because `ScriptApp.newTrigger()` and
 * `ScriptApp.deleteTrigger()` look handlers up by string.
 */

const TRIGGER_HANDLER_MAIN = "main";
const TRIGGER_HANDLER_CLEANUP = "cleanupCache";
