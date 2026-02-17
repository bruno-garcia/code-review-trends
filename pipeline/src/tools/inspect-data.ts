#!/usr/bin/env tsx
/**
 * Quick data inspection tool.
 *
 * Usage:
 *   npm run inspect                        # overview of all tables
 *   npm run inspect -- --table bots        # show rows from a specific table
 *   npm run inspect -- --query "SELECT ..." # run arbitrary query
 *   npm run inspect -- --bot coderabbit    # show data for a specific bot
 *   npm run inspect -- --weeks 4           # show last N weeks of activity
 */

import { createCHClient, query } from "../clickhouse.js";

async function main() {
  const args = parseArgs();
  const client = createCHClient();

  try {
    if (args["--query"]) {
      await runCustomQuery(args["--query"]);
    } else if (args["--table"]) {
      await showTable(args["--table"], parseInt(args["--limit"] ?? "20"));
    } else if (args["--bot"]) {
      await showBotData(args["--bot"]);
    } else if (args["--weeks"]) {
      await showRecentWeeks(parseInt(args["--weeks"]));
    } else {
      await showOverview();
    }
  } finally {
    await client.close();
  }
}

async function showOverview() {
  const client = createCHClient();
  try {
    console.log("=== ClickHouse Data Overview ===\n");

    const tables = [
      "bots",
      "bot_logins",
      "review_activity",
      "human_review_activity",
      "pr_bot_events",
      "repos",
      "pull_requests",
      "pr_comments",
      "pr_bot_reactions",
      "reaction_scan_progress",
    ];

    for (const table of tables) {
      const rows = await query<{ count: string }>(
        client,
        `SELECT count() AS count FROM ${table}`,
      );
      const count = rows[0]?.count ?? "0";

      let extra = "";
      if (table === "review_activity" || table === "human_review_activity") {
        const range = await query<{ min_week: string; max_week: string }>(
          client,
          `SELECT toString(min(week)) AS min_week, toString(max(week)) AS max_week FROM ${table}`,
        );
        if (range[0]) {
          extra = `  (${range[0].min_week} → ${range[0].max_week})`;
        }
      }

      console.log(`${table}: ${count} rows${extra}`);
    }

    console.log("\n=== Bots ===\n");
    const bots = await query<{ id: string; name: string }>(
      client,
      "SELECT id, name FROM bots ORDER BY name",
    );
    const logins = await query<{ bot_id: string; github_login: string }>(
      client,
      "SELECT bot_id, github_login FROM bot_logins ORDER BY bot_id, github_login",
    );
    const loginsByBot = new Map<string, string[]>();
    for (const row of logins) {
      const arr = loginsByBot.get(row.bot_id) ?? [];
      arr.push(row.github_login);
      loginsByBot.set(row.bot_id, arr);
    }
    for (const bot of bots) {
      const botLogins = loginsByBot.get(bot.id) ?? [];
      console.log(`  ${bot.id.padEnd(15)} ${bot.name.padEnd(25)} ${botLogins.join(", ")}`);
    }

    console.log("\n=== Latest Week Activity ===\n");
    const latest = await query<{
      bot_id: string;
      week_str: string;
      review_count: string;
      review_comment_count: string;
      repo_count: string;
    }>(
      client,
      `SELECT bot_id, toString(week) AS week_str, review_count, review_comment_count, repo_count
       FROM review_activity
       WHERE week = (SELECT max(week) FROM review_activity)
       ORDER BY review_count DESC`,
    );
    if (latest.length > 0) {
      console.log(`  Week: ${latest[0].week_str}\n`);
      console.log(
        `  ${"Bot".padEnd(15)} ${"Reviews".padStart(10)} ${"Comments".padStart(10)} ${"Repos".padStart(8)}`,
      );
      console.log(`  ${"-".repeat(45)}`);
      for (const row of latest) {
        console.log(
          `  ${row.bot_id.padEnd(15)} ${row.review_count.padStart(10)} ${row.review_comment_count.padStart(10)} ${row.repo_count.padStart(8)}`,
        );
      }
    }
  } finally {
    await client.close();
  }
}

async function showTable(table: string, limit: number) {
  const client = createCHClient();
  try {
    const rows = await query<Record<string, unknown>>(
      client,
      `SELECT * FROM ${table} LIMIT ${limit}`,
    );
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await client.close();
  }
}

async function showBotData(botId: string) {
  const client = createCHClient();
  try {
    console.log(`=== Bot: ${botId} ===\n`);

    const bot = await query<Record<string, string>>(
      client,
      `SELECT * FROM bots WHERE id = {botId:String}`,
      { botId },
    );
    if (bot.length === 0) {
      console.log("Bot not found.");
      return;
    }
    console.log("Profile:", JSON.stringify(bot[0], null, 2));

    console.log("\nRecent activity (last 8 weeks):");
    const activity = await query<{
      week: string;
      review_count: string;
      review_comment_count: string;
      repo_count: string;
    }>(
      client,
      `SELECT toString(week) AS week, review_count, review_comment_count, repo_count
       FROM review_activity
       WHERE bot_id = {botId:String}
       ORDER BY week DESC
       LIMIT 8`,
      { botId },
    );
    for (const row of activity) {
      console.log(
        `  ${row.week}  reviews=${row.review_count}  comments=${row.review_comment_count}  repos=${row.repo_count}`,
      );
    }

    console.log("\nComment reactions (from pr_comments, last 8 weeks):");
    const reactions = await query<{
      week: string;
      thumbs_up: string;
      thumbs_down: string;
      heart: string;
    }>(
      client,
      `SELECT
         formatDateTime(toStartOfWeek(created_at, 1), '%Y-%m-%d') AS week,
         sum(thumbs_up) AS thumbs_up,
         sum(thumbs_down) AS thumbs_down,
         sum(heart) AS heart
       FROM pr_comments
       WHERE bot_id = {botId:String} AND comment_id > 0
       GROUP BY week
       ORDER BY week DESC
       LIMIT 8`,
      { botId },
    );
    for (const row of reactions) {
      console.log(
        `  ${row.week}  👍${row.thumbs_up}  👎${row.thumbs_down}  ❤️${row.heart}`,
      );
    }

    // Bot emoji reactions on PRs (🎉 = review with no findings)
    console.log("\nEmoji reactions on PRs (from pr_bot_reactions):");
    const botReactions = await query<{
      reaction_type: string;
      total: string;
      unique_prs: string;
    }>(
      client,
      `SELECT
         reaction_type,
         count() AS total,
         countDistinct((repo_name, pr_number)) AS unique_prs
       FROM pr_bot_reactions
       WHERE bot_id = {botId:String}
       GROUP BY reaction_type
       ORDER BY total DESC`,
      { botId },
    ).catch(() => []);

    if (botReactions.length === 0) {
      console.log("  (none found — reaction scan may still be in progress)");
    } else {
      for (const row of botReactions) {
        const emoji = row.reaction_type === "hooray" ? "🎉" : row.reaction_type;
        console.log(`  ${emoji} ${row.reaction_type}: ${row.total} reactions on ${row.unique_prs} PRs`);
      }
    }

    // Deduplicated reaction reviews (reaction-only, no other activity)
    const [dedupedStats] = await query<{
      reaction_only_prs: string;
      total_reaction_prs: string;
    }>(
      client,
      `SELECT
         countDistinctIf(
           (r.repo_name, r.pr_number),
           (r.repo_name, r.pr_number, r.bot_id) NOT IN (
             SELECT (repo_name, pr_number, bot_id) FROM pr_bot_events
           )
         ) AS reaction_only_prs,
         countDistinct((r.repo_name, r.pr_number)) AS total_reaction_prs
       FROM pr_bot_reactions r
       WHERE r.bot_id = {botId:String} AND r.reaction_type = 'hooray'`,
      { botId },
    ).catch(() => [{ reaction_only_prs: "0", total_reaction_prs: "0" }]);

    if (Number(dedupedStats.total_reaction_prs) > 0) {
      console.log(`\n  Total 🎉 PRs: ${dedupedStats.total_reaction_prs}`);
      console.log(`  Reaction-only reviews (no other bot activity): ${dedupedStats.reaction_only_prs}`);
      console.log(`  Overlapping with existing events: ${Number(dedupedStats.total_reaction_prs) - Number(dedupedStats.reaction_only_prs)}`);
    }

    // Reaction scan progress for this bot's repos
    const [scanProgress] = await query<{
      total_prs: string;
      scanned_prs: string;
    }>(
      client,
      `SELECT
         countDistinct((e.repo_name, e.pr_number)) AS total_prs,
         countDistinctIf((e.repo_name, e.pr_number), s.pr_number > 0) AS scanned_prs
       FROM pr_bot_events e
       LEFT JOIN reaction_scan_progress s
         ON e.repo_name = s.repo_name AND e.pr_number = s.pr_number
       WHERE e.bot_id = {botId:String}`,
      { botId },
    ).catch(() => [{ total_prs: "0", scanned_prs: "0" }]);

    const scanPct = Number(scanProgress.total_prs) > 0
      ? ((Number(scanProgress.scanned_prs) / Number(scanProgress.total_prs)) * 100).toFixed(1) : "0";
    console.log(`\n  Reaction scan progress: ${scanProgress.scanned_prs}/${scanProgress.total_prs} PRs scanned (${scanPct}%)`);

    // Sample reaction PRs
    const samplePrs = await query<{
      repo_name: string;
      pr_number: string;
      reaction_type: string;
      reacted_at: string;
    }>(
      client,
      `SELECT repo_name, pr_number, reaction_type, toString(reacted_at) AS reacted_at
       FROM pr_bot_reactions
       WHERE bot_id = {botId:String}
       ORDER BY reacted_at DESC
       LIMIT 5`,
      { botId },
    ).catch(() => []);

    if (samplePrs.length > 0) {
      console.log("\n  Recent reaction PRs:");
      for (const row of samplePrs) {
        const emoji = row.reaction_type === "hooray" ? "🎉" : row.reaction_type;
        console.log(`    ${emoji} ${row.repo_name}#${row.pr_number} (${row.reacted_at})`);
      }
    }
  } finally {
    await client.close();
  }
}

async function showRecentWeeks(weeks: number) {
  const client = createCHClient();
  try {
    console.log(`=== Last ${weeks} weeks ===\n`);
    const rows = await query<{
      week: string;
      bot_reviews: string;
      human_reviews: string;
      bot_share: string;
    }>(
      client,
      `SELECT
         toString(h.week) AS week,
         COALESCE(b.bot_reviews, 0) AS bot_reviews,
         h.review_count AS human_reviews,
         round(COALESCE(b.bot_reviews, 0) * 100.0 / (h.review_count + COALESCE(b.bot_reviews, 0)), 2) AS bot_share
       FROM human_review_activity h
       LEFT JOIN (
         SELECT week, sum(review_count) AS bot_reviews
         FROM review_activity GROUP BY week
       ) b ON h.week = b.week
       ORDER BY h.week DESC
       LIMIT {weeks:UInt32}`,
      { weeks },
    );

    console.log(
      `${"Week".padEnd(12)} ${"Bot".padStart(10)} ${"Human".padStart(12)} ${"Share".padStart(8)}`,
    );
    console.log("-".repeat(44));
    for (const row of rows) {
      console.log(
        `${String(row.week).padEnd(12)} ${String(row.bot_reviews).padStart(10)} ${String(row.human_reviews).padStart(12)} ${String(row.bot_share).padStart(7)}%`,
      );
    }
  } finally {
    await client.close();
  }
}

async function runCustomQuery(sql: string) {
  const client = createCHClient();
  try {
    const rows = await query<Record<string, unknown>>(client, sql);
    console.log(JSON.stringify(rows, null, 2));
  } finally {
    await client.close();
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
