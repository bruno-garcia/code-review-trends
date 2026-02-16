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
              1. Reviews (PullRequestReviewEvent)
            </h3>
            <p className="mt-2 text-gray-300 leading-relaxed">
              Fired when a review is submitted — approve, request changes, or
              comment. This is the primary metric used for rankings. Even a
              silent approval (no comment body) generates this event.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-white">
              2. Review Comments (PullRequestReviewCommentEvent)
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
              3. PR Comments (IssueCommentEvent on PRs)
            </h3>
            <p className="mt-2 text-gray-300 leading-relaxed">
              Top-level comments posted on pull requests (not inline on diffs).
              Many bots use these for summaries, walkthrough guides, or analysis
              reports rather than the formal review API. In GitHub&apos;s data
              model, PRs are issues — so <code className="rounded bg-gray-800 px-1.5 py-0.5 text-sm text-gray-200">IssueCommentEvent</code> fires
              for both. We filter to only include comments on pull requests.
            </p>
          </div>
        </div>
      </section>

      {/* How Bots Differ */}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold text-white">How Bots Differ</h2>
        <p className="text-gray-300 leading-relaxed">
          Not all bots use the same mix of event types. This affects how they
          rank depending on which metric you look at:
        </p>

        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="px-4 py-3 text-sm font-semibold text-gray-200">Bot</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-200">Reviews</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-200">Review Comments</th>
                <th className="px-4 py-3 text-sm font-semibold text-gray-200">PR Comments</th>
              </tr>
            </thead>
            <tbody className="text-gray-300">
              <tr className="border-b border-gray-800">
                <td className="px-4 py-3">CodeRabbit</td>
                <td className="px-4 py-3">33%</td>
                <td className="px-4 py-3">47%</td>
                <td className="px-4 py-3">20%</td>
              </tr>
              <tr className="border-b border-gray-800">
                <td className="px-4 py-3">GitHub Copilot</td>
                <td className="px-4 py-3">54%</td>
                <td className="px-4 py-3">46%</td>
                <td className="px-4 py-3">0%</td>
              </tr>
              <tr className="border-b border-gray-800">
                <td className="px-4 py-3">Gemini Code Assist</td>
                <td className="px-4 py-3">41%</td>
                <td className="px-4 py-3">27%</td>
                <td className="px-4 py-3">32%</td>
              </tr>
              <tr className="border-b border-gray-800">
                <td className="px-4 py-3">Sentry</td>
                <td className="px-4 py-3">19%</td>
                <td className="px-4 py-3">21%</td>
                <td className="px-4 py-3">48%</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="text-gray-400 text-sm italic">
          Percentages based on recent public event samples. Individual bot
          behavior may change over time.
        </p>
        <p className="text-gray-300 leading-relaxed">
          For example, Sentry uses IssueCommentEvent for nearly half its PR
          interactions. Rankings based only on formal Reviews would significantly
          undercount Sentry&apos;s actual code review activity.
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
              reaction (e.g., 👀) to the PR description. GitHub has no event
              type for reactions in its Events API, so these are invisible to GH
              Archive. We capture reactions on bot <em>comments</em> via the
              GitHub REST API enrichment pipeline, but not reactions added{" "}
              <em>by</em> bots to PR descriptions.
            </p>
          </div>

          <div>
            <h3 className="text-lg font-medium text-white">Check runs and status checks</h3>
            <p className="mt-1 text-gray-300 leading-relaxed">
              Some tools (SonarQube, DeepSource) post analysis results as CI
              check runs (CheckRunEvent/CheckSuiteEvent). These are not code
              reviews in the traditional sense and are not tracked.
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
              users in GH Archive data.
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
