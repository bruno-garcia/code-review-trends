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

  // Filter out errors from browser extensions (not our code).
  // `ignoreErrors` drops events whose error message matches these patterns.
  ignoreErrors: [
    // WebExtension API errors (1Password, Dashlane, etc.)
    /runtime\.sendMessage/i,
    // 1Password-specific messages
    /get-frame-manager-configuration/i,
    /shell-plugins-site-config/i,
  ],

  // Drop errors whose top stack frame originates from an extension script.
  // Unlike breadcrumb-based filtering, this only looks at where the error
  // was thrown — a legitimate site error won't be dropped just because the
  // user has an extension installed.
  denyUrls: [
    /^chrome-extension:\/\//,
    /^moz-extension:\/\//,
    /^safari-extension:\/\//,
    /^safari-web-extension:\/\//,
  ],
});

// Required by @sentry/nextjs to instrument client-side navigations
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
