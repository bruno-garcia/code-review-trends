#!/usr/bin/env bash
# Load fake seed data for local development.
# The fake data SQL lives in db/seed/ (outside db/init/) so it is never
# accidentally applied to staging or production. Docker Compose mounts
# db/seed/ into the initdb directory as a subdirectory.
set -euo pipefail

SEED_DIR="/docker-entrypoint-initdb.d/seed"

if [ ! -d "$SEED_DIR" ]; then
  echo "003_seed.sh: seed directory not found at $SEED_DIR — skipping."
  exit 0
fi

for f in "$SEED_DIR"/*.sql; do
  [ -f "$f" ] || continue
  echo "003_seed.sh: loading $(basename "$f")..."
  clickhouse-client \
    --user "${CLICKHOUSE_USER:-default}" \
    --password "${CLICKHOUSE_PASSWORD:-}" \
    --database "${CLICKHOUSE_DB:-default}" \
    --multiquery < "$f"
done

echo "003_seed.sh: done."
