import { notFound } from "next/navigation";
import {
  getProductById,
  getProductSummaries,
  getProductBots,
  getWeeklyActivityByProduct,
  getBotsByLanguage,
  getAvgCommentsPerPR,
} from "@/lib/clickhouse";
import {
  SingleBotChart,
  BotLanguageChart,
} from "@/components/charts";
import { parseTimeRange, computeCutoffDate } from "@/lib/time-range";
import Link from "next/link";

export const dynamic = "force-dynamic";

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

  const [product, allSummaries, productBots, activity, languageData, commentsPerPR] = await Promise.all([
    getProductById(id),
    getProductSummaries(since),
    getProductBots(id, since),
    getWeeklyActivityByProduct(id, since),
    getBotsByLanguage(id, since),
    getAvgCommentsPerPR(id, since),
  ]);

  if (!product) {
    notFound();
  }

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
  const growthPct = Number(summary?.growth_pct ?? 0);

  // Rank among all products
  const reviewRank =
    [...allSummaries]
      .sort((a, b) => Number(b.total_reviews) - Number(a.total_reviews))
      .findIndex((s) => s.id === id) + 1;

  // Collect unique GitHub logins from bots
  const githubLogins = [
    ...new Set(productBots.map((b) => b.github_login).filter(Boolean)),
  ];

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/bots"
          className="text-sm text-theme-muted hover:text-theme-text transition-colors"
        >
          ← Back to all products
        </Link>
        <div className="mt-4 flex items-center gap-4">
          {product.avatar_url && (
            <img
              src={product.avatar_url}
              alt={product.name}
              width={48}
              height={48}
              className="rounded-full bg-theme-surface border border-theme-border"
            />
          )}
          <h1
            className="text-4xl font-bold"
            data-testid="bot-name"
            style={{ color: product.brand_color || undefined }}
          >
            {product.name}
          </h1>
        </div>
        <p className="mt-2 text-theme-muted">{product.description}</p>
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          {product.website && (
            <a
              href={product.website}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              {product.website} ↗
            </a>
          )}
          {product.docs_url && product.docs_url !== product.website && (
            <a
              href={product.docs_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              Docs ↗
            </a>
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
          <span className="text-sm text-theme-muted/70">
            Rank: <span className="text-theme-text font-medium">#{reviewRank}</span>{" "}
            of {allSummaries.length}
          </span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="space-y-4" data-testid="bot-stats">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard label="Total Reviews" value={totalReviews.toLocaleString()} />
          <StatCard label="Review Comments" value={totalComments.toLocaleString()} />
          <StatCard label="PR Comments" value={totalPrComments.toLocaleString()} />
          <StatCard label="Active Repos" value={totalRepos.toLocaleString()} />
          <StatCard label="Organizations" value={totalOrgs.toLocaleString()} />
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            label="Avg Comments/Review"
            value={avgCommentsPerReview.toFixed(1)}
          />
          <StatCard
            label="Comments/Repo"
            value={commentsPerRepo.toLocaleString()}
          />
          <StatCard
            label="Growth (12w)"
            value={`${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`}
            color={growthPct >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        </div>
      </div>

      {/* Activity chart */}
      <section data-testid="bot-activity-chart">
        <h2 className="text-2xl font-semibold mb-4">Activity Over Time</h2>
        <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
          <SingleBotChart data={chartData} />
        </div>
      </section>

      {/* Bot History (multi-bot products) */}
      {productBots.length > 1 && (
        <section data-testid="bot-history-section">
          <h2 className="text-2xl font-semibold mb-4">Bot History</h2>
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
                    <td className="py-3 pr-4 font-medium">{bot.name}</td>
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


      {/* Comments per PR */}
      <section data-testid="bot-comments-per-pr">
        <h2 className="text-2xl font-semibold mb-4">Comments per PR</h2>
        {commentsPerPR.length > 0 ? (
          <div className="bg-theme-surface rounded-xl p-5 border border-theme-border inline-block">
            <p className="text-sm text-theme-muted">Avg Comments / PR</p>
            <p className="text-3xl font-bold tabular-nums">
              {Number(commentsPerPR[0].avg_comments_per_pr).toFixed(2)}
            </p>
            <p className="text-xs text-theme-muted/70 mt-1">
              {Number(commentsPerPR[0].total_comments).toLocaleString()} comments across{" "}
              {Number(commentsPerPR[0].total_prs).toLocaleString()} PRs
            </p>
          </div>
        ) : (
          <p className="text-theme-muted text-sm">No data</p>
        )}
      </section>

      {/* Top Languages */}
      {totalReviews > 0 && languageData.length > 0 && (
        <section data-testid="bot-languages">
          <h2 className="text-2xl font-semibold mb-4">Top Languages</h2>
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
