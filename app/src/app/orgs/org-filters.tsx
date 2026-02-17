"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState, useCallback, useTransition } from "react";

type LanguageOption = { value: string; count: number };
type ProductOption = { id: string; name: string; avatar_url: string; brand_color: string };

export function OrgFilters({
  languageOptions,
  productOptions,
  selectedLanguages,
  selectedProducts,
  sort,
}: {
  languageOptions: LanguageOption[];
  productOptions: ProductOption[];
  selectedLanguages: string[];
  selectedProducts: string[];
  sort: string;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(
    selectedLanguages.length > 0 || selectedProducts.length > 0,
  );

  const applyFilters = useCallback(
    (updates: Record<string, string | string[] | null>) => {
      const params = new URLSearchParams();
      // Start from current params
      for (const [key, val] of searchParams.entries()) {
        if (key === "page") continue; // reset to page 1 on filter change
        if (key in updates) continue; // will be overwritten
        params.append(key, val);
      }
      // Apply updates
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
      const newPath = `/orgs${qs ? `?${qs}` : ""}`;
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

  const toggleProduct = (productId: string) => {
    const current = new Set(selectedProducts);
    if (current.has(productId)) current.delete(productId);
    else current.add(productId);
    applyFilters({ product: [...current] });
  };

  const clearAll = () => {
    applyFilters({ lang: null, product: null, sort: null });
  };

  const hasFilters = selectedLanguages.length > 0 || selectedProducts.length > 0;

  return (
    <div data-testid="org-filters" className={`transition-opacity duration-200 ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
      {/* Controls row */}
      <div className="flex items-center gap-3 flex-wrap">
        {/* Sort */}
        <div className="flex gap-1">
          {(["stars", "repos", "prs"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => applyFilters({ sort: s === "stars" ? null : s })}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                sort === s
                  ? "bg-violet-600 text-white"
                  : "bg-theme-border text-theme-muted hover:text-theme-text"
              }`}
              data-testid={`sort-${s}`}
            >
              {s === "stars" ? "⭐ Stars" : s === "repos" ? "Repos" : "AI PRs"}
            </button>
          ))}
        </div>

        {/* Filter toggle */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="px-3 py-1.5 text-sm rounded-md bg-theme-border text-theme-muted hover:text-theme-text transition-colors"
          data-testid="toggle-filters"
        >
          Filters {hasFilters && `(${selectedLanguages.length + selectedProducts.length})`}{" "}
          {expanded ? "▲" : "▼"}
        </button>

        {/* Clear */}
        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="px-3 py-1.5 text-sm text-theme-muted hover:text-theme-text transition-colors"
            data-testid="clear-filters"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Expanded filter panels */}
      {expanded && (
        <div className="mt-4 space-y-4 bg-theme-surface rounded-xl p-5 border border-theme-border">
          {/* Languages */}
          <div>
            <h3 className="text-sm font-medium text-theme-muted mb-2">Languages</h3>
            <div className="flex flex-wrap gap-1.5" data-testid="language-filters">
              {languageOptions.map((opt) => {
                const active = selectedLanguages.includes(opt.value);
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => toggleLanguage(opt.value)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors ${
                      active
                        ? "bg-violet-600 text-white"
                        : "bg-theme-border/60 text-theme-muted hover:text-theme-text hover:bg-theme-border"
                    }`}
                  >
                    {opt.value}
                    <span className="ml-1 opacity-60">{Number(opt.count).toLocaleString()}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Products */}
          <div>
            <h3 className="text-sm font-medium text-theme-muted mb-2">AI Review Products</h3>
            <div className="flex flex-wrap gap-1.5" data-testid="product-filters">
              {productOptions.map((p) => {
                const active = selectedProducts.includes(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => toggleProduct(p.id)}
                    className={`px-2.5 py-1 text-xs rounded-full transition-colors flex items-center gap-1.5 ${
                      active
                        ? "bg-violet-600 text-white"
                        : "bg-theme-border/60 text-theme-muted hover:text-theme-text hover:bg-theme-border"
                    }`}
                  >
                    {p.avatar_url && (
                      <img
                        src={p.avatar_url}
                        alt=""
                        width={14}
                        height={14}
                        className="rounded-full"
                      />
                    )}
                    {p.name}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
