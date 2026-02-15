import { getProductSummaries } from "@/lib/clickhouse";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function BotsPage() {
  const summaries = await getProductSummaries();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">AI Code Review Products</h1>
          <p className="mt-2 text-gray-400">
            Profiles and statistics for each AI code review product we track.
          </p>
        </div>
        <Link
          href="/compare"
          className="text-sm bg-violet-600 hover:bg-violet-500 text-white px-4 py-2 rounded-lg transition-colors"
        >
          Compare All →
        </Link>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
        data-testid="bots-grid"
      >
        {summaries.map((product) => (
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
                  alt=""
                  width={40}
                  height={40}
                  className="rounded-full bg-gray-800 border border-gray-700"
                />
              )}
              <h2
                className="text-xl font-semibold"
                style={{ color: product.brand_color || "#a78bfa" }}
              >
                {product.name}
              </h2>
            </div>
            <p className="text-sm text-gray-400 line-clamp-2">
              {product.description}
            </p>
            <div className="mt-4 grid grid-cols-3 gap-3 text-sm">
              <div>
                <span className="text-gray-500">Reviews</span>
                <p className="font-medium tabular-nums">
                  {Number(product.total_reviews).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Repos</span>
                <p className="font-medium tabular-nums">
                  {Number(product.total_repos).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Orgs</span>
                <p className="font-medium tabular-nums">
                  {Number(product.total_orgs).toLocaleString()}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Approval</span>
                <p className="font-medium tabular-nums">
                  {Number(product.approval_rate).toFixed(0)}%
                </p>
              </div>
              <div>
                <span className="text-gray-500">Avg C/R</span>
                <p className="font-medium tabular-nums">
                  {Number(product.avg_comments_per_review).toFixed(1)}
                </p>
              </div>
              <div>
                <span className="text-gray-500">Growth</span>
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
    </div>
  );
}
