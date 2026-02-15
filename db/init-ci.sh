#!/usr/bin/env bash
# Runs SQL init files against ClickHouse HTTP interface.
# Splits multi-statement SQL files on semicolons.
set -euo pipefail

CH_URL="${CLICKHOUSE_URL:-http://localhost:8123}"
CH_USER="${CLICKHOUSE_USER:-default}"
CH_PASSWORD="${CLICKHOUSE_PASSWORD:-dev}"

run_statement() {
  local stmt="$1"
  # Skip empty or comment-only statements
  local trimmed
  trimmed=$(echo "$stmt" | sed '/^[[:space:]]*$/d; /^[[:space:]]*--/d')
  [ -z "$trimmed" ] && return 0

  response=$(curl -sf "${CH_URL}/?user=${CH_USER}&password=${CH_PASSWORD}" -d "$stmt" 2>&1) || {
    echo "ERROR running statement:"
    echo "$stmt" | head -3
    echo "Response: $response"
    return 1
  }
}

# 1. Run schema (db/init/*.sql)
for f in db/init/*.sql; do
  echo "Running $f..."
  statements=$(sed 's/--.*$//' "$f" | tr '\n' ' ' | sed 's/;/;\n/g')
  while IFS= read -r stmt; do
    run_statement "$stmt"
  done <<< "$statements"
  echo "  Done."
done

# 2. Run seed data (db/seed/*.sql) — fake data for CI tests
for f in db/seed/*.sql; do
  [ -f "$f" ] || continue
  echo "Running $f..."
  statements=$(sed 's/--.*$//' "$f" | tr '\n' ' ' | sed 's/;/;\n/g')
  while IFS= read -r stmt; do
    run_statement "$stmt"
  done <<< "$statements"
  echo "  Done."
done

echo "All init scripts completed."
