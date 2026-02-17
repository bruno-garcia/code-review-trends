"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useTransition } from "react";

type ProductOption = { id: string; name: string; avatar_url: string; brand_color: string };

export function PRFilters({
  productOptions,
  sort,
  selectedProduct,
  selectedLanguage,
  minStars,
}: {
  productOptions: ProductOption[];
  sort: string;
  selectedProduct?: string;
  selectedLanguage?: string;
  minStars?: number;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const applyFilters = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams();
      for (const [key, val] of searchParams.entries()) {
        if (key === "page") continue;
        if (key in updates) continue;
        params.append(key, val);
      }
      for (const [key, val] of Object.entries(updates)) {
        if (val === null) params.delete(key);
        else if (val) params.set(key, val);
        else params.delete(key);
      }
      const qs = params.toString();
      const newPath = `/prs${qs ? `?${qs}` : ""}`;
      document.dispatchEvent(
        new CustomEvent("navigation-start", { detail: { href: newPath } }),
      );
      startTransition(() => {
        router.push(newPath);
      });
    },
    [router, searchParams],
  );

  const sortOptions = [
    { value: "bots", label: "🤖 Most Bots" },
    { value: "thumbs_up", label: "👍 Thumbs Up" },
    { value: "comments", label: "💬 Comments" },
    { value: "stars", label: "⭐ Stars" },
    { value: "recent", label: "🕐 Recent" },
  ] as const;

  return (
    <div data-testid="pr-filters" className={`transition-opacity duration-200 ${isPending ? "opacity-60 pointer-events-none" : ""}`}>
      <div className="flex items-center gap-3 flex-wrap">
        {/* Sort buttons */}
        <div className="flex gap-1">
          {sortOptions.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => applyFilters({ sort: value === "bots" ? null : value })}
              className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                sort === value
                  ? "bg-violet-600 text-white"
                  : "bg-theme-border text-theme-muted hover:text-theme-text"
              }`}
              data-testid={`sort-${value}`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Product filter */}
        <select
          value={selectedProduct ?? ""}
          onChange={(e) => applyFilters({ product: e.target.value || null })}
          className="px-3 py-1.5 text-sm rounded-md bg-theme-border text-theme-muted border-none"
          data-testid="product-filter"
        >
          <option value="">All products</option>
          {productOptions.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>

        {/* Clear */}
        {(selectedProduct || selectedLanguage || minStars) && (
          <button
            type="button"
            onClick={() => applyFilters({ product: null, lang: null, stars: null, sort: null })}
            className="px-3 py-1.5 text-sm text-theme-muted hover:text-theme-text transition-colors"
          >
            Clear filters
          </button>
        )}
      </div>
    </div>
  );
}
