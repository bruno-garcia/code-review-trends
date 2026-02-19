/**
 * Static analysis test: ensures every ReplacingMergeTree table reference
 * in clickhouse.ts uses the FINAL keyword.
 *
 * This catches bugs like commit 19a8f47 where queries were missing FINAL,
 * which causes ReplacingMergeTree to return duplicate/stale rows.
 *
 * No ClickHouse connection needed — pure source file analysis.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "../../..");

// --- 1. Parse schema files to find ReplacingMergeTree tables ---

function parseTablesWithEngine(sqlFiles: string[]): {
  replacingMergeTrees: Set<string>;
  nonReplacingTables: Set<string>;
} {
  const replacingMergeTrees = new Set<string>();
  const nonReplacingTables = new Set<string>();

  for (const file of sqlFiles) {
    const sql = fs.readFileSync(path.join(repoRoot, file), "utf-8");
    // Match CREATE TABLE ... ENGINE = XxxMergeTree
    const re = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:\w+\.)?(\w+)\s*\([\s\S]*?\)\s*ENGINE\s*=\s*(\w+)/gi;
    let m: RegExpExecArray | null;
    while ((m = re.exec(sql)) !== null) {
      const [, tableName, engine] = m;
      if (engine === "ReplacingMergeTree") {
        replacingMergeTrees.add(tableName);
      } else {
        nonReplacingTables.add(tableName);
      }
    }
  }

  return { replacingMergeTrees, nonReplacingTables };
}

const schemaFiles = [
  "db/init/001_schema.sql",
  "db/init/003_pr_bot_reactions.sql",
  "db/init/006_reaction_only_review_counts.sql",
  "db/init/004_pr_bot_event_counts.sql",
];

const { replacingMergeTrees, nonReplacingTables } = parseTablesWithEngine(schemaFiles);

// --- 2. Read clickhouse.ts source ---

const clickhouseSrc = fs.readFileSync(
  path.join(__dirname, "clickhouse.ts"),
  "utf-8",
);

// --- 3. Find all FROM/JOIN table references and check for FINAL ---

type Violation = {
  table: string;
  type: "FROM" | "JOIN";
  context: string; // surrounding text for debugging
};

function findViolations(source: string): Violation[] {
  const violations: Violation[] = [];

  // Tables that don't need FINAL
  const exempt = new Set([
    ...nonReplacingTables,
    "system",  // system.tables etc.
  ]);

  // Match FROM/JOIN followed by a table name, with optional alias, then check for FINAL
  // Pattern: (FROM|JOIN) <table> [<alias>] [FINAL]
  // We need to handle:
  //   FROM table FINAL
  //   FROM table alias FINAL
  //   JOIN table FINAL ON
  //   JOIN table alias FINAL ON
  const re = /\b(FROM|JOIN)\s+(\w+)(?:\.(\w+))?\s+/gi;
  let m: RegExpExecArray | null;

  while ((m = re.exec(source)) !== null) {
    const keyword = m[1].toUpperCase() as "FROM" | "JOIN";
    let tableName: string;

    // Handle schema-qualified names like system.tables
    if (m[3]) {
      // schema.table — skip system tables
      if (m[2] === "system") continue;
      tableName = m[3];
    } else {
      tableName = m[2];
    }

    // Skip non-ReplacingMergeTree tables
    if (!replacingMergeTrees.has(tableName)) continue;

    // Check if this is inside an EXISTS subquery (exempt)
    // Look backwards for NOT EXISTS or EXISTS within ~200 chars
    const before = source.substring(Math.max(0, m.index - 200), m.index);
    if (/EXISTS\s*\(\s*SELECT[\s\S]*$/i.test(before)) continue;

    // Now check what follows the table name — look for FINAL
    const after = source.substring(m.index + m[0].length, m.index + m[0].length + 60);

    // After the table name, we may have: FINAL, or alias FINAL, or alias WHERE/ON/GROUP etc.
    // The regex already consumed "FROM table " — now check what's next
    const afterMatch = after.match(/^(\w+)\s*/);

    if (afterMatch) {
      const nextWord = afterMatch[1];
      if (nextWord === "FINAL") {
        continue;
      }
      // Could be an alias (with or without AS) — check subsequent words for FINAL
      // Patterns: table alias FINAL, table AS alias FINAL
      const rest = after.substring(afterMatch[0].length);
      const secondWord = rest.match(/^(\w+)\s*/);
      if (secondWord) {
        if (secondWord[1] === "FINAL") {
          continue;
        }
        // AS alias FINAL — check third word
        if (nextWord === "AS") {
          const rest2 = rest.substring(secondWord[0].length);
          const thirdWord = rest2.match(/^(\w+)/);
          if (thirdWord && thirdWord[1] === "FINAL") {
            continue;
          }
        }
      }
    }

    // No FINAL found — this is a violation
    const lineStart = source.lastIndexOf("\n", m.index) + 1;
    const lineEnd = source.indexOf("\n", m.index);
    const line = source.substring(lineStart, lineEnd === -1 ? undefined : lineEnd).trim();

    violations.push({
      table: tableName,
      type: keyword,
      context: line,
    });
  }

  return violations;
}

// --- Tests ---

describe("clickhouse.ts FINAL keyword lint", () => {
  it("should parse ReplacingMergeTree tables from schema", () => {
    // Sanity check that we found the expected tables
    const expected = [
      "products", "bots", "bot_logins", "review_activity",
      "human_review_activity", "pr_bot_events", "repos",
      "pull_requests", "pr_comments", "pr_bot_reactions",
      "reaction_scan_progress", "reaction_only_review_counts",
      "schema_migrations",
    ];
    for (const t of expected) {
      assert.ok(
        replacingMergeTrees.has(t),
        `Expected ${t} to be in ReplacingMergeTree set, found: ${[...replacingMergeTrees].join(", ")}`,
      );
    }
  });

  it("should identify non-ReplacingMergeTree tables as exempt", () => {
    assert.ok(nonReplacingTables.has("pr_bot_event_counts"), "pr_bot_event_counts should be AggregatingMergeTree");
  });

  it("every ReplacingMergeTree table reference should use FINAL", () => {
    const violations = findViolations(clickhouseSrc);

    if (violations.length > 0) {
      const msg = violations
        .map(
          (v) =>
            `  ${v.type} ${v.table} — missing FINAL\n    → ${v.context}`,
        )
        .join("\n\n");
      assert.fail(
        `Found ${violations.length} ReplacingMergeTree table reference(s) without FINAL:\n\n${msg}`,
      );
    }
  });
});
