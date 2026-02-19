import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import {
  getOrgSummary,
  getOrgRepos,
  getOrgProducts,
} from "@/lib/clickhouse";
import { formatNumber } from "@/lib/format";
import { SectionHeading } from "@/components/section-heading";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ owner: string }>;
}): Promise<Metadata> {
  const { owner } = await params;
  const summary = await getOrgSummary(owner);
  if (!summary) return { title: "Organization Not Found" };

  const repos = Number(summary.repo_count);
  const prs = Number(summary.total_prs);
  const stars = formatNumber(Number(summary.total_stars));

  const title = `${owner} — AI Code Review Usage on GitHub`;
  const description = `${owner} uses AI code review across ${repos} ${repos === 1 ? "repo" : "repos"} (${stars} stars${prs > 0 ? `, ${formatNumber(prs)} PRs reviewed` : ""}). See which AI tools review their code.`;

  return {
    title,
    description,
    alternates: { canonical: `/orgs/${owner}` },
    openGraph: { title, description, url: `/orgs/${owner}` },
  };
}

export default async function OrgPage({
  params,
}: {
  params: Promise<{ owner: string }>;
}) {
  const { owner } = await params;

  const [summary, repos, products] = await Promise.all([
    getOrgSummary(owner),
    getOrgRepos(owner),
    getOrgProducts(owner),
  ]);

  if (!summary) {
    notFound();
  }

  const languages = summary.languages.filter(Boolean);
  const totalStars = Number(summary.total_stars);
  const repoCount = Number(summary.repo_count);
  const totalPrs = Number(summary.total_prs);
  const totalBotComments = Number(summary.total_bot_comments);
  return (
    <div className="space-y-10">
      {/* Header */}
      <div>
        <Link
          href="/"
          className="text-sm text-theme-muted hover:text-theme-text transition-colors"
        >
          ← Back to overview
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
            <h1 className="text-4xl font-bold" data-testid="org-name">
              {owner}
            </h1>
            <a
              href={`https://github.com/${owner}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm text-indigo-400 hover:text-indigo-300"
            >
              github.com/{owner} ↗
            </a>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" data-testid="org-stats">
        <StatCard label="Total Stars" value={`⭐ ${formatNumber(totalStars)}`} />
        <StatCard label="Repos Tracked" value={formatNumber(repoCount)} />
        <StatCard label="PRs with AI Review" value={formatNumber(totalPrs)} />
        <StatCard label="Bot Comments" value={formatNumber(totalBotComments)} />
      </div>

      {/* AI Review Products */}
      {products.length > 0 && (
        <section data-testid="org-products">
          <SectionHeading id="products">AI Review Products</SectionHeading>
          <p className="text-theme-muted mb-6">
            AI code review products active on {owner}&apos;s repositories.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {products.map((p) => (
              <Link
                key={p.product_id}
                href={`/bots/${p.product_id}`}
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
        <section data-testid="org-languages">
          <SectionHeading id="languages">Languages</SectionHeading>
          <div className="flex flex-wrap gap-2">
            {languages.map((lang) => (
              <span
                key={lang}
                className="px-3 py-1.5 rounded-full text-sm bg-theme-surface border border-theme-border text-theme-text"
              >
                {lang}
              </span>
            ))}
          </div>
        </section>
      )}

      {/* Repositories */}
      <section data-testid="org-repos">
        <SectionHeading id="repositories">Repositories</SectionHeading>
        <p className="text-theme-muted mb-6">
          Repositories where AI bots review code.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="text-theme-muted border-b border-theme-border">
              <tr>
                <th className="pb-3 pr-4">Repository</th>
                <th className="pb-3 pr-4 text-right">⭐ Stars</th>
                <th className="pb-3 pr-4">Language</th>
                <th className="pb-3 pr-4 text-right" title="Pull requests reviewed by AI bots">Reviewed PRs</th>
                <th className="pb-3 text-right">Bot Comments</th>
              </tr>
            </thead>
            <tbody>
              {repos.map((repo) => {
                const shortName = repo.name.replace(`${owner}/`, "");
                return (
                  <tr
                    key={repo.name}
                    className="border-b border-theme-border/50"
                  >
                    <td className="py-3 pr-4">
                      <a
                        href={`https://github.com/${repo.name}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-indigo-400 hover:text-indigo-300 hover:underline"
                      >
                        {shortName}
                      </a>
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {Number(repo.stars).toLocaleString()}
                    </td>
                    <td className="py-3 pr-4 text-theme-muted">
                      {repo.primary_language || "—"}
                    </td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {Number(repo.pr_count).toLocaleString()}
                    </td>
                    <td className="py-3 text-right tabular-nums">
                      {Number(repo.bot_comment_count).toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-theme-surface rounded-xl p-5 border border-theme-border">
      <p className="text-sm text-theme-muted">{label}</p>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
    </div>
  );
}
