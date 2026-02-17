#!/usr/bin/env tsx
/**
 * Validate ClickHouse schema matches expectations.
 *
 * Checks that all expected tables exist with the correct columns and types.
 * Run after deployments or schema changes to catch drift early.
 *
 * Usage:
 *   npm run validate
 */

import { createCHClient, query } from "../clickhouse.js";

type ColumnInfo = {
  table: string;
  name: string;
  type: string;
};

// Expected schema definition
const EXPECTED_TABLES: Record<string, Record<string, string>> = {
  products: {
    id: "String",
    name: "String",
    website: "String",
    description: "String",
    docs_url: "String",
    brand_color: "String",
    avatar_url: "String",
  },
  bots: {
    id: "String",
    name: "String",
    product_id: "String",
    website: "String",
    description: "String",
    brand_color: "String",
    avatar_url: "String",
  },
  bot_logins: {
    bot_id: "String",
    github_login: "String",
  },
  review_activity: {
    week: "Date",
    bot_id: "String",
    review_count: "UInt64",
    review_comment_count: "UInt64",
    repo_count: "UInt64",
    org_count: "UInt64",
  },
  human_review_activity: {
    week: "Date",
    review_count: "UInt64",
    review_comment_count: "UInt64",
    repo_count: "UInt64",
  },
  pr_bot_events: {
    repo_name: "String",
    pr_number: "UInt32",
    bot_id: "String",
    actor_login: "String",
    event_type: "String",
    event_week: "Date",
    discovered_at: "DateTime",
  },
  repos: {
    name: "String",
    owner: "String",
    stars: "UInt32",
    primary_language: "String",
    fork: "Bool",
    archived: "Bool",
    fetch_status: "String",
    updated_at: "DateTime",
  },
  pull_requests: {
    repo_name: "String",
    pr_number: "UInt32",
    title: "String",
    author: "String",
    state: "String",
    created_at: "DateTime",
    merged_at: "Nullable(DateTime)",
    closed_at: "Nullable(DateTime)",
    additions: "UInt32",
    deletions: "UInt32",
    changed_files: "UInt32",
    updated_at: "DateTime",
  },
  pr_comments: {
    repo_name: "String",
    pr_number: "UInt32",
    comment_id: "UInt64",
    bot_id: "String",
    body_length: "UInt32",
    created_at: "DateTime",
    thumbs_up: "UInt32",
    thumbs_down: "UInt32",
    laugh: "UInt32",
    confused: "UInt32",
    heart: "UInt32",
    hooray: "UInt32",
    eyes: "UInt32",
    rocket: "UInt32",
    updated_at: "DateTime",
  },
};

async function main() {
  const client = createCHClient();
  let errors = 0;

  try {
    console.log("Validating ClickHouse schema...\n");

    // Get all columns from the database
    const columns = await query<ColumnInfo>(
      client,
      `SELECT table, name, type
       FROM system.columns
       WHERE database = currentDatabase()
       ORDER BY table, position`,
    );

    const actual = new Map<string, Map<string, string>>();
    for (const col of columns) {
      if (!actual.has(col.table)) {
        actual.set(col.table, new Map());
      }
      actual.get(col.table)!.set(col.name, col.type);
    }

    // Check each expected table
    for (const [table, expectedCols] of Object.entries(EXPECTED_TABLES)) {
      const tableCols = actual.get(table);
      if (!tableCols) {
        console.log(`✗ Table '${table}' is MISSING`);
        errors++;
        continue;
      }

      let tableOk = true;
      for (const [colName, expectedType] of Object.entries(expectedCols)) {
        const actualType = tableCols.get(colName);
        if (!actualType) {
          console.log(`  ✗ ${table}.${colName} is MISSING (expected ${expectedType})`);
          errors++;
          tableOk = false;
        } else if (actualType !== expectedType) {
          console.log(
            `  ✗ ${table}.${colName} type mismatch: expected ${expectedType}, got ${actualType}`,
          );
          errors++;
          tableOk = false;
        }
      }

      // Check for unexpected columns
      for (const [colName] of tableCols) {
        if (!(colName in expectedCols)) {
          console.log(`  ⚠ ${table}.${colName} is unexpected (not in schema definition)`);
        }
      }

      if (tableOk) {
        console.log(`✓ ${table} (${Object.keys(expectedCols).length} columns)`);
      }
    }

    // Check for unexpected tables
    for (const tableName of actual.keys()) {
      if (!(tableName in EXPECTED_TABLES)) {
        console.log(`⚠ Unexpected table: ${tableName}`);
      }
    }

    console.log(
      errors === 0
        ? "\n✓ Schema validation passed!"
        : `\n✗ Schema validation failed with ${errors} error(s).`,
    );
    process.exit(errors > 0 ? 1 : 0);
  } finally {
    await client.close();
  }
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});
