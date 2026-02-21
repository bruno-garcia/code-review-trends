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

  // Filter out errors from browser extensions (not our code)
  ignoreErrors: [
    // Browser extension errors (1Password, Dashlane, etc.)
    /runtime\.sendMessage/i,
    /Invalid call to runtime\.sendMessage/i,
    // Extension-specific error messages
    /get-frame-manager-configuration/i,
    /shell-plugins-site-config/i,
    // Common extension patterns
    /chrome-extension/i,
    /moz-extension/i,
    /safari-extension/i,
  ],

  // Additional filtering for extension errors
  beforeSend(event, hint) {
    // Filter out errors from browser extension scripts
    const error = hint.originalException;
    
    if (error && typeof error === 'object') {
      const errorMessage = error.toString();
      
      // Check for browser extension error patterns
      if (
        errorMessage.includes('runtime.sendMessage') ||
        errorMessage.includes('get-frame-manager-configuration') ||
        errorMessage.includes('shell-plugins-site-config')
      ) {
        return null; // Don't send to Sentry
      }
    }

    // Check breadcrumbs for extension-related errors
    if (event.breadcrumbs) {
      const hasExtensionBreadcrumb = event.breadcrumbs.some((breadcrumb) => {
        const message = breadcrumb.message || '';
        return (
          message.includes('get-frame-manager-configuration') ||
          message.includes('shell-plugins-site-config')
        );
      });

      if (hasExtensionBreadcrumb) {
        return null; // Don't send to Sentry
      }
    }

    // Check exception messages
    if (event.exception?.values) {
      const hasExtensionError = event.exception.values.some((exception) => {
        const value = exception.value || '';
        return (
          value.includes('runtime.sendMessage') ||
          value.includes('Tab not found')
        );
      });

      if (hasExtensionError) {
        return null; // Don't send to Sentry
      }
    }

    return event;
  },
});

// Required by @sentry/nextjs to instrument client-side navigations
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
