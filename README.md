# Gmail Smart Labeller

A small Google Apps Script that auto-applies three labels to your Gmail threads:

- **Inbound** — first message was sent _to_ you
- **Outbound** — first message was sent _by_ you
- **Conversation** — both you and someone else have participated in the thread

It runs every few minutes as a Google Apps Script trigger inside your own account. Useful for filtering your inbox to "real conversations," archiving outbound-only threads, prioritizing replies, etc.

## Why this exists

Gmail's built-in filters can't easily express "this thread became a back-and-forth." Smart Labels in Gmail are opaque and not customizable. This script gives you three durable, filterable labels that your existing rules can chain off of.

## How it works

```
                ┌──────────────────────────────────┐
                │  Apps Script time-based trigger  │
                │      runs every N minutes        │
                └────────────────┬─────────────────┘
                                 ▼
        ┌──────────────────────────────────────────────┐
        │  GmailApp.search(newer_than:Xm  -labels…)    │
        │  → returns unlabeled threads from window     │
        └────────────────┬─────────────────────────────┘
                         ▼
        ┌─────────────────────────────────────────────┐
        │  For each thread:                           │
        │   • Skip if in cache and unchanged          │
        │   • Sample messages → classify              │
        │   • Queue label additions in batches        │
        │   • Queue cache update                      │
        └────────────────┬────────────────────────────┘
                         ▼
        ┌─────────────────────────────────────────────┐
        │  Flush: label.addToThreads(batch),          │
        │  PropertiesService.setProperties(cache)     │
        └─────────────────────────────────────────────┘
```

A daily 2 AM trigger prunes old cache entries so PropertiesService doesn't fill up.

## Privacy & security

This is the question to answer first if you're considering installing it.

- **No third-party servers.** The code runs as your own Apps Script project under your own Google account. Your mail, your script, your data — there's nowhere else for it to go.
- **You install it yourself** via `clasp push` against a script project you own. You can read every line of code before pushing.
- **No outbound network calls.** The script only uses Google's first-party APIs (Gmail, ScriptApp, PropertiesService, MailApp).
- **Minimal scopes.** The OAuth consent screen will ask for exactly these and nothing else:
  | Scope | Used for |
  |---|---|
  | `gmail.modify` | Read threads and apply labels |
  | `script.scriptapp` | Register the polling trigger |
  | `script.send_mail` | Send you an error email if a run fails |
  | `script.storage` | Cache "thread already processed" in your user properties |
- **What it does NOT do:** read message bodies (only `From:` headers), modify or delete messages, send mail to anyone but you (for errors), or share data with anyone.

To revoke access later: <https://myaccount.google.com/permissions> → find your script project → Remove access.

## Setup

You'll need:

- A Google account
- [Node](https://nodejs.org) (any recent version) — only for `clasp`, the CLI that pushes local code to Apps Script
- A clone of this repository

### 1. Enable the Apps Script API for your account

Visit <https://script.google.com/home/usersettings> and toggle **Google Apps Script API** to **ON**. This is what lets `clasp` talk to Apps Script from the command line.

### 2. Create the Apps Script project

```bash
npx @google/clasp login           # opens browser, authorizes clasp
npx @google/clasp create \
    --title "Gmail Smart Labeller" \
    --type standalone \
    --rootDir src
```

This creates a new standalone Apps Script project and writes `.clasp.json` with the project's script ID. `.clasp.json` is gitignored.

### 3. Configure for yourself

```bash
cp src/config.template.js src/config.js
$EDITOR src/config.js              # set userEmail at minimum
```

`src/config.js` is gitignored so your config never leaks into commits.

### 4. Push and run setup

```bash
npx @google/clasp push
npx @google/clasp open             # opens the script in the editor
```

In the Apps Script editor:

1. From the function dropdown, pick `setup` and click **Run**. The OAuth consent screen appears the first time — review the scopes (they should match the table above), then approve.
2. (Optional) Run `processHistorical` to label existing mail. It processes a batch on each call; rerun until the log says "Completed processing all existing threads."

That's it. New mail will start getting labeled within `intervalMinutes` of arrival.

## Configuration

`src/config.template.js` is the source of truth. Copy to `src/config.js` and edit. Fields:

| Field | Default | Description |
|---|---|---|
| `userEmail` | _placeholder_ | **Required.** Used as substring match against `From:` headers to decide inbound vs outbound. |
| `labels.{inbound,outbound,conversation}` | `Inbound`, `Outbound`, `Conversation` | Label names. Renaming after first run will create new labels alongside the old. |
| `polling.intervalMinutes` | `5` | Minutes between trigger runs. Apps Script's minimum is 1. |
| `polling.searchWindowMinutes` | `10` | Look back this far on each run. **Must be >= `intervalMinutes`** so a delayed/skipped run doesn't miss mail. |
| `polling.maxThreadsPerRun` | `50` | Per-run cap. Must be ≤ 100 (`label.addToThreads` limit). |
| `polling.timeoutMs` | `25000` | Stop processing the current batch after this many ms to stay under Apps Script's 6-minute runtime cap. |
| `debug.enableLogging` | `true` | Verbose logs to View → Logs in the editor. |
| `debug.sendErrorEmails` | `true` | Email yourself when a run throws. |
| `debug.errorEmailThrottleHours` | `1` | Min hours between error emails to prevent spam from a stuck error. |
| `caching.threadCacheKeyPrefix` | `thread_` | Key prefix in PropertiesService for the per-thread "already seen" cache. |
| `caching.maxCachedThreads` | `500` | Trigger cleanup when cache exceeds this. |
| `caching.threadCacheRetentionDays` | `30` | Cleanup drops entries older than this. |

`setup()` calls `validateConfig()` first and refuses to register triggers if anything is missing or out of range — you'll get a single multi-line error listing every problem.

## Editor-runnable functions

These show up in the function dropdown in the Apps Script editor:

| Function | What it does |
|---|---|
| `setup` | Validate config, create labels, register polling + cleanup triggers. Run once. |
| `main` | The trigger handler. You can run it manually to test. |
| `manualRun` | Alias for `main` for clarity in the dropdown. |
| `processHistorical` | Label existing unlabeled threads. Run repeatedly until done. |
| `cleanupCache` | Trigger handler for daily cache pruning. |
| `resetCache` | Wipe the thread cache. Every thread will be reprocessed on the next run. |

## Limitations

- **Polling, not push.** Apps Script doesn't support real push notifications for Gmail without a separate GCP project + Pub/Sub. Latency is bounded by `intervalMinutes`.
- **Quotas.** Apps Script has [daily quotas](https://developers.google.com/apps-script/guides/services/quotas) for Gmail reads, label operations, and trigger total runtime. A normal inbox is well under them; very large historical backfills may need multiple runs.
- **Substring email match.** `userEmail` is matched as a substring of the `From:` header. Aliases that contain your address work; addresses that _happen to contain_ your address as a substring will be misclassified. (Tested and documented in `test/classifier.test.js`.)
- **Cache size.** PropertiesService caps at ~500 KB total and ~9 KB per value. The script holds one small JSON record per processed thread; the default `maxCachedThreads: 500` keeps you comfortably under the cap.

## Development

```bash
bun install      # install dev deps (biome, vitest, clasp, @types/google-apps-script)
bun run lint     # biome check
bun run lint:fix # biome check --write
bun run format   # biome format --write
bun run test     # vitest run
bun run test:watch
bun run typecheck # tsc --noEmit (JSDoc-based type checking, no compile)
bun run push     # clasp push
```

The source under `src/` is Apps Script JS — top-level `function` and `const` declarations are global at runtime, so the files don't use `import` / `export`. Tests in `test/` load each source file into a Node `vm` context with mocked GAS globals (`GmailApp`, `PropertiesService`, etc.) so the same source runs unmodified under both runtimes.

Project layout:

```
src/
  appsscript.json     — Apps Script project config (scopes, runtime, timezone)
  config.template.js  — copy to config.js (gitignored) before pushing
  constants.js        — trigger handler names
  main.js             — GAS-callable entry points
  classifier.js       — pure classification logic
  processors.js       — search → classify → label batches
  cache.js            — per-thread "already processed" cache
  gmail-utils.js      — label/trigger/search helpers
  errors.js           — throttled error email
  retry.js            — exponential-backoff wrapper for transient Gmail errors
  validate-config.js  — config schema check

test/
  loader.js           — vm-based source loader
  mocks/              — fakes for GmailApp, PropertiesService, ScriptApp, etc.
  *.test.js           — vitest suites
```

## License

[MIT](LICENSE).
