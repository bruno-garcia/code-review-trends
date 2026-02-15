/**
 * Hash-based repo partitioner for multi-worker support.
 *
 * Assigns repos to workers using deterministic hashing so multiple workers
 * with separate GitHub PATs can process disjoint sets of repos concurrently.
 *
 * ClickHouse filtering uses `cityHash64(repo_name) % N = workerId`.
 * Node.js filtering uses a JS reimplementation of CityHash64 — but since
 * exact replication is fragile, the recommended approach is to do all
 * filtering in ClickHouse via `partitionWhereClause`. The `isMyRepo`
 * function queries ClickHouse to check partition membership.
 */

export type WorkerConfig = {
  workerId: number; // 0-indexed
  totalWorkers: number; // >= 1
};

/**
 * Check if a repo belongs to this worker's partition.
 *
 * Uses a simple FNV-1a-style hash for in-process filtering. Note: this
 * will NOT match ClickHouse's cityHash64 exactly. For authoritative
 * partition checks, use `partitionWhereClause` in SQL queries instead.
 *
 * For single-worker setups (totalWorkers=1), always returns true.
 */
export function isMyRepo(repoName: string, config: WorkerConfig): boolean {
  if (config.totalWorkers <= 1) return true;
  const hash = simpleHash(repoName);
  return hash % config.totalWorkers === config.workerId;
}

/**
 * Generate a WHERE clause fragment for ClickHouse queries to filter by partition.
 *
 * Uses `cityHash64(repo_name) % totalWorkers = workerId` for deterministic,
 * consistent partitioning directly in the database.
 *
 * Returns an empty string if totalWorkers <= 1 (single worker, no filtering needed).
 */
export function partitionWhereClause(config: WorkerConfig): string {
  if (config.totalWorkers <= 1) return "";
  return `cityHash64(repo_name) % ${config.totalWorkers} = ${config.workerId}`;
}

/**
 * Simple deterministic hash (FNV-1a 32-bit).
 * Used only for in-process filtering when ClickHouse is not available.
 */
function simpleHash(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return hash >>> 0;
}
