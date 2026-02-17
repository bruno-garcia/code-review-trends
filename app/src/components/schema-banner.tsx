import { type SchemaStatus } from "@/lib/migrations";

function SentryLink({ eventId }: { eventId?: string }) {
  if (!eventId) return null;
  const href = `https://bruno-garcia.sentry.io/projects/code-review-trends/events/${eventId}/`;
  return (
    <>
      {" "}
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="underline underline-offset-2 hover:opacity-80"
      >
        Sentry: {eventId.slice(0, 8)}
      </a>
    </>
  );
}

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
        ⚠️ Database schema is <strong>ahead</strong> of this app deployment
        (DB&nbsp;v{status.dbVersion} vs app&nbsp;v{status.expectedVersion}).
        The app needs to be redeployed with the latest code.
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
        ⚠️ Database schema is <strong>behind</strong> this app
        (DB&nbsp;v{status.dbVersion}, app expects&nbsp;v
        {status.expectedVersion}). Auto-migration failed.
        <SentryLink eventId={status.sentryEventId} />
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

  if (status.status === "error") {
    return (
      <div
        className="bg-red-900/80 text-red-100 px-4 py-2 text-center text-sm"
        role="alert"
        data-testid="schema-banner"
      >
        ⚠️ Schema check failed — could not connect to ClickHouse or run
        migrations.
        <SentryLink eventId={status.sentryEventId} />
      </div>
    );
  }

  return null;
}
