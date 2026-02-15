import { notFound } from "next/navigation";
import {
  getProductById,
  getProductSummaries,
  getProductBots,
  getWeeklyActivityByProduct,
  getBotReactions,
} from "@/lib/clickhouse";
import { SingleBotChart, ReactionChart } from "@/components/charts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ProductPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [product, allSummaries, productBots, activity] = await Promise.all([
    getProductById(id),
    getProductSummaries(),
    getProductBots(id),
    getWeeklyActivityByProduct(id),
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
    repo_count: Number(a.repo_count),
    org_count: Number(a.org_count),
  }));

  // Fetch and merge reactions from all bots in this product
  const botIds = [...new Set(productBots.map((b) => b.id))];
  const allReactions = await Promise.all(
    botIds.map((botId) => getBotReactions(botId)),
  );
  const reactionMap = new Map<
    string,
    { thumbs_up: number; thumbs_down: number; heart: number; laugh: number; confused: number }
  >();
  for (const botReactions of allReactions) {
    for (const r of botReactions) {
      const existing = reactionMap.get(r.week);
      if (existing) {
        existing.thumbs_up += Number(r.thumbs_up);
        existing.thumbs_down += Number(r.thumbs_down);
        existing.heart += Number(r.heart);
        existing.laugh += Number(r.laugh);
        existing.confused += Number(r.confused);
      } else {
        reactionMap.set(r.week, {
          thumbs_up: Number(r.thumbs_up),
          thumbs_down: Number(r.thumbs_down),
          heart: Number(r.heart),
          laugh: Number(r.laugh),
          confused: Number(r.confused),
        });
      }
    }
  }
  const reactionData = [...reactionMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([week, r]) => ({ week, ...r }));

  const totalReviews = Number(summary?.total_reviews ?? 0);
  const totalComments = Number(summary?.total_comments ?? 0);
  const totalRepos = Number(summary?.total_repos ?? 0);
  const totalOrgs = Number(summary?.total_orgs ?? 0);
  const avgCommentsPerReview = Number(summary?.avg_comments_per_review ?? 0);
  const commentsPerRepo = Number(summary?.comments_per_repo ?? 0);
  const approvalRate = Number(summary?.approval_rate ?? 0);
  const thumbsUp = Number(summary?.thumbs_up ?? 0);
  const thumbsDown = Number(summary?.thumbs_down ?? 0);
  const hearts = Number(summary?.heart ?? 0);
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
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to all products
        </Link>
        <div className="mt-4 flex items-center gap-4">
          {product.avatar_url && (
            <img
              src={product.avatar_url}
              alt=""
              width={48}
              height={48}
              className="rounded-full bg-gray-800 border border-gray-700"
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
        <p className="mt-2 text-gray-400">{product.description}</p>
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
          {githubLogins.length > 0 && (
            <span className="text-sm text-gray-500">
              GitHub:{" "}
              {githubLogins.map((login, i) => (
                <span key={login}>
                  {i > 0 && ", "}
                  <code className="text-gray-300">{login}</code>
                </span>
              ))}
            </span>
          )}
          <span className="text-sm text-gray-500">
            Rank: <span className="text-white font-medium">#{reviewRank}</span>{" "}
            of {allSummaries.length}
          </span>
        </div>
      </div>

      {/* Summary stats */}
      <div className="space-y-4" data-testid="bot-stats">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard label="Total Reviews" value={totalReviews.toLocaleString()} />
          <StatCard label="Total Comments" value={totalComments.toLocaleString()} />
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
          <StatCard label="Approval Rate" value={`${approvalRate.toFixed(0)}%`} />
          <StatCard
            label="Growth (4w)"
            value={`${growthPct >= 0 ? "+" : ""}${growthPct.toFixed(1)}%`}
            color={growthPct >= 0 ? "text-emerald-400" : "text-red-400"}
          />
        </div>
        <div className="grid grid-cols-3 md:grid-cols-3 gap-4">
          <StatCard label="👍 Thumbs Up" value={thumbsUp.toLocaleString()} />
          <StatCard label="👎 Thumbs Down" value={thumbsDown.toLocaleString()} />
          <StatCard label="❤️ Hearts" value={hearts.toLocaleString()} />
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
          <p className="text-gray-400 mb-4">
            This product has operated under multiple bot accounts over time.
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-gray-400 border-b border-gray-800">
                <tr>
                  <th className="pb-3 pr-4">Bot</th>
                  <th className="pb-3 pr-4">GitHub Login</th>
                  <th className="pb-3 pr-4 text-right">Reviews</th>
                  <th className="pb-3 pr-4 text-right">Comments</th>
                  <th className="pb-3 pr-4">First Seen</th>
                  <th className="pb-3">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {productBots.map((bot) => (
                  <tr
                    key={`${bot.id}-${bot.github_login}`}
                    className="border-b border-gray-800/50"
                  >
                    <td className="py-3 pr-4 font-medium">{bot.name}</td>
                    <td className="py-3 pr-4">
                      <code className="text-gray-300">{bot.github_login}</code>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {Number(bot.total_reviews).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {Number(bot.total_comments).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-gray-400">{bot.first_week}</td>
                    <td className="py-3 text-gray-400">{bot.last_week}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Reactions chart */}
      {reactionData.length > 0 && (
        <section data-testid="bot-reactions-chart">
          <h2 className="text-2xl font-semibold mb-4">Community Reactions</h2>
          <p className="text-gray-400 mb-6">
            Reactions on review comments — a proxy for how useful people find
            this product&apos;s reviews.
          </p>
          <div className="bg-theme-surface rounded-xl p-6 border border-theme-border">
            <ReactionChart data={reactionData} />
          </div>
        </section>
      )}
    </div>
  );
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
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color ?? ""}`}>
        {value}
      </p>
    </div>
  );
}
