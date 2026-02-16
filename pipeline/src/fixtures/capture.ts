/**
 * Captures one week of real BigQuery + GitHub data as JSON fixtures.
 *
 * Run once to generate fixture files:
 *   npx tsx pipeline/src/fixtures/capture.ts
 *
 * Requires GCP credentials and GITHUB_TOKEN.
 */

import { writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createBigQueryClient,
  queryBotReviewActivity,
  queryHumanReviewActivity,
  queryBotPREvents,
} from "../bigquery.js";
import { BOT_LOGINS } from "../bots.js";
import { Octokit } from "@octokit/rest";

const __dirname = dirname(fileURLToPath(import.meta.url));
const logins = [...BOT_LOGINS];

// Use a fixed week so fixtures are stable across captures
function formatMonday(weeksOffset: number): string {
  const d = new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1) + weeksOffset * 7;
  d.setDate(diff);
  return d.toISOString().split("T")[0];
}

const start = formatMonday(-1);
const end = formatMonday(0);

console.log(`Capturing fixtures for ${start} to ${end}...`);

// BigQuery data
const bq = createBigQueryClient();

console.log("Fetching bot review activity...");
const botActivity = await queryBotReviewActivity(bq, start, end, logins);
console.log(`  ${botActivity.length} rows`);

console.log("Fetching human review activity...");
const humanActivity = await queryHumanReviewActivity(bq, start, end, logins);
console.log(`  ${humanActivity.length} rows`);

console.log("Fetching PR bot events (limited to 500)...");
const allEvents = await queryBotPREvents(bq, start, end, logins);
const prEvents = allEvents.slice(0, 500); // Keep fixtures small
console.log(`  ${prEvents.length} rows (of ${allEvents.length} total)`);

// GitHub data — fetch a few real repos, PRs, and comments
const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });

console.log("Fetching repo metadata (vercel/next.js)...");
const { data: repoData } = await octokit.rest.repos.get({
  owner: "vercel",
  repo: "next.js",
});
const { data: langData } = await octokit.rest.repos.listLanguages({
  owner: "vercel",
  repo: "next.js",
});

console.log("Fetching recent PRs...");
const { data: prs } = await octokit.rest.pulls.list({
  owner: "vercel",
  repo: "next.js",
  state: "closed",
  sort: "updated",
  per_page: 3,
});

// Fetch full details for each PR
const prDetails = [];
for (const pr of prs) {
  const { data } = await octokit.rest.pulls.get({
    owner: "vercel",
    repo: "next.js",
    pull_number: pr.number,
  });
  prDetails.push(data);
}

console.log("Fetching review comments...");
let reviewComments: typeof import("@octokit/rest").Octokit extends never ? never : unknown[] = [];
for (const pr of prs) {
  const { data } = await octokit.rest.pulls.listReviewComments({
    owner: "vercel",
    repo: "next.js",
    pull_number: pr.number,
    per_page: 5,
  });
  if (data.length > 0) {
    reviewComments = data;
    break;
  }
}

// Write fixtures
const fixtures = {
  metadata: { captured_at: new Date().toISOString(), start, end },
  bigquery: {
    bot_activity: botActivity,
    human_activity: humanActivity,
    pr_events: prEvents,
  },
  github: {
    repo: {
      full_name: repoData.full_name,
      owner: repoData.owner.login,
      stars: repoData.stargazers_count,
      language: repoData.language,
      fork: repoData.fork,
      archived: repoData.archived,
    },
    languages: langData,
    pull_requests: prDetails.map((pr) => ({
      repo_name: "vercel/next.js",
      number: pr.number,
      title: pr.title,
      author: pr.user?.login ?? "",
      state: pr.merged_at ? "merged" : pr.closed_at ? "closed" : "open",
      created_at: pr.created_at,
      merged_at: pr.merged_at,
      closed_at: pr.closed_at,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
    })),
    comments: (reviewComments as Array<Record<string, unknown>>).map((c: Record<string, unknown>) => ({
      id: c.id,
      user_login: (c.user as Record<string, unknown>)?.login,
      body_length: typeof c.body === "string" ? c.body.length : 0,
      created_at: c.created_at,
      reactions: c.reactions,
    })),
  },
};

const json = JSON.stringify(fixtures, (_, v) =>
  typeof v === "bigint" ? Number(v) : v, 2,
);
const outPath = join(__dirname, "pipeline-fixture.json");
writeFileSync(outPath, json);
console.log(`\nWrote ${(json.length / 1024).toFixed(0)}KB to ${outPath}`);
