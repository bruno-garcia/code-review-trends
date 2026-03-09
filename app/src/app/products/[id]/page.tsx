import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  getProductById,
  getProductSummaries,
  getProductBots,
  getWeeklyActivityByProduct,
  getBotsByLanguage,
  getAvgCommentsPerPR,
  getPrCommentSyncPct,
  getOrgList,
  getTopReposByProduct,
  getPrCharacteristics,
  isNewProduct,
  isDormantProduct,
} from "@/lib/clickhouse";
import { PrCommentSyncBanner } from "@/components/pr-comment-sync-banner";
import {
  SingleBotChart,
  BotLanguageChart,
} from "@/components/charts";
import { parseTimeRange, computeCutoffDate } from "@/lib/time-range";
import Link from "next/link";
import { ThemedProductHeader } from "@/components/themed-product-header";
import { SectionHeading } from "@/components/section-heading";
import { JsonLd } from "@/components/json-ld";
import { formatNumber, formatHours } from "@/lib/format";
import { InfoTooltip } from "@/components/info-tooltip";
import { OG_DEFAULTS } from "@/lib/constants";
import { ProductScopedLink } from "@/components/product-scoped-link";

/** Max top orgs/repos shown on the bot detail page. */
const TOP_N = 5;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const [product, summaries] = await Promise.all([
    getProductById(id),
    getProductSummaries(),
  ]);
  if (!product) return { title: "Product Not Found" };

  const summary = summaries.find((s) => s.id === id);
  const reviews = summary ? formatNumber(Number(summary.total_reviews)) : "0";
  const repos = summary ? formatNumber(Number(summary.total_repos)) : "0";
  const growthLabel = summary
    ? isDormantProduct(summary) ? "inactive" : isNewProduct(summary) ? "new" : `${Number(summary.growth_pct) >= 0 ? "+" : ""}${Number(summary.growth_pct).toFixed(1)}% growth`
    : "0% growth";

  const title = `${product.name} AI Code Review Stats & Trends`;
  const description = `${product.name} has performed ${reviews} code reviews across ${repos} repos (${growthLabel}). See weekly trends, language breakdown, and comparisons.`;

  return {
    title,
    description,
    alternates: { canonical: `/products/${id}` },
    openGraph: {
      ...OG_DEFAULTS,
      title,
      description,
      url: `/products/${id}`,
    },
    twitter: {
      title,
      description,
    },
  };
}

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const range = parseTimeRange(sp.range as string | undefined);
  const since = computeCutoffDate(range) ?? undefined;

  const [product, allSummaries, productBots, activity, languageData, commentsPerPR, prCommentSyncPct, topOrgs, topReposResult, prChars] = await Promise.all([
    getProductById(id),
    getProductSummaries(since),
    getProductBots(id, since),
    getWeeklyActivityByProduct(id, since),
    getBotsByLanguage(id, since),
    getAvgCommentsPerPR(id, since),
    getPrCommentSyncPct(),
    getOrgList({ productIds: [id], sort: "stars", limit: TOP_N }),
    getTopReposByProduct(id, TOP_N),
    getPrCharacteristics(id, since),
  ]);

  if (!product) {
    notFound();
  }

  const topRepos = topReposResult.repos;
  const totalRepoCount = topReposResult.total;
  const summary = allSummaries.find((s) => s.id === id);

  // Aggregate activity into chart data
  const chartData = activity.map((a) => ({
    week: a.week,
    review_count: Number(a.review_count),
    review_comment_count: Number(a.review_comment_count),
    pr_comment_count: Number(a.pr_comment_count),
    repo_count: Number(a.repo_count),
    org_count: Number(a.org_count),
  }));


  const totalReviews = Number(summary?.total_reviews ?? 0);
  const totalComments = Number(summary?.total_comments ?? 0);
  const totalPrComments = Number(summary?.total_pr_comments ?? 0);
  const totalRepos = Number(summary?.total_repos ?? 0);
  const totalOrgs = Number(summary?.total_orgs ?? 0);
  const avgCommentsPerReview = Number(summary?.avg_comments_per_review ?? 0);
  const commentsPerRepo = Number(summary?.comments_per_repo ?? 0);
  const avgCommentsPerPR = commentsPerPR.length > 0 ? Number(commentsPerPR[0].avg_comments_per_pr) : null;
  const growthPct = Number(summary?.growth_pct ?? 0);
  const productIsNew = summary ? isNewProduct(summary) : false;
  const productIsDormant = summary ? isDormantProduct(summary) : false;

  // Rank among all products (by growth rate — see /about#rankings).
  // allSummaries is already sorted by growth_pct DESC, total_reviews DESC
  // from getProductSummaries, so we can use the index directly.
  const growthRank = allSummaries.findIndex((s) => s.id === id) + 1;

  // Collect unique GitHub logins from bots
  const githubLogins = [
    ...new Set(productBots.map((b) => b.github_login).filter(Boolean)),
  ];

  return (
    <div className="space-y-10">
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: product.name,
          description: product.description,
          ...(product.status !== "retired" ? { url: product.website } : {}),
          applicationCategory: "DeveloperApplication",
          operatingSystem: "Web",
          ...(product.avatar_url ? { image: product.avatar_url } : {}),
        }}
      />
      <div>
        <Link
          href="/products"
          className="text-sm text-theme-muted hover:text-theme-text transition-colors"
        >
          ← Back to all products
        </Link>
        <ThemedProductHeader
          productId={product.id}
          name={product.name}
          avatarUrl={product.avatar_url}
          brandColor={product.brand_color}
        />
        <p className="mt-2 text-theme-muted">{product.description}</p>
        {(product.status === "retired" || productIsDormant) && (
          <div className="mt-3 inline-flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/30 px-4 py-2 text-sm text-amber-400">
            <span>⚠️</span>
            <span>
              {product.status === "retired"
                ? <><strong>Retired</strong> — this product appears to be no longer available. Historical data is preserved.</>
                : <><strong>Inactive</strong> — no review activity detected in the last 12 weeks. Historical data is preserved.</>}
            </span>
          </div>
        )}
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          {product.website && (
            (product.status === "retired") ? (
              <span className="text-sm text-theme-muted/50">{product.website}</span>
            ) : (
            <a
              href={product.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              {product.website} ↗
            </a>
            )
          )}
          {product.docs_url && product.docs_url !== product.website && (
            (product.status === "retired") ? (
              <span className="text-sm text-theme-muted/50">Docs</span>
            ) : (
            <a
              href={product.docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              Docs ↗
            </a>
            )
          )}
          {githubLogins.length > 0 && (
            <span className="text-sm text-theme-muted/70">
              GitHub:{" "}
              {githubLogins.map((login, i) => (
                <span key={login}>
                  {i > 0 && ", "}
                  <GitHubLogin login={login} />
                </span>
              ))}
            </span>
          )}
          {productIsDormant && !productIsNew && (
            <span className="shrink-0 rounded-full bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-xs font-medium text-amber-400">
              Inactive
            </span>
          )}
          {productIsNew && (
            <span className="shrink-0 rounded-full bg-blue-500/15 border border-blue-500/30 px-2 py-0.5 text-xs font-medium text-blue-400" data-testid="new-product-badge">
              New
            </span>
          )}
          <span className="text-sm text-theme-muted/70" data-testid="bot-rank">
            <InfoTooltip
              content={
                <>
                  Ranked by 12-week review growth rate.{" "}
                  <Link href="/about#rankings" className="text-blue-400 hover:underline">
                    Learn more →
                  </Link>
                </>
              }
            >
              <span>
                Rank: <span className="text-theme-text font-medium">#{growthRank}</span>{" "}
                of {allSummaries.length}
              </span>
            </InfoTooltip>
          </span>
        </div>
      </div>

      <PrCommentSyncBanner pct={prCommentSyncPct} />

      {/* Summary stats */}
      <div className="space-y-4" data-testid="bot-stats">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Reviews" value={totalReviews.toLocaleString()} />
          <StatCard label="Review Comments" value={totalComments.toLocaleString()} />
          <StatCard label="PR Comments" value={totalPrComments.toLocaleString()} />
          <StatCard label="Active Repos" value={totalRepos.toLocaleString()} />
          <StatCard label="Organizations" value={totalOrgs.toLocaleString()} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard
            label="Avg Comments/Review"
            value={avgCommentsPerReview.toFixed(1)}
          />
          <StatCard
            label="Comments/Repo"
            value={commentsPerRepo.toLocaleString()}
          />
          <StatCard
            label="Comments/PR"
            value={avgCommentsPerPR !== null ? avgCommentsPerPR.toFixed(2) : "—"}
          />
          <StatCard
            label="Growth (12w)"
            value={productIsDormant ? "Inactive" : productIsNew ? "New" : `${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`}
            color={productIsDormant ? "text-amber-400" : productIsNew ? "text-blue-400" : growthPct >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        </div>
      </div>

      {/* Activity chart */}
      <section data-testid="bot-activity-chart">
        <SectionHeading id="activity">Activity Over Time</SectionHeading>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <SingleBotChart data={chartData} />
        </div>
      </section>

      {/* Bot History (multi-bot products) */}
      {productBots.length > 1 && (
        <section data-testid="bot-history-section">
          <SectionHeading id="bot-history">Bot History</SectionHeading>
          <p className="text-theme-muted mb-4">
            This product has operated under multiple bot accounts over time.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-theme-muted border-b border-theme-border">
                <tr>
                  <th className="pb-3 pr-4">Bot</th>
                  <th className="pb-3 pr-4 text-right">Reviews</th>
                  <th className="pb-3 pr-4 text-right">Review Comments</th>
                  <th className="pb-3 pr-4 text-right">PR Comments</th>
                  <th className="pb-3 pr-4">First Seen</th>
                  <th className="pb-3">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {productBots.map((bot) => (
                  <tr
                    key={bot.id}
                    className="border-b border-theme-border/50"
                  >
                    <td className="py-3 pr-4 font-medium" data-testid={`bot-history-login-${bot.id}`}>
                      {bot.github_login || bot.id}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {Number(bot.total_reviews).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {Number(bot.total_comments).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {Number(bot.total_pr_comments).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-theme-muted">{bot.first_week}</td>
                    <td className="py-3 text-theme-muted">{bot.last_week}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}


      {/* PR Characteristics */}
      {prChars && (
        <section data-testid="bot-pr-characteristics">
          <SectionHeading id="pr-characteristics">
            Typical PR Profile
          </SectionHeading>
          <p className="text-theme-muted mb-4">
            Characteristics of pull requests reviewed by {product.name}, based
            on {Number(prChars.sampled_prs).toLocaleString()} enriched PRs.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <StatCard
              label="Avg Additions"
              value={`+${Number(prChars.avg_additions).toLocaleString()}`}
              color="text-emerald-400"
            />
            <StatCard
              label="Avg Deletions"
              value={`−${Number(prChars.avg_deletions).toLocaleString()}`}
              color="text-red-400"
            />
            <StatCard
              label="Avg Files Changed"
              value={Number(prChars.avg_changed_files).toLocaleString()}
            />
            <StatCard
              label="Merge Rate"
              value={`${prChars.merge_rate}%`}
            />
            <StatCard
              label="Avg Time to Merge"
              value={formatHours(prChars.avg_hours_to_merge)}
            />
          </div>
        </section>
      )}

      {/* Top Organizations */}
      {topOrgs.orgs.length > 0 && (
        <section data-testid="bot-top-orgs">
          <SectionHeading id="organizations">Top Organizations</SectionHeading>
          <p className="text-theme-muted mb-4">
            Highest-starred GitHub organizations using {product.name}.
          </p>
          <div className="space-y-2">
            {topOrgs.orgs.map((org, i) => {
              const langs = org.languages.filter(Boolean);
              return (
                <Link
                  key={org.owner}
                  href={`/orgs/${org.owner}`}
                  className="flex items-center gap-4 py-3 px-4 rounded-lg hover:bg-theme-surface/60 transition-colors group"
                >
                  <span className="text-theme-muted text-sm w-6 text-right shrink-0 tabular-nums">
                    {i + 1}
                  </span>
                  <img
                    src={`https://github.com/${org.owner}.png?size=40`}
                    alt={org.owner}
                    width={32}
                    height={32}
                    className="rounded-full bg-theme-surface shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <span className="text-base font-medium text-theme-text group-hover:text-indigo-400 group-hover:underline transition-colors">
                      {org.owner}
                    </span>
                    {langs.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-0.5 items-center">
                        {langs.slice(0, 4).map((lang) => (
                          <span
                            key={lang}
                            className="text-xs text-theme-muted bg-theme-surface-alt px-1.5 py-0.5 rounded border border-theme-border/60 leading-none"
                          >
                            {lang}
                          </span>
                        ))}
                        {langs.length > 4 && (
                          <span className="text-xs text-theme-muted leading-none">
                            +{langs.length - 4}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-4 shrink-0 text-sm tabular-nums">
                    <span className="text-theme-muted" title="GitHub stars">
                      ⭐ {formatNumber(Number(org.total_stars))}
                    </span>
                    <span className="hidden sm:inline text-theme-muted" title="Repos">
                      {Number(org.repo_count)} {Number(org.repo_count) === 1 ? "repo" : "repos"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
          {topOrgs.total > TOP_N && (
            <div className="mt-4">
              <ProductScopedLink
                productId={id}
                href={`/orgs?products=${id}`}
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                View all {topOrgs.total.toLocaleString()} organizations using {product.name} →
              </ProductScopedLink>
            </div>
          )}
        </section>
      )}

      {/* Top Repos */}
      {topRepos.length > 0 && (
        <section data-testid="bot-top-repos">
          <SectionHeading id="repos">Top Repositories</SectionHeading>
          <p className="text-theme-muted mb-4">
            Highest-starred repositories reviewed by {product.name}.
          </p>
          <div className="space-y-2">
            {topRepos.map((repo, i) => (
              <Link
                key={repo.name}
                href={`/repos/${repo.name}`}
                className="flex items-center gap-4 py-3 px-4 rounded-lg hover:bg-theme-surface/60 transition-colors group"
              >
                <span className="text-theme-muted text-sm w-6 text-right shrink-0 tabular-nums">
                  {i + 1}
                </span>
                <img
                  src={`https://github.com/${repo.owner}.png?size=40`}
                  alt={repo.owner}
                  width={32}
                  height={32}
                  className="rounded-full bg-theme-surface shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <span className="text-base font-medium text-theme-text group-hover:text-indigo-400 group-hover:underline transition-colors truncate block">
                    {repo.name}
                  </span>
                  {repo.primary_language && (
                    <span className="text-xs text-theme-muted bg-theme-surface-alt px-1.5 py-0.5 rounded border border-theme-border/60 leading-none inline-block mt-0.5">
                      {repo.primary_language}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-4 shrink-0 text-sm tabular-nums">
                  <span className="text-theme-muted" title="GitHub stars">
                    ⭐ {formatNumber(Number(repo.stars))}
                  </span>
                  <span className="hidden sm:inline text-theme-muted" title="PRs reviewed">
                    {formatNumber(Number(repo.pr_count))} PRs
                  </span>
                </div>
              </Link>
            ))}
          </div>
          {totalRepoCount > TOP_N && (
            <div className="mt-4">
              <ProductScopedLink
                productId={id}
                href={`/repos?products=${id}`}
                className="text-sm text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                View all {totalRepoCount.toLocaleString()} repositories using {product.name} →
              </ProductScopedLink>
            </div>
          )}
        </section>
      )}

      {/* Top Languages */}
      {totalReviews > 0 && languageData.length > 0 && (
        <section data-testid="bot-languages">
          <SectionHeading id="languages">Top Languages</SectionHeading>
          <p className="text-theme-muted mb-6">
            Programming languages of repos where this bot reviews code.
          </p>
          <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
            <BotLanguageChart data={languageData} />
          </div>
        </section>
      )}
    </div>
  );
}

/** Derive GitHub App URL from a bot login, or null if unknown/defunct. */
function githubAppUrl(login: string | null | undefined): string | null {
  if (!login?.endsWith("[bot]")) return null;
  const slug = login.replace("[bot]", "");
  // Apps known to no longer exist on GitHub
  const defunct = new Set(["qodo-merge-pro"]);
  if (defunct.has(slug)) return null;
  return `https://github.com/apps/${slug}`;
}

function GitHubLogin({ login }: { login: string }) {
  const url = githubAppUrl(login);
  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-400 hover:text-indigo-300"
      >
        <code>{login}</code>
      </a>
    );
  }
  return <code className="text-theme-text/80">{login}</code>;
}

function StatCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="bg-theme-surface rounded-xl p-5 border border-theme-border">
      <p className="text-sm text-theme-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color ?? ""}`}>
        {value}
      </p>
    </div>
  );
}
