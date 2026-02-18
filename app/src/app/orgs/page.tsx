import type { Metadata } from "next";
import Link from "next/link";
import {
  getOrgList,
  getOrgLanguageOptions,
  getProducts,
} from "@/lib/clickhouse";
import { formatNumber } from "@/lib/format";
import { OrgFilters } from "./org-filters";
import { OrgProductSync } from "./org-product-sync";

export const metadata: Metadata = {
  title: "Organizations Using AI Code Review",
  description:
    "Browse thousands of organizations using AI code review on GitHub. Filter by language, product, and sort by stars, repos, or PRs.",
  alternates: { canonical: "/orgs" },
};

const PAGE_SIZE = 50;

export default async function OrgsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  // Parse filters from search params
  const languages = parseArray(sp.lang);
  const productIds = parseArray(sp.product);
  const sort = parseSortParam(sp.sort);
  const search = String(sp.q ?? "").trim();
  const page = Math.max(1, parseInt(String(sp.page ?? "1"), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  // Fetch data + filter options in parallel
  const [result, languageOptions, products] = await Promise.all([
    getOrgList({ languages, productIds, sort, search, limit: PAGE_SIZE, offset }),
    getOrgLanguageOptions(),
    getProducts(),
  ]);

  const total = Number(result.total);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const productNameMap = new Map(products.map((p) => [p.id, p.name]));

  const isFiltered = productIds.length > 0 || languages.length > 0 || search.length > 0;

  return (
    <div className="space-y-6">
      <OrgProductSync />
      <div>
        <h1 className="text-3xl font-bold">Organizations</h1>
        <p className="mt-2 text-theme-muted">
          {total.toLocaleString()} organizations
          {isFiltered ? " matching current filters" : " using AI code review on GitHub"}.
        </p>
      </div>

      {/* Filters */}
      <OrgFilters
        languageOptions={languageOptions}
        selectedLanguages={languages}
        sort={sort}
        search={search}
      />

      {/* Results */}
      <div data-testid="org-list">
        {result.orgs.length === 0 ? (
          <p className="text-theme-muted py-8 text-center">
            No organizations match the current filters.
          </p>
        ) : (
          <div className="space-y-2">
            {result.orgs.map((org, i) => (
              <Link
                key={org.owner}
                href={`/orgs/${org.owner}`}
                className="flex items-center gap-4 py-3 px-4 rounded-lg hover:bg-theme-surface/60 transition-colors group"
                data-testid="org-row"
              >
                {/* Rank */}
                <span className="text-theme-muted text-sm w-8 text-right shrink-0 tabular-nums">
                  {offset + i + 1}
                </span>

                {/* Avatar */}
                <img
                  src={`https://github.com/${org.owner}.png?size=40`}
                  alt={org.owner}
                  width={32}
                  height={32}
                  className="rounded-full bg-theme-surface shrink-0"
                />

                {/* Name + languages */}
                <div className="min-w-0 flex-1">
                  <span className="text-base font-medium text-theme-text group-hover:text-indigo-400 group-hover:underline transition-colors">
                    {org.owner}
                  </span>
                  {org.languages.filter(Boolean).length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-0.5 items-center">
                      {org.languages
                        .filter(Boolean)
                        .slice(0, 6)
                        .map((lang) => (
                          <span
                            key={lang}
                            className="text-xs text-theme-muted bg-theme-surface-alt px-1.5 py-0.5 rounded border border-theme-border/60 leading-none"
                          >
                            {lang}
                          </span>
                        ))}
                      {org.languages.filter(Boolean).length > 6 && (
                        <span className="text-xs text-theme-muted leading-none">
                          +{org.languages.filter(Boolean).length - 6}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Products used */}
                {org.product_ids.length > 0 && (
                  <div className="hidden sm:flex items-center gap-1 shrink-0">
                    {org.product_ids.slice(0, 3).map((pid) => (
                      <span
                        key={pid}
                        className="text-xs text-theme-muted bg-theme-surface-alt px-1.5 py-0.5 rounded border border-theme-border/60 leading-none"
                        title={productNameMap.get(pid) ?? pid}
                      >
                        {productNameMap.get(pid) ?? pid}
                      </span>
                    ))}
                    {org.product_ids.length > 3 && (
                      <span className="text-xs text-theme-muted leading-none">
                        +{org.product_ids.length - 3}
                      </span>
                    )}
                  </div>
                )}

                {/* Stats */}
                <div className="flex items-center gap-4 shrink-0 text-sm tabular-nums">
                  <span className="text-theme-muted w-20 text-right" title="GitHub stars across all repos">
                    ⭐ {formatNumber(Number(org.total_stars))}
                  </span>
                  <span className="hidden md:inline text-theme-muted w-16 text-right" title="Repos with AI-reviewed PRs">
                    {Number(org.repo_count)} {Number(org.repo_count) === 1 ? "repo" : "repos"}
                  </span>
                  {Number(org.total_prs) > 0 && (
                    <span className="hidden lg:inline text-theme-muted w-20 text-right" title="Pull requests reviewed by AI bots">
                      {formatNumber(Number(org.total_prs))} PRs
                    </span>
                  )}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-4" data-testid="org-pagination">
          {page > 1 && (
            <PaginationLink page={page - 1} sp={sp} label="← Previous" />
          )}
          <span className="text-sm text-theme-muted px-3">
            Page {page} of {totalPages}
          </span>
          {page < totalPages && (
            <PaginationLink page={page + 1} sp={sp} label="Next →" />
          )}
        </nav>
      )}
    </div>
  );
}

function PaginationLink({
  page,
  sp,
  label,
}: {
  page: number;
  sp: Record<string, string | string[] | undefined>;
  label: string;
}) {
  const params = new URLSearchParams();
  // Preserve existing filters
  for (const [key, val] of Object.entries(sp)) {
    if (key === "page") continue;
    if (Array.isArray(val)) {
      for (const v of val) params.append(key, v);
    } else if (val) {
      params.set(key, val);
    }
  }
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return (
    <Link
      href={`/orgs${qs ? `?${qs}` : ""}`}
      className="px-4 py-2 text-sm rounded-lg bg-theme-surface border border-theme-border hover:border-theme-border-hover transition-colors"
    >
      {label}
    </Link>
  );
}

// --- helpers ---

function parseArray(val: string | string[] | undefined): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean);
  return val.split(",").filter(Boolean);
}

function parseSortParam(val: string | string[] | undefined): "stars" | "repos" | "prs" {
  const s = String(val ?? "stars");
  if (s === "repos" || s === "prs") return s;
  return "stars";
}
