"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-md mx-auto px-4 space-y-4">
        <h2 className="text-xl font-semibold">Failed to load data</h2>
        <p className="text-theme-muted text-sm">
          Could not connect to the database. This is usually temporary.
        </p>
        <button
          type="button"
          onClick={reset}
          className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded text-white text-sm transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
