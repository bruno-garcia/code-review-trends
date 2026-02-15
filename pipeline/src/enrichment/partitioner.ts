/**
 * Hash-based repo partitioner for multi-worker support.
 *
 * Assigns repos to workers using deterministic hashing so multiple workers
 * with separate GitHub PATs can process disjoint sets of repos concurrently.
 *
 * ClickHouse filtering uses `cityHash64(repo_name) % N = workerId`.
 * All filtering should happen in ClickHouse via `partitionWhereClause`.
 */

export type WorkerConfig = {
  workerId: number; // 0-indexed
  totalWorkers: number; // >= 1
};

/**
 * Generate a parameterized WHERE clause fragment for ClickHouse queries
 * to filter by partition.
 *
 * Uses `cityHash64(column) % totalWorkers = workerId` for deterministic,
 * consistent partitioning directly in the database.
 *
 * Returns null if totalWorkers <= 1 (single worker, no filtering needed).
 *
 * @param config - Worker partition config
 * @param column - Column name to hash (default: "repo_name")
 */
const ALLOWED_COLUMNS = new Set(["repo_name", "pr_number", "bot_id"]);

export function partitionWhereClause(
  config: WorkerConfig,
  column?: string,
): { sql: string; params: Record<string, number> } | null {
  if (config.totalWorkers <= 1) return null;
  const col = column ?? "repo_name";
  if (!ALLOWED_COLUMNS.has(col)) {
    throw new Error(`Invalid partition column: ${col}. Allowed: ${[...ALLOWED_COLUMNS].join(", ")}`);
  }
  return {
    sql: `cityHash64(${col}) % {_partTotalWorkers:UInt32} = {_partWorkerId:UInt32}`,
    params: {
      _partTotalWorkers: config.totalWorkers,
      _partWorkerId: config.workerId,
    },
  };
}
