import * as Sentry from "@sentry/nextjs";

Sentry.init({
  // Frontend DSN — baked into the client bundle at build time.
  // Set via SENTRY_DSN_CRT_FRONTEND build arg (see Dockerfile / CI).
  // Exposed to client code via next.config.ts `env` key.
  // Intentionally separate from the server-side DSN so the backend
  // DSN can be rotated independently if the public one is abused.
  dsn: process.env.SENTRY_DSN_CRT_FRONTEND,

  tracesSampleRate: 1.0,
  replaysOnErrorSampleRate: 1.0,

  integrations: [
    Sentry.replayIntegration({
      // Public site with no user-entered data — no need to mask or block
      maskAllText: false,
      blockAllMedia: false,
    }),
    Sentry.feedbackIntegration({
      // Use "system" so the widget reads prefers-color-scheme by default;
      // CSS overrides on #sentry-feedback (in globals.css) bind it to the
      // app's .dark class so it follows the theme toggle, not the OS.
      colorScheme: "system",
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
