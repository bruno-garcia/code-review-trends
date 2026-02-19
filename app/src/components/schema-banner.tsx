import { type SchemaStatus } from "@/lib/migrations";

/**
 * Server component that shows a warning banner when the schema version
 * doesn't match what the app expects.
 *
 * Connection failures throw from getSchemaStatus() (→ global-error.tsx).
 * DDL failures return "db_behind" — site still works, banner is shown.
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
        ⚠️ Database schema is <strong>ahead</strong> of this app deployment
        (DB&nbsp;v{status.dbVersion} vs app&nbsp;v{status.expectedVersion}).
        The app needs to be redeployed with the latest code.
      </div>
    );
  }

  if (status.status === "db_behind") {
    return (
      <div
        className="bg-amber-900/80 text-amber-100 px-4 py-2 text-center text-sm"
        role="alert"
        data-testid="schema-banner"
      >
        ⚠️ Database schema is <strong>behind</strong> (v{status.dbVersion} →
        v{status.expectedVersion}). Auto-migration failed
        {status.error ? `: ${status.error}` : ""}. The site may be missing
        some features.
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
        v{status.expectedVersion}). Another instance is applying migrations —
        refresh in a moment.
      </div>
    );
  }

  return null;
}
