/**
 * GitHub API utilities for enrichment data.
 */

// ── Token identity ─────────────────────────────────────────────────────

export type GitHubTokenInfo = {
  login: string;
  /** Token expiry date, or null if the token never expires. */
  expiry: Date | null;
};

/**
 * Resolve the authenticated user and token expiry from a GitHub PAT.
 *
 * Calls `GET /user` — a single lightweight API request that counts against
 * the token's rate limit but does NOT consume a GraphQL point.
 *
 * Fine-grained PATs return a `github-authentication-token-expiration` header,
 * classic PATs return `github-token-expiration`. Both use the format
 * "2025-03-15 00:00:00 UTC" (or with a timezone offset like "-0500").
 * Tokens without expiry omit the header entirely.
 */
export async function resolveGitHubTokenInfo(token: string): Promise<GitHubTokenInfo> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  let res: Response;
  try {
    res = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    throw new Error(`GitHub GET /user failed: ${res.status} ${res.statusText}`);
  }

  const data = (await res.json()) as { login: string };

  // Parse token expiration from response header (if present).
  // GitHub uses two different header names depending on token type:
  //   - "github-authentication-token-expiration" (fine-grained PATs)
  //   - "github-token-expiration" (classic PATs)
  // Format: "2025-03-15 00:00:00 UTC" or "2025-03-15 00:00:00 -0500"
  const expiryHeader =
    res.headers.get("github-authentication-token-expiration") ??
    res.headers.get("github-token-expiration");
  const expiry = expiryHeader ? new Date(expiryHeader) : null;

  return { login: data.login, expiry };
}

// ── Reactions ──────────────────────────────────────────────────────────

export type ReviewCommentReactions = {
  thumbs_up: number;
  thumbs_down: number;
  laugh: number;
  confused: number;
  heart: number;
  hooray: number;
  eyes: number;
  rocket: number;
};

/**
 * Extract reaction counts from a GitHub API response object.
 *
 * GitHub returns reactions inline on PRs (via pulls.get) and comments,
 * but Octokit's types for the pulls endpoint don't include them.
 * This helper safely extracts the counts with a single type assertion,
 * avoiding duplication across enrichment code and tests.
 */
export function extractReactionCounts(
  data: unknown,
): ReviewCommentReactions {
  const r = (data as { reactions?: Record<string, number> }).reactions;
  return {
    thumbs_up: r?.["+1"] ?? 0,
    thumbs_down: r?.["-1"] ?? 0,
    laugh: r?.laugh ?? 0,
    confused: r?.confused ?? 0,
    heart: r?.heart ?? 0,
    hooray: r?.hooray ?? 0,
    eyes: r?.eyes ?? 0,
    rocket: r?.rocket ?? 0,
  };
}
