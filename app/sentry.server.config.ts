import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Backend DSN — private, injected at runtime via Secret Manager.
  // Separate from the frontend DSN so it can be rotated independently.
  dsn: process.env.SENTRY_DSN,

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
