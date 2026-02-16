#!/usr/bin/env tsx
/**
 * Discover bot accounts doing code reviews on GitHub.
 *
 * Two discovery strategies:
 *
 * 1. **BigQuery [bot] scan** — queries GH Archive for accounts ending in [bot]
 *    that produce PullRequestReviewEvent or PullRequestReviewCommentEvent.
 *
 * 2. **GitHub Marketplace scan** — scrapes the GitHub Marketplace for AI code
 *    review apps, resolves their bot logins via the GitHub API, then checks
 *    BigQuery for review activity (catches accounts without [bot] suffix,
 *    e.g. GitHub Copilot).
 *
 * Usage:
 *   npm run discover-bots                          # last 30 days, both strategies
 *   npm run discover-bots -- --start 2025-01-01    # custom date range
 *   npm run discover-bots -- --marketplace-only    # skip BigQuery [bot] scan
 *   npm run discover-bots -- --bigquery-only       # skip marketplace scan
 *
 * Requires GCP_PROJECT_ID environment variable and BigQuery access (unless --marketplace-only).
 */

import { BigQuery } from "@google-cloud/bigquery";
import {
  createBigQueryClient,
  discoverBotReviewers,
  queryReviewActivityByLogins,
} from "../bigquery.js";
import { BOT_LOGINS } from "../bots.js";

// ---------------------------------------------------------------------------
// Marketplace scraping
// ---------------------------------------------------------------------------

/** Search queries and categories to scan on GitHub Marketplace */
const MARKETPLACE_SEARCHES = [
  "https://github.com/marketplace?type=apps&query=ai+code+review",
  "https://github.com/marketplace?type=apps&query=code+review+bot",
  "https://github.com/marketplace?type=apps&query=ai+pull+request+review",
  "https://github.com/marketplace?type=apps&category=code-review",
  "https://github.com/marketplace?type=apps&category=ai-assisted",
];

/** Extract marketplace app slugs from an HTML page */
function extractMarketplaceSlugs(html: string): string[] {
  const matches = html.matchAll(/href="\/marketplace\/([a-z0-9][a-z0-9-]*)"/g);
  const slugs = new Set<string>();
  for (const m of matches) {
    const slug = m[1];
    // Filter out navigation links that aren't actual apps
    if (!["models", "new"].includes(slug)) {
      slugs.add(slug);
    }
  }
  return [...slugs];
}

/** Scrape GitHub Marketplace search results for app slugs */
async function scrapeMarketplaceSlugs(): Promise<string[]> {
  const allSlugs = new Set<string>();

  for (const url of MARKETPLACE_SEARCHES) {
    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": "code-review-trends-bot-discovery/1.0",
          Accept: "text/html",
        },
      });
      if (!res.ok) {
        console.warn(`  ⚠ Failed to fetch ${url}: ${res.status}`);
        continue;
      }
      const html = await res.text();
      const slugs = extractMarketplaceSlugs(html);
      for (const s of slugs) allSlugs.add(s);
    } catch (err) {
      console.warn(`  ⚠ Error fetching ${url}: ${err}`);
    }
  }

  return [...allSlugs];
}

type ResolvedApp = {
  marketplace_slug: string;
  app_slug: string;
  bot_login: string; // slug[bot]
  plain_login: string; // slug (without [bot])
  name: string;
};

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "code-review-trends-bot-discovery/1.0",
  ...(process.env.GITHUB_TOKEN
    ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` }
    : {}),
};

/**
 * Try to resolve a marketplace slug to a GitHub App via the API.
 * Returns null if the slug doesn't match a GitHub App.
 */
async function resolveViaApi(
  slug: string,
): Promise<{ app_slug: string; name: string } | null> {
  try {
    const res = await fetch(`https://api.github.com/apps/${slug}`, {
      headers: GITHUB_HEADERS,
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { slug?: string; name?: string };
    if (!data.slug) return null;
    return { app_slug: data.slug, name: data.name ?? data.slug };
  } catch {
    return null;
  }
}

/**
 * Fallback: scrape the marketplace listing page for bot login hints.
 *
 * Looks for:
 * - @username mentions that look like bot names (e.g. "@cubic-dev-ai")
 * - The "ownerLogin" from embedded JSON data
 *
 * Then tries the GitHub Apps API with those candidates.
 */
async function resolveViaMarketplacePage(
  marketplace_slug: string,
): Promise<{ app_slug: string; name: string } | null> {
  try {
    const res = await fetch(
      `https://github.com/marketplace/${marketplace_slug}`,
      {
        headers: {
          "User-Agent": "code-review-trends-bot-discovery/1.0",
          Accept: "text/html",
        },
      },
    );
    if (!res.ok) return null;
    const html = await res.text();

    // Collect candidate slugs from page content
    const candidates = new Set<string>();

    // Look for @mentions that look like bot/AI accounts
    for (const m of html.matchAll(/@([a-z0-9][a-z0-9_-]{2,})/gi)) {
      const login = m[1].toLowerCase();
      if (
        login !== marketplace_slug &&
        !["github", "gmail", "example"].includes(login)
      ) {
        candidates.add(login);
      }
    }

    // Look for ownerLogin in embedded JSON
    for (const m of html.matchAll(/"ownerLogin":"([^"]+)"/g)) {
      candidates.add(m[1].toLowerCase());
    }

    // Try each candidate via the Apps API
    for (const candidate of candidates) {
      const result = await resolveViaApi(candidate);
      if (result) return result;
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve marketplace slugs to GitHub App details.
 *
 * Strategy:
 * 1. Try the GitHub Apps API directly with the marketplace slug
 * 2. If that fails, scrape the marketplace page for bot login hints
 *    and try those via the API
 */
async function resolveApps(slugs: string[]): Promise<ResolvedApp[]> {
  const resolved: ResolvedApp[] = [];
  const BATCH_SIZE = 5;

  for (let i = 0; i < slugs.length; i += BATCH_SIZE) {
    const batch = slugs.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      batch.map(async (marketplace_slug) => {
        // Strategy 1: direct API lookup
        let result = await resolveViaApi(marketplace_slug);

        // Strategy 2: scrape marketplace page for hints
        if (!result) {
          result = await resolveViaMarketplacePage(marketplace_slug);
        }

        if (!result) return null;

        return {
          marketplace_slug,
          app_slug: result.app_slug,
          bot_login: `${result.app_slug}[bot]`,
          plain_login: result.app_slug,
          name: result.name,
        };
      }),
    );
    for (const r of results) {
      if (r) resolved.push(r);
    }
    // Rate limit courtesy
    if (i + BATCH_SIZE < slugs.length) {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs();
  const endDate = args["--end"] ?? new Date().toISOString().split("T")[0];
  const startDate =
    args["--start"] ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];
  const marketplaceOnly = "--marketplace-only" in args;
  const bigqueryOnly = "--bigquery-only" in args;

  console.log(`Discovering bot reviewers: ${startDate} → ${endDate}\n`);

  // Collect all results: login → { event_count, repo_count, source, tracked }
  type Result = {
    login: string;
    event_count: number;
    repo_count: number;
    source: string;
    tracked: boolean;
    marketplace_name?: string;
  };
  const results = new Map<string, Result>();

  // --- Strategy 1: BigQuery [bot] wildcard scan ---
  let bq: BigQuery | undefined;
  if (!marketplaceOnly) {
    console.log("═══ Strategy 1: BigQuery [bot] wildcard scan ═══\n");
    bq = createBigQueryClient();
    const bots = await discoverBotReviewers(bq, startDate, endDate);
    for (const bot of bots) {
      results.set(bot.login, {
        login: bot.login,
        event_count: bot.event_count,
        repo_count: bot.repo_count,
        source: "bigquery",
        tracked: BOT_LOGINS.has(bot.login),
      });
    }
    console.log(`  Found ${bots.length} bot accounts via [bot] filter\n`);
  }

  // --- Strategy 2: GitHub Marketplace → BigQuery verification ---
  if (!bigqueryOnly) {
    console.log("═══ Strategy 2: GitHub Marketplace scan ═══\n");

    console.log("  Scraping marketplace search results...");
    const slugs = await scrapeMarketplaceSlugs();
    console.log(`  Found ${slugs.length} app slugs on marketplace\n`);

    console.log("  Resolving app slugs via GitHub API...");
    const apps = await resolveApps(slugs);
    console.log(
      `  Resolved ${apps.length}/${slugs.length} slugs to GitHub Apps\n`,
    );

    // Collect candidate logins not already in results
    // Try both slug[bot] and plain slug (for apps like Copilot)
    const candidateLogins: string[] = [];
    const loginToApp = new Map<string, ResolvedApp>();
    for (const app of apps) {
      for (const login of [app.bot_login, app.plain_login]) {
        if (!results.has(login)) {
          candidateLogins.push(login);
          loginToApp.set(login, app);
        }
      }
    }

    if (candidateLogins.length > 0 && !marketplaceOnly) {
      console.log(
        `  Checking ${candidateLogins.length} candidate logins in BigQuery...`,
      );
      if (!bq) bq = createBigQueryClient();
      const activity = await queryReviewActivityByLogins(
        bq,
        startDate,
        endDate,
        candidateLogins,
      );

      for (const row of activity) {
        const app = loginToApp.get(row.login);
        results.set(row.login, {
          login: row.login,
          event_count: row.event_count,
          repo_count: row.repo_count,
          source: "marketplace",
          tracked: BOT_LOGINS.has(row.login),
          marketplace_name: app?.name,
        });
      }
      console.log(
        `  Found ${activity.length} active accounts from marketplace apps\n`,
      );
    } else if (marketplaceOnly) {
      // Just show marketplace apps without BigQuery verification
      console.log("  (Skipping BigQuery verification — showing all apps)\n");
      for (const app of apps) {
        if (!results.has(app.bot_login)) {
          results.set(app.bot_login, {
            login: app.bot_login,
            event_count: 0,
            repo_count: 0,
            source: "marketplace",
            tracked: BOT_LOGINS.has(app.bot_login),
            marketplace_name: app.name,
          });
        }
      }
    }
  }

  // --- Print results ---
  const sorted = [...results.values()].sort(
    (a, b) => b.event_count - a.event_count,
  );

  console.log("═══ Results ═══\n");
  console.log(
    `${"Login".padEnd(40)} ${"Events".padStart(10)} ${"Repos".padStart(8)} ${"Source".padStart(12)} ${"Status".padStart(10)}`,
  );
  console.log("-".repeat(82));

  for (const r of sorted) {
    const status = r.tracked ? "  ✓" : "  NEW";
    const name = r.marketplace_name ? ` (${r.marketplace_name})` : "";
    console.log(
      `${(r.login + name).padEnd(40)} ${String(r.event_count).padStart(10)} ${String(r.repo_count).padStart(8)} ${r.source.padStart(12)} ${status.padStart(10)}`,
    );
  }

  const newBots = sorted.filter((r) => !r.tracked);
  if (newBots.length > 0) {
    console.log(`\n${newBots.length} new account(s) not yet tracked:`);
    for (const r of newBots) {
      const name = r.marketplace_name ? ` — ${r.marketplace_name}` : "";
      console.log(`  • ${r.login}${name} (${r.event_count} events, ${r.repo_count} repos)`);
    }
    console.log("\nConsider adding them to pipeline/src/bots.ts");
  } else {
    console.log("\nAll discovered accounts are already tracked.");
  }
}

function parseArgs(): Record<string, string> {
  const result: Record<string, string> = {};
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith("--")) {
      const next = args[i + 1];
      if (next && !next.startsWith("--")) {
        result[arg] = next;
        i++;
      } else {
        result[arg] = "true";
      }
    }
  }
  return result;
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
