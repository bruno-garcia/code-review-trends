/**
 * Canonical registry of AI code review bots we track.
 *
 * Source of truth for bot identifiers. Used by the pipeline to filter
 * GH Archive events and by the app to display bot profiles.
 *
 * A bot can have multiple GitHub logins (e.g. after a rename). Activity
 * from all logins is aggregated under the same bot id.
 *
 * To add a new bot:
 * 1. Add an entry here
 * 2. Run `npm run cli -- sync-bots` to push it to ClickHouse
 * 3. The app picks it up automatically
 */

export type BotDefinition = {
  /** Stable identifier used as primary key across all tables */
  id: string;
  /** Display name */
  name: string;
  /** GitHub logins in the format `name[bot]` — used to filter GH Archive events.
   *  A bot can have multiple logins (e.g. after a rename). Activity from all
   *  logins is aggregated under the same bot id. */
  github_logins: string[];
  /** Website URL */
  website: string;
  /** Short description for the profile page */
  description: string;
};

export const BOTS: BotDefinition[] = [
  {
    id: "coderabbit",
    name: "CodeRabbit",
    github_logins: ["coderabbitai[bot]"],
    website: "https://coderabbit.ai",
    description:
      "AI code review agent that provides contextual feedback on pull requests.",
  },
  {
    id: "copilot",
    name: "GitHub Copilot",
    github_logins: ["copilot-pull-request-reviewer[bot]"],
    website: "https://github.com/features/copilot",
    description:
      "GitHub's AI pair programmer, also provides code review suggestions.",
  },
  {
    id: "codescene",
    name: "CodeScene",
    github_logins: ["codescene-delta-analysis[bot]"],
    website: "https://codescene.com",
    description: "Behavioral code analysis and AI code review.",
  },
  {
    id: "sourcery",
    name: "Sourcery",
    github_logins: ["sourcery-ai[bot]"],
    website: "https://sourcery.ai",
    description:
      "AI code reviewer focused on code quality and refactoring.",
  },
  {
    id: "ellipsis",
    name: "Ellipsis",
    github_logins: ["ellipsis-dev[bot]"],
    website: "https://ellipsis.dev",
    description: "AI-powered code review and bug detection.",
  },
  {
    id: "qodo",
    name: "Qodo (formerly CodiumAI)",
    github_logins: ["qodo-merge-pro[bot]"],
    website: "https://www.qodo.ai",
    description:
      "AI agent for code integrity — reviews, tests, and suggestions.",
  },
  {
    id: "greptile",
    name: "Greptile",
    github_logins: ["greptile-apps[bot]"],
    website: "https://greptile.com",
    description:
      "AI code review that understands your entire codebase.",
  },
];

/** Map from GitHub login to bot definition for fast lookups.
 *  Multiple logins can map to the same bot. */
export const BOT_BY_LOGIN = new Map(
  BOTS.flatMap((b) => b.github_logins.map((login) => [login, b] as const)),
);

/** Map from id to bot definition */
export const BOT_BY_ID = new Map(BOTS.map((b) => [b.id, b]));

/** All GitHub logins as a set (for filtering events) */
export const BOT_LOGINS = new Set(
  BOTS.flatMap((b) => b.github_logins),
);
