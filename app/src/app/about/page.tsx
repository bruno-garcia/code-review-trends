export default function AboutPage() {
  return (
    <div data-testid="about-page" className="mx-auto max-w-4xl space-y-12 py-8">
      <h1 className="text-4xl font-bold text-white">Methodology</h1>

      {/* Data Source */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Data Source</h2>
        <p className="text-gray-300 leading-relaxed">
          <a href="https://www.gharchive.org/" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">GH Archive</a> stores
          all public GitHub events in BigQuery. We query these daily tables to
          count how AI code review bots interact with pull requests. Additional
          metadata (stars, languages, reactions) comes from the GitHub REST API.
        </p>
        <p className="text-gray-400 text-sm italic">
          Note: Only public repositories are included. Activity on private repos
          is invisible.
        </p>
      </section>

      {/* What Counts as a "Review" */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-white">
          What Counts as a &ldquo;Review&rdquo;
        </h2>
        <p className="text-gray-300 leading-relaxed">
          We track three types of GitHub events that indicate a bot participated
          in code review:
        </p>

        <div className="space-y-6">
          <div>
            <h3 className="text-lg font-medium text-white">
              1. Reviews (<a href="https://docs.github.com/en/rest/using-the-rest-api/github-event-types#pullrequestreviewevent" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">PullRequestReviewEvent</a>)
            </h3>
            <p className="mt-2 text-gray-300 leading-relaxed">
              Fired when a review is submitted — approve, request changes, or
              comment. This is the primary metric used for rankings. Even a
              silent approval (no comment body) generates this event.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-white">
              2. Review Comments (<a href="https://docs.github.com/en/rest/using-the-rest-api/github-event-types#pullrequestreviewcommentevent" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">PullRequestReviewCommentEvent</a>)
            </h3>
            <p className="mt-2 text-gray-300 leading-relaxed">
              Fired for each inline comment on a PR diff. A single review
              submission can contain many inline comments, each generating a
              separate event. This gives a more granular view of how verbose a
              bot&apos;s feedback is.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-white">
              3. PR Comments (<a href="https://docs.github.com/en/rest/using-the-rest-api/github-event-types#issuecommentevent" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">IssueCommentEvent</a> on PRs)
            </h3>
            <p className="mt-2 text-gray-300 leading-relaxed">
              Top-level comments posted on pull requests (not inline on diffs).
              Many bots use these for summaries, walkthrough guides, or analysis
              reports rather than the formal review API. In GitHub&apos;s data
              model, PRs are issues — so IssueCommentEvent fires for both. We
              filter to only include comments on pull requests.
            </p>
          </div>
        </div>
      </section>

      {/* How AI Share Is Calculated */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">
          How &ldquo;AI Share&rdquo; Is Calculated
        </h2>
        <p className="text-gray-300 leading-relaxed">
          The AI share percentage on the home page uses a simple formula,
          computed separately for each event type (reviews, review comments, PR
          comments):
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-700 bg-gray-900 px-6 py-4">
          <code className="text-sm text-gray-200">
            AI Share % = tracked_bot_events / (tracked_bot_events +
            non_bot_events) × 100
          </code>
        </div>

        <div className="space-y-3">
          <p className="text-gray-300 leading-relaxed">
            <strong className="text-white">Numerator</strong> (tracked bot
            events): Only events from the{" "}
            <span className="tabular-nums">~30</span> bot accounts we
            explicitly track. If an AI code review tool isn&apos;t in our
            registry, its activity does not count as &ldquo;AI.&rdquo;
          </p>
          <p className="text-gray-300 leading-relaxed">
            <strong className="text-white">Denominator</strong> (non-bot
            events): All remaining events after excluding our tracked bots{" "}
            <em>and</em> any GitHub account with a{" "}
            <code className="rounded bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">
              [bot]
            </code>{" "}
            suffix. This means non-AI automation bots (like{" "}
            <code className="rounded bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">
              dependabot[bot]
            </code>{" "}
            or{" "}
            <code className="rounded bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">
              renovate[bot]
            </code>
            ) are excluded from both sides of the equation — they don&apos;t
            inflate the human count or the AI count.
          </p>
        </div>

        <p className="text-gray-300 leading-relaxed">
          <strong className="text-white">No double counting</strong>: Each
          event type is counted and displayed independently — the chart lets you
          toggle between Reviews, Review Comments, and PR Comments. A bot that
          submits 1 review with 5 inline comments contributes 1 to the Reviews
          metric and 5 to the Review Comments metric, but these are never
          combined. The same counting logic applies to both the bot and
          non-bot sides, so the ratio is apples-to-apples. Note that we count{" "}
          <em>events</em>, not unique pull requests — if a bot comments twice on
          the same PR, that&apos;s two events.
        </p>

        <p className="text-gray-400 text-sm italic">
          This means the percentage represents &ldquo;share of non-bot public
          GitHub code review activity attributable to tracked AI bots.&rdquo;
          The true share of AI-assisted reviews is likely higher, since we
          miss private repos, untracked tools, and AI tools operating through
          regular user accounts.
        </p>
      </section>

      {/* How Bots Differ */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">How Bots Differ</h2>
        <p className="text-gray-300 leading-relaxed">
          Not all bots use the same mix of event types. This affects how they
          rank depending on which metric you look at. For example:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-gray-300">
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
        <p className="text-gray-300 leading-relaxed">
          You can see the exact event-type breakdown for each product on its
          detail page.
        </p>
      </section>

      {/* What's NOT Tracked */}
      <section className="space-y-6">
        <h2 className="text-2xl font-semibold text-white">
          What&apos;s NOT Tracked
        </h2>

        <div className="space-y-4">
          <div>
            <h3 className="text-lg font-medium text-white">Private repositories</h3>
            <p className="mt-1 text-gray-300 leading-relaxed">
              GH Archive only captures public GitHub events. Bots may be far
              more active on private repos, especially in enterprise settings.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-white">Emoji reactions on PRs</h3>
            <p className="mt-1 text-gray-300 leading-relaxed">
              Some bots indicate they&apos;ve reviewed a PR by adding an emoji
              reaction (e.g., Sentry adds 🎉 when it finds no issues). GitHub
              has no event type for reactions in its Events API, so these are
              invisible to GH Archive. We capture reactions <em>on</em> bot
              comments via the GitHub REST API enrichment pipeline, but do not
              yet capture reactions added <em>by</em> bots to PR descriptions
              (this requires an extra API call per PR to resolve who reacted).
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-white">Check runs and status checks</h3>
            <p className="mt-1 text-gray-300 leading-relaxed">
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
            <h3 className="text-lg font-medium text-white">Bot-created pull requests</h3>
            <p className="mt-1 text-gray-300 leading-relaxed">
              AI tools like Devin, Sweep, and Seer by Sentry create pull
              requests rather than review them. PullRequestEvent is a different
              signal and is not tracked.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-white">Non-bot accounts</h3>
            <p className="mt-1 text-gray-300 leading-relaxed">
              Some AI tools operate through regular GitHub user accounts rather
              than App bot accounts. These are not distinguishable from human
              users in GH Archive data. Where we know about these accounts, we
              track them explicitly — for example, GitHub Copilot appears as
              both{" "}
              <code className="rounded bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">
                copilot-pull-request-reviewer[bot]
              </code>{" "}
              and the regular user account{" "}
              <code className="rounded bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">
                Copilot
              </code>
              , and we include both in our tracking. Any non-bot accounts we
              don&apos;t know about are counted as human activity.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-white">Untracked bot accounts</h3>
            <p className="mt-1 text-gray-300 leading-relaxed">
              We maintain a curated registry of ~30 AI code review bot accounts.
              Any bot not in this registry is excluded from the AI share
              numerator. If it has a{" "}
              <code className="rounded bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">[bot]</code>{" "}
              suffix, it&apos;s also excluded from the denominator (so it
              doesn&apos;t affect the percentage either way). If it uses a
              regular user account, it falls into the human count.
            </p>
          </div>
        </div>
      </section>

      {/* Products vs. Bots */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">Products vs. Bots</h2>
        <p className="text-gray-300 leading-relaxed">
          A <em>product</em> is a company or tool (e.g., &ldquo;Qodo&rdquo;),
          while a <em>bot</em> is a specific GitHub App account (e.g.,{" "}
          <code className="rounded bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">qodo-merge-pro[bot]</code>).
          Some products operate multiple bot accounts:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-gray-300">
          <li>
            <strong className="text-white">Qodo</strong>: codium-pr-agent[bot],
            qodo-merge[bot], qodo-merge-pro[bot]
          </li>
          <li>
            <strong className="text-white">Sentry</strong>: sentry[bot],
            seer-by-sentry[bot], codecov-ai[bot]
          </li>
          <li>
            <strong className="text-white">LinearB</strong>: gitstream-cm[bot],
            linearb[bot]
          </li>
        </ul>
        <p className="text-gray-300 leading-relaxed">
          Product-level rankings aggregate activity across all of a
          product&apos;s bot accounts.
        </p>
      </section>

      {/* Comparison with Other Trackers */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">
          Comparison with Other Trackers
        </h2>
        <p className="text-gray-300 leading-relaxed">
          If you&apos;ve seen different rankings on other trackers (e.g.,{" "}
          <a href="https://aitooltracker.dev" target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">aitooltracker.dev</a>),
          it&apos;s likely because:
        </p>
        <ul className="list-disc space-y-2 pl-6 text-gray-300">
          <li>
            <strong className="text-white">Different time windows</strong>: We
            show all-time cumulative totals by default. Other trackers may show
            rolling 7-day or 30-day windows, which favors bots with recent
            surges.
          </li>
          <li>
            <strong className="text-white">Different event types</strong>: Some
            trackers only count PullRequestReviewEvent. We track all three event
            types separately, giving a more complete picture.
          </li>
          <li>
            <strong className="text-white">Different bot coverage</strong>: We
            track 25+ products with 30+ bot accounts. Other trackers may include
            different sets.
          </li>
        </ul>
        <p className="text-gray-300 leading-relaxed">
          Both this site and aitooltracker.dev use the same underlying data
          source (GH Archive on BigQuery).
        </p>
      </section>
    </div>
  );
}
