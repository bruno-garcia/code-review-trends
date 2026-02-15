import type { NextConfig } from "next";
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
  // Enables built-in deployment skew protection: Next.js bakes this into
  // the client bundle and sends it as x-deployment-id on RSC navigations.
  // If the server's ID differs, the client hard-reloads automatically.
  deploymentId: commitSha,

  // Expose the SHA to client components for the version stamp
  env: {
    NEXT_PUBLIC_COMMIT_SHA: commitSha,
  },
};

export default nextConfig;
