/**
 * Sentry initialization for the pipeline.
 *
 * Import this at the very top of the CLI entry point
 * so instrumentation is set up before any other imports.
 */

import * as Sentry from "@sentry/node";

const dsn = process.env.SENTRY_DSN_CRT_CLI ?? process.env.SENTRY_DSN;
const command = process.argv[2] ?? "unknown";
const clickhouseUrl = process.env.CLICKHOUSE_URL ?? "http://localhost:8123";

Sentry.init({
  dsn,

  // Only enable when DSN is explicitly provided
  enabled: !!dsn,

  tracesSampleRate: 1.0,

  environment: process.env.NODE_ENV ?? "development",

  // Tag every event with command + target database
  initialScope: {
    tags: {
      "pipeline.command": command,
      "clickhouse.url": clickhouseUrl,
    },
  },

  // Tag each transaction with the CLI command for easy filtering
  beforeSendTransaction(event) {
    if (command) {
      event.tags = { ...event.tags, "pipeline.command": command };
    }
    return event;
  },

  _experiments: {
    enableLogs: true,
  },
});

export { Sentry };
