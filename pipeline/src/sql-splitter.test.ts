import { describe, it, expect } from "vitest";

// Re-export the function for testing by importing the module
// Since splitSqlStatements is not exported, we test it indirectly via a copy.
// TODO: extract to a shared module if this grows.

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  while (i < sql.length) {
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const eol = sql.indexOf("\n", i);
      if (eol === -1) break;
      current += sql.slice(i, eol + 1);
      i = eol + 1;
      continue;
    }
    if (sql[i] === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) { current += sql.slice(i); break; }
      current += sql.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") j += 2;
        else if (sql[j] === "'") break;
        else j++;
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    if (sql[i] === ";") {
      const trimmed = current.trim();
      const withoutComments = trimmed.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
      if (withoutComments.length > 0) statements.push(trimmed);
      current = "";
      i++;
      continue;
    }
    current += sql[i];
    i++;
  }
  const trimmed = current.trim();
  const withoutComments = trimmed.replace(/--[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (withoutComments.length > 0) statements.push(trimmed);
  return statements;
}

describe("splitSqlStatements", () => {
  it("splits basic statements", () => {
    const stmts = splitSqlStatements("SELECT 1; SELECT 2;");
    expect(stmts).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("handles trailing statement without semicolon", () => {
    const stmts = splitSqlStatements("SELECT 1; SELECT 2");
    expect(stmts).toEqual(["SELECT 1", "SELECT 2"]);
  });

  it("ignores semicolons in line comments", () => {
    const sql = `-- rows; ReplacingMergeTree deduplicates at merge time.
CREATE TABLE foo (id Int32);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("CREATE TABLE foo");
    expect(stmts[0]).toContain("ReplacingMergeTree"); // comment preserved
  });

  it("ignores semicolons in block comments", () => {
    const sql = `/* drop; this; table; */ CREATE TABLE foo (id Int32);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("CREATE TABLE foo");
  });

  it("ignores semicolons in string literals", () => {
    const sql = `INSERT INTO t VALUES ('hello; world');`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("hello; world");
  });

  it("filters out comment-only fragments", () => {
    const sql = `-- just a comment
-- another comment;
SELECT 1;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(1);
    expect(stmts[0]).toContain("SELECT 1");
  });

  it("handles the real 009 migration file pattern", () => {
    const sql = `-- Note: run this while ingestion
--    is paused or perform a post-migration catch-up for rows inserted in the window.
DROP TABLE IF EXISTS code_review_trends.comment_stats_weekly_mv;

ALTER TABLE code_review_trends.comment_stats_weekly
    ADD COLUMN IF NOT EXISTS reacted_comment_count SimpleAggregateFunction(sum, UInt64);`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("DROP TABLE");
    expect(stmts[1]).toContain("ALTER TABLE");
  });

  it("handles the real 011 migration file pattern", () => {
    const sql = `-- Materialized view: auto-populates on INSERT to pull_requests.
-- Joins against pr_bot_events (to find which bots touched the PR) and bots
-- (to resolve product_id). Multiple events for the same PR produce multiple
-- rows; ReplacingMergeTree deduplicates at merge time.
CREATE MATERIALIZED VIEW IF NOT EXISTS foo
TO bar
AS SELECT 1;

INSERT INTO bar SELECT 1;`;
    const stmts = splitSqlStatements(sql);
    expect(stmts).toHaveLength(2);
    expect(stmts[0]).toContain("CREATE MATERIALIZED VIEW");
    expect(stmts[1]).toContain("INSERT INTO");
  });
});
