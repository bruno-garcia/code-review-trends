import { type SchemaStatus } from "@/lib/migrations";

/**
 * Server component that shows a warning banner when the schema version
 * doesn't match what the app expects.
 */
export function SchemaBanner({ status }: { status: SchemaStatus }) {
  if (status.status === "ok") return null;

  if (status.status === "app_behind") {
    return (
      <div
        className="bg-amber-900/80 text-amber-100 px-4 py-2 text-center text-sm"
        role="alert"
        data-testid="schema-banner"
      >
        ⚠️ Database schema (v{status.dbVersion}) is ahead of this app
        (v{status.expectedVersion}). Please redeploy.
      </div>
    );
  }

  if (status.status === "db_behind") {
    return (
      <div
        className="bg-red-900/80 text-red-100 px-4 py-2 text-center text-sm"
        role="alert"
        data-testid="schema-banner"
      >
        ⚠️ Database schema (v{status.dbVersion}) is behind app
        (v{status.expectedVersion}). Auto-migration failed.
        {status.error && ` ${status.error}`}
      </div>
    );
  }

  if (status.status === "migrating") {
    return (
      <div
        className="bg-blue-900/80 text-blue-100 px-4 py-2 text-center text-sm"
        role="alert"
        data-testid="schema-banner"
      >
        🔄 Schema migration in progress (v{status.dbVersion} →
        v{status.expectedVersion}). Refresh in a moment.
      </div>
    );
  }

  if (status.status === "error") {
    return (
      <div
        className="bg-red-900/80 text-red-100 px-4 py-2 text-center text-sm"
        role="alert"
        data-testid="schema-banner"
      >
        ⚠️ Schema check failed: {status.error}
      </div>
    );
  }

  return null;
}
