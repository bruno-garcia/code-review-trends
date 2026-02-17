#!/usr/bin/env bash
# Loads seed data from db/seed/ into ClickHouse on first container init.
# This runs as part of docker-entrypoint-initdb.d (local dev only).
set -e

SEED_DIR="/seed"
if [ ! -d "$SEED_DIR" ]; then
  echo "No seed directory mounted at $SEED_DIR, skipping."
  exit 0
fi

for f in "$SEED_DIR"/*.sql; do
  [ -f "$f" ] || continue
  echo "Loading seed: $f..."
  clickhouse-client --password "${CLICKHOUSE_PASSWORD:-dev}" --database "${CLICKHOUSE_DB:-code_review_trends}" --multiquery < "$f"
  echo "  Done."
done
