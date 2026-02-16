import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";
import { execSync } from "child_process";

function getGitCommitSha(): string {
  // Vercel provides this at build time
  if (process.env.VERCEL_GIT_COMMIT_SHA) {
    return process.env.VERCEL_GIT_COMMIT_SHA;
  }
  // Fallback for local dev / CI builds
  try {
    return execSync("git rev-parse HEAD").toString().trim();
  } catch {
    return "unknown";
  }
}

const commitSha = getGitCommitSha();

const nextConfig: NextConfig = {
  // On Vercel, deployment skew protection is handled automatically — Vercel
  // injects NEXT_DEPLOYMENT_ID. Setting deploymentId here would conflict.
  // Only set it for non-Vercel builds (local dev, self-hosted).
  ...(process.env.VERCEL ? {} : { deploymentId: commitSha }),

  // Expose the SHA to client components for the version stamp
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha,
  },
};

export default withSentryConfig(nextConfig, {
  // Org & project for source map uploads
  org: "bruno-garcia",
  project: "code-review-trends",

  // Upload source maps for proper stack traces
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },

  // Use SENTRY_AUTH_TOKEN env var for CI/Vercel builds
  // Silently skip upload when token is missing (local dev)
  silent: !process.env.CI,

  // Tunnel Sentry events through Next.js to avoid ad blockers
  tunnelRoute: "/monitoring",

  // Associate commits and deploys with releases
  release: {
    name: commitSha,
  },

  // Widen server-side bundles for better stack traces
  widenClientFileUpload: true,

  // Webpack-specific options (not supported with Turbopack)
  webpack: {
    // Tree-shake Sentry debug logger in production
    treeshake: {
      removeDebugLogging: true,
    },
    // React component annotations for better error grouping
    reactComponentAnnotation: {
      enabled: true,
    },
  },
});
