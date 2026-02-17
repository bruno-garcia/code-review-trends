"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { SchemaStatus } from "@/lib/migrations";

/**
 * When the schema is migrating, behind, or errored, replaces page content with
 * a status screen that auto-refreshes every 3 seconds until the issue resolves.
 * In the normal case (status "ok"), renders children with zero overhead.
 */
export function MigrationGate({
  status,
  children,
}: {
  status: SchemaStatus;
  children: React.ReactNode;
}) {
  const needsGate =
    status.status === "migrating" ||
    status.status === "db_behind" ||
    status.status === "error";

  return needsGate ? <MigrationScreen status={status} /> : <>{children}</>;
}

function MigrationScreen({ status }: { status: SchemaStatus }) {
  const router = useRouter();

  useEffect(() => {
    const interval = setInterval(() => {
      router.refresh();
    }, 3000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isError = status.status === "error";
  const isMigrating = status.status === "migrating";

  return (
    <div
      className="flex items-center justify-center min-h-[60vh]"
      role="status"
      aria-live="polite"
    >
      <div className="text-center max-w-md mx-auto px-4">
        {/* Spinner */}
        <div className="mb-6 flex justify-center" aria-hidden="true">
          <div className="h-10 w-10 rounded-full border-4 border-violet-500/30 border-t-violet-500 animate-spin" />
        </div>

        <h2 className="text-xl font-semibold text-theme-text mb-2">
          {isError
            ? "Connecting to database…"
            : isMigrating
              ? "Updating database…"
              : "Preparing database…"}
        </h2>
        <p className="text-theme-muted text-sm leading-relaxed">
          {isError
            ? "Waiting for the database to become available. This page will refresh automatically."
            : isMigrating
              ? `Migrating schema from v${status.dbVersion} to v${status.expectedVersion}. This usually takes a few seconds.`
              : `Running schema migration to v${status.expectedVersion}. This usually takes a few seconds.`}
        </p>
        <span className="sr-only">Loading, please wait.</span>
      </div>
    </div>
  );
}
