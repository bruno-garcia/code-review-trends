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
      "review_activity",
      "human_review_activity",
      "review_reactions",
      "repo_bot_usage",
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
    const bots = await query<{ id: string; name: string; github_login: string }>(
      client,
      "SELECT id, name, github_login FROM bots ORDER BY name",
    );
    for (const bot of bots) {
      console.log(`  ${bot.id.padEnd(15)} ${bot.name.padEnd(25)} ${bot.github_login}`);
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

    console.log("\nReactions (last 8 weeks):");
    const reactions = await query<{
      week: string;
      thumbs_up: string;
      thumbs_down: string;
      heart: string;
    }>(
      client,
      `SELECT toString(week) AS week, thumbs_up, thumbs_down, heart
       FROM review_reactions
       WHERE bot_id = {botId:String}
       ORDER BY week DESC
       LIMIT 8`,
      { botId },
    );
    for (const row of reactions) {
      console.log(
        `  ${row.week}  👍${row.thumbs_up}  👎${row.thumbs_down}  ❤️${row.heart}`,
      );
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
