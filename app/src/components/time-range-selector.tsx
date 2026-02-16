"use client";

import { Suspense, useCallback, useTransition } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { TIME_RANGE_OPTIONS, parseTimeRange, type TimeRangeKey } from "@/lib/time-range";

function TimeRangeSelectorInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const current = parseTimeRange(searchParams.get("range"));

  const setRange = useCallback(
    (key: TimeRangeKey) => {
      const params = new URLSearchParams(searchParams.toString());
      if (key === "all") {
        params.delete("range");
      } else {
        params.set("range", key);
      }
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      startTransition(() => {
        router.push(url, { scroll: false });
      });
    },
    [searchParams, pathname, router],
  );

  return (
    <div
      className={`flex items-center gap-1 shrink-0 transition-opacity ${isPending ? "opacity-60" : ""}`}
      data-testid="time-range-selector"
    >
      {TIME_RANGE_OPTIONS.map((opt) => (
        <button
          key={opt.key}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setRange(opt.key);
          }}
          className={`px-2 py-1 text-xs rounded-md transition-colors whitespace-nowrap ${
            current === opt.key
              ? "bg-violet-600 text-white"
              : "bg-theme-border text-theme-muted hover:text-theme-text"
          }`}
          aria-pressed={current === opt.key}
          data-testid={`time-range-${opt.key}`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Wrapped in Suspense so static pages (e.g. /about) can pre-render. */
export function TimeRangeSelector() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center gap-1 shrink-0" data-testid="time-range-selector">
          {TIME_RANGE_OPTIONS.map((opt) => (
            <span
              key={opt.key}
              className="px-2 py-1 text-xs rounded-md bg-theme-border text-theme-muted whitespace-nowrap"
            >
              {opt.label}
            </span>
          ))}
        </div>
      }
    >
      <TimeRangeSelectorInner />
    </Suspense>
  );
}
