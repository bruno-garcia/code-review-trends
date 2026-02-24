import * as Sentry from "@sentry/nextjs";

// SENTRY_ENVIRONMENT is a runtime env var set by Cloud Run (via Pulumi).
// Do NOT use NODE_ENV — Next.js inlines it to "production" at build time,
// making runtime overrides impossible. See AGENTS.md principle #20.
const environment = process.env.SENTRY_ENVIRONMENT;
if (!environment) {
  throw new Error(
    "SENTRY_ENVIRONMENT is required. Set it as an environment variable.\n" +
    "  Cloud Run: set via Pulumi config\n" +
    "  Local dev: add SENTRY_ENVIRONMENT=development to .env.local",
  );
}

Sentry.init({
  // Edge runtime (middleware) is server-side — use the backend DSN.
  dsn: process.env.SENTRY_DSN_CRT_BACKEND,

  // Performance
  tracesSampleRate: 1.0,

  // Environment — explicit, never derived from NODE_ENV
  environment,

  // Release tracking
  release: process.env.NEXT_PUBLIC_COMMIT_SHA,
});
