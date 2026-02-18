import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn:
    process.env.NEXT_PUBLIC_SENTRY_DSN ||
    "https://d6db925f6f5fd03b889196aea9909d62@o117736.ingest.us.sentry.io/4510892245385216",

  tracesSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Public site with no user-entered data — no need to mask or block
      maskAllText: false,
      blockAllMedia: false,
    }),
    Sentry.feedbackIntegration({
      colorScheme: "dark",
      triggerLabel: "Feedback",
      formTitle: "Send Feedback",
      submitButtonLabel: "Send",
      successMessageText: "Thanks for your feedback!",
      isNameRequired: false,
      isEmailRequired: false,
    }),
    Sentry.browserTracingIntegration(),
  ],

  // Environment
  environment: process.env.NODE_ENV,

  // Release tracking — matches the commit SHA from next.config.ts
  release: process.env.NEXT_PUBLIC_COMMIT_SHA,
});

// Required by @sentry/nextjs to instrument client-side navigations
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
