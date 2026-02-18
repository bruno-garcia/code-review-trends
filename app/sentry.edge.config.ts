import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Edge runtime (middleware) is server-side — use the backend DSN.
  dsn: process.env.SENTRY_DSN_CRT_BACKEND,

  // Performance
  tracesSampleRate: 1.0,

  // Environment
  environment: process.env.NODE_ENV,

  // Release tracking
  release: process.env.NEXT_PUBLIC_COMMIT_SHA,
});
