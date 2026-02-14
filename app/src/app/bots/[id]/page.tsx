import { notFound } from "next/navigation";
import {
  getBotById,
  getWeeklyActivity,
  getBotReactions,
  getBotSummaries,
} from "@/lib/clickhouse";
import { SingleBotChart, ReactionChart } from "@/components/charts";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BotPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [bot, activity, reactions, allSummaries] = await Promise.all([
    getBotById(id),
    getWeeklyActivity(id),
    getBotReactions(id),
    getBotSummaries(),
  ]);

  if (!bot) {
    notFound();
  }

  const summary = allSummaries.find((s) => s.id === id);

  const chartData = activity.map((a) => ({
    week: a.week,
    review_count: Number(a.review_count),
    review_comment_count: Number(a.review_comment_count),
    repo_count: Number(a.repo_count),
    org_count: Number(a.org_count),
  }));

  const reactionData = reactions.map((r) => ({
    week: r.week,
    thumbs_up: Number(r.thumbs_up),
    thumbs_down: Number(r.thumbs_down),
    heart: Number(r.heart),
    laugh: Number(r.laugh),
    confused: Number(r.confused),
  }));

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

  // Rank among all bots (sort a copy to avoid mutating the original)
  const reviewRank =
    [...allSummaries]
      .sort((a, b) => Number(b.total_reviews) - Number(a.total_reviews))
      .findIndex((s) => s.id === id) + 1;

  return (
    <div className="space-y-10">
      <div>
        <Link
          href="/bots"
          className="text-sm text-gray-400 hover:text-white transition-colors"
        >
          ← Back to all bots
        </Link>
        <h1 className="mt-4 text-4xl font-bold" data-testid="bot-name">
          {bot.name}
        </h1>
        <p className="mt-2 text-gray-400">{bot.description}</p>
        <div className="mt-4 flex items-center gap-4 flex-wrap">
          <a
            href={bot.website}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-indigo-400 hover:text-indigo-300"
          >
            {bot.website} ↗
          </a>
          <span className="text-sm text-gray-500">
            GitHub: <code className="text-gray-300">{bot.github_login}</code>
          </span>
          <span className="text-sm text-gray-500">
            Rank: <span className="text-white font-medium">#{reviewRank}</span>{" "}
            of {allSummaries.length}
          </span>
        </div>
      </div>

      {/* Summary stats — 2 rows */}
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
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <SingleBotChart data={chartData} />
        </div>
      </section>

      {/* Reactions chart */}
      <section data-testid="bot-reactions-chart">
        <h2 className="text-2xl font-semibold mb-4">Community Reactions</h2>
        <p className="text-gray-400 mb-6">
          Reactions on review comments — a proxy for how useful people find this
          bot&apos;s reviews.
        </p>
        <div className="bg-gray-900 rounded-xl p-6 border border-gray-800">
          <ReactionChart data={reactionData} />
        </div>
      </section>
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
    <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
      <p className="text-sm text-gray-400">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color ?? ""}`}>
        {value}
      </p>
    </div>
  );
}
