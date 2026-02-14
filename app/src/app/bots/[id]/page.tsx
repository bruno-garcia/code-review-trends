import { notFound } from "next/navigation";
import {
  getBotById,
  getWeeklyActivity,
  getBotReactions,
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
  const [bot, activity, reactions] = await Promise.all([
    getBotById(id),
    getWeeklyActivity(id),
    getBotReactions(id),
  ]);

  if (!bot) {
    notFound();
  }

  const chartData = activity.map((a) => ({
    week: a.week,
    review_count: Number(a.review_count),
    review_comment_count: Number(a.review_comment_count),
    repo_count: Number(a.repo_count),
  }));

  const reactionData = reactions.map((r) => ({
    week: r.week,
    thumbs_up: Number(r.thumbs_up),
    thumbs_down: Number(r.thumbs_down),
    heart: Number(r.heart),
  }));

  const totalReviews = activity.reduce(
    (sum, a) => sum + Number(a.review_count),
    0,
  );
  const totalComments = activity.reduce(
    (sum, a) => sum + Number(a.review_comment_count),
    0,
  );

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
        <div className="mt-4 flex items-center gap-4">
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
        </div>
      </div>

      {/* Summary stats */}
      <div
        className="grid grid-cols-2 md:grid-cols-4 gap-4"
        data-testid="bot-stats"
      >
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-sm text-gray-400">Total Reviews</p>
          <p className="text-2xl font-bold tabular-nums">
            {totalReviews.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-sm text-gray-400">Total Comments</p>
          <p className="text-2xl font-bold tabular-nums">
            {totalComments.toLocaleString()}
          </p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-sm text-gray-400">Weeks Tracked</p>
          <p className="text-2xl font-bold tabular-nums">{activity.length}</p>
        </div>
        <div className="bg-gray-900 rounded-xl p-5 border border-gray-800">
          <p className="text-sm text-gray-400">Latest Repos</p>
          <p className="text-2xl font-bold tabular-nums">
            {activity.length > 0
              ? Number(activity[activity.length - 1].repo_count).toLocaleString()
              : "—"}
          </p>
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
        <h2 className="text-2xl font-semibold mb-4">
          Community Reactions
        </h2>
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
