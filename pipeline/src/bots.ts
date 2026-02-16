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
  /** Brand color (hex) */
  brand_color: string;
  /** Avatar URL */
  avatar_url: string;
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
      "AI code review agent that provides contextual feedback on pull requests.",
    brand_color: "#f97316",
    avatar_url: "https://avatars.githubusercontent.com/in/347564?v=4",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    website: "https://github.com/features/copilot",
    description:
      "GitHub's AI pair programmer, also provides code review suggestions.",
    brand_color: "#e5e7eb",
    avatar_url: "https://avatars.githubusercontent.com/in/946600?v=4",
  },
  {
    id: "codescene",
    name: "CodeScene",
    website: "https://codescene.com",
    description: "Behavioral code analysis and AI code review.",
    brand_color: "#5f72ee",
    avatar_url: "https://avatars.githubusercontent.com/u/38929568?v=4",
  },
  {
    id: "sourcery",
    name: "Sourcery",
    website: "https://sourcery.ai",
    description: "AI code reviewer focused on code quality and refactoring.",
    brand_color: "#65a30d",
    avatar_url: "https://avatars.githubusercontent.com/in/48477?v=4",
  },
  {
    id: "ellipsis",
    name: "Ellipsis",
    website: "https://ellipsis.dev",
    description: "AI-powered code review and bug detection.",
    brand_color: "#06b6d4",
    avatar_url: "https://avatars.githubusercontent.com/in/64358?v=4",
  },
  {
    id: "qodo",
    name: "Qodo",
    website: "https://qodo.ai",
    description:
      "AI agent for code integrity — reviews, tests, and suggestions.",
    brand_color: "#9d75f8",
    avatar_url: "https://avatars.githubusercontent.com/in/484649?v=4",
  },
  {
    id: "greptile",
    name: "Greptile",
    website: "https://greptile.com",
    description: "AI code review that understands your entire codebase.",
    brand_color: "#22c55e",
    avatar_url: "https://avatars.githubusercontent.com/in/867647?v=4",
  },
  {
    id: "sentry",
    name: "Sentry",
    website: "https://sentry.io",
    description:
      "Application monitoring platform with AI-powered code review and error tracking.",
    brand_color: "#9589c4",
    avatar_url: "https://avatars.githubusercontent.com/u/1396951?v=4",
  },
  {
    id: "baz",
    name: "Baz",
    website: "https://baz.co",
    description: "AI code reviewer for fast, actionable pull request feedback.",
    brand_color: "#39FF14",
    avatar_url: "https://avatars.githubusercontent.com/in/933528?s=60&v=4",
  },
  {
    id: "graphite",
    name: "Graphite",
    website: "https://graphite.dev",
    description:
      "Developer productivity platform with AI-assisted code review.",
    brand_color: "#5b8ef0",
    avatar_url: "https://avatars.githubusercontent.com/in/158384?v=4",
  },
  {
    id: "codeant",
    name: "CodeAnt",
    website: "https://codeant.ai",
    description: "AI code review tool that catches bugs and anti-patterns.",
    brand_color: "#a855f7",
    avatar_url: "https://avatars.githubusercontent.com/in/646884?v=4",
  },
  {
    id: "windsurf",
    name: "Windsurf",
    website: "https://windsurf.com",
    description: "AI-powered code review with deep codebase understanding.",
    brand_color: "#0d9488",
    avatar_url: "https://avatars.githubusercontent.com/in/1066231?v=4",
  },
  {
    id: "cubic",
    name: "Cubic",
    website: "https://cubic.dev",
    description: "AI development assistant with automated code review.",
    brand_color: "#edc00c",
    avatar_url: "https://avatars.githubusercontent.com/in/1082092?v=4",
  },
  {
    id: "cursor",
    name: "Cursor Bugbot",
    website: "https://cursor.com",
    description: "AI code editor with automated bug detection on pull requests.",
    brand_color: "#e84e4e",
    avatar_url: "https://avatars.githubusercontent.com/in/1210556?v=4",
  },
  {
    id: "gemini",
    name: "Gemini Code Assist",
    website: "https://cloud.google.com/gemini/docs/codeassist/overview",
    description:
      "Google's AI code assistant with automated pull request reviews.",
    brand_color: "#ec4899",
    avatar_url: "https://avatars.githubusercontent.com/in/956858?v=4",
  },
  {
    id: "bito",
    name: "Bito",
    website: "https://bito.ai",
    description: "AI code review assistant powered by large language models.",
    brand_color: "#94a3b8",
    avatar_url: "https://avatars.githubusercontent.com/in/1061978?v=4",
  },
  {
    id: "korbit",
    name: "Korbit",
    website: "https://korbit.ai",
    description: "AI code review mentor that helps teams improve code quality.",
    brand_color: "#b07838",
    avatar_url: "https://avatars.githubusercontent.com/in/322216?v=4",
  },
  {
    id: "claude",
    name: "Claude",
    website: "https://claude.ai",
    description:
      "Anthropic's AI assistant with code review capabilities on GitHub.",
    brand_color: "#FF9F1C",
    avatar_url: "https://avatars.githubusercontent.com/in/1236702?v=4",
  },
  {
    id: "openai-codex",
    name: "OpenAI Codex",
    website: "https://openai.com/codex",
    description: "OpenAI's coding agent with automated pull request reviews.",
    brand_color: "#808080",
    avatar_url: "https://avatars.githubusercontent.com/in/1144995?s=60&v=4",
  },
  {
    id: "jazzberry",
    name: "Jazzberry",
    website: "https://jazzberry.ai",
    description: "AI code review tool for automated feedback on pull requests.",
    brand_color: "#d44d7f",
    avatar_url: "https://avatars.githubusercontent.com/in/1231820?v=4",
  },
  {
    id: "mesa",
    name: "Mesa",
    website: "https://mesa.dev",
    description: "AI-powered development workflow with code review automation.",
    brand_color: "#c06a33",
    avatar_url: "https://avatars.githubusercontent.com/in/1050077?v=4",
  },
  {
    id: "linearb",
    name: "LinearB",
    website: "https://linearb.io",
    description:
      "Dev workflow platform with gitStream automation and AI-powered code review.",
    brand_color: "#a37ce2",
    avatar_url: "https://avatars.githubusercontent.com/in/1658443?v=4",
  },
  {
    id: "augment",
    name: "Augment Code",
    website: "https://augmentcode.com",
    description:
      "AI coding assistant with automated code review on pull requests.",
    brand_color: "#968CFF",
    avatar_url: "https://avatars.githubusercontent.com/in/1027498?v=4",
  },
  {
    id: "kodus",
    name: "Kodus AI",
    website: "https://kodus.ai",
    description:
      "AI code review assistant for automated pull request feedback.",
    brand_color: "#6366f1",
    avatar_url: "https://avatars.githubusercontent.com/u/148880201?v=4",
  },
  {
    id: "corgea",
    name: "Corgea",
    website: "https://corgea.com",
    description:
      "AI-powered security code review that finds and fixes vulnerabilities.",
    brand_color: "#10b981",
    avatar_url: "https://avatars.githubusercontent.com/in/673913?v=4",
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
      "AI code review agent that provides contextual feedback on pull requests.",
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
      "GitHub's AI pair programmer, also provides code review suggestions.",
    brand_color: "#e5e7eb",
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
    description: "Behavioral code analysis and AI code review.",
    brand_color: "#5f72ee",
    avatar_url: "https://avatars.githubusercontent.com/u/38929568?v=4",
  },
  // Sourcery
  {
    id: "sourcery",
    product_id: "sourcery",
    name: "Sourcery",
    github_login: "sourcery-ai[bot]",
    github_id: 58596630,
    website: "https://sourcery.ai",
    description: "AI code reviewer focused on code quality and refactoring.",
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
    description: "AI-powered code review and bug detection.",
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
      "Legacy CodiumAI PR agent, now part of Qodo's code review suite.",
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
    description: "Qodo's AI-powered pull request merge assistant.",
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
      "AI agent for code integrity — reviews, tests, and suggestions.",
    brand_color: "#9d75f8",
    avatar_url: "https://avatars.githubusercontent.com/in/484649?v=4",
  },
  // Greptile
  {
    id: "greptile",
    product_id: "greptile",
    name: "Greptile",
    github_login: "greptile-apps[bot]",
    github_id: 165735046,
    website: "https://greptile.com",
    description: "AI code review that understands your entire codebase.",
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
      "Sentry's GitHub bot for issue linking, code review, and error tracking.",
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
    description: "Sentry's AI agent for automated root cause analysis.",
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
      "Codecov's AI-powered code review for test coverage insights.",
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
    description: "AI code reviewer for fast, actionable pull request feedback.",
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
      "Developer productivity platform with AI-assisted code review.",
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
    description: "AI code review tool that catches bugs and anti-patterns.",
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
    description: "AI-powered code review with deep codebase understanding.",
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
    description: "AI development assistant with automated code review.",
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
    description: "AI code editor with automated bug detection on pull requests.",
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
      "Google's AI code assistant with automated pull request reviews.",
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
    description: "AI code review assistant powered by large language models.",
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
    description: "AI code review mentor that helps teams improve code quality.",
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
      "Anthropic's AI assistant with code review capabilities on GitHub.",
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
    description: "OpenAI's coding agent with automated pull request reviews.",
    brand_color: "#808080",
    avatar_url: "https://avatars.githubusercontent.com/in/1144995?s=60&v=4",
  },
  // Jazzberry
  {
    id: "jazzberry",
    product_id: "jazzberry",
    name: "Jazzberry",
    github_login: "jazzberry-ai[bot]",
    github_id: 209297164,
    website: "https://jazzberry.ai",
    description: "AI code review tool for automated feedback on pull requests.",
    brand_color: "#d44d7f",
    avatar_url: "https://avatars.githubusercontent.com/in/1231820?v=4",
  },
  // Mesa
  {
    id: "mesa",
    product_id: "mesa",
    name: "Mesa",
    github_login: "mesa-dot-dev[bot]",
    github_id: 187716431,
    website: "https://mesa.dev",
    description: "AI-powered development workflow with code review automation.",
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
      "LinearB's workflow automation bot for continuous merge management.",
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
      "LinearB's GitHub bot for dev workflow insights and code review.",
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
      "AI coding assistant with automated code review on pull requests.",
    brand_color: "#968CFF",
    avatar_url: "https://avatars.githubusercontent.com/in/1027498?v=4",
  },
  // Kodus AI
  {
    id: "kodus",
    product_id: "kodus",
    name: "Kodus AI",
    github_login: "kodus-ai[bot]",
    github_id: 148880201,
    website: "https://kodus.ai",
    description:
      "AI code review assistant for automated pull request feedback.",
    brand_color: "#6366f1",
    avatar_url: "https://avatars.githubusercontent.com/u/148880201?v=4",
  },
  // Corgea
  {
    id: "corgea",
    product_id: "corgea",
    name: "Corgea",
    github_login: "corgea[bot]",
    github_id: 152934588,
    website: "https://corgea.com",
    description:
      "AI-powered security code review that finds and fixes vulnerabilities.",
    brand_color: "#10b981",
    avatar_url: "https://avatars.githubusercontent.com/in/673913?v=4",
  },
];

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
