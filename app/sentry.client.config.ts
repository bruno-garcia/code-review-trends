import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://da57fb3ae8cfa9b22b369cf6cc16e6f7@o117736.ingest.us.sentry.io/4510892245385216",

  tracesSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Mask all text and block all media by default for privacy
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
