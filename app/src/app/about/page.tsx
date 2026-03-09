import type { Metadata } from "next";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";
import { getDataCollectionStats } from "@/lib/clickhouse";
import { SectionHeading } from "@/components/section-heading";

export const metadata: Metadata = {
  title: "Methodology",
  description:
    "How Code Review Trends tracks AI code review adoption on GitHub. Data sources, counting methodology, ranking system, and known limitations.",
  alternates: { canonical: "/about" },
};

const linkClass = "text-blue-400 hover:text-blue-300";
const codeClass =
  "rounded bg-theme-surface-alt px-1.5 py-0.5 text-sm text-theme-text";


export default async function AboutPage() {
  let reactionEnrichmentPct: number | null = null;
  let prEnrichmentPct: number | null = null;
  try {
    const stats = await getDataCollectionStats();
    if (stats.reactions_total > 0) {
      reactionEnrichmentPct = (stats.reactions_scanned / stats.reactions_total) * 100;
    }
    if (stats.prs_discovered > 0) {
      prEnrichmentPct = (stats.prs_enriched / stats.prs_discovered) * 100;
    }
  } catch (err) {
    Sentry.captureException(err, {
      tags: { route: "about", section: "enrichment-pct" },
    });
  }

  return (
    <div data-testid="about-page" className="mx-auto max-w-5xl space-y-12 px-4 py-8">
      <h1 className="text-4xl font-bold text-theme-text">Methodology</h1>

      {/* Table of Contents */}
      <nav className="rounded-lg border border-theme-border bg-theme-surface px-6 py-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-theme-muted mb-3">On this page</h2>
        <ul className="columns-1 sm:columns-2 gap-x-8 space-y-1.5 text-sm">
          <li><a href="#data-source" className={linkClass}>Data Source</a></li>
          <li><a href="#interpreting" className={linkClass}>Interpreting the Numbers</a></li>
          <li><a href="#what-counts" className={linkClass}>What Counts as a &ldquo;Review&rdquo;</a></li>
          <li><a href="#ai-share" className={linkClass}>How &ldquo;AI Share&rdquo; Is Calculated</a></li>
          <li><a href="#how-bots-differ" className={linkClass}>How Bots Differ</a></li>
          <li><a href="#rankings" className={linkClass}>How Rankings Work</a></li>
          <li><a href="#pr-profile" className={linkClass}>PR Profile &amp; Merge Characteristics</a></li>
          <li><a href="#thumbs-up-rate" className={linkClass}>👍 Rate &amp; Reaction Data</a></li>
          <li><a href="#not-tracked" className={linkClass}>What&apos;s NOT Tracked</a></li>
          <li><a href="#products-vs-bots" className={linkClass}>Products vs. Bots</a></li>
          <li><a href="#bot-registry" className={linkClass}>Bot Registry</a></li>
          <li><a href="#comparison" className={linkClass}>Comparison with Other Trackers</a></li>
          <li><a href="#who" className={linkClass}>Who&apos;s Behind This</a></li>
        </ul>
      </nav>

      {/* Data Source */}
      <section className="space-y-4">
        <SectionHeading id="data-source" className="text-theme-text">Data Source</SectionHeading>
        <p className="text-theme-text-secondary leading-relaxed">
          <a href="https://www.gharchive.org/" target="_blank" rel="noopener noreferrer" className={linkClass}>GH Archive</a> stores
          all public GitHub events in BigQuery. We query these daily tables to
          count how AI code review bots interact with pull requests. The{" "}
          <a href="#ai-share" className={linkClass}>AI Share</a> percentage
          and the weekly time-series charts (AI Share, Total Volume) are
          computed entirely from this BigQuery data — no GitHub API calls are
          involved, and we collect all public events (not a sample).
          Product-level rankings and totals
          also include{" "}
          <a href="#what-counts" className={linkClass}>emoji reaction reviews</a>{" "}
          discovered via the GitHub API, which capture bot activity invisible
          to GH Archive.
        </p>
        <p className="text-theme-text-secondary leading-relaxed">
          Additional metadata — repository stars, primary languages, comment
          reactions (👍/👎), and emoji-based review signals (🎉) — comes from
          the GitHub REST API via a separate{" "}
          <Link href="/status" className={linkClass}>enrichment pipeline</Link>.
          This data powers per-product detail pages, language breakdowns, and
          reaction sentiment (👍 Rate), but does <em>not</em> feed into the AI Share
          calculation.
        </p>
        <p className="text-theme-muted text-sm italic">
          Note: Only public repositories are included. Activity on private repos
          is invisible.
        </p>
      </section>

      {/* Interpreting the Numbers */}
      <section className="space-y-4">
        <SectionHeading id="interpreting" className="text-theme-text">
          Interpreting the Numbers
        </SectionHeading>
        <p className="text-theme-text-secondary leading-relaxed">
          Review counts measure <em>activity volume</em>, not review quality or
          depth. Two bots with the same number of reviews may be doing very
          different things — and a direct comparison of their counts can be
          misleading. Here&apos;s why:
        </p>

        <p className="text-theme-text-secondary leading-relaxed">
          <strong className="text-theme-text">Bots have different scopes.</strong>{" "}
          Some bots do comprehensive code review covering style, bugs, security,
          and performance in a single pass. Others focus narrowly — bug
          prediction only, security scanning only, or enforcing team-specific
          linting rules. A bug-prediction bot that flags one critical defect is
          doing fundamentally different work than a style bot that flags 20
          formatting issues, even though the latter generates 20× more review
          comment events. The same applies to a security scanner that catches a
          single vulnerability versus a bot that leaves comments on every
          function missing a docstring. Volume says nothing about severity or
          value.
        </p>

        <p className="text-theme-text-secondary leading-relaxed">
          <strong className="text-theme-text">Not every review is a code review.</strong>{" "}
          Bots generate events for operational reasons that have nothing to do
          with reviewing your code. A bot might post a review to tell you
          you&apos;ve exceeded your usage quota, or respond to your reply
          explaining why a flagged issue might be a false positive. These are
          legitimate GitHub events that appear in our counts, but they&apos;re
          administrative overhead, not code analysis.
        </p>

        <p className="text-theme-text-secondary leading-relaxed">
          <strong className="text-theme-text">Some counts include benchmarking and testing.</strong>{" "}
          A few products run large-scale public evaluations — reviewing
          thousands of PRs across open-source repositories to benchmark their
          analysis engine. These reviews are real GitHub events and are counted
          in our data. There&apos;s no reliable way to distinguish a
          &ldquo;benchmark run&rdquo; from organic usage in GH Archive data, so
          these inflate the product&apos;s review counts.
        </p>

        <p className="text-theme-text-secondary leading-relaxed">
          <strong className="text-theme-text">Comment volume reflects bot design, not thoroughness.</strong>{" "}
          A bot that posts one summary comment per PR generates far fewer events
          than one that posts individual inline comments for each finding. A bot
          configured with strict custom rules for a large monorepo will generate
          more events per PR than the same bot with default settings on a small
          project. Volume is a function of configuration and design philosophy
          as much as adoption.
        </p>

        <p className="text-theme-muted text-sm italic">
          The bottom line: use the numbers to understand adoption trends and
          relative growth over time — not to judge which bot gives
          &ldquo;better&rdquo; reviews. For that, you&apos;d need to evaluate
          the actual content and accuracy of their suggestions, which is beyond
          what event counting can tell you.
        </p>
      </section>

      {/* What Counts as a "Review" */}
      <section className="space-y-6">
        <SectionHeading id="what-counts" className="text-theme-text">
          What Counts as a &ldquo;Review&rdquo;
        </SectionHeading>
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
              comments). This captures bots like{" "}
              <Link href="/products/sentry" className={linkClass}>Sentry</Link>{" "}
              that add 🎉 when they
              review a PR and find no issues — a deliberate low-noise approach
              that avoids leaving a formal review or comment.
            </p>
            <p className="mt-2 text-theme-muted text-sm italic">
              Collecting this data requires individual GitHub API calls for each
              discovered PR, which can take days at scale. Check the{" "}
              <Link href="/status" className={linkClass}>/status</Link>{" "}
              page for current progress.
            </p>
            {reactionEnrichmentPct !== null && reactionEnrichmentPct <= 95 && (
              <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400" data-testid="enrichment-warning">
                <strong>Note:</strong> Reaction scan data has not yet been fully
                collected ({reactionEnrichmentPct.toFixed(1)}% complete). Reaction
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
        <SectionHeading id="ai-share" className="text-theme-text">
          How &ldquo;AI Share&rdquo; Is Calculated
        </SectionHeading>
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
            bot accounts we explicitly track (see{" "}
            <a href="#bot-registry" className={linkClass}>Bot Registry</a>). If an AI code review tool isn&apos;t in our
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
          <p className="text-theme-text-secondary leading-relaxed">
            Some tracked bots use regular user accounts without the{" "}
            <code className={codeClass}>[bot]</code> suffix — for example,{" "}
            <Link href="/products/copilot" className={linkClass}>GitHub Copilot</Link>{" "}
            operates as both{" "}
            <code className={codeClass}>copilot-pull-request-reviewer[bot]</code>{" "}
            and the regular account{" "}
            <code className={codeClass}>Copilot</code>. These non-bot accounts
            are explicitly excluded from the human count in the BigQuery
            query, so they correctly count as AI activity rather than inflating
            the human side.
          </p>
        </div>

        <p className="text-theme-text-secondary leading-relaxed">
          <strong className="text-theme-text">No double counting</strong>: Each
          event type is counted independently — the AI Share chart lets you
          toggle between Reviews and Review Comments, while the{" "}
          <Link href="/compare" className={linkClass}>comparison page</Link>{" "}
          lets you toggle between Reviews, Review Comments, and PR Comments.
          A bot that submits 1 review with 5 inline comments contributes 1 to
          the Reviews metric and 5 to the Review Comments metric, but these are
          never combined. The same counting logic applies to both the bot and
          non-bot sides, so the ratio is apples-to-apples.
        </p>

        <p className="text-theme-text-secondary leading-relaxed">
          <strong className="text-theme-text">Events, not unique PRs</strong>:{" "}
          We count <em>events</em>, not unique pull requests — if a bot comments
          twice on the same PR (e.g., once when the PR is opened and again on a
          new commit push), that&apos;s two events. This means both sides of the
          ratio scale with activity intensity, not just reach. A bot that runs
          on every commit to a PR generates more events than one that runs once,
          and similarly, a human reviewer who leaves multiple rounds of feedback
          generates more events than one who reviews once. Because the same
          counting applies to both sides, the AI Share percentage is a{" "}
          <em>somewhat</em> fair comparison — but with an important caveat:
          bots are automated and typically re-run on every commit pushed to a
          PR, generating a new review each time, whereas human reviewers
          usually review once or twice and don&apos;t re-review on every push.
          <strong className="text-theme-text">This asymmetry means
          event-based counting inherently amplifies bot activity relative to
          human activity, and the AI Share percentage likely overstates the
          true share of PRs that receive AI review.</strong> It
          measures share of review <em>activity</em> (volume of events), not
          share of PRs reviewed. We don&apos;t currently have a &ldquo;per
          run&rdquo; metric (where a run is a single invocation of a bot,
          whether triggered by a PR opening, a new commit, or an @mention).
          Even with per-event timestamps from GH Archive and enriched
          comment timestamps from the GitHub API, reliably grouping events
          into runs would require heuristics (e.g., time-window clustering)
          that are fragile across different bot behaviors. Our pipeline
          aggregates events to weekly buckets for trend analysis, which
          precludes run-level detection.
        </p>

        <p className="text-theme-muted text-sm italic">
          This means the percentage represents &ldquo;share of non-bot public
          GitHub code review activity attributable to tracked AI bots.&rdquo;
          The true share of AI-assisted reviews may be higher, since we
          miss untracked tools and AI tools operating through regular user
          accounts rather than GitHub App bot accounts. Private repos are also
          invisible, though their AI adoption rate may differ from public repos.
        </p>
      </section>

      {/* How Bots Differ */}
      <section className="space-y-4">
        <SectionHeading id="how-bots-differ" className="text-theme-text">How Bots Differ</SectionHeading>
        <p className="text-theme-text-secondary leading-relaxed">
          Not all bots use the same mix of event types. This affects how they
          rank depending on which metric you look at. For example:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-theme-text-secondary">
          <li>
            Some bots (like{" "}
            <Link href="/products/copilot" className={linkClass}>GitHub Copilot</Link>)
            use the formal review API almost exclusively — they show up strongly
            in Reviews and Review Comments but produce few or no PR Comments.
          </li>
          <li>
            <Link href="/products/coderabbit" className={linkClass}>CodeRabbit</Link>{" "}
            posts walkthrough summaries as top-level PR comments
            alongside inline review comments, so it generates significant
            activity across all three event types.
          </li>
          <li>
            <Link href="/products/sentry" className={linkClass}>Sentry</Link> posts
            inline comments pointing out bugs on specific lines (Review
            Comments), but when it reviews a PR and finds nothing, it signals
            this with a 🎉 emoji reaction and a CI status check — neither of
            which produces a trackable event in GH Archive. This means some of
            Sentry&apos;s review activity is invisible to our BigQuery-based
            data — until we enrich it with GitHub API calls (see{" "}
            <a href="#what-counts" className={linkClass}>Emoji Reactions on PRs</a>{" "}
            above for how we recover these).
          </li>
        </ul>
        <p className="text-theme-text-secondary leading-relaxed">
          You can see the exact event-type breakdown for each product on its
          detail page.
        </p>
      </section>

      {/* How Rankings Work */}
      <section className="space-y-4">
        <SectionHeading id="rankings" className="text-theme-text">
          How Rankings Work
        </SectionHeading>
        <p className="text-theme-text-secondary leading-relaxed">
          Products are ranked by <strong className="text-theme-text">growth rate</strong> rather
          than absolute volume. A product with fewer total reviews but rapid
          adoption will rank higher than a larger product with flat or declining
          growth.
        </p>
        <p className="text-theme-text-secondary leading-relaxed">
          Growth is calculated by comparing review volume in the most recent
          12-week window against the previous 12-week window:
        </p>
        <div className="overflow-x-auto rounded-lg border border-theme-border bg-theme-surface px-6 py-4">
          <code className="text-sm text-theme-text">
            Growth % = (recent_12w_reviews − previous_12w_reviews) / previous_12w_reviews × 100
          </code>
        </div>
        <p className="text-theme-text-secondary leading-relaxed">
          This means a product that doubled its review count from one quarter
          to the next shows +100% growth, regardless of whether that&apos;s
          1,000 → 2,000 or 100,000 → 200,000 reviews.
        </p>

        <h4 className="text-theme-text font-semibold mt-6" id="growth-threshold">
          Minimum Baseline &amp; &ldquo;New&rdquo; Products
        </h4>
        <p className="text-theme-text-secondary leading-relaxed">
          Growth percentages require a meaningful baseline to be useful. A product
          that goes from 5 to 50 reviews shows +900% growth — technically correct
          but misleading when compared to established products. To prevent this,
          we require at least <strong className="text-theme-text">100 reviews</strong> in the
          previous 12-week window before calculating a growth percentage.
        </p>
        <p className="text-theme-text-secondary leading-relaxed">
          Products below this threshold display
          a <span className="inline-flex items-center rounded-full bg-blue-500/15 border border-blue-500/30 px-1.5 py-px text-xs font-medium text-blue-400">New</span> badge
          instead of a growth percentage. These are recently launched tools still
          building their initial user base. Once they accumulate enough review
          history, the badge is replaced with a real growth rate.
        </p>
        <p className="text-theme-text-secondary leading-relaxed">
          Additionally, growth is capped at ±999% to prevent extreme outliers from
          distorting rankings. In practice, this cap rarely triggers — the baseline
          threshold handles the most common case.
        </p>

        <h4 className="text-theme-text font-semibold mt-6">
          Ranking Order
        </h4>
        <p className="text-theme-text-secondary leading-relaxed">
          We chose growth over absolute volume because it makes the ranking
          more dynamic, giving credit to fast-growing tools over
          older, established ones — while the 12-week window keeps it
          stable enough to avoid noise from week-to-week fluctuations.
        </p>
        <p className="text-theme-text-secondary leading-relaxed">
          New products (with the <span className="inline-flex items-center rounded-full bg-blue-500/15 border border-blue-500/30 px-1.5 py-px text-xs font-medium text-blue-400">New</span> badge)
          have a growth of 0% for ranking purposes, placing them alongside
          products with neutral growth — above retired or declining tools, but
          below products with established positive growth trends. The{" "}
          <Link href="/compare#detailed" className={linkClass}>
            detailed comparison table
          </Link>{" "}
          lets you sort by any metric — including total reviews, repos, and
          organizations — if you prefer a different ranking.
        </p>
        <p className="text-theme-muted text-sm italic">
          The default &ldquo;Top 10&rdquo; product selection in the filter bar
          also uses growth rate, so newly emerging tools appear by default
          alongside established ones.
        </p>
      </section>

      {/* PR Profile & Merge Characteristics */}
      <section className="space-y-4">
        <SectionHeading id="pr-profile" className="text-theme-text">
          PR Profile &amp; Merge Characteristics
        </SectionHeading>
        <p className="text-theme-text-secondary leading-relaxed">
          Each product&apos;s detail page and the{" "}
          <Link href="/compare#detailed" className={linkClass}>comparison table</Link>{" "}
          show characteristics of pull requests the bot has reviewed: average
          size (additions, deletions, files changed), merge rate, and time to
          merge.
        </p>
        <p className="text-theme-text-secondary leading-relaxed">
          This data comes from a <strong className="text-theme-text">separate
          enrichment step</strong> — the pipeline fetches PR metadata from the
          GitHub REST API for PRs discovered via GH Archive. It is not derived
          from GH Archive events directly.
        </p>
        <div className="space-y-3">
          <h3 className="text-lg font-medium text-theme-text">Important caveats</h3>
          <ul className="list-disc space-y-2 pl-6 text-theme-text-secondary">
            <li>
              <strong className="text-theme-text">Progressive enrichment.</strong>{" "}
              We discover <em>every</em> PR where a tracked bot left an event
              in GH Archive, then fetch metadata via the GitHub API. Until
              enrichment completes, statistics are based on the subset already
              enriched — check
              the <Link href="/status" className={linkClass}>/status</Link> page
              for current progress. The count is shown alongside each stat
              (&ldquo;based on X PRs&rdquo;).
            </li>
            <li>
              <strong className="text-theme-text">Correlation, not causation.</strong>{" "}
              A bot reviewing a PR does not mean it influenced the merge rate or
              time to merge. These stats describe the <em>kind of PRs</em> the
              bot reviews — not the bot&apos;s impact on outcomes.
            </li>
            <li>
              <strong className="text-theme-text">Merge rate</strong> is the
              percentage of enriched PRs in{" "}
              <code className={codeClass}>MERGED</code> state (vs.{" "}
              <code className={codeClass}>CLOSED</code> without merge or
              still <code className={codeClass}>OPEN</code>).
            </li>
            <li>
              <strong className="text-theme-text">Time to merge</strong> is the
              average hours between PR creation and merge, computed only for
              merged PRs. Products where no enriched PRs have been merged
              show &ldquo;—&rdquo;.
            </li>
            <li>
              Products with fewer than <strong className="text-theme-text">10
              enriched PRs</strong> are excluded from the comparison table to
              avoid misleading statistics from insufficient data.
            </li>
          </ul>
        </div>
        {prEnrichmentPct !== null && prEnrichmentPct <= 95 && (
          <div className="mt-3 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400" data-testid="pr-enrichment-warning">
            <strong>Note:</strong> PR metadata has not yet been fully
            collected ({prEnrichmentPct.toFixed(1)}% complete). PR profile
            statistics are based on incomplete data.{" "}
            <Link href="/status" className="text-red-300 hover:text-red-200 underline">
              View status →
            </Link>
          </div>
        )}
      </section>

      {/* 👍 Rate & Reaction Data */}
      <section className="space-y-4">
        <SectionHeading id="thumbs-up-rate" className="text-theme-text">
          👍 Rate &amp; Reaction Data
        </SectionHeading>
        <p className="text-theme-text-secondary leading-relaxed">
          When someone reads a bot&apos;s inline review comment on GitHub, they
          can react with emoji — including 👍 and 👎. This includes human
          developers, but also coding agents and automation that can be{" "}
          <a
            href="https://github.com/bruno-garcia/pi-config/blob/main/skills/address-review/SKILL.md"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            instructed to react to review comments
          </a>
          . We track these reactions and compute two metrics:
        </p>
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-theme-border bg-theme-surface px-6 py-4 space-y-3">
            <div>
              <code className="text-sm text-theme-text">
                👍 Rate = thumbs_up / (thumbs_up + thumbs_down) × 100
              </code>
              <p className="mt-1 text-sm text-theme-text-secondary">
                Of all 👍 and 👎 reactions on a bot&apos;s comments, what
                percentage are 👍? Higher means people who react tend to
                agree with the bot&apos;s suggestions.
              </p>
            </div>
            <div>
              <code className="text-sm text-theme-text">
                Reaction Rate = comments_with_reactions / total_comments × 100
              </code>
              <p className="mt-1 text-sm text-theme-text-secondary">
                What percentage of a bot&apos;s comments received any 👍 or 👎
                reaction at all? This gives context to the 👍 Rate — a 95%
                👍 Rate means something very different if 0.5% vs. 10% of
                comments get reactions.
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 space-y-3">
          <h3 className="text-lg font-medium text-theme-text">Important caveats</h3>
          <ul className="list-disc space-y-2 pl-6 text-theme-text-secondary">
            <li>
              <strong className="text-theme-text">Most comments get zero reactions.</strong>{" "}
              The Reaction Rate shows what percentage actually do. Without it,
              the 👍 Rate is uninterpretable — a bot could show 100% 👍 Rate
              based on just a handful of reactions across thousands of comments.
            </li>
            <li>
              <strong className="text-theme-text">Minimum threshold.</strong>{" "}
              Bots with fewer than 30 total 👍+👎 reactions show &ldquo;—&rdquo;
              instead of a percentage. Below this threshold the data is too
              sparse to be meaningful.
            </li>
            <li>
              <strong className="text-theme-text">Selection bias.</strong>{" "}
              People who take the time to react are not representative of all
              readers. Happy users might 👍; annoyed users might just ignore the
              comment. Or vice versa. The signal is noisy.
            </li>
            <li>
              <strong className="text-theme-text">Not a quality metric.</strong>{" "}
              A 👍 could mean &ldquo;good catch, I&apos;ll fix it&rdquo; or
              just &ldquo;thanks for reviewing.&rdquo; A 👎 could mean
              &ldquo;bad suggestion&rdquo; or &ldquo;I disagree with the
              approach.&rdquo; Neither tells you whether the code was actually
              changed.
            </li>
            <li>
              <strong className="text-theme-text">Large PRs may be incomplete.</strong>{" "}
              The GitHub API returns at most 100 review threads per request.
              For the rare PR with more than 100 threads, we save the first
              100 and move on — any bot comments beyond that are missed. This
              means reaction counts for those PRs are undercounted. In
              practice, very few PRs hit this limit.
            </li>
            <li>
              <strong className="text-theme-text">No fix rate.</strong>{" "}
              We don&apos;t track whether a bot&apos;s suggestion was addressed
              by a subsequent commit. That would require analyzing commit diffs
              relative to comment content — a much harder problem we don&apos;t
              attempt. The 👍 Rate measures <em>reaction sentiment</em>, not
              whether suggestions are acted on.
            </li>
          </ul>
        </div>
      </section>

      {/* What's NOT Tracked */}
      <section className="space-y-6">
        <SectionHeading id="not-tracked" className="text-theme-text">
          What&apos;s NOT Tracked
        </SectionHeading>

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
              We maintain a curated registry of AI code review bot accounts.
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
        <SectionHeading id="products-vs-bots" className="text-theme-text">Products vs. Bots</SectionHeading>
        <p className="text-theme-text-secondary leading-relaxed">
          A <em>product</em> is a company or tool (e.g., &ldquo;Qodo&rdquo;),
          while a <em>bot</em> is a specific GitHub App account (e.g.,{" "}
          <code className={codeClass}>qodo-merge-pro[bot]</code>).
          Some products operate multiple bot accounts:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-theme-text-secondary">
          <li>
            <Link href="/products/qodo" className={linkClass}><strong>Qodo</strong></Link>: codium-pr-agent[bot],
            qodo-merge[bot], qodo-merge-pro[bot]
          </li>
          <li>
            <Link href="/products/sentry" className={linkClass}><strong>Sentry</strong></Link>: sentry[bot],
            seer-by-sentry[bot], codecov-ai[bot]
          </li>
          <li>
            <Link href="/products/linearb" className={linkClass}><strong>LinearB</strong></Link>: gitstream-cm[bot],
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
        <SectionHeading id="bot-registry" className="text-theme-text">Bot Registry</SectionHeading>
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
        <p className="text-theme-text-secondary leading-relaxed">
          Product descriptions and comparison blurbs were generated by Claude
          (Opus 4.6) based on research of each product&apos;s public website
          and documentation. They aim to highlight what makes each tool&apos;s
          approach to code review distinctive — for example, whether it&apos;s
          a dedicated reviewer, part of a broader platform, or focused on a
          specific aspect like production safety or refactoring. If you spot
          an inaccuracy or want to suggest a better description,{" "}
          <a
            href="https://github.com/bruno-garcia/code-review-trends/blob/main/pipeline/src/bots.ts"
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            open a pull request
          </a>{" "}
          or use the Feedback widget below.
        </p>
      </section>

      {/* Known Data Gaps */}
      <section className="space-y-4">
        <SectionHeading id="data-gaps" className="text-theme-text">
          Known Data Gaps
        </SectionHeading>
        <p className="text-theme-text-secondary leading-relaxed">
          GH Archive is our sole source for trend data, and it has
          known data-collection issues that affect our charts. These are
          upstream problems we cannot fix — the raw event counts in BigQuery
          are lower than reality for the affected periods.
        </p>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-theme-text">
              May 24, 2025 — permanent ~35% drop in captured events
            </h3>
            <p className="mt-2 text-theme-text-secondary leading-relaxed">
              Starting May 24, 2025 the number of events captured by GH Archive
              dropped by roughly 35% and has not recovered. The GH Archive{" "}
              <a
                href="https://github.com/igrigorik/gharchive.org/blob/master/crawler/crawler.rb"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                crawler
              </a>{" "}
              only fetches the first page of the GitHub Events API. Analysis of
              event IDs shows the archive has always missed some events, but the
              miss rate increased sharply on this date — likely due to a
              server-side change at GitHub. This is tracked in{" "}
              <a
                href="https://github.com/igrigorik/gharchive.org/issues/310"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                gharchive.org issue 310
              </a>
              {" "}(open, unresolved).
            </p>
            <p className="mt-2 text-theme-text-secondary leading-relaxed">
              <strong className="text-theme-text">Impact:</strong> All absolute
              event counts (bot and human) after May 24 are ~35% lower than
              they should be. Because both sides are affected proportionally,
              the <em>AI Share percentage</em> remains approximately correct —
              ratios are preserved even when the underlying counts are
              undercounted.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-theme-text">
              Oct 9–14, 2025 — near-total outage (5 days)
            </h3>
            <p className="mt-2 text-theme-text-secondary leading-relaxed">
              GitHub introduced a cache on the Events API that caused certain
              API tokens — including the one used by the GH Archive crawler —
              to see stale data. Event capture dropped from ~2.7 million
              events/day to ~18,000 events/day (a 99% reduction) for five days.
              GitHub Support{" "}
              <a
                href="https://github.com/igrigorik/gharchive.org/issues/312#issuecomment-3411383428"
                target="_blank"
                rel="noopener noreferrer"
                className={linkClass}
              >
                confirmed the issue
              </a>
              {" "}and disabled the cache. Normal collection resumed October 15.
            </p>
            <p className="mt-2 text-theme-text-secondary leading-relaxed">
              <strong className="text-theme-text">Impact:</strong> The weeks of
              October 6 and October 13 show dramatically lower counts, visible
              as a sharp dip in all volume charts. The AI Share percentage for
              those weeks is also unreliable since the missing events may not be
              evenly distributed between bot and human activity.
            </p>
          </div>
        </div>

        <p className="text-theme-muted text-sm italic">
          These gaps are inherent to GH Archive. We do not attempt to
          interpolate, estimate, or backfill the missing data — what you see
          in the charts is exactly what GH Archive captured. If GH Archive
          recovers to full event coverage in the future, our next pipeline
          backfill will automatically reflect the corrected data.
        </p>
      </section>

      {/* Comparison with Other Trackers */}
      <section className="space-y-4">
        <SectionHeading id="comparison" className="text-theme-text">
          Comparison with Other Trackers
        </SectionHeading>
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
            track dozens of products and bot accounts. Other trackers may include
            different sets.
          </li>
        </ul>
      </section>

      {/* Who's Behind This */}
      <section className="space-y-4">
        <SectionHeading id="who" className="text-theme-text">
          Who&apos;s Behind This
        </SectionHeading>
        <p className="text-theme-text-secondary leading-relaxed">
          I&apos;m{" "}
          <a href="https://github.com/bruno-garcia" target="_blank" rel="noopener noreferrer" className={linkClass}>Bruno Garcia</a>.
          I work at{" "}
          <a href="https://sentry.io/welcome/" target="_blank" rel="noopener noreferrer" className={linkClass}>Sentry</a>{" "}
          on the code review part of{" "}
          <a href="https://sentry.io/product/seer/" target="_blank" rel="noopener noreferrer" className={linkClass}>Seer</a>,
          Sentry&apos;s AI debugging agent. Seer does root cause analysis,
          code review, and fix generation — using the context Sentry already
          has about your running application (errors, traces, logs, profiles)
          to find and fix bugs. The code review piece specifically looks at
          pull requests and predicts issues before they ship.
        </p>
        <p className="text-theme-text-secondary leading-relaxed">
          This is a personal project, not a Sentry product. I have an obvious
          bias — Sentry is one of the tracked bots — so I want to be upfront
          about that. The data is public, the{" "}
          <a href="https://github.com/bruno-garcia/code-review-trends" target="_blank" rel="noopener noreferrer" className={linkClass}>code is public</a>,
          and every bot gets the same treatment.
        </p>
        <p className="text-theme-text-secondary leading-relaxed">
          The motivation is simple: I wanted to understand how this space is
          evolving. Back in 2018 when I joined Sentry, I built{" "}
          <a href="https://nugettrends.com" target="_blank" rel="noopener noreferrer" className={linkClass}>NuGet Trends</a>{" "}
          (now{" "}
          <a href="https://github.com/dotnet/nuget-trends" target="_blank" rel="noopener noreferrer" className={linkClass}>part of the .NET Foundation</a>)
          to track adoption of the Sentry .NET SDK I was working on.
          Same idea here —
          scratch your own itch, make the data available, and maybe it&apos;s
          useful to others too.
        </p>
        <p className="text-theme-text-secondary leading-relaxed">
          If you spot a missing bot, have questions about the methodology, or
          just want to say hi:{" "}
          <a href="https://github.com/bruno-garcia/code-review-trends/issues" target="_blank" rel="noopener noreferrer" className={linkClass}>open an issue</a>,
          or find me on{" "}
          <a href="https://x.com/brungarc" target="_blank" rel="noopener noreferrer" className={linkClass}>X</a>
          {" / "}
          <a href="https://bsky.app/profile/brunogarcia.com" target="_blank" rel="noopener noreferrer" className={linkClass}>Bluesky</a>.
        </p>
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
