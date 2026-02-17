/**
 * Validates BigQuery PR metadata against GitHub API data.
 *
 * Compares fields from GH Archive events (title, author, state, additions,
 * deletions) against already-enriched PR data in ClickHouse to determine
 * if BigQuery could replace API calls for these fields.
 */

import { createCHClient, query } from "../clickhouse.js";
import { createBigQueryClient } from "../bigquery.js";
import { log } from "../sentry.js";

export type ValidationResult = {
  sample_size: number;
  matched: number;
  fields: Record<string, { match: number; mismatch: number; missing: number; examples: string[] }>;
};

export async function validateBigQueryPRData(options: {
  sampleSize?: number;
}): Promise<ValidationResult> {
  const sampleSize = options.sampleSize ?? 500;
  const ch = createCHClient();
  const bq = createBigQueryClient();

  try {
    // Step 1: Get a sample of enriched PRs from ClickHouse
    log(`[validate] Fetching ${sampleSize} enriched PRs from ClickHouse...`);
    const prs = await query<{
      repo_name: string;
      pr_number: number;
      title: string;
      author: string;
      state: string;
      additions: number;
      deletions: number;
    }>(ch, `
      SELECT repo_name, pr_number, title, author, state,
             additions, deletions
      FROM pull_requests FINAL
      WHERE title != ''
      ORDER BY rand()
      LIMIT {limit:UInt32}
    `, { limit: sampleSize });

    if (prs.length === 0) {
      log("[validate] No enriched PRs found in ClickHouse.");
      return {
        sample_size: 0,
        matched: 0,
        fields: {},
      };
    }

    log(`[validate] Got ${prs.length} PRs. Querying BigQuery for matching events...`);

    // Step 2: Query BigQuery for the same PRs
    const repoSet = new Set(prs.map((p) => p.repo_name));
    const prLookup = new Map<string, typeof prs[0]>();
    for (const pr of prs) {
      prLookup.set(`${pr.repo_name}/${pr.pr_number}`, pr);
    }

    // Query BQ for PullRequestEvent payloads containing these PRs
    // Use the most recent event per PR for the most up-to-date state
    const bqQuery = `
      WITH ranked AS (
        SELECT
          repo.name AS repo_name,
          CAST(JSON_VALUE(payload, '$.pull_request.number') AS INT64) AS pr_number,
          JSON_VALUE(payload, '$.pull_request.title') AS bq_title,
          JSON_VALUE(payload, '$.pull_request.user.login') AS bq_author,
          JSON_VALUE(payload, '$.pull_request.state') AS bq_state,
          SAFE_CAST(JSON_VALUE(payload, '$.pull_request.additions') AS INT64) AS bq_additions,
          SAFE_CAST(JSON_VALUE(payload, '$.pull_request.deletions') AS INT64) AS bq_deletions,
          CAST(JSON_VALUE(payload, '$.pull_request.merged') AS BOOL) AS bq_merged,
          ROW_NUMBER() OVER (
            PARTITION BY repo.name, JSON_VALUE(payload, '$.pull_request.number')
            ORDER BY created_at DESC
          ) AS rn
        FROM \`githubarchive.day.2*\`
        WHERE
          _TABLE_SUFFIX BETWEEN '0230101' AND '0260217'
          AND type = 'PullRequestEvent'
          AND repo.name IN UNNEST(@repos)
          AND JSON_VALUE(payload, '$.pull_request.number') IS NOT NULL
      )
      SELECT * FROM ranked WHERE rn = 1
    `;

    const [bqRows] = await bq.query({
      query: bqQuery,
      params: { repos: [...repoSet] },
      maximumBytesBilled: "15000000000000",
    });

    log(`[validate] Got ${bqRows.length} matching events from BigQuery.`);

    // Step 3: Compare
    const fields: Record<string, { match: number; mismatch: number; missing: number; examples: string[] }> = {
      title: { match: 0, mismatch: 0, missing: 0, examples: [] },
      author: { match: 0, mismatch: 0, missing: 0, examples: [] },
      state: { match: 0, mismatch: 0, missing: 0, examples: [] },
      additions: { match: 0, mismatch: 0, missing: 0, examples: [] },
      deletions: { match: 0, mismatch: 0, missing: 0, examples: [] },
    };

    const bqMap = new Map<string, typeof bqRows[0]>();
    for (const row of bqRows) {
      bqMap.set(`${row.repo_name}/${row.pr_number}`, row);
    }

    let matched = 0;

    for (const pr of prs) {
      const key = `${pr.repo_name}/${pr.pr_number}`;
      const bqRow = bqMap.get(key);

      if (!bqRow) {
        for (const f of Object.keys(fields)) {
          fields[f].missing++;
        }
        continue;
      }

      matched++;

      // Compare title
      if (bqRow.bq_title === pr.title) {
        fields.title.match++;
      } else {
        fields.title.mismatch++;
        if (fields.title.examples.length < 3) {
          fields.title.examples.push(`${key}: API="${pr.title.slice(0, 50)}" BQ="${String(bqRow.bq_title).slice(0, 50)}"`);
        }
      }

      // Compare author
      if (bqRow.bq_author === pr.author) {
        fields.author.match++;
      } else {
        fields.author.mismatch++;
        if (fields.author.examples.length < 3) {
          fields.author.examples.push(`${key}: API="${pr.author}" BQ="${bqRow.bq_author}"`);
        }
      }

      // Compare state (BQ has "open"/"closed" + merged bool; API has "open"/"closed"/"merged")
      const bqState = bqRow.bq_merged ? "merged" : (bqRow.bq_state ?? "").toLowerCase();
      if (bqState === pr.state) {
        fields.state.match++;
      } else {
        fields.state.mismatch++;
        if (fields.state.examples.length < 3) {
          fields.state.examples.push(`${key}: API="${pr.state}" BQ="${bqState}"`);
        }
      }

      // Compare additions
      if (bqRow.bq_additions !== null && Number(bqRow.bq_additions) === Number(pr.additions)) {
        fields.additions.match++;
      } else if (bqRow.bq_additions === null) {
        fields.additions.missing++;
      } else {
        fields.additions.mismatch++;
        if (fields.additions.examples.length < 3) {
          fields.additions.examples.push(`${key}: API=${pr.additions} BQ=${bqRow.bq_additions}`);
        }
      }

      // Compare deletions
      if (bqRow.bq_deletions !== null && Number(bqRow.bq_deletions) === Number(pr.deletions)) {
        fields.deletions.match++;
      } else if (bqRow.bq_deletions === null) {
        fields.deletions.missing++;
      } else {
        fields.deletions.mismatch++;
        if (fields.deletions.examples.length < 3) {
          fields.deletions.examples.push(`${key}: API=${pr.deletions} BQ=${bqRow.bq_deletions}`);
        }
      }
    }

    return { sample_size: prs.length, matched, fields };
  } finally {
    await ch.close();
  }
}
