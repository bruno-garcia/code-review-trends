import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getRepoDetail,
  getRepoProducts,
} from "@/lib/clickhouse";
import { formatNumber, formatHours } from "@/lib/format";
import { SectionHeading } from "@/components/section-heading";
import { JsonLd } from "@/components/json-ld";
import { OG_DEFAULTS } from "@/lib/constants";

type Params = { params: Promise<{ owner: string; name: string }> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { owner, name } = await params;
  const repoName = `${owner}/${name}`;
  const detail = await getRepoDetail(repoName);
  if (!detail) return { title: "Repository Not Found" };

  const stars = formatNumber(Number(detail.stars));
  const prs = formatNumber(Number(detail.total_prs));
  const title = `${repoName} — AI Code Review Activity`;
  const description = `${repoName} (${stars} stars) has ${prs} PRs reviewed by AI code review tools. See which products review this repository.`;

  return {
    title,
    description,
    alternates: { canonical: `/repos/${owner}/${name}` },
    openGraph: { ...OG_DEFAULTS, title, description, url: `/repos/${owner}/${name}` },
  };
}

export default async function RepoPage({ params }: Params) {
  const { owner, name } = await params;
  const repoName = `${owner}/${name}`;

  const [detail, products] = await Promise.all([
    getRepoDetail(repoName),
    getRepoProducts(repoName),
  ]);


  if (!detail) notFound();

  const totalStars = Number(detail.stars);
  const totalPrs = Number(detail.total_prs);
  const botComments = Number(detail.bot_comment_count);
  const hasPrStats = detail.merge_rate !== null;

  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <Link
          href="/repos"
          className="text-sm text-theme-muted hover:text-theme-text transition-colors"
        >
          ← Back to repositories
        </Link>
        <div className="mt-4 flex items-center gap-4">
          <img
            src={`https://github.com/${owner}.png?size=64`}
            alt={owner}
            width={48}
            height={48}
            className="rounded-full bg-theme-surface border border-theme-border"
          />
          <div>
            <h1 className="text-4xl font-bold" data-testid="repo-name">
              {repoName}
            </h1>
            <a
              href={`https://github.com/${repoName}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              github.com/{repoName} ↗
            </a>
            <div className="flex gap-2 mt-2">
              {detail.primary_language && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-theme-surface border border-theme-border">
                  {detail.primary_language}
                </span>
              )}
              {detail.fork && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-theme-surface border border-theme-border">
                  Fork
                </span>
              )}
              {detail.archived && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-theme-surface border border-theme-border">
                  Archived
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="repo-stats">
        <StatCard label="Stars" value={`⭐ ${formatNumber(totalStars)}`} />
        <StatCard label="PRs Reviewed" value={formatNumber(totalPrs)} />
        <StatCard label="Bot Comments" value={formatNumber(botComments)} />
        <StatCard label="Primary Language" value={detail.primary_language || "—"} />
      </div>

      {hasPrStats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <StatCard
            label="Merge Rate"
            value={`${Number(detail.merge_rate).toFixed(1)}%`}
          />
          <StatCard
            label="Avg Time to Merge"
            value={formatHours(detail.avg_hours_to_merge ?? null)}
          />
          <StatCard
            label="Avg Additions"
            value={`+${formatNumber(Math.round(Number(detail.avg_additions)))}`}
            color="text-emerald-400"
          />
          <StatCard
            label="Avg Deletions"
            value={`-${formatNumber(Math.round(Number(detail.avg_deletions)))}`}
            color="text-red-400"
          />
          <StatCard
            label="Avg Files Changed"
            value={formatNumber(Math.round(Number(detail.avg_changed_files)))}
          />
        </div>
      )}

      {/* AI Review Products */}
      {products.length > 0 && (
        <section data-testid="repo-products">
          <SectionHeading id="products">AI Review Products</SectionHeading>
          <p className="text-theme-muted mb-6">
            AI code review products active on this repository.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => (
              <Link
                key={p.product_id}
                href={`/products/${p.product_id}`}
                className="bg-theme-surface rounded-xl p-5 border border-theme-border hover:border-theme-border-hover transition-colors group"
              >
                <div className="flex items-center gap-3 mb-3">
                  {p.avatar_url && (
                    <img
                      src={p.avatar_url}
                      alt={p.product_name}
                      width={32}
                      height={32}
                      className="rounded-full bg-theme-surface"
                    />
                  )}
                  <span
                    className="font-semibold text-lg group-hover:underline"
                    style={{ color: p.brand_color || undefined }}
                  >
                    {p.product_name}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-sm text-theme-muted">
                  <span>
                    <span className="text-theme-text font-medium tabular-nums">
                      {Number(p.pr_count).toLocaleString()}
                    </span>{" "}
                    PRs
                  </span>
                  <span>
                    <span className="text-theme-text font-medium tabular-nums">
                      {Number(p.event_count).toLocaleString()}
                    </span>{" "}
                    events
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* Languages */}
      {languages.length > 0 && (
        <section data-testid="repo-languages">
          <SectionHeading id="languages">Languages</SectionHeading>
          <div className="space-y-3 mt-6">
            {languages.map((lang) => {
              const maxBytes = Number(languages[0].bytes);
              const pct = maxBytes > 0 ? (Number(lang.bytes) / maxBytes) * 100 : 0;
              return (
                <div key={lang.language} className="flex items-center gap-3">
                  <span className="text-sm text-theme-muted w-24 text-right truncate">
                    {lang.language}
                  </span>
                  <div className="flex-1 bg-theme-border rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-violet-500 rounded-full"
                      style={{ width: `${Math.max(pct, 2)}%` }}
                    />
                  </div>
                  <span className="text-xs text-theme-muted tabular-nums w-20 text-right">
                    {formatBytes(Number(lang.bytes))}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@type": "SoftwareSourceCode",
          name: repoName,
          codeRepository: `https://github.com/${repoName}`,
          programmingLanguage: detail.primary_language || undefined,
        }}
      />
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  const testId = `stat-${label.toLowerCase().replace(/\s+/g, "-")}`;
  return (
    <div className="bg-theme-surface rounded-xl p-5 border border-theme-border" data-testid={testId}>
      <p className="text-sm text-theme-muted">{label}</p>
      <p className={`text-2xl font-bold tabular-nums ${color ?? ""}`}>{value}</p>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}
