"use client";

import { useState } from "react";

const SHORT_SHA_LENGTH = 7;

export function VersionStamp() {
  const commitSha = process.env.NEXT_PUBLIC_COMMIT_SHA ?? "unknown";
  const shortSha = commitSha.slice(0, SHORT_SHA_LENGTH);
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(shortSha);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API may not be available (e.g. non-HTTPS)
    }
  }

  return (
    <button
      onClick={handleCopy}
      data-testid="version-stamp"
      title={`Version: ${shortSha} — click to copy`}
      className="inline-flex items-center gap-1 text-gray-600 hover:text-gray-400 transition-colors font-mono text-xs cursor-pointer"
    >
      <span>{shortSha}</span>
      {copied && (
        <span className="text-emerald-400" data-testid="version-copied">
          ✓
        </span>
      )}
    </button>
  );
}
