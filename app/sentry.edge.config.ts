import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://da57fb3ae8cfa9b22b369cf6cc16e6f7@o117736.ingest.us.sentry.io/4510892245385216",

  // Performance
  tracesSampleRate: 1.0,

  // Environment
  environment: process.env.NODE_ENV,

  // Release tracking
  release: process.env.NEXT_PUBLIC_COMMIT_SHA,
});
