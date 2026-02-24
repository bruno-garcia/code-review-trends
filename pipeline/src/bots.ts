/**
 * Canonical registry of AI code review products and bots we track.
 *
 * Source of truth for bot/product identifiers. Used by the pipeline to filter
 * GH Archive events and by the app to display bot profiles.
 *
 * A product can have multiple bots (e.g. Qodo has codium-pr-agent, qodo-merge,
 * qodo-merge-pro). Each bot has exactly one GitHub login.
 *
 * To add a new bot:
 * 1. Add a product entry (if new) and bot entry here
 * 2. Run `npm run cli -- sync-bots` to push it to ClickHouse
 * 3. The app picks it up automatically
 */

export type ProductDefinition = {
  /** Stable identifier used as primary key */
  id: string;
  /** Display name */
  name: string;
  /** Website URL */
  website: string;
  /** Short description */
  description: string;
  /** URL to product documentation */
  docs_url: string;
  /** Brand color (hex) */
  brand_color: string;
  /** Avatar URL */
  avatar_url: string;
  /** Product status — 'retired' means service is no longer available. Defaults to 'active'. */
  status?: "active" | "retired";
};

export type BotDefinition = {
  /** Stable identifier used as primary key across all tables */
  id: string;
  /** Product this bot belongs to */
  product_id: string;
  /** Display name */
  name: string;
  /** Primary GitHub login in the format `name[bot]` */
  github_login: string;
  /**
   * Additional GitHub logins this bot operates under.
   * Some bots use regular user accounts alongside their App bot account
   * (e.g. GitHub Copilot appears as both `copilot-pull-request-reviewer[bot]`
   * and `Copilot`). These are included in BigQuery filters and the bot_logins
   * table so they're correctly attributed.
   */
  additional_logins?: string[];
  /** GitHub user ID for cross-referencing */
  github_id: number;
  /** Website URL */
  website: string;
  /** Short description for the profile page */
  description: string;
  /** Brand color (hex) */
  brand_color: string;
  /** Avatar URL */
  avatar_url: string;
};

export const PRODUCTS: ProductDefinition[] = [
  {
    id: "coderabbit",
    name: "CodeRabbit",
    website: "https://coderabbit.ai",
    description:
      "AI-first code review agent that learns from your team's preferences over time. Provides line-by-line feedback with auto-generated PR summaries, custom review instructions, and integration with Jira, Linear, and GitHub Issues. Adapts its review style and focus areas based on past interactions, making feedback increasingly relevant to your codebase conventions.",
    docs_url: "https://docs.coderabbit.ai",
    brand_color: "#f97316",
    avatar_url: "https://avatars.githubusercontent.com/in/347564?v=4",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    website: "https://github.com/features/copilot",
    description:
      "GitHub's native AI pair programmer spanning code completion, chat, and pull request review. Reviews PRs directly in the GitHub UI with zero third-party overhead. Part of the broader Copilot suite — developers using Copilot in their IDE get the same AI reviewing their PRs, creating a unified experience from writing to review.",
    docs_url: "https://docs.github.com/en/copilot",
    brand_color: "#58a6ff",
    avatar_url: "https://avatars.githubusercontent.com/in/946600?v=4",
  },
  {
    id: "codescene",
    name: "CodeScene",
    website: "https://codescene.com",
    description:
      "Behavioral code analysis platform that mines version control history to understand code health and technical debt. PR reviews analyze changes through the lens of historical patterns — flagging modifications to hotspot areas with high churn and bug density. Unlike pure AI tools, CodeScene combines static analysis with git history to identify truly risky changes based on the trajectory of each file and module.",
    docs_url: "https://codescene.io/docs",
    brand_color: "#5f72ee",
    avatar_url: "https://avatars.githubusercontent.com/in/53921?v=4",
  },
  {
    id: "sourcery",
    name: "Sourcery",
    website: "https://sourcery.ai",
    description:
      "AI code reviewer focused on refactoring and code quality rather than bug detection. Identifies opportunities for cleaner patterns, suggests simplifications, and assigns quality scores to track improvements over time. Strong Python and JavaScript support. Asks \"is this code well-written?\" rather than \"is this code correct?\" — helping teams prioritize maintainability and readability.",
    docs_url: "https://docs.sourcery.ai",
    brand_color: "#65a30d",
    avatar_url: "https://avatars.githubusercontent.com/in/48477?v=4",
  },
  {
    id: "ellipsis",
    name: "Ellipsis",
    website: "https://ellipsis.dev",
    description:
      "Configurable AI code review platform that lets teams define their own review rules and custom prompts. Rather than a fixed ruleset, Ellipsis empowers teams to encode their specific coding standards, architectural patterns, and regulatory requirements into automated checks. Valuable for organizations with practices that generic tools can't address.",
    docs_url: "https://docs.ellipsis.dev",
    brand_color: "#06b6d4",
    avatar_url: "https://avatars.githubusercontent.com/in/64358?v=4",
  },
  {
    id: "qodo",
    name: "Qodo",
    website: "https://qodo.ai",
    description:
      "Code integrity platform (formerly CodiumAI) that uniquely integrates test generation with code review. Identifies areas lacking test coverage and auto-generates test cases to catch potential bugs. Bridges the gap between \"reviewed code\" and \"tested code\" — treating testing as an integral part of the review process rather than a separate concern.",
    docs_url: "https://qodo-merge-docs.qodo.ai",
    brand_color: "#9d75f8",
    avatar_url: "https://avatars.githubusercontent.com/in/484649?v=4",
  },
  {
    id: "greptile",
    name: "Greptile",
    website: "https://greptile.com",
    description:
      "Codebase-aware AI code review that indexes your entire repository to understand architecture, dependencies, and design patterns. Reviews PRs in context of the full system — recognizing which components depend on changed code, where inconsistencies arise, and what architectural debt a change introduces. Particularly valuable for large, complex codebases where understanding cross-cutting impact matters most.",
    docs_url: "https://docs.greptile.com",
    brand_color: "#22c55e",
    avatar_url: "https://avatars.githubusercontent.com/in/867647?v=4",
  },
  {
    id: "sentry",
    name: "Sentry",
    website: "https://sentry.io",
    description:
      "Application monitoring and error tracking platform where PR review is powered by Seer, an AI debugger grounded in production context. Unlike generic code review tools, Seer correlates PR changes against real errors, traces, logs, and performance data to answer \"will this break production?\" Can automatically root-cause issues and open fix PRs for live errors — turning error detection into immediate remediation.",
    docs_url: "https://docs.sentry.io",
    brand_color: "#9589c4",
    avatar_url: "https://avatars.githubusercontent.com/u/1396951?v=4",
  },
  {
    id: "baz",
    name: "Baz",
    website: "https://baz.co",
    description:
      "AI code reviewer built on the principle of signal over volume. Focuses on catching genuine bugs, logic errors, and security vulnerabilities with high confidence rather than generating a flood of stylistic suggestions. Designed for teams that want every review comment to be actionable — prioritizing accuracy over coverage to avoid the noise that leads developers to ignore automated feedback.",
    docs_url: "https://docs.baz.co",
    brand_color: "#39FF14",
    avatar_url: "https://avatars.githubusercontent.com/in/933528?s=60&v=4",
  },
  {
    id: "graphite",
    name: "Graphite",
    website: "https://graphite.dev",
    description:
      "Developer productivity platform built around stacked PRs and merge queues, with AI-assisted code review that understands how changes build on one another. Reviewer summarizes changes and provides feedback while understanding dependencies across stacked PRs. Differentiates through workflow innovation — optimizing the review and merge process, not just analyzing code.",
    docs_url: "https://graphite.dev/docs",
    brand_color: "#5b8ef0",
    avatar_url: "https://avatars.githubusercontent.com/in/158384?v=4",
  },
  {
    id: "codeant",
    name: "CodeAnt",
    website: "https://codeant.ai",
    description:
      "Static analysis platform with AI-enhanced detection and auto-fix capabilities across 30+ programming languages. Reviews PRs for bugs, security vulnerabilities, and anti-patterns, then generates fixes that can be applied directly. Differentiates through breadth of language coverage and automated remediation — identifying issues is half the problem; CodeAnt closes the loop by fixing them at scale.",
    docs_url: "https://docs.codeant.ai",
    brand_color: "#a855f7",
    avatar_url: "https://avatars.githubusercontent.com/in/646884?v=4",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    website: "https://windsurf.com",
    description:
      "IDE-first AI development platform (formerly Codeium) that extends from code completion and generation into PR review. Analyzes changes in the context of your full repository with review feedback available both on GitHub and in the editor. Reduces context switching by bringing review insights back into the IDE where developers spend most of their time.",
    docs_url: "https://docs.windsurf.com",
    brand_color: "#0d9488",
    avatar_url: "https://avatars.githubusercontent.com/in/1066231?v=4",
  },
  {
    id: "cubic",
    name: "Cubic",
    website: "https://cubic.dev",
    description:
      "AI development assistant that combines code review with developer education. Reviews PRs for bugs, security issues, and style while explaining not just what's wrong but why it matters. Designed to help teams grow their skills alongside maintaining code quality — particularly valuable for organizations investing in developer growth.",
    docs_url: "https://docs.cubic.dev",
    brand_color: "#edc00c",
    avatar_url: "https://avatars.githubusercontent.com/in/1082092?v=4",
  },
  {
    id: "cursor",
    name: "Cursor Bugbot",
    website: "https://cursor.com",
    description:
      "PR review extension from the Cursor AI code editor. Bugbot scans pull requests for potential bugs and suggests fixes, bringing Cursor's deep code understanding to the review workflow. Creates editor-to-PR continuity for teams already using Cursor — the same AI that helps write code also reviews it, ensuring consistent analysis from development through review.",
    docs_url: "https://docs.cursor.com",
    brand_color: "#e84e4e",
    avatar_url: "https://avatars.githubusercontent.com/in/1210556?v=4",
  },
  {
    id: "gemini",
    name: "Gemini Code Assist",
    website: "https://cloud.google.com/gemini/docs/codeassist/overview",
    description:
      "Google Cloud's enterprise AI code assistant that reviews pull requests for bugs, security vulnerabilities, and best practices. Part of the broader Gemini suite with IDE plugins and chat. Integrates with Google Cloud's identity, security, and developer infrastructure — can be customized with organization-specific policies and training data for GCP-native teams.",
    docs_url:
      "https://cloud.google.com/gemini/docs/codeassist/overview",
    brand_color: "#ec4899",
    avatar_url: "https://avatars.githubusercontent.com/in/956858?v=4",
  },
  {
    id: "bito",
    name: "Bito",
    website: "https://bito.ai",
    description:
      "LLM-powered code review assistant with a focus on security analysis and customizable review checklists. Teams define domain-specific checklists (API versioning, data validation, error handling) and Bito checks each PR against them. Particularly valued in regulated industries where compliance and threat-model-driven reviews need to be applied consistently across PRs.",
    docs_url: "https://docs.bito.ai",
    brand_color: "#94a3b8",
    avatar_url: "https://avatars.githubusercontent.com/in/1061978?v=4",
  },
  {
    id: "korbit",
    name: "Korbit",
    website: "https://korbit.ai",
    description:
      "AI code review mentor that went beyond bug detection to provide educational feedback aimed at helping developers learn and improve. Focused on teaching best practices through guided explanations during the review process — designed for learning contexts including coding bootcamps and team onboarding. Service has been retired.",
    docs_url: "https://docs.korbit.ai",
    brand_color: "#b07838",
    avatar_url: "https://avatars.githubusercontent.com/in/322216?v=4",
    status: "retired",
  },
  {
    id: "claude",
    name: "Claude",
    website: "https://claude.ai",
    description:
      "Anthropic's AI assistant with deep reasoning capabilities, available as a GitHub PR reviewer and through Claude Code, a CLI-based coding agent. Reviews code by thinking through changes step by step — following complex logic chains across files to identify subtle bugs and architectural issues. Stands out for nuanced understanding of business logic rather than pattern-matching against rules.",
    docs_url: "https://docs.anthropic.com",
    brand_color: "#FF9F1C",
    avatar_url: "https://avatars.githubusercontent.com/in/1236702?v=4",
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    website: "https://openai.com/codex",
    description:
      "OpenAI's cloud-based coding agent that runs in a sandboxed environment to write code, fix bugs, and review pull requests asynchronously. Assign tasks and review results when ready — operates independently without blocking developer workflows. Optimized for stateless, scalable code analysis that can process high volumes of reviews across distributed environments.",
    docs_url: "https://platform.openai.com/docs/guides/codex",
    brand_color: "#808080",
    avatar_url: "https://avatars.githubusercontent.com/in/1144995?s=60&v=4",
  },
  {
    id: "mesa",
    name: "Mesa",
    website: "https://mesa.dev",
    description:
      "Development workflow platform that integrates PR review with CI/CD orchestration and deployment context. AI suggestions appear alongside build results, test coverage, and deployment status — enabling review decisions informed by the full pipeline, not just the diff. Centralizes PRs, build logs, and deployment information to reduce context switching.",
    docs_url: "https://docs.mesa.dev",
    brand_color: "#c06a33",
    avatar_url: "https://avatars.githubusercontent.com/in/1050077?v=4",
  },
  {
    id: "linearb",
    name: "LinearB",
    website: "https://linearb.io",
    description:
      "Developer productivity and workflow intelligence platform that optimizes the review process itself. Uses gitStream automation to route PRs, auto-approve safe changes (documentation, version bumps), and assign the right reviewers. Focuses on team-level metrics — cycle time, review load balancing, and deployment frequency — rather than individual code quality analysis.",
    docs_url: "https://linearb.io/docs",
    brand_color: "#a37ce2",
    avatar_url: "https://avatars.githubusercontent.com/in/1658443?v=4",
  },
  {
    id: "augment",
    name: "Augment Code",
    website: "https://augmentcode.com",
    description:
      "Enterprise AI coding assistant with automated PR review focused on security, compliance, and architectural alignment. Can be deployed on-premises or in private cloud for organizations with strict data residency requirements. Reviews PRs against company-specific coding standards and integration patterns — designed for regulated industries handling sensitive code.",
    docs_url: "https://docs.augmentcode.com",
    brand_color: "#968CFF",
    avatar_url: "https://avatars.githubusercontent.com/in/1027498?v=4",
  },
  {
    id: "kodus",
    name: "Kodus",
    website: "https://kodus.io",
    description:
      "Open-source AI code reviewer with cloud and self-hosted deployment options. Analyzes pull requests for bugs, security issues, and coding standard violations with full transparency into how reviews are generated. Appeals to teams that want to audit AI decisions, customize detection logic, and avoid vendor lock-in while still getting automated code review.",
    docs_url: "https://docs.kodus.io",
    brand_color: "#6C63FF",
    avatar_url: "https://avatars.githubusercontent.com/in/413034?v=4",
  },
  {
    id: "amazon-q",
    name: "Amazon Q Developer",
    website: "https://aws.amazon.com/q/developer/",
    description:
      "AWS's generative AI assistant for software development, spanning code generation, debugging, optimization, and pull request review. Reviews PRs for bugs, security vulnerabilities, and best practices as part of the broader Amazon Q suite. Deeply integrated with the AWS ecosystem — understands IAM policies, CloudFormation templates, and AWS SDK patterns in addition to general code quality. Available in IDEs, the AWS Console, and as a GitHub App.",
    docs_url: "https://docs.aws.amazon.com/amazonq/latest/qdeveloper-ug/what-is.html",
    brand_color: "#232F3E",
    avatar_url: "https://avatars.githubusercontent.com/in/1220912?v=4",
  },
  {
    id: "codacy",
    name: "Codacy",
    website: "https://www.codacy.com",
    description:
      "Automated code quality and security platform that has been analyzing pull requests since 2012 — one of the longest-running code review automation tools. Combines static analysis, security scanning (SAST/DAST), and AI-powered review across 40+ languages. Differentiates through end-to-end DevSecOps coverage: from IDE integration through CI/CD to production monitoring, with centralized rules and policies that enforce standards consistently across an organization's entire codebase.",
    docs_url: "https://docs.codacy.com",
    brand_color: "#242C33",
    avatar_url: "https://avatars.githubusercontent.com/in/56611?v=4",
  },
  {
    id: "qlty",
    name: "Qlty",
    website: "https://qlty.sh",
    description:
      "Code quality platform spun out from Code Climate in 2024, led by Code Climate's original founder. Automates PR review with linting, formatting, duplication detection, security scanning, and complexity analysis — plus AI-generated autofix suggestions for 90% of issues. Runs analysis in the cloud with no CI setup required, providing consistent pass/fail quality gates on every pull request. Also offers code coverage tracking with diff-aware coverage gates.",
    docs_url: "https://qlty.sh/docs",
    brand_color: "#6366F1",
    avatar_url: "https://avatars.githubusercontent.com/in/890766?v=4",
  },
  {
    id: "codeclimate",
    name: "Code Climate",
    website: "https://codeclimate.com",
    description:
      "Pioneering automated code review platform founded in 2011 that helped define the category. Now focused on Software Engineering Intelligence (SEI) and Velocity — providing engineering leaders with metrics on delivery performance, cycle time, and team productivity. The original Code Climate Quality product was spun out as Qlty Software in 2024. Legacy code review bot activity reflects the pre-spinout era.",
    docs_url: "https://codeclimate.com/quality/docs",
    brand_color: "#1E293B",
    avatar_url: "https://avatars.githubusercontent.com/u/789641?v=4",
  },
  {
    id: "kilo",
    name: "Kilo Review",
    website: "https://kilocode.ai",
    description:
      "AI code review bot from Kilo Code, a fast-growing newcomer to the automated review space. Reviews pull requests for bugs, code quality issues, and improvement opportunities. Emerged in late 2025 with rapidly accelerating adoption — doubling its review volume and repo count month over month across public GitHub repositories.",
    docs_url: "https://kilocode.ai/docs",
    brand_color: "#000000",
    avatar_url: "https://avatars.githubusercontent.com/in/2193792?v=4",
  },
];

export const BOTS: BotDefinition[] = [
  // CodeRabbit
  {
    id: "coderabbit",
    product_id: "coderabbit",
    name: "CodeRabbit",
    github_login: "coderabbitai[bot]",
    github_id: 136622811,
    website: "https://coderabbit.ai",
    description:
      "AI-first code review agent. Auto-summarizes PRs, provides line-by-line feedback, and learns from your preferences over time.",
    brand_color: "#f97316",
    avatar_url: "https://avatars.githubusercontent.com/in/347564?v=4",
  },
  // GitHub Copilot
  {
    id: "copilot",
    product_id: "copilot",
    name: "GitHub Copilot",
    github_login: "copilot-pull-request-reviewer[bot]",
    additional_logins: ["Copilot"],
    github_id: 175728472,
    website: "https://github.com/features/copilot",
    description:
      "GitHub's native AI pair programmer. Provides inline code review suggestions directly in the PR UI.",
    brand_color: "#58a6ff",
    avatar_url: "https://avatars.githubusercontent.com/in/946600?v=4",
  },
  // CodeScene
  {
    id: "codescene",
    product_id: "codescene",
    name: "CodeScene",
    github_login: "codescene-delta-analysis[bot]",
    github_id: 61000666,
    website: "https://codescene.com",
    description: "Behavioral code analysis platform. Identifies code health, complexity hotspots, and technical debt.",
    brand_color: "#5f72ee",
    avatar_url: "https://avatars.githubusercontent.com/in/53921?v=4",
  },
  // Sourcery
  {
    id: "sourcery",
    product_id: "sourcery",
    name: "Sourcery",
    github_login: "sourcery-ai[bot]",
    github_id: 58596630,
    website: "https://sourcery.ai",
    description: "AI code reviewer focused on code quality, refactoring suggestions, and coding standards enforcement.",
    brand_color: "#65a30d",
    avatar_url: "https://avatars.githubusercontent.com/in/48477?v=4",
  },
  // Ellipsis
  {
    id: "ellipsis",
    product_id: "ellipsis",
    name: "Ellipsis",
    github_login: "ellipsis-dev[bot]",
    github_id: 65095814,
    website: "https://ellipsis.dev",
    description: "AI-powered code review and bug detection with configurable rules and custom prompts.",
    brand_color: "#06b6d4",
    avatar_url: "https://avatars.githubusercontent.com/in/64358?v=4",
  },
  // Qodo (3 bots)
  {
    id: "codium-pr-agent",
    product_id: "qodo",
    name: "Qodo (CodiumAI PR Agent)",
    github_login: "codium-pr-agent[bot]",
    github_id: 139473635,
    website: "https://qodo.ai",
    description:
      "Legacy CodiumAI PR agent, now part of Qodo. Generates tests and reviews PRs for code integrity.",
    brand_color: "#9d75f8",
    avatar_url: "https://avatars.githubusercontent.com/u/54746889?v=4",
  },
  {
    id: "qodo-merge",
    product_id: "qodo",
    name: "Qodo Merge",
    github_login: "qodo-merge[bot]",
    github_id: 185363710,
    website: "https://qodo.ai",
    description: "Qodo's AI-powered pull request merge assistant with test generation and code integrity checks.",
    brand_color: "#9d75f8",
    avatar_url: "https://avatars.githubusercontent.com/u/104026966?v=4",
  },
  {
    id: "qodo-merge-pro",
    product_id: "qodo",
    name: "Qodo Merge Pro",
    github_login: "qodo-merge-pro[bot]",
    github_id: 151058649,
    website: "https://qodo.ai",
    description:
      "Qodo's premium AI agent for code integrity — reviews, tests, and suggestions.",
    brand_color: "#9d75f8",
    avatar_url: "https://avatars.githubusercontent.com/in/484649?v=4",
  },
  {
    id: "qodo-ai",
    product_id: "qodo",
    name: "Qodo AI",
    github_login: "qodo-ai[bot]",
    github_id: 216754087,
    website: "https://qodo.ai",
    description:
      "Qodo's latest AI code review bot. Successor to qodo-merge and qodo-merge-pro.",
    brand_color: "#9d75f8",
    avatar_url: "https://avatars.githubusercontent.com/in/1420315?v=4",
  },
  // Greptile
  {
    id: "greptile",
    product_id: "greptile",
    name: "Greptile",
    github_login: "greptile-apps[bot]",
    github_id: 165735046,
    website: "https://greptile.com",
    description: "Codebase-aware AI code review. Indexes your entire repo for context-rich feedback.",
    brand_color: "#22c55e",
    avatar_url: "https://avatars.githubusercontent.com/in/867647?v=4",
  },
  // Sentry (3 bots)
  {
    id: "sentry",
    product_id: "sentry",
    name: "Sentry",
    github_login: "sentry[bot]",
    github_id: 39604003,
    website: "https://sentry.io",
    description:
      "Sentry's GitHub bot for issue linking, error tracking, and code review integration.",
    brand_color: "#9589c4",
    avatar_url: "https://avatars.githubusercontent.com/u/1396951?v=4",
  },
  {
    id: "seer-by-sentry",
    product_id: "sentry",
    name: "Seer by Sentry",
    github_login: "seer-by-sentry[bot]",
    github_id: 157164994,
    website: "https://sentry.io",
    description: "Sentry's AI agent for automated root cause analysis and error triage on PRs.",
    brand_color: "#9589c4",
    avatar_url: "https://avatars.githubusercontent.com/in/801464?v=4",
  },
  {
    id: "codecov-ai",
    product_id: "sentry",
    name: "Codecov AI",
    github_login: "codecov-ai[bot]",
    github_id: 156709835,
    website: "https://codecov.io",
    description:
      "Codecov's AI-powered code review for test coverage insights and regression detection.",
    brand_color: "#9589c4",
    avatar_url: "https://avatars.githubusercontent.com/in/797565?v=4",
  },
  // Baz
  {
    id: "baz",
    product_id: "baz",
    name: "Baz",
    github_login: "baz-reviewer[bot]",
    github_id: 174234987,
    website: "https://baz.co",
    description: "AI code reviewer focused on catching real bugs before merge with minimal noise.",
    brand_color: "#39FF14",
    avatar_url: "https://avatars.githubusercontent.com/in/933528?s=60&v=4",
  },
  // Graphite
  {
    id: "graphite",
    product_id: "graphite",
    name: "Graphite",
    github_login: "graphite-app[bot]",
    github_id: 96075541,
    website: "https://graphite.dev",
    description:
      "Developer productivity platform with stacked PRs, merge queues, and AI-assisted code review.",
    brand_color: "#5b8ef0",
    avatar_url: "https://avatars.githubusercontent.com/in/158384?v=4",
  },
  // CodeAnt
  {
    id: "codeant",
    product_id: "codeant",
    name: "CodeAnt",
    github_login: "codeant-ai[bot]",
    github_id: 151821869,
    website: "https://codeant.ai",
    description: "AI code review and static analysis. Catches bugs, anti-patterns, and security issues across 30+ languages.",
    brand_color: "#a855f7",
    avatar_url: "https://avatars.githubusercontent.com/in/646884?v=4",
  },
  // Windsurf
  {
    id: "windsurf",
    product_id: "windsurf",
    name: "Windsurf",
    github_login: "windsurf-bot[bot]",
    github_id: 189301087,
    website: "https://windsurf.com",
    description: "AI-powered development platform (formerly Codeium). IDE-first with deep codebase-aware PR reviews.",
    brand_color: "#0d9488",
    avatar_url: "https://avatars.githubusercontent.com/in/1066231?v=4",
  },
  // Cubic
  {
    id: "cubic",
    product_id: "cubic",
    name: "Cubic",
    github_login: "cubic-dev-ai[bot]",
    github_id: 191113872,
    website: "https://cubic.dev",
    description: "AI development assistant with automated code review and improvement suggestions.",
    brand_color: "#edc00c",
    avatar_url: "https://avatars.githubusercontent.com/in/1082092?v=4",
  },
  // Cursor Bugbot
  {
    id: "cursor",
    product_id: "cursor",
    name: "Cursor Bugbot",
    github_login: "cursor[bot]",
    github_id: 206951365,
    website: "https://cursor.com",
    description: "PR review feature from Cursor AI editor. Scans PRs for potential bugs and suggests fixes.",
    brand_color: "#e84e4e",
    avatar_url: "https://avatars.githubusercontent.com/in/1210556?v=4",
  },
  // Gemini Code Assist
  {
    id: "gemini",
    product_id: "gemini",
    name: "Gemini Code Assist",
    github_login: "gemini-code-assist[bot]",
    github_id: 176961590,
    website: "https://cloud.google.com/gemini/docs/codeassist/overview",
    description:
      "Google's AI code assistant. Reviews PRs with suggestions for improvements, security fixes, and best practices.",
    brand_color: "#ec4899",
    avatar_url: "https://avatars.githubusercontent.com/in/956858?v=4",
  },
  // Bito
  {
    id: "bito",
    product_id: "bito",
    name: "Bito",
    github_login: "bito-code-review[bot]",
    github_id: 188872107,
    website: "https://bito.ai",
    description: "AI code review powered by LLMs. Provides PR summaries, security analysis, and performance suggestions.",
    brand_color: "#94a3b8",
    avatar_url: "https://avatars.githubusercontent.com/in/1061978?v=4",
  },
  // Korbit
  {
    id: "korbit",
    product_id: "korbit",
    name: "Korbit",
    github_login: "korbit-ai[bot]",
    github_id: 131444098,
    website: "https://korbit.ai",
    description: "AI code review mentor. Provides educational feedback that helps developers learn best practices during review.",
    brand_color: "#b07838",
    avatar_url: "https://avatars.githubusercontent.com/in/322216?v=4",
  },
  // Claude
  {
    id: "claude",
    product_id: "claude",
    name: "Claude",
    github_login: "claude[bot]",
    github_id: 209825114,
    website: "https://claude.ai",
    description:
      "Anthropic's AI assistant with GitHub integration. Provides in-depth code review with strong reasoning capabilities.",
    brand_color: "#FF9F1C",
    avatar_url: "https://avatars.githubusercontent.com/in/1236702?v=4",
  },
  // OpenAI Codex
  {
    id: "openai-codex",
    product_id: "openai-codex",
    name: "OpenAI Codex",
    github_login: "chatgpt-codex-connector[bot]",
    github_id: 199175422,
    website: "https://openai.com/codex",
    description: "OpenAI's cloud-based coding agent. Runs in a sandbox to write code, fix bugs, and review PRs asynchronously.",
    brand_color: "#808080",
    avatar_url: "https://avatars.githubusercontent.com/in/1144995?s=60&v=4",
  },
  // Mesa
  {
    id: "mesa",
    product_id: "mesa",
    name: "Mesa",
    github_login: "mesa-dot-dev[bot]",
    github_id: 187716431,
    website: "https://mesa.dev",
    description: "AI-powered development workflow platform with integrated code review and CI/CD automation.",
    brand_color: "#c06a33",
    avatar_url: "https://avatars.githubusercontent.com/in/1050077?v=4",
  },
  // LinearB (2 bots)
  {
    id: "gitstream",
    product_id: "linearb",
    name: "gitStream",
    github_login: "gitstream-cm[bot]",
    github_id: 111687743,
    website: "https://linearb.io",
    description:
      "LinearB's gitStream workflow automation bot. Automates PR routing and continuous merge management.",
    brand_color: "#a37ce2",
    avatar_url: "https://avatars.githubusercontent.com/ml/13414?v=4",
  },
  {
    id: "linearb",
    product_id: "linearb",
    name: "LinearB",
    github_login: "linearb[bot]",
    github_id: 5890272,
    website: "https://linearb.io",
    description:
      "LinearB's GitHub bot for dev workflow insights, metrics, and AI-powered code review.",
    brand_color: "#a37ce2",
    avatar_url: "https://avatars.githubusercontent.com/in/1658443?v=4",
  },
  // Augment Code
  {
    id: "augment",
    product_id: "augment",
    name: "Augment Code",
    github_login: "augmentcode[bot]",
    github_id: 185243770,
    website: "https://augmentcode.com",
    description:
      "AI coding assistant with codebase-aware PR review. Designed for enterprise teams with private codebases.",
    brand_color: "#968CFF",
    avatar_url: "https://avatars.githubusercontent.com/in/1027498?v=4",
  },
  // Kodus
  {
    id: "kodus",
    product_id: "kodus",
    name: "Kody AI",
    github_login: "kody-ai[bot]",
    github_id: 148880201,
    website: "https://kodus.io",
    description:
      "Kodus AI code reviewer. Automatically analyzes PRs with actionable suggestions and bug detection.",
    brand_color: "#6C63FF",
    avatar_url: "https://avatars.githubusercontent.com/in/413034?v=4",
  },
  // Amazon Q Developer
  {
    id: "amazon-q",
    product_id: "amazon-q",
    name: "Amazon Q Developer",
    github_login: "amazon-q-developer[bot]",
    github_id: 208079219,
    website: "https://aws.amazon.com/q/developer/",
    description:
      "AWS's AI assistant for software development. Reviews PRs for bugs, security issues, and AWS best practices.",
    brand_color: "#232F3E",
    avatar_url: "https://avatars.githubusercontent.com/in/1220912?v=4",
  },
  // Codacy
  {
    id: "codacy",
    product_id: "codacy",
    name: "Codacy",
    github_login: "codacy-production[bot]",
    github_id: 61871480,
    website: "https://www.codacy.com",
    description:
      "Automated code quality and security platform. Analyzes PRs for bugs, vulnerabilities, and style across 40+ languages.",
    brand_color: "#242C33",
    avatar_url: "https://avatars.githubusercontent.com/in/56611?v=4",
  },
  // Qlty
  {
    id: "qlty",
    product_id: "qlty",
    name: "Qlty",
    github_login: "qltysh[bot]",
    github_id: 168846912,
    website: "https://qlty.sh",
    description:
      "Code quality platform (spun out from Code Climate). Automated linting, security, and AI autofix on every PR.",
    brand_color: "#6366F1",
    avatar_url: "https://avatars.githubusercontent.com/in/890766?v=4",
  },
  // Code Climate
  {
    id: "codeclimate",
    product_id: "codeclimate",
    name: "Code Climate",
    github_login: "codeclimate[bot]",
    github_id: 789641,
    website: "https://codeclimate.com",
    description:
      "Pioneering code review platform (est. 2011). Quality product spun out as Qlty in 2024; now focused on engineering intelligence.",
    brand_color: "#1E293B",
    avatar_url: "https://avatars.githubusercontent.com/u/789641?v=4",
  },
  // Kilo Review
  {
    id: "kilo",
    product_id: "kilo",
    name: "Kilo Review",
    github_login: "kiloconnect[bot]",
    github_id: 240665456,
    website: "https://kilocode.ai",
    description:
      "AI code review bot from Kilo Code. Fast-growing newcomer reviewing PRs for bugs and code quality.",
    brand_color: "#000000",
    avatar_url: "https://avatars.githubusercontent.com/in/2193792?v=4",
  },
];

/**
 * Bot logins we've seen via discover-bots but decided not to track.
 * Adding a login here suppresses the Sentry alert for it.
 */
export const IGNORED_BOT_LOGINS = new Set([
  "devloai[bot]",
  "codefactor-io[bot]",
]);

/** Map from GitHub login to bot definition (includes additional_logins) */
export const BOT_BY_LOGIN = new Map(
  BOTS.flatMap((b) => {
    const entries: [string, BotDefinition][] = [[b.github_login, b]];
    for (const login of b.additional_logins ?? []) {
      entries.push([login, b]);
    }
    return entries;
  }),
);

/** Map from id to bot definition */
export const BOT_BY_ID = new Map(BOTS.map((b) => [b.id, b]));

/** All GitHub logins as a set (for filtering events, includes additional_logins) */
export const BOT_LOGINS = new Set(
  BOTS.flatMap((b) => [b.github_login, ...(b.additional_logins ?? [])]),
);

/** Map from product id to product definition */
export const PRODUCT_BY_ID = new Map(PRODUCTS.map((p) => [p.id, p]));

/** Map from product id to its bots */
export const BOTS_BY_PRODUCT = new Map<string, BotDefinition[]>();
for (const bot of BOTS) {
  const list = BOTS_BY_PRODUCT.get(bot.product_id);
  if (list) {
    list.push(bot);
  } else {
    BOTS_BY_PRODUCT.set(bot.product_id, [bot]);
  }
}
