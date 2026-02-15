import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,

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
