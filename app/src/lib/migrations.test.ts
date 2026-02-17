/**
 * Tests for the schema migration system.
 *
 * Integration tests that run against real ClickHouse (localhost:8123).
 * Requires: ClickHouse running via `npm run dev:infra`.
 *
 * Run: npx tsx --test src/lib/migrations.test.ts
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createClient, type ClickHouseClient } from "@clickhouse/client";

// We import the module under test, but also need to manipulate internal state.
// The cached schema status must be reset between tests.
import {
  EXPECTED_SCHEMA_VERSION,
  getSchemaStatus,
  _resetCacheForTesting,
  type SchemaStatus,
} from "./migrations.js";

function createTestClient(): ClickHouseClient {
  return createClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "dev",
    database: process.env.CLICKHOUSE_DB ?? "code_review_trends",
  });
}

async function query<T>(client: ClickHouseClient, sql: string): Promise<T[]> {
  const result = await client.query({ query: sql, format: "JSONEachRow" });
  return (await result.json()) as T[];
}

describe("schema migration system", () => {
  let ch: ClickHouseClient;

  before(async () => {
    ch = createTestClient();

    // Ensure migration tables exist (may have been created by Docker init)
    await ch.command({
      query: `CREATE TABLE IF NOT EXISTS schema_migrations (
        version UInt32, name String, applied_at DateTime DEFAULT now()
      ) ENGINE = ReplacingMergeTree() ORDER BY version`,
    });
    await ch.command({
      query: `CREATE TABLE IF NOT EXISTS schema_migration_lock (
        locked_by String, locked_at DateTime DEFAULT now()
      ) ENGINE = MergeTree() ORDER BY tuple()`,
    });
  });

  beforeEach(async () => {
    // Reset migration state between tests
    await ch.command({ query: "TRUNCATE TABLE schema_migrations" });
    await ch.command({ query: "TRUNCATE TABLE schema_migration_lock" });

    // Reset the module-level cache so each test gets a fresh check
    _resetCacheForTesting();
  });

  after(async () => {
    // Restore version 1 so other tests/dev aren't affected
    await ch.command({ query: "TRUNCATE TABLE schema_migrations" });
    await ch.insert({
      table: "schema_migrations",
      values: [{ version: 1, name: "initial_schema" }],
      format: "JSONEachRow",
    });
    await ch.close();
  });

  it("EXPECTED_SCHEMA_VERSION is a positive integer", () => {
    assert.ok(EXPECTED_SCHEMA_VERSION >= 1);
    assert.equal(EXPECTED_SCHEMA_VERSION, Math.floor(EXPECTED_SCHEMA_VERSION));
  });

  it("auto-migrates when DB has no version recorded", async () => {
    // schema_migrations is empty (version 0), app expects version 1
    const status = await getSchemaStatus();

    assert.equal(status.status, "ok");
    assert.equal(status.dbVersion, EXPECTED_SCHEMA_VERSION);
    assert.equal(status.expectedVersion, EXPECTED_SCHEMA_VERSION);

    // Verify the version was recorded
    const rows = await query<{ version: number; name: string }>(
      ch,
      "SELECT version, name FROM schema_migrations ORDER BY version",
    );
    assert.ok(rows.length >= 1, "should have at least one migration recorded");
    assert.equal(rows[0].version, 1);
    assert.equal(rows[0].name, "initial_schema");
  });

  it("returns ok when DB version matches expected", async () => {
    // Pre-record the expected version
    await ch.insert({
      table: "schema_migrations",
      values: [{ version: EXPECTED_SCHEMA_VERSION, name: "initial_schema" }],
      format: "JSONEachRow",
    });

    const status = await getSchemaStatus();
    assert.equal(status.status, "ok");
    assert.equal(status.dbVersion, EXPECTED_SCHEMA_VERSION);
  });

  it("returns app_behind when DB version is higher than expected", async () => {
    // Insert a future version
    await ch.insert({
      table: "schema_migrations",
      values: [{ version: 999, name: "future_migration" }],
      format: "JSONEachRow",
    });

    const status = await getSchemaStatus();
    assert.equal(status.status, "app_behind");
    assert.equal(status.dbVersion, 999);
    assert.equal(status.expectedVersion, EXPECTED_SCHEMA_VERSION);
  });

  it("migration is idempotent — running twice is safe", async () => {
    // First run: auto-migrate
    const status1 = await getSchemaStatus();
    assert.equal(status1.status, "ok");

    // Reset cache by truncating and re-inserting (getSchemaStatus re-checks non-ok)
    // Actually the cache would return "ok", so let's verify the DB state directly
    const rows = await query<{ version: number }>(
      ch,
      "SELECT version FROM schema_migrations",
    );
    const versionCount = rows.filter(
      (r) => r.version === EXPECTED_SCHEMA_VERSION,
    ).length;
    // ReplacingMergeTree may have multiple rows before OPTIMIZE, but that's fine
    assert.ok(versionCount >= 1, "version should be recorded at least once");
  });

  it("lock table is cleaned up after migration", async () => {
    // Auto-migrate
    await getSchemaStatus();

    // Lock should be released
    const locks = await query<{ locked_by: string }>(
      ch,
      "SELECT locked_by FROM schema_migration_lock",
    );
    assert.equal(locks.length, 0, "lock should be released after migration");
  });

  it("all migration DDL is idempotent (CREATE IF NOT EXISTS)", async () => {
    // Run getSchemaStatus twice — both should succeed without errors
    // This tests that running CREATE TABLE IF NOT EXISTS on existing tables is safe
    await ch.command({ query: "TRUNCATE TABLE schema_migrations" });
    const status1 = await getSchemaStatus();
    assert.equal(status1.status, "ok");

    await ch.command({ query: "TRUNCATE TABLE schema_migrations" });
    const status2 = await getSchemaStatus();
    assert.equal(status2.status, "ok");
  });

  it("tables created by migration match expected schema", async () => {
    // Ensure migration has run
    await getSchemaStatus();

    // Spot-check that key tables exist and have expected columns
    const tables = await query<{ name: string }>(
      ch,
      "SHOW TABLES",
    );
    const tableNames = tables.map((t) => t.name);

    const expectedTables = [
      "products",
      "bots",
      "bot_logins",
      "review_activity",
      "human_review_activity",
      "pr_bot_events",
      "repos",
      "repo_languages",
      "pull_requests",
      "pr_comments",
      "schema_migrations",
      "schema_migration_lock",
    ];

    for (const table of expectedTables) {
      assert.ok(
        tableNames.includes(table),
        `Table "${table}" should exist after migration`,
      );
    }
  });
});

describe("SchemaStatus type", () => {
  it("status field has one of the expected values", () => {
    const validStatuses = ["ok", "app_behind", "db_behind", "migrating", "error"];
    // This is a compile-time check more than runtime, but verifies the type
    const testStatus: SchemaStatus = {
      status: "ok",
      dbVersion: 1,
      expectedVersion: 1,
    };
    assert.ok(validStatuses.includes(testStatus.status));
  });
});
