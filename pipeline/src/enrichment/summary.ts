/**
 * Helpers for summarizing enrichment work items in logs.
 *
 * Gives operators a quick sense of what a run is processing
 * so they can tell runs apart and spot unexpected patterns.
 */

/**
 * Summarize repo names by org. Returns a string like:
 *   "42 orgs: vercel (18), facebook (12), google (8), … +21 more"
 */
export function summarizeOrgs(repoNames: string[], maxShown: number = 5): string {
  const orgCounts = new Map<string, number>();
  for (const name of repoNames) {
    const org = name.split("/")[0] ?? name;
    orgCounts.set(org, (orgCounts.get(org) ?? 0) + 1);
  }

  // Sort by count descending
  const sorted = [...orgCounts.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.length;
  const shown = sorted.slice(0, maxShown);
  const shownStr = shown.map(([org, count]) => `${org} (${count})`).join(", ");
  const remaining = total - shown.length;

  if (remaining > 0) {
    return `${total} orgs: ${shownStr}, … +${remaining} more`;
  }
  return `${total} orgs: ${shownStr}`;
}

/**
 * Summarize a set of repo/PR combos by repo. Returns a string like:
 *   "85 repos: vercel/next.js (12 PRs), facebook/react (8 PRs), … +83 more"
 */
export function summarizeRepos(items: { repo_name: string }[], maxShown: number = 5): string {
  const repoCounts = new Map<string, number>();
  for (const { repo_name } of items) {
    repoCounts.set(repo_name, (repoCounts.get(repo_name) ?? 0) + 1);
  }

  const sorted = [...repoCounts.entries()].sort((a, b) => b[1] - a[1]);
  const total = sorted.length;
  const shown = sorted.slice(0, maxShown);
  const shownStr = shown.map(([repo, count]) => count > 1 ? `${repo} (${count})` : repo).join(", ");
  const remaining = total - shown.length;

  if (remaining > 0) {
    return `${total} repos: ${shownStr}, … +${remaining} more`;
  }
  return `${total} repos: ${shownStr}`;
}
