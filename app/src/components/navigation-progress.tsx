"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * Global navigation progress bar.
 *
 * Shows a thin animated bar at the top of the viewport during page navigations.
 * Detects navigation start via:
 *   - Click on internal <a> elements (Next.js <Link> renders as <a>)
 *   - Custom "navigation-start" CustomEvents dispatched by components using
 *     router.push (detail.href carries the target URL for same-URL filtering)
 * Detects completion when pathname or searchParams change.
 */
function ProgressBar() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [state, setState] = useState<"idle" | "loading" | "complete">("idle");
  const urlRef = useRef(`${pathname}?${searchParams.toString()}`);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Detect clicks on internal links and custom navigation-start events
  useEffect(() => {
    function startLoading() {
      clearTimeout(completeTimerRef.current);
      clearTimeout(safetyTimerRef.current);
      setState("loading");
      // Safety timeout: auto-clear after 10s in case URL never changes
      safetyTimerRef.current = setTimeout(() => {
        setState((prev) => {
          if (prev !== "loading") return prev;
          completeTimerRef.current = setTimeout(() => setState("idle"), 500);
          return "complete";
        });
      }, 10_000);
    }

    /** Returns true if href points to the current URL (no navigation needed). */
    function isSameUrl(href: string): boolean {
      try {
        const url = new URL(href, window.location.origin);
        return (
          url.pathname === window.location.pathname &&
          url.search === window.location.search
        );
      } catch {
        return false;
      }
    }

    function handleClick(e: MouseEvent) {
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;

      const anchor = (e.target as HTMLElement).closest("a");
      if (!anchor) return;
      if (anchor.target === "_blank") return;

      const href = anchor.getAttribute("href");
      if (
        !href ||
        href.startsWith("http") ||
        href.startsWith("//") ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return;

      if (isSameUrl(href)) return;

      startLoading();
    }

    function handleNavigationStart(e: Event) {
      const href = (e as CustomEvent<{ href?: string }>).detail?.href;
      if (href && isSameUrl(href)) return;
      startLoading();
    }

    document.addEventListener("click", handleClick, true);
    document.addEventListener("navigation-start", handleNavigationStart);
    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("navigation-start", handleNavigationStart);
    };
  }, []);

  // When URL changes, schedule completion.
  // We use requestAnimationFrame to move the state update out of the
  // synchronous effect body (avoids react-hooks/set-state-in-effect).
  useEffect(() => {
    const newUrl = `${pathname}?${searchParams.toString()}`;
    if (urlRef.current !== newUrl) {
      urlRef.current = newUrl;
      const raf = requestAnimationFrame(() => {
        setState((prev) => {
          if (prev !== "loading") return prev;
          clearTimeout(completeTimerRef.current);
          clearTimeout(safetyTimerRef.current);
          completeTimerRef.current = setTimeout(() => setState("idle"), 500);
          return "complete";
        });
      });
      return () => cancelAnimationFrame(raf);
    }
  }, [pathname, searchParams]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimeout(completeTimerRef.current);
      clearTimeout(safetyTimerRef.current);
    };
  }, []);

  if (state === "idle") return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[100] h-[2px] overflow-hidden pointer-events-none">
      <div
        className={`h-full w-full rounded-r-full ${
          state === "loading" ? "nav-progress-bar" : "nav-progress-complete"
        }`}
        style={{
          background: "linear-gradient(90deg, #8b5cf6, #6366f1, #8b5cf6)",
          boxShadow:
            "0 0 10px rgba(139, 92, 246, 0.5), 0 0 4px rgba(99, 102, 241, 0.3)",
        }}
      />
    </div>
  );
}

/** Wrapped in Suspense because useSearchParams needs it for static pages. */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <ProgressBar />
    </Suspense>
  );
}
