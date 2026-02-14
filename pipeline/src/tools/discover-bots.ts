#!/usr/bin/env tsx
/**
 * Discover bot accounts doing code reviews on GitHub.
 *
 * Queries GH Archive via BigQuery to find [bot] accounts that produce
 * PullRequestReviewEvent or PullRequestReviewCommentEvent.
 *
 * Usage:
 *   npm run discover-bots                          # last 30 days
 *   npm run discover-bots -- --start 2025-01-01    # custom date range
 *   npm run discover-bots -- --start 2025-01-01 --end 2025-02-01
 *
 * Requires GCP_PROJECT_ID environment variable and BigQuery access.
 */

import { createBigQueryClient, discoverBotReviewers } from "../bigquery.js";
import { BOT_LOGINS } from "../bots.js";

async function main() {
  const args = parseArgs();
  const endDate = args["--end"] ?? new Date().toISOString().split("T")[0];
  const startDate =
    args["--start"] ??
    new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

  console.log(`Discovering bot reviewers: ${startDate} → ${endDate}\n`);

  const bq = createBigQueryClient();
  const bots = await discoverBotReviewers(bq, startDate, endDate);

  console.log(
    `${"Login".padEnd(35)} ${"Events".padStart(10)} ${"Repos".padStart(8)} ${"Tracked?".padStart(10)}`,
  );
  console.log("-".repeat(65));

  for (const bot of bots) {
    const tracked = BOT_LOGINS.has(bot.login) ? "  ✓" : "  NEW";
    console.log(
      `${bot.login.padEnd(35)} ${String(bot.event_count).padStart(10)} ${String(bot.repo_count).padStart(8)} ${tracked.padStart(10)}`,
    );
  }

  const newBots = bots.filter((b) => !BOT_LOGINS.has(b.login));
  if (newBots.length > 0) {
    console.log(`\n${newBots.length} new bot(s) not yet tracked.`);
    console.log("Consider adding them to pipeline/src/bots.ts");
  } else {
    console.log("\nAll discovered bots are already tracked.");
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
