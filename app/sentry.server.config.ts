import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn:
    process.env.SENTRY_DSN ||
    "https://d6db925f6f5fd03b889196aea9909d62@o117736.ingest.us.sentry.io/4510892245385216",

  // Performance — sample 100% of traces
  tracesSampleRate: 1.0,

  // Environment
  environment: process.env.NODE_ENV,

  // Release tracking
  release: process.env.NEXT_PUBLIC_COMMIT_SHA,

  // Spotlight for local dev (Sentry dev toolbar)
  spotlight: process.env.NODE_ENV === "development",

  // Logs
  _experiments: {
    enableLogs: true,
  },
});
