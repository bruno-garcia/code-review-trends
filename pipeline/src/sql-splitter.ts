/**
 * Split SQL text into individual statements, respecting comments.
 * Handles `--` line comments, block comments, and string literals
 * so that semicolons inside them don't produce spurious splits.
 */
export function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let i = 0;
  while (i < sql.length) {
    // Line comment: skip to end of line
    if (sql[i] === "-" && sql[i + 1] === "-") {
      const eol = sql.indexOf("\n", i);
      if (eol === -1) {
        // Comment runs to end of file — skip it entirely
        break;
      }
      // Include comment in current statement (preserves context) but skip past it
      current += sql.slice(i, eol + 1);
      i = eol + 1;
      continue;
    }
    // Block comment: skip to closing delimiter
    if (sql[i] === "/" && sql[i + 1] === "*") {
      const end = sql.indexOf("*/", i + 2);
      if (end === -1) {
        // Unterminated block comment — include rest
        current += sql.slice(i);
        break;
      }
      current += sql.slice(i, end + 2);
      i = end + 2;
      continue;
    }
    // String literal: skip to closing quote (handles escaped quotes)
    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'" && sql[j + 1] === "'") {
          j += 2; // escaped quote
        } else if (sql[j] === "'") {
          break;
        } else {
          j++;
        }
      }
      current += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }
    // Statement terminator
    if (sql[i] === ";") {
      const trimmed = current.trim();
      // Only keep statements that have actual SQL (not just comments)
      const withoutComments = trimmed
        .replace(/--[^\n]*/g, "")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .trim();
      if (withoutComments.length > 0) {
        statements.push(trimmed);
      }
      current = "";
      i++;
      continue;
    }
    current += sql[i];
    i++;
  }
  // Handle trailing statement without semicolon
  const trimmed = current.trim();
  const withoutComments = trimmed
    .replace(/--[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .trim();
  if (withoutComments.length > 0) {
    statements.push(trimmed);
  }
  return statements;
}
