/**
 * GitHub API utilities for enrichment data.
 */

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
