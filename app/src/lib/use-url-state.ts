"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";

/**
 * Like useState but syncs to a URL search parameter via history.replaceState.
 * Does NOT trigger server re-renders — ideal for client-side-only state
 * that should be shareable via URL (chart toggles, sort order, etc.).
 *
 * @param key - URL search parameter name
 * @param defaultValue - Default value (omitted from URL when active)
 */
export function useUrlState(
  key: string,
  defaultValue: string,
): [string, (value: string) => void] {
  const [value, setValueRaw] = useState(defaultValue);
  const initializedRef = useRef(false);

  // Hydrate from URL on mount (after SSR, avoids hydration mismatch)
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const urlValue = new URLSearchParams(window.location.search).get(key);
    if (urlValue !== null && urlValue !== defaultValue) {
      startTransition(() => {
        setValueRaw(urlValue);
      });
    }
  }, [key, defaultValue]);

  const setValue = useCallback(
    (newValue: string) => {
      setValueRaw(newValue);

      const params = new URLSearchParams(window.location.search);
      if (newValue === defaultValue) {
        params.delete(key);
      } else {
        params.set(key, newValue);
      }
      const qs = params.toString();
      window.history.replaceState(
        null,
        "",
        `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`,
      );
    },
    [key, defaultValue],
  );

  return [value, setValue];
}
