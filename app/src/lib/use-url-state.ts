"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";

/**
 * Custom event name for cross-instance synchronization.
 * When one useUrlState instance updates a key, all other instances
 * watching the same key are notified via this event.
 */
const URL_STATE_CHANGE_EVENT = "url-state-change";

/**
 * Like useState but syncs to a URL search parameter via history.replaceState.
 * Does NOT trigger server re-renders — ideal for client-side-only state
 * that should be shareable via URL (chart toggles, sort order, etc.).
 *
 * Multiple component instances using the same key stay in sync: when one
 * instance calls setValue, all others are notified via a custom DOM event.
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

  // Listen for changes from other useUrlState instances with the same key.
  // history.replaceState doesn't fire popstate, so we use a custom event.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ key: string; value: string }>).detail;
      if (detail.key === key) {
        setValueRaw(detail.value);
      }
    };
    window.addEventListener(URL_STATE_CHANGE_EVENT, handler);
    return () => window.removeEventListener(URL_STATE_CHANGE_EVENT, handler);
  }, [key]);

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

      // Notify other useUrlState instances watching the same key
      window.dispatchEvent(
        new CustomEvent(URL_STATE_CHANGE_EVENT, {
          detail: { key, value: newValue },
        }),
      );
    },
    [key, defaultValue],
  );

  return [value, setValue];
}
