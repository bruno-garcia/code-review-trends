/**
 * GitHub API client for enrichment data.
 *
 * Used to fetch data not available in GH Archive:
 * - Reactions on review comments (👍👎❤️)
 * - Review body text
 * - Detailed PR metadata
 *
 * Rate limit: 5,000 requests/hour with a token.
 * We target specific repos (known to use bots) rather than broad scans.
 */

import { Octokit } from "@octokit/rest";

export function createGitHubClient(token?: string): Octokit {
  return new Octokit({
    auth: token ?? process.env.GITHUB_TOKEN,
  });
}

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
 * Fetch reactions on review comments by a specific bot in a repo.
 *
 * This is the primary enrichment we do from the GitHub API.
 * GH Archive doesn't include reactions.
 *
 * @param owner - Repo owner
 * @param repo - Repo name
 * @param botLogin - GitHub bot login (e.g. "coderabbitai[bot]")
 * @param since - ISO date string to fetch comments since
 */
export async function fetchBotReviewCommentReactions(
  octokit: Octokit,
  owner: string,
  repo: string,
  botLogin: string,
  since?: string,
): Promise<{
  reactions: ReviewCommentReactions;
  commentCount: number;
}> {
  const totals: ReviewCommentReactions = {
    thumbs_up: 0,
    thumbs_down: 0,
    laugh: 0,
    confused: 0,
    heart: 0,
    hooray: 0,
    eyes: 0,
    rocket: 0,
  };
  let commentCount = 0;

  // Paginate through review comments
  const iterator = octokit.paginate.iterator(
    octokit.rest.pulls.listReviewCommentsForRepo,
    {
      owner,
      repo,
      sort: "created",
      direction: "desc",
      since,
      per_page: 100,
    },
  );

  for await (const { data: comments } of iterator) {
    for (const comment of comments) {
      if (comment.user?.login !== botLogin) continue;

      commentCount++;

      // Reactions are included inline when available
      if (comment.reactions) {
        const r = comment.reactions;
        totals.thumbs_up += r["+1"] ?? 0;
        totals.thumbs_down += r["-1"] ?? 0;
        totals.laugh += r.laugh ?? 0;
        totals.confused += r.confused ?? 0;
        totals.heart += r.heart ?? 0;
        totals.hooray += r.hooray ?? 0;
        totals.eyes += r.eyes ?? 0;
        totals.rocket += r.rocket ?? 0;
      }
    }

    // Stop if we've gone past our `since` date (comments are desc sorted)
    if (since && comments.length > 0) {
      const last = comments[comments.length - 1];
      if (last.created_at && last.created_at < since) break;
    }
  }

  return { reactions: totals, commentCount };
}

/**
 * List repos where a bot has recent review activity.
 *
 * Uses the GitHub search API to find repos with review comments from a bot.
 * Limited to ~30 requests/minute for search API.
 */
export async function findBotActiveRepos(
  octokit: Octokit,
  botLogin: string,
  maxResults = 50,
): Promise<{ owner: string; repo: string; stars: number }[]> {
  // Search for review comments by the bot
  // Note: GitHub search can't filter by comment author directly,
  // so we search for the bot's username in commenter:login
  const results: { owner: string; repo: string; stars: number }[] = [];

  try {
    const response = await octokit.rest.search.issuesAndPullRequests({
      q: `is:pr commenter:${botLogin} sort:updated`,
      per_page: Math.min(maxResults, 100),
    });

    const seenRepos = new Set<string>();
    for (const item of response.data.items) {
      const repoUrl = item.repository_url;
      // Extract owner/repo from URL like https://api.github.com/repos/owner/repo
      const match = repoUrl.match(/\/repos\/([^/]+)\/([^/]+)$/);
      if (!match) continue;

      const key = `${match[1]}/${match[2]}`;
      if (seenRepos.has(key)) continue;
      seenRepos.add(key);

      results.push({
        owner: match[1],
        repo: match[2],
        stars: 0, // Would need a separate API call to get stars
      });
    }
  } catch (err) {
    // Search API is rate-limited separately; log and continue
    console.error(
      `Search API error for ${botLogin}:`,
      err instanceof Error ? err.message : err,
    );
  }

  return results;
}

/**
 * Get rate limit status.
 * Useful for checking how many requests we have left before running a job.
 */
export async function getRateLimit(octokit: Octokit): Promise<{
  core: { remaining: number; limit: number; reset: Date };
  search: { remaining: number; limit: number; reset: Date };
}> {
  const { data } = await octokit.rest.rateLimit.get();
  return {
    core: {
      remaining: data.resources.core.remaining,
      limit: data.resources.core.limit,
      reset: new Date(data.resources.core.reset * 1000),
    },
    search: {
      remaining: data.resources.search.remaining,
      limit: data.resources.search.limit,
      reset: new Date(data.resources.search.reset * 1000),
    },
  };
}
