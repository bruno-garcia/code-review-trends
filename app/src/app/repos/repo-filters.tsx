"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useRef, useTransition } from "react";

type LanguageOption = { value: string; count: number };

const SORT_OPTIONS = [
  { key: "stars", label: "⭐ Stars", tip: "Sort by GitHub stars" },
  { key: "prs", label: "Reviewed PRs", tip: "Sort by pull requests reviewed by AI bots" },
] as const;

export function RepoFilters({
  languageOptions,
  selectedLanguages,
  sort,
  search,
}: {
  languageOptions: LanguageOption[];
  selectedLanguages: string[];
  sort: string;
  search: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const applyFilters = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams();
      for (const [key, val] of searchParams.entries()) {
        if (key === "page") continue;
        if (key in updates) continue;
        params.append(key, val);
      }
      for (const [key, val] of Object.entries(updates)) {
        if (val === null) {
          params.delete(key);
        } else if (Array.isArray(val)) {
          params.delete(key);
          for (const v of val) {
            if (v) params.append(key, v);
          }
        } else if (val) {
          params.set(key, val);
        } else {
          params.delete(key);
        }
      }
      const qs = params.toString();
      const newPath = `/repos${qs ? `?${qs}` : ""}`;
      document.dispatchEvent(
        new CustomEvent("navigation-start", { detail: { href: newPath } }),
      );
      startTransition(() => {
        router.push(newPath);
      });
    },
    [router, searchParams],
  );

  const toggleLanguage = (lang: string) => {
    const current = new Set(selectedLanguages);
    if (current.has(lang)) current.delete(lang);
    else current.add(lang);
    applyFilters({ lang: [...current] });
  };

  const hasFilters = selectedLanguages.length > 0 || search.length > 0;
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  return (
    <div data-testid="repo-filters" className={`transition-opacity duration-200 ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-3 flex-wrap">
        {/* Search */}
        <div className="relative">
          <input
            type="text"
            placeholder="Search repos…"
            defaultValue={search}
            onChange={(e) => {
              const val = e.target.value.trim();
              if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
              searchTimerRef.current = setTimeout(() => {
                applyFilters({ q: val || null });
              }, 300);
            }}
            className="pl-8 pr-3 py-1.5 text-sm rounded-md bg-theme-surface border border-theme-border text-theme-text placeholder:text-theme-muted/60 focus:outline-none focus:border-violet-500 w-44 sm:w-56"
            data-testid="repo-search"
          />
          <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-theme-muted/60" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
        </div>

        {/* Sort */}
        <div className="flex gap-1">
          {SORT_OPTIONS.map(({ key, label, tip }) => (
            <button
              key={key}
              type="button"
              onClick={() => applyFilters({ sort: key === "stars" ? null : key })}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                sort === key
                  ? "bg-violet-600 text-white"
                  : "bg-theme-surface border border-theme-border text-theme-muted hover:text-theme-text"
              }`}
              title={tip}
              data-testid={`sort-${key}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Language pills */}
        {selectedLanguages.length > 0 && (
          <div className="flex items-center gap-1.5">
            {selectedLanguages.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => toggleLanguage(lang)}
                className="px-2 py-1 text-xs rounded-full bg-violet-600 text-white flex items-center gap-1"
              >
                {lang} ✕
              </button>
            ))}
          </div>
        )}

        {/* Clear */}
        {hasFilters && (
          <button
            type="button"
            onClick={() => applyFilters({ lang: null, q: null, sort: null })}
            className="px-3 py-1.5 text-sm text-theme-muted hover:text-theme-text transition-colors"
            data-testid="clear-filters"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Language chips */}
      <div className="mt-3 flex flex-wrap gap-1.5" data-testid="language-filters">
        {languageOptions.slice(0, 20).map((opt) => {
          const active = selectedLanguages.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => toggleLanguage(opt.value)}
              className={`px-2 py-0.5 text-xs rounded transition-colors ${
                active
                  ? "bg-violet-600 text-white"
                  : "bg-theme-surface border border-theme-border text-theme-muted hover:text-theme-text hover:border-theme-border-hover"
              }`}
              title={`${Number(opt.count).toLocaleString()} repositories using ${opt.value}`}
            >
              {opt.value}
            </button>
          );
        })}
      </div>
    </div>
  );
}
