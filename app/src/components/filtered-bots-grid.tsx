"use client";

import { useProductFilter } from "@/lib/product-filter";
import type { ProductSummary } from "@/lib/clickhouse";
import Link from "next/link";

export function FilteredBotsGrid({
  summaries,
}: {
  summaries: ProductSummary[];
}) {
  const { selectedProductIds } = useProductFilter();
  const selected = new Set(selectedProductIds);
  const filtered = summaries.filter((p) => selected.has(p.id));

  return (
    <div
      className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
      data-testid="bots-grid"
    >
      {filtered.map((product) => (
        <Link
          key={product.id}
          href={`/bots/${product.id}`}
          className="block bg-theme-surface rounded-xl p-6 border border-theme-border hover:border-violet-500/50 transition-colors"
          data-testid={`bot-card-${product.id}`}
        >
          <div className="flex items-center gap-3 mb-3">
            {product.avatar_url && (
              <img
                src={product.avatar_url}
                alt={product.name}
                width={40}
                height={40}
                className="rounded-full bg-theme-surface-alt border border-theme-border"
              />
            )}
            <h2
              className="text-xl font-semibold"
              style={{ color: product.brand_color || "#a78bfa" }}
            >
              {product.name}
            </h2>
          </div>
          <p className="text-sm text-theme-muted line-clamp-2">
            {product.description}
          </p>
          <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
            <div>
              <span className="text-theme-muted-dim">Reviews</span>
              <p className="font-medium tabular-nums">
                {Number(product.total_reviews).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-theme-muted-dim">PR Comments</span>
              <p className="font-medium tabular-nums">
                {Number(product.total_pr_comments).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-theme-muted-dim">Repos</span>
              <p className="font-medium tabular-nums">
                {Number(product.total_repos).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-theme-muted-dim">Orgs</span>
              <p className="font-medium tabular-nums">
                {Number(product.total_orgs).toLocaleString()}
              </p>
            </div>
            <div>
              <span className="text-theme-muted-dim">Approval</span>
              <p className="font-medium tabular-nums">
                {Number(product.approval_rate).toFixed(0)}%
              </p>
            </div>
            <div>
              <span className="text-theme-muted-dim">Growth</span>
              <p
                className={`font-medium tabular-nums ${Number(product.growth_pct) >= 0 ? "text-emerald-400" : "text-red-400"}`}
              >
                {Number(product.growth_pct) >= 0 ? "+" : ""}
                {Number(product.growth_pct).toFixed(1)}%
              </p>
            </div>
          </div>
        </Link>
      ))}
    </div>
  );
}
