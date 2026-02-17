import Link from "next/link";
import { getDataCollectionStats } from "@/lib/clickhouse";

const linkClass = "text-blue-400 hover:text-blue-300";
const codeClass =
  "rounded bg-theme-surface-alt px-1.5 py-0.5 text-sm text-theme-text";

// Revalidate every hour — data only changes weekly via pipeline

export default async function AboutPage() {
  let enrichmentPct: number | null = null;
  try {
    const stats = await getDataCollectionStats();
    if (stats.reactions_total > 0) {
      enrichmentPct = (stats.reactions_scanned / stats.reactions_total) * 100;
    }
  } catch {
    // ClickHouse may be unreachable — leave enrichmentPct null
  }

  return (
    <div data-testid="about-page" className="mx-auto max-w-4xl space-y-12 py-8">
      <h1 className="text-4xl font-bold text-theme-text">Methodology</h1>

      {/* Data Source */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-theme-text">Data Source</h2>
        <p className="text-theme-text-secondary leading-relaxed">
          <a href="https://www.gharchive.org/" target="_blank" rel="noopener noreferrer" className={linkClass}>GH Archive</a> stores
          all public GitHub events in BigQuery. We query these daily tables to
          count how AI code review bots interact with pull requests. Additional
          metadata (stars, languages, reactions) comes from the GitHub REST API.
        </p>
        <p className="text-theme-muted text-sm italic">
          Note: Only public repositories are included. Activity on private repos
          is invisible.
        </p>
      </section>

      {/* What Counts as a "Review" */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-theme-text">
          What Counts as a &ldquo;Review&rdquo;
        </h2>
        <p className="text-theme-text-secondary leading-relaxed">
          We track four types of GitHub signals that indicate a bot
          participated in code review:
        </p>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-theme-text">
              1. Reviews (<a href="https://docs.github.com/en/rest/using-the-rest-api/github-event-types#pullrequestreviewevent" target="_blank" rel="noopener noreferrer" className={linkClass}>PullRequestReviewEvent</a>)
            </h3>
            <p className="mt-2 text-theme-text-secondary leading-relaxed">
              Fired when a review is submitted — approve, request changes, or
              comment. This is the primary metric used for rankings. Even a
              silent approval (no comment body) generates this event.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-theme-text">
              2. Review Comments (<a href="https://docs.github.com/en/rest/using-the-rest-api/github-event-types#pullrequestreviewcommentevent" target="_blank" rel="noopener noreferrer" className={linkClass}>PullRequestReviewCommentEvent</a>)
            </h3>
            <p className="mt-2 text-theme-text-secondary leading-relaxed">
              Fired for each inline comment on a PR diff. A single review
              submission can contain many inline comments, each generating a
              separate event. This gives a more granular view of how verbose a
              bot&apos;s feedback is.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-theme-text">
              3. PR Comments (<a href="https://docs.github.com/en/rest/using-the-rest-api/github-event-types#issuecommentevent" target="_blank" rel="noopener noreferrer" className={linkClass}>IssueCommentEvent</a> on PRs)
            </h3>
            <p className="mt-2 text-theme-text-secondary leading-relaxed">
              Top-level comments posted on pull requests (not inline on diffs).
              Many bots use these for summaries, walkthrough guides, or analysis
              reports rather than the formal review API. In GitHub&apos;s data
              model, PRs are issues — so IssueCommentEvent fires for both. We
              filter to only include comments on pull requests.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-theme-text">
              4. Emoji Reactions on PRs
            </h3>
            <p className="mt-2 text-theme-text-secondary leading-relaxed">
              Some bots signal approval by adding emoji reactions to PR
              descriptions — for example, a 🎉 reaction indicates a bot has
              reviewed and approved the PR. GitHub&apos;s Events API has no
              event type for reactions, so these are invisible in GH Archive.
              We discover them by scanning PRs via the GitHub Reactions API and
              checking whether a tracked bot left a 🎉. Only{" "}
              <code className={codeClass}>hooray</code> (🎉) counts as a
              review signal — other reactions like 👀 indicate the PR is still
              being reviewed.
            </p>
            <p className="mt-2 text-theme-text-secondary leading-relaxed">
              To avoid double-counting, a reaction review is only counted if
              the bot has no other activity on that PR (no review event, no
              comments). This captures bots like Sentry that add 🎉 when they
              review a PR and find no issues — a deliberate low-noise approach
              that avoids leaving a formal review or comment.
            </p>
            <p className="mt-2 text-theme-muted text-sm italic">
              Collecting this data requires individual GitHub API calls for each
              discovered PR, which can take days at scale. Check the{" "}
              <Link href="/status" className={linkClass}>/status</Link>{" "}
              page for current progress.
            </p>
            {enrichmentPct !== null && enrichmentPct < 90 && (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400" data-testid="enrichment-warning">
                <strong>Note:</strong> Reaction scan data has not yet been fully
                collected ({enrichmentPct.toFixed(1)}% complete). Reaction
                review counts may be incomplete.{" "}
                <Link href="/status" className="text-red-300 hover:text-red-200 underline">
                  View status →
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* How AI Share Is Calculated */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-theme-text">
          How &ldquo;AI Share&rdquo; Is Calculated
        </h2>
        <p className="text-theme-text-secondary leading-relaxed">
          The AI share percentage on the home page uses a simple formula,
          computed separately for each event type (reviews, review comments, PR
          comments):
        </p>
        <div className="overflow-x-auto rounded-lg border border-theme-border bg-theme-surface px-6 py-4">
          <code className="text-sm text-theme-text">
            AI Share % = tracked_bot_events / (tracked_bot_events +
            non_bot_events) × 100
          </code>
        </div>

        <div className="space-y-3">
          <p className="text-theme-text-secondary leading-relaxed">
            <strong className="text-theme-text">Numerator</strong> (tracked bot
            events): Only events from the{" "}
            <span className="tabular-nums">~30</span> bot accounts we
            explicitly track. If an AI code review tool isn&apos;t in our
            registry, its activity does not count as &ldquo;AI.&rdquo;
          </p>
          <p className="text-theme-text-secondary leading-relaxed">
            <strong className="text-theme-text">Denominator</strong>: The sum of
            tracked bot events and non-bot events — i.e., the total pool of
            activity. The non-bot portion is calculated by taking all public
            events and excluding our tracked bots <em>and</em> any GitHub
            account with a{" "}
            <code className={codeClass}>
              [bot]
            </code>{" "}
            suffix. This means non-AI automation bots (like{" "}
            <code className={codeClass}>
              dependabot[bot]
            </code>{" "}
            or{" "}
            <code className={codeClass}>
              renovate[bot]
            </code>
            ) are excluded from both the AI count and the human count, so they
            don&apos;t inflate either side.
          </p>
        </div>

        <p className="text-theme-text-secondary leading-relaxed">
          <strong className="text-theme-text">No double counting</strong>: Each
          event type is counted and displayed independently — the chart lets you
          toggle between Reviews and Review Comments. A bot that
          submits 1 review with 5 inline comments contributes 1 to the Reviews
          metric and 5 to the Review Comments metric, but these are never
          combined. PR Comments (IssueCommentEvent) are tracked in aggregate
          counts but not shown in time-series charts due to incomplete
          historical data. The same counting logic applies to both the bot and
          non-bot sides, so the ratio is apples-to-apples. Note that we count{" "}
          <em>events</em>, not unique pull requests — if a bot comments twice on
          the same PR, that&apos;s two events.
        </p>

        <p className="text-theme-muted text-sm italic">
          This means the percentage represents &ldquo;share of non-bot public
          GitHub code review activity attributable to tracked AI bots.&rdquo;
          The true share of AI-assisted reviews is likely higher, since we
          miss private repos, untracked tools, and AI tools operating through
          regular user accounts.
        </p>
      </section>

      {/* How Bots Differ */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-theme-text">How Bots Differ</h2>
        <p className="text-theme-text-secondary leading-relaxed">
          Not all bots use the same mix of event types. This affects how they
          rank depending on which metric you look at. For example:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-theme-text-secondary">
          <li>
            Some bots (like GitHub Copilot) use the formal review API almost
            exclusively — they show up strongly in Reviews and Review Comments
            but produce few or no PR Comments.
          </li>
          <li>
            CodeRabbit posts walkthrough summaries as top-level PR comments
            alongside inline review comments, so it generates significant
            activity across all three event types.
          </li>
          <li>
            Sentry posts inline comments pointing out bugs on specific lines
            (Review Comments), but when it reviews a PR and finds nothing, it
            signals this with a 🎉 emoji reaction and a CI status check —
            neither of which produces a trackable event in GH Archive. This
            means some of Sentry&apos;s review activity is invisible to our
            data.
          </li>
        </ul>
        <p className="text-theme-text-secondary leading-relaxed">
          You can see the exact event-type breakdown for each product on its
          detail page.
        </p>
      </section>

      {/* What's NOT Tracked */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-theme-text">
          What&apos;s NOT Tracked
        </h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-theme-text">Private repositories</h3>
            <p className="mt-1 text-theme-text-secondary leading-relaxed">
              GH Archive only captures public GitHub events. Bots may be far
              more active on private repos, especially in enterprise settings.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-theme-text">Check runs and status checks</h3>
            <p className="mt-1 text-theme-text-secondary leading-relaxed">
              Some tools post analysis results as CI check runs or commit
              statuses (CheckRunEvent/CheckSuiteEvent/StatusEvent). These are
              not tracked. This affects even bots we do track — for example,
              Sentry posts a status check when it reviews a PR and finds no
              issues, so those &ldquo;clean&rdquo; reviews are invisible in our
              data. Tools like SonarQube and DeepSource report exclusively
              through check runs and are not tracked at all.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-theme-text">Bot-created pull requests</h3>
            <p className="mt-1 text-theme-text-secondary leading-relaxed">
              AI tools like Devin, Sweep, and Seer by Sentry create pull
              requests rather than review them. PullRequestEvent is a different
              signal and is not tracked.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-theme-text">Non-bot accounts</h3>
            <p className="mt-1 text-theme-text-secondary leading-relaxed">
              Some AI tools operate through regular GitHub user accounts rather
              than App bot accounts. These are not distinguishable from human
              users in GH Archive data. Where we know about these accounts, we
              track them explicitly — for example, GitHub Copilot appears as
              both{" "}
              <code className={codeClass}>
                copilot-pull-request-reviewer[bot]
              </code>{" "}
              and the regular user account{" "}
              <code className={codeClass}>
                Copilot
              </code>
              , and we include both in our tracking. Any non-bot accounts we
              don&apos;t know about are counted as human activity.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-theme-text">Untracked bot accounts</h3>
            <p className="mt-1 text-theme-text-secondary leading-relaxed">
              We maintain a curated registry of ~30 AI code review bot accounts.
              Any bot not in this registry is excluded from the AI share
              numerator. If it has a{" "}
              <code className={codeClass}>[bot]</code>{" "}
              suffix, it&apos;s also excluded from the denominator (so it
              doesn&apos;t affect the percentage either way). If it uses a
              regular user account, it falls into the human count.
            </p>
          </div>
        </div>
      </section>

      {/* Products vs. Bots */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-theme-text">Products vs. Bots</h2>
        <p className="text-theme-text-secondary leading-relaxed">
          A <em>product</em> is a company or tool (e.g., &ldquo;Qodo&rdquo;),
          while a <em>bot</em> is a specific GitHub App account (e.g.,{" "}
          <code className={codeClass}>qodo-merge-pro[bot]</code>).
          Some products operate multiple bot accounts:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-theme-text-secondary">
          <li>
            <strong className="text-theme-text">Qodo</strong>: codium-pr-agent[bot],
            qodo-merge[bot], qodo-merge-pro[bot]
          </li>
          <li>
            <strong className="text-theme-text">Sentry</strong>: sentry[bot],
            seer-by-sentry[bot], codecov-ai[bot]
          </li>
          <li>
            <strong className="text-theme-text">LinearB</strong>: gitstream-cm[bot],
            linearb[bot]
          </li>
        </ul>
        <p className="text-theme-text-secondary leading-relaxed">
          Product-level rankings aggregate activity across all of a
          product&apos;s bot accounts.
        </p>
      </section>

      {/* Bot Registry */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-theme-text">Bot Registry</h2>
        <p className="text-theme-text-secondary leading-relaxed">
          The canonical list of tracked bots lives in{" "}
          <a
            href="https://github.com/bruno-garcia/code-review-trends/blob/main/pipeline/src/bots.ts"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            pipeline/src/bots.ts
          </a>{" "}
          in our GitHub repository. This file defines every product and its
          associated bot accounts — adding a new bot is as simple as adding an
          entry there.
        </p>
        <p className="text-theme-text-secondary leading-relaxed">
          We also run an automated discovery process (
          <a
            href="https://github.com/bruno-garcia/code-review-trends/blob/main/pipeline/src/tools/discover-bots.ts"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            <code className="rounded bg-theme-surface-alt px-1.5 py-0.5 text-sm">discover-bots</code>
          </a>
          ) that scans GH
          Archive for new bot accounts performing code reviews on public
          repositories. Discovered candidates are reviewed manually before
          being added to the registry. This helps us stay up-to-date as new
          AI code review tools emerge.
        </p>
      </section>

      {/* Comparison with Other Trackers */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-theme-text">
          Comparison with Other Trackers
        </h2>
        <p className="text-theme-text-secondary leading-relaxed">
          If you&apos;ve seen different rankings on other trackers,
          it&apos;s likely because:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-theme-text-secondary">
          <li>
            <strong className="text-theme-text">Different time windows</strong>: We
            show all-time cumulative totals by default. Other trackers may show
            rolling 7-day or 30-day windows, which favors bots with recent
            surges.
          </li>
          <li>
            <strong className="text-theme-text">Different event types</strong>: Some
            trackers only count PullRequestReviewEvent. We track all four signal
            types separately (including emoji reactions), giving a more complete picture.
          </li>
          <li>
            <strong className="text-theme-text">Different bot coverage</strong>: We
            track 25+ products with 30+ bot accounts. Other trackers may include
            different sets.
          </li>
        </ul>
      </section>

      {/* Link to Status */}
      <section className="text-center py-4 border-t border-theme-border">
        <Link href="/status" className={linkClass}>
          View data collection status →
        </Link>
      </section>
    </div>
  );
}
