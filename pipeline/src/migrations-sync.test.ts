/**
 * Ensures the two migration registries (pipeline CLI + Next.js app) stay in
 * sync with each other and with the SQL files in db/init/.
 *
 * Both systems write to the same `schema_migrations` ClickHouse table, so
 * version numbers and names MUST match. This test reads the source files
 * directly to avoid cross-workspace import issues.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Parse { version, name } entries from pipeline/src/cli.ts SCHEMA_MIGRATIONS array. */
function parsePipelineMigrations(): { version: number; name: string }[] {
  const src = readFileSync(join(ROOT, "pipeline/src/cli.ts"), "utf-8");
  const match = src.match(
    /const SCHEMA_MIGRATIONS[^[]*\[([\s\S]*?)\];/,
  );
  assert.ok(match, "Could not find SCHEMA_MIGRATIONS in pipeline/src/cli.ts");
  const entries: { version: number; name: string }[] = [];
  const re = /\{\s*version:\s*(\d+)\s*,\s*name:\s*"([^"]+)"\s*\}/g;
  let m;
  while ((m = re.exec(match[1])) !== null) {
    entries.push({ version: Number(m[1]), name: m[2] });
  }
  return entries;
}

/** Parse migration versions/names and EXPECTED_SCHEMA_VERSION from app/src/lib/migrations.ts. */
function parseAppMigrations(): {
  expectedVersion: number;
  migrations: { version: number; name: string }[];
} {
  const src = readFileSync(
    join(ROOT, "app/src/lib/migrations.ts"),
    "utf-8",
  );

  const versionMatch = src.match(/EXPECTED_SCHEMA_VERSION\s*=\s*(\d+)/);
  assert.ok(versionMatch, "Could not find EXPECTED_SCHEMA_VERSION in app migrations");

  const migrations: { version: number; name: string }[] = [];
  // Match each migration constant definition
  const re = /const MIGRATION_\d+:\s*Migration\s*=\s*\{\s*version:\s*(\d+)\s*,\s*name:\s*"([^"]+)"/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    migrations.push({ version: Number(m[1]), name: m[2] });
  }

  return { expectedVersion: Number(versionMatch[1]), migrations };
}

/** List SQL files in db/init/ that are schema migrations (not data-only). */
function listSqlMigrationFiles(): string[] {
  // Data-only files contain only INSERT statements — no schema changes.
  // They're applied by db/init-ci.sh but aren't tracked in schema_migrations.
  const DATA_ONLY_FILES = new Set(["002_bot_data.sql", "010_kodus_bot.sql"]);
  const files = readdirSync(join(ROOT, "db/init"))
    .filter((f) => f.endsWith(".sql") && !DATA_ONLY_FILES.has(f))
    .sort();
  return files;
}

/** Extract all INSERT INTO...SELECT statements from app migrations source. */
function findInsertSelectStatements(): { line: number; text: string }[] {
  const src = readFileSync(
    join(ROOT, "app/src/lib/migrations.ts"),
    "utf-8",
  );
  const results: { line: number; text: string }[] = [];
  const lines = src.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    // Match INSERT INTO that isn't followed by a parenthesized column list
    // but IS followed by SELECT (possibly on the next non-empty line).
    // Pattern: INSERT INTO <table_name> SELECT (no parentheses between table and SELECT)
    if (/INSERT\s+INTO\s+\w+\s*$/i.test(trimmed) || /INSERT\s+INTO\s+\w+\s+SELECT/i.test(trimmed)) {
      // Check if there's a column list (parentheses after the table name)
      const fullMatch = trimmed.match(/INSERT\s+INTO\s+(\w+)\s*(.*)/i);
      if (fullMatch) {
        const afterTable = fullMatch[2].trim();
        // If nothing follows on this line, peek at next non-empty line
        let nextContent = afterTable;
        if (!nextContent) {
          for (let j = i + 1; j < lines.length && j < i + 5; j++) {
            const next = lines[j].trim();
            if (next) {
              nextContent = next;
              break;
            }
          }
        }
        // Safe: starts with '(' (column list) or VALUES
        if (nextContent.startsWith("(") || /^VALUES/i.test(nextContent)) {
          continue;
        }
        // Unsafe: SELECT without column list
        if (/^SELECT/i.test(nextContent) || nextContent === "") {
          results.push({ line: i + 1, text: trimmed });
        }
      }
    }
  }
  return results;
}

describe("migration registry sync", () => {
  const pipeline = parsePipelineMigrations();
  const app = parseAppMigrations();
  const sqlFiles = listSqlMigrationFiles();

  it("pipeline and app have the same number of migrations", () => {
    assert.equal(
      pipeline.length,
      app.migrations.length,
      `Pipeline has ${pipeline.length} migrations, app has ${app.migrations.length}. ` +
        `Pipeline: [${pipeline.map((m) => `v${m.version}:${m.name}`).join(", ")}]. ` +
        `App: [${app.migrations.map((m) => `v${m.version}:${m.name}`).join(", ")}].`,
    );
  });

  it("pipeline and app migrations have matching versions and names", () => {
    for (let i = 0; i < pipeline.length; i++) {
      const p = pipeline[i];
      const a = app.migrations[i];
      assert.equal(
        p.version,
        a.version,
        `Migration ${i}: pipeline v${p.version} != app v${a.version}`,
      );
      assert.equal(
        p.name,
        a.name,
        `Migration v${p.version}: pipeline name "${p.name}" != app name "${a.name}"`,
      );
    }
  });

  it("app EXPECTED_SCHEMA_VERSION matches the last migration version", () => {
    const lastApp = app.migrations[app.migrations.length - 1];
    assert.equal(
      app.expectedVersion,
      lastApp.version,
      `EXPECTED_SCHEMA_VERSION is ${app.expectedVersion} but last migration is v${lastApp.version}`,
    );
  });

  it("pipeline max version matches app EXPECTED_SCHEMA_VERSION", () => {
    const lastPipeline = pipeline[pipeline.length - 1];
    assert.equal(
      lastPipeline.version,
      app.expectedVersion,
      `Pipeline max version is ${lastPipeline.version} but app expects ${app.expectedVersion}`,
    );
  });

  it("all INSERT INTO...SELECT statements have explicit column lists", () => {
    const unsafeInserts = findInsertSelectStatements();
    assert.equal(
      unsafeInserts.length,
      0,
      `Found ${unsafeInserts.length} INSERT INTO...SELECT without explicit column list in app/src/lib/migrations.ts.\n` +
        `Each INSERT must list columns: INSERT INTO table (col1, col2) SELECT ...\n` +
        `Without explicit columns, adding a column in a later migration breaks earlier INSERTs.\n\n` +
        unsafeInserts.map((u) => `  Line ${u.line}: ${u.text}`).join("\n"),
    );
  });

  it("number of SQL migration files matches number of tracked migrations", () => {
    assert.equal(
      sqlFiles.length,
      pipeline.length,
      `Found ${sqlFiles.length} SQL migration files but ${pipeline.length} tracked migrations. ` +
        `SQL files: [${sqlFiles.join(", ")}]. ` +
        `Add missing entries to SCHEMA_MIGRATIONS in pipeline/src/cli.ts ` +
        `and MIGRATIONS in app/src/lib/migrations.ts.`,
    );
  });
});
