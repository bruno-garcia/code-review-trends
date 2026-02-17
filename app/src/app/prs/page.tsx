import Link from "next/link";
import { getPRList, getProducts, type PRListSort } from "@/lib/clickhouse";
import { formatNumber } from "@/lib/format";
import { PRFilters } from "./pr-filters";

export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function PRsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;

  const sort = parseSortParam(sp.sort);
  const language = typeof sp.lang === "string" ? sp.lang : undefined;
  const productId = typeof sp.product === "string" ? sp.product : undefined;
  const minStars = sp.stars ? parseInt(String(sp.stars), 10) || 0 : undefined;
  const page = Math.max(1, parseInt(String(sp.page ?? "1"), 10) || 1);
  const offset = (page - 1) * PAGE_SIZE;

  const [result, products] = await Promise.all([
    getPRList({ sort, language, productId, minStars, limit: PAGE_SIZE, offset }),
    getProducts(),
  ]);

  const total = Number(result.total);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  const productOptions = products.map((p) => ({
    id: p.id,
    name: p.name,
    avatar_url: p.avatar_url,
    brand_color: p.brand_color,
  }));

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">PR Explorer</h1>
        <p className="mt-2 text-theme-muted">
          {total.toLocaleString()} pull requests reviewed by AI bots on GitHub.
        </p>
      </div>

      <PRFilters
        productOptions={productOptions}
        sort={sort}
        selectedProduct={productId}
        selectedLanguage={language}
        minStars={minStars}
      />

      <div data-testid="pr-explorer">
        {result.prs.length === 0 ? (
          <p className="text-theme-muted py-8 text-center">
            No pull requests match the current filters.
          </p>
        ) : (
          <div className="space-y-2">
            {result.prs.map((pr, i) => (
              <a
                key={`${pr.repo_name}/${pr.pr_number}`}
                href={`https://github.com/${pr.repo_name}/pull/${pr.pr_number}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-start gap-4 py-3 px-4 rounded-lg hover:bg-theme-surface/60 transition-colors group"
                data-testid="pr-row"
              >
                {/* Rank */}
                <span className="text-theme-muted text-sm w-8 text-right shrink-0 tabular-nums pt-0.5">
                  {offset + i + 1}
                </span>

                {/* Main content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                      pr.state === "merged" ? "bg-purple-500/20 text-purple-400"
                        : pr.state === "closed" ? "bg-red-500/20 text-red-400"
                        : "bg-green-500/20 text-green-400"
                    }`}>
                      {pr.state}
                    </span>
                    <span className="text-base font-medium text-theme-text group-hover:text-indigo-400 truncate">
                      {pr.title || `${pr.repo_name}#${pr.pr_number}`}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-xs text-theme-muted">
                    <span>{pr.repo_name}</span>
                    <span>by {pr.author || "unknown"}</span>
                    {pr.primary_language && (
                      <span className="bg-theme-border/40 px-1.5 py-0.5 rounded">{pr.primary_language}</span>
                    )}
                  </div>
                </div>

                {/* Bot badges */}
                <div className="hidden sm:flex items-center gap-1 shrink-0">
                  {pr.bot_names.slice(0, 3).map((name) => (
                    <span key={name} className="text-xs text-theme-muted/70 bg-theme-border/40 px-1.5 py-0.5 rounded">
                      {name}
                    </span>
                  ))}
                  {pr.bot_names.length > 3 && (
                    <span className="text-xs text-theme-muted/50">+{pr.bot_names.length - 3}</span>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 shrink-0 text-sm tabular-nums">
                  {Number(pr.comment_thumbs_up) > 0 && (
                    <span className="text-theme-muted" title="Thumbs up on bot comments">
                      👍 {pr.comment_thumbs_up}
                    </span>
                  )}
                  {Number(pr.comment_thumbs_down) > 0 && (
                    <span className="text-theme-muted" title="Thumbs down on bot comments">
                      👎 {pr.comment_thumbs_down}
                    </span>
                  )}
                  {Number(pr.total_bot_comments) > 0 && (
                    <span className="text-theme-muted/70" title="Bot review comments">
                      💬 {pr.total_bot_comments}
                    </span>
                  )}
                  <span className="text-theme-muted/70 w-16 text-right" title="Stars">
                    ⭐ {formatNumber(Number(pr.repo_stars))}
                  </span>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <nav className="flex items-center justify-center gap-2 pt-4" data-testid="pr-pagination">
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
      href={`/prs${qs ? `?${qs}` : ""}`}
      className="px-4 py-2 text-sm rounded-lg bg-theme-surface border border-theme-border hover:border-theme-border-hover transition-colors"
    >
      {label}
    </Link>
  );
}

function parseSortParam(val: string | string[] | undefined): PRListSort {
  const s = String(val ?? "bots");
  if (s === "thumbs_up" || s === "comments" || s === "stars" || s === "recent") return s;
  return "bots";
}
