"use client";

import { useState, useRef, useEffect } from "react";

const SHORT_SHA_LENGTH = 7;

export function VersionStamp() {
  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "unknown";
  const shortSha = commitSha.slice(0, SHORT_SHA_LENGTH);
  const [copied, setCopied] = useState(false);
  const timerRef = useRef<NodeJS.Timeout>();

  useEffect(() => {
    return () => clearTimeout(timerRef.current);
  }, []);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(commitSha);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy version to clipboard:", err);
    }
  }

  return (
    <button
      type="button"
      onClick={handleCopy}
      data-testid="version-stamp"
      title={`Version: ${shortSha} — click to copy`}
      className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-400 transition-colors font-mono text-xs cursor-pointer"
    >
      <span>{shortSha}</span>
      {copied && (
        <span
          className="text-emerald-400"
          data-testid="version-copied"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden="true">✓</span>
          <span className="sr-only">Copied to clipboard</span>
        </span>
      )}
    </button>
  );
}
