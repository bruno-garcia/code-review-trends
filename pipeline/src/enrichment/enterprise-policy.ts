/**
 * Detect and report GitHub enterprise policy 403 errors.
 *
 * Some GitHub enterprises restrict API access based on token type or lifetime.
 * For example, an org with SAML SSO may require fine-grained PATs to have a
 * lifetime ≤ 366 days. These show up as 403s with a message like:
 *   "The 'Sentry' enterprise forbids access via a fine-grained personal
 *    access tokens if the token's lifetime is greater than 366 days."
 *
 * We capture these as a single Sentry issue (via fixed fingerprint) with
 * the org slug as a tag, so all affected orgs are visible in one place.
 */

import { Sentry } from "../sentry.js";

/**
 * Check if a 403 error is caused by an enterprise token policy.
 * If so, logs to console and captures a Sentry event.
 *
 * @param repoName - Full "owner/repo" string
 * @returns true if this was an enterprise policy 403
 */
export function handleEnterprisePolicyError(
  err: unknown,
  repoName: string,
  context: string,
): boolean {
  const message = (err as { response?: { data?: { message?: string } } })
    .response?.data?.message;

  if (!message || !message.includes("enterprise forbids access")) {
    return false;
  }

  const owner = repoName.split("/")[0] ?? "unknown";

  // Extract enterprise name from: "The 'Sentry' enterprise forbids..."
  const enterpriseMatch = message.match(/The '([^']+)' enterprise/);
  const enterprise = enterpriseMatch?.[1] ?? "unknown";

  console.warn(
    `[${context}] Enterprise policy 403 for "${repoName}" (enterprise: ${enterprise}): ${message}`,
  );

  Sentry.captureMessage("GitHub enterprise policy blocked API access", {
    level: "warning",
    fingerprint: ["github-enterprise-policy-403"],
    tags: {
      owner,
      repo: repoName,
      "github.enterprise": enterprise,
    },
  });

  return true;
}
