/**
 * Integration tests for the full migration roundtrip.
 *
 * Validates that a fresh environment can be set up by `pipeline migrate`
 * (SQL files + version recording) and that the app's auto-migration
 * succeeds even when SQL files have already been applied.
 *
 * This catches the exact production bug where:
 *   1. SQL files applied (creating tables with columns from later migrations)
 *   2. Version recording failed (bot sync error, password issue, etc.)
 *   3. App tried to auto-migrate → INSERT column mismatch → crash
 *
 * Requires: ClickHouse running (npm run dev:infra or CI).
 * Uses a temporary database for isolation — does not affect other tests.
 *
 * Run: node --import tsx --test src/migrations-roundtrip.test.ts
 */

import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createClient, type ClickHouseClient } from "@clickhouse/client";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { splitSqlStatements } from "./sql-splitter.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TEST_DB = "code_review_trends_roundtrip_test";

// Parse EXPECTED_SCHEMA_VERSION from app/src/lib/migrations.ts
function getExpectedSchemaVersion(): number {
  const src = readFileSync(join(ROOT, "app/src/lib/migrations.ts"), "utf-8");
  const match = src.match(/EXPECTED_SCHEMA_VERSION\s*=\s*(\d+)/);
  assert.ok(match, "Could not find EXPECTED_SCHEMA_VERSION");
  return Number(match[1]);
}

// Parse SCHEMA_MIGRATIONS from pipeline/src/cli.ts
function getSchemaVersions(): { version: number; name: string }[] {
  const src = readFileSync(join(ROOT, "pipeline/src/cli.ts"), "utf-8");
  const match = src.match(/const SCHEMA_MIGRATIONS[^[]*\[([\s\S]*?)\];/);
  assert.ok(match, "Could not find SCHEMA_MIGRATIONS");
  const entries: { version: number; name: string }[] = [];
  const re = /\{\s*version:\s*(\d+)\s*,\s*name:\s*"([^"]+)"\s*\}/g;
  let m;
  while ((m = re.exec(match[1])) !== null) {
    entries.push({ version: Number(m[1]), name: m[2] });
  }
  return entries;
}

// Extract all INSERT INTO...SELECT statements from app migrations, grouped by migration version.
// Each INSERT is associated with its target table so we can TRUNCATE before re-running.
function parseAppMigrationInserts(): { version: number; table: string; sql: string }[] {
  const src = readFileSync(join(ROOT, "app/src/lib/migrations.ts"), "utf-8");
  const results: { version: number; table: string; sql: string }[] = [];

  // Find each MIGRATION_NNN constant and extract its version + statements
  const migrationRe = /const MIGRATION_(\d+):\s*Migration\s*=\s*\{\s*version:\s*(\d+)\s*,\s*name:\s*"([^"]+)"\s*,\s*statements:\s*\[([\s\S]*?)\]\s*,?\s*\}/g;
  let migMatch;
  while ((migMatch = migrationRe.exec(src)) !== null) {
    const version = Number(migMatch[2]);
    const statementsBlock = migMatch[4];

    // Find INSERT INTO statements within this migration's statements
    const insertRe = /`(INSERT\s+INTO\s+(\w+)\s*[\s\S]*?)`/g;
    let insMatch;
    while ((insMatch = insertRe.exec(statementsBlock)) !== null) {
      const sql = insMatch[1];
      const table = insMatch[2];
      // Only include INSERT...SELECT (not INSERT...VALUES)
      if (/SELECT/i.test(sql)) {
        results.push({ version, table, sql });
      }
    }
  }
  return results;
}

// Read and parse all SQL files from db/init/
function loadSqlFiles(): { name: string; statements: string[] }[] {
  const initDir = join(ROOT, "db/init");
  return readdirSync(initDir)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => ({
      name: f,
      statements: splitSqlStatements(readFileSync(join(initDir, f), "utf-8")),
    }));
}

function createTestClient(database?: string): ClickHouseClient {
  return createClient({
    url: process.env.CLICKHOUSE_URL ?? "http://localhost:8123",
    username: process.env.CLICKHOUSE_USER ?? "default",
    password: process.env.CLICKHOUSE_PASSWORD ?? "dev",
    database,
  });
}

async function query<T>(client: ClickHouseClient, sql: string): Promise<T[]> {
  const result = await client.query({ query: sql, format: "JSONEachRow" });
  return (await result.json()) as T[];
}

// Apply all SQL files, replacing the database prefix with our test DB
async function applySqlFiles(client: ClickHouseClient): Promise<{ applied: number; errors: string[] }> {
  const sqlFiles = loadSqlFiles();
  let applied = 0;
  const errors: string[] = [];
  for (const file of sqlFiles) {
    for (const stmt of file.statements) {
      // Replace the database prefix used in SQL files
      const adjustedSql = stmt.replace(/code_review_trends\./g, `${TEST_DB}.`);
      try {
        await client.command({ query: adjustedSql });
        applied++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        errors.push(`[${file.name}] ${msg.split("\n")[0]}`);
      }
    }
  }
  return { applied, errors };
}

// Record migration versions (same logic as cmdMigrate)
async function recordVersions(client: ClickHouseClient): Promise<void> {
  const versions = getSchemaVersions();
  await client.insert({
    table: `${TEST_DB}.schema_migrations`,
    values: versions.map((m) => ({ version: m.version, name: m.name })),
    format: "JSONEachRow",
  });
}

// Check if ClickHouse is available
async function isClickHouseAvailable(): Promise<boolean> {
  const client = createTestClient();
  try {
    await client.query({ query: "SELECT 1", format: "JSONEachRow" });
    return true;
  } catch {
    return false;
  } finally {
    await client.close();
  }
}

// Drop and recreate the test database for a clean slate
async function resetTestDatabase(client: ClickHouseClient): Promise<void> {
  await client.command({ query: `DROP DATABASE IF EXISTS ${TEST_DB}` });
  await client.command({ query: `CREATE DATABASE ${TEST_DB}` });
}

describe("migration roundtrip", async () => {
  const available = await isClickHouseAvailable();
  if (!available) {
    it("skipped — ClickHouse not available", { skip: "ClickHouse not running" }, () => {});
    return;
  }

  // Use a client without a default database (for DROP/CREATE DATABASE)
  let rootClient: ClickHouseClient;
  let dbClient: ClickHouseClient;

  before(async () => {
    rootClient = createTestClient();
    await resetTestDatabase(rootClient);
    dbClient = createTestClient(TEST_DB);
  });

  beforeEach(async () => {
    // Full reset: drop and recreate the test database
    await resetTestDatabase(rootClient);
    await dbClient.close();
    dbClient = createTestClient(TEST_DB);
  });

  after(async () => {
    // Clean up: drop the test database entirely
    await rootClient.command({ query: `DROP DATABASE IF EXISTS ${TEST_DB}` });
    await dbClient.close();
    await rootClient.close();
  });

  it("fresh DB → SQL files + version recording → all versions tracked", async () => {
    // Simulate cmdMigrate: apply SQL files, then record versions
    const { errors } = await applySqlFiles(rootClient);
    assert.equal(errors.length, 0, `SQL file errors:\n${errors.join("\n")}`);

    await recordVersions(dbClient);

    // Verify all versions are recorded
    const rows = await query<{ version: number; name: string }>(
      dbClient,
      `SELECT version, name FROM schema_migrations ORDER BY version`,
    );

    const expectedVersion = getExpectedSchemaVersion();
    const maxVersion = Math.max(...rows.map((r) => r.version));
    assert.equal(maxVersion, expectedVersion, `Max recorded version should be ${expectedVersion}`);

    const versions = getSchemaVersions();
    assert.equal(rows.length, versions.length, "Should have one row per migration version");

    for (const expected of versions) {
      const found = rows.find((r) => r.version === expected.version);
      assert.ok(found, `Version ${expected.version} (${expected.name}) not found in schema_migrations`);
      assert.equal(found.name, expected.name, `Version ${expected.version} name mismatch`);
    }
  });

  it("SQL files applied without versions → app migration INSERTs still succeed", async () => {
    // This is the exact production bug regression test.
    // SQL files create all tables (including later ALTERs like the 8th column).
    // App tries to re-run earlier migrations which INSERT with fewer columns.
    // With explicit column lists, these INSERTs must succeed.

    const { errors } = await applySqlFiles(rootClient);
    assert.equal(errors.length, 0, `SQL file errors:\n${errors.join("\n")}`);

    // Do NOT record versions (simulates the bug — cmdMigrate failed before recording)

    // Now simulate the app's auto-migration: for each migration's INSERT...SELECT,
    // TRUNCATE the target table (so the INSERT has something to do), then run it.
    const inserts = parseAppMigrationInserts();
    assert.ok(inserts.length > 0, "Should find at least one INSERT...SELECT in migrations");

    const insertErrors: string[] = [];
    for (const { version, table, sql } of inserts) {
      try {
        // TRUNCATE first so the INSERT has a clean target
        // (some tables may have been backfilled by the SQL files)
        await dbClient.command({ query: `TRUNCATE TABLE ${table}` });
        await dbClient.command({ query: sql });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        insertErrors.push(`Migration ${version}, table ${table}: ${msg.split("\n")[0]}`);
      }
    }

    assert.equal(
      insertErrors.length,
      0,
      `App migration INSERTs failed after SQL files were applied (the production bug!):\n${insertErrors.join("\n")}`,
    );
  });

  it("SQL file DDL is idempotent — CREATE/ALTER statements succeed on re-apply", async () => {
    // Apply all SQL files
    const { errors } = await applySqlFiles(rootClient);
    assert.equal(errors.length, 0, `First apply errors:\n${errors.join("\n")}`);

    // Re-apply only DDL statements (CREATE, ALTER, DROP, TRUNCATE).
    // INSERT backfills are NOT idempotent across migration boundaries
    // (e.g., 007 inserts 7 columns but 009 adds an 8th), and that's OK —
    // cmdMigrate applies SQL files once, and backfills are re-done by later
    // migrations that TRUNCATE + re-INSERT with the full column set.
    const sqlFiles = loadSqlFiles();
    const ddlErrors: string[] = [];
    for (const file of sqlFiles) {
      for (const stmt of file.statements) {
        // Find the first non-comment, non-empty line to determine statement type
        const firstKeyword = stmt
          .split("\n")
          .map((l) => l.trim())
          .filter((l) => l && !l.startsWith("--"))
          .map((l) => l.split(/\s+/)[0]?.toUpperCase())[0];
        if (firstKeyword === "INSERT") continue; // skip backfill INSERTs
        const adjusted = stmt.replace(/code_review_trends\./g, `${TEST_DB}.`);
        try {
          await rootClient.command({ query: adjusted });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          ddlErrors.push(`[${file.name}] ${msg.split("\n")[0]}`);
        }
      }
    }
    assert.equal(ddlErrors.length, 0, `DDL re-apply errors:\n${ddlErrors.join("\n")}`);
  });

  it("version recording is idempotent — recording twice causes no errors", async () => {
    const { errors } = await applySqlFiles(rootClient);
    assert.equal(errors.length, 0, `SQL file errors:\n${errors.join("\n")}`);

    // Record versions twice (ReplacingMergeTree deduplicates on ORDER BY version)
    await recordVersions(dbClient);
    await recordVersions(dbClient);

    const rows = await query<{ version: number }>(
      dbClient,
      `SELECT version FROM schema_migrations FINAL ORDER BY version`,
    );

    const versions = getSchemaVersions();
    assert.equal(rows.length, versions.length, "Should have one row per migration after FINAL dedup");
  });
});
