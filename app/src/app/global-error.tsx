"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({
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
    <html lang="en" className="dark">
      <body className="bg-gray-950 text-gray-100 antialiased flex items-center justify-center min-h-screen">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold">Something went wrong</h1>
          <p className="text-gray-400">An unexpected error occurred.</p>
          <button
            type="button"
            onClick={reset}
            className="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded text-white transition-colors"
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
