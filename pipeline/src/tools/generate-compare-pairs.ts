/**
 * Generate static compare-pair metadata for all C(n,2) product combinations.
 *
 * Usage:
 *   npm run pipeline -- generate-compare-pairs
 *
 * Outputs: app/src/lib/generated/compare-pairs.ts
 */

import { writeFileSync, mkdirSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { PRODUCTS } from "../bots.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "../../../app/src/lib/generated/compare-pairs.ts");

/** Slugify a product name: lowercase, spaces → hyphens, strip non-alphanumeric. */
function slugify(name: string): string {
  return name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

/**
 * Short focus blurb for each product, used to build contrastive pair descriptions.
 * Keyed by product ID. Should be a concise phrase (not a sentence) describing
 * what makes this product's approach to code review distinctive.
 */
const PRODUCT_FOCUS: Record<string, string> = {
  coderabbit: "an AI-first review agent that learns from team preferences and provides line-by-line feedback",
  copilot: "GitHub's native AI assistant spanning code completion, chat, and PR review with zero third-party setup",
  codescene: "a behavioral analysis platform that uses git history to identify risky changes in high-churn hotspots",
  sourcery: "a refactoring-focused reviewer that scores code quality and suggests cleaner patterns",
  ellipsis: "a configurable review platform where teams define their own rules and custom prompts",
  qodo: "a code integrity platform that combines PR review with automated test generation",
  greptile: "a codebase-aware reviewer that indexes your entire repo for architecture-level feedback",
  sentry: "an error tracking platform whose AI (Seer) reviews PRs using production errors, traces, and logs",
  baz: "a high-signal reviewer focused on catching real bugs with minimal false positives",
  graphite: "a developer productivity platform with stacked PRs, merge queues, and AI-assisted review",
  codeant: "a static analysis tool covering 30+ languages with auto-fix capabilities",
  windsurf: "an IDE-first AI platform (formerly Codeium) that extends code completion into PR review",
  cubic: "an AI assistant that combines code review with developer education and explanations",
  cursor: "a PR review extension from the Cursor AI editor, bringing IDE-level bug detection to GitHub",
  gemini: "Google Cloud's enterprise AI assistant with GCP integration and custom policy support",
  bito: "an LLM-powered reviewer with security analysis and customizable compliance checklists",
  korbit: "an educational code review mentor focused on teaching best practices (retired)",
  claude: "Anthropic's AI with deep reasoning capabilities for nuanced, multi-file code analysis",
  "openai-codex": "OpenAI's cloud-based coding agent that reviews PRs asynchronously in a sandboxed environment",
  mesa: "a workflow platform integrating PR review with CI/CD pipeline context and deployment status",
  linearb: "a workflow intelligence platform that optimizes PR routing, auto-approval, and team metrics",
  augment: "an enterprise AI assistant with on-premises deployment and compliance-focused review",
  kodus: "an open-source AI reviewer with self-hosted deployment and full review transparency",
};

/**
 * Build a contrastive description for a pair of products.
 * Uses each product's focus blurb to highlight what makes them different.
 */
function buildDescription(nameA: string, idA: string, nameB: string, idB: string): string {
  const focusA = PRODUCT_FOCUS[idA];
  const focusB = PRODUCT_FOCUS[idB];

  if (!focusA || !focusB) {
    // Fallback for any product missing a focus entry
    return `Compare ${nameA} and ${nameB} AI code review tools side-by-side — review volume, growth trends, top repos, and community sentiment.`;
  }

  return `${nameA} is ${focusA}. ${nameB} is ${focusB}. Compare their review volume, growth, repos, and community reactions side-by-side.`;
}

export async function generateComparePairs(): Promise<void> {
  // Verify all products have a focus entry
  const missing = PRODUCTS.filter((p) => !PRODUCT_FOCUS[p.id]);
  if (missing.length > 0) {
    throw new Error(
      `Missing PRODUCT_FOCUS entries for: ${missing.map((p) => p.id).join(", ")}. ` +
      `Add entries to generate-compare-pairs.ts.`,
    );
  }

  // Build slug for each product from its display name (not ID).
  // e.g. "Cursor Bugbot" → "cursor-bugbot", "GitHub Copilot" → "github-copilot"
  const withSlugs = PRODUCTS.map((p) => ({ ...p, nameSlug: slugify(p.name) }));

  // Detect slug collisions (would break URL uniqueness)
  const slugSet = new Set<string>();
  for (const p of withSlugs) {
    if (slugSet.has(p.nameSlug)) {
      throw new Error(`Slug collision: "${p.nameSlug}" from product "${p.name}" (${p.id})`);
    }
    slugSet.add(p.nameSlug);
  }

  // Sort by name-slug for deterministic output
  const sorted = [...withSlugs].sort((a, b) => a.nameSlug.localeCompare(b.nameSlug));

  // Generate all C(n,2) pairs with slugA < slugB (alphabetically)
  const pairs: { idA: string; idB: string; nameA: string; nameB: string; slug: string; title: string; description: string }[] = [];

  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i];
      const b = sorted[j];
      const slug = `${a.nameSlug}-vs-${b.nameSlug}`;
      pairs.push({
        idA: a.id,
        idB: b.id,
        nameA: a.name,
        nameB: b.name,
        slug,
        title: `${a.name} vs ${b.name} — AI Code Review Comparison`,
        description: buildDescription(a.name, a.id, b.name, b.id),
      });
    }
  }

  // Generate TypeScript source
  const content = `// Auto-generated by: npm run pipeline -- generate-compare-pairs
// Do not edit manually. Regenerate with the command above.

export type ComparePair = {
  idA: string;
  idB: string;
  nameA: string;
  nameB: string;
  slug: string;
  title: string;
  description: string;
};

export const COMPARE_PAIRS: ComparePair[] = ${JSON.stringify(pairs, null, 2)};

export const PAIR_BY_SLUG = new Map<string, ComparePair>(
  COMPARE_PAIRS.map((p) => [p.slug, p]),
);

/** Lookup by sorted product IDs: "idA:idB" → ComparePair (IDs alphabetically sorted). */
export const PAIR_BY_IDS = new Map<string, ComparePair>(
  COMPARE_PAIRS.map((p) => {
    const key = p.idA < p.idB ? \`\${p.idA}:\${p.idB}\` : \`\${p.idB}:\${p.idA}\`;
    return [key, p];
  }),
);
`;

  // Ensure output directory exists
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, content, "utf-8");

  console.log(`✓ Generated ${pairs.length} compare pairs (${sorted.length} products)`);
  console.log(`  Output: ${OUTPUT_PATH}`);
}
