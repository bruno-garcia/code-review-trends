/**
 * All product brand colors used as text in the UI.
 * Derived from the pipeline bot registry; this list is manually kept in sync for tests.
 *
 * Colors here are the RAW brand_color values from pipeline/src/bots.ts.
 * The color-check test applies getThemedBrandColor() before checking contrast,
 * so it validates the full pipeline: raw color → theme override → readable on screen.
 * This ensures products with dark brand colors have a working theme override.
 *
 * To update: change colors in pipeline/src/bots.ts, run sync-bots,
 * then manually update this list to match.
 */
export const BRAND_COLORS: { id: string; name: string; color: string }[] = [
  { id: "coderabbit", name: "CodeRabbit", color: "#f97316" },
  { id: "copilot", name: "GitHub Copilot", color: "#58a6ff" },
  { id: "codescene", name: "CodeScene", color: "#5f72ee" },
  { id: "sourcery", name: "Sourcery", color: "#65a30d" },
  { id: "ellipsis", name: "Ellipsis", color: "#06b6d4" },
  { id: "qodo", name: "Qodo", color: "#9d75f8" },
  { id: "greptile", name: "Greptile", color: "#22c55e" },
  { id: "sentry", name: "Sentry", color: "#9589c4" },
  { id: "baz", name: "Baz", color: "#39FF14" },
  { id: "graphite", name: "Graphite", color: "#5b8ef0" },
  { id: "codeant", name: "CodeAnt", color: "#a855f7" },
  { id: "windsurf", name: "Windsurf", color: "#0d9488" },
  { id: "cubic", name: "Cubic", color: "#edc00c" },
  { id: "cursor", name: "Cursor Bugbot", color: "#e84e4e" },
  { id: "gemini", name: "Gemini Code Assist", color: "#ec4899" },
  { id: "bito", name: "Bito", color: "#94a3b8" },
  { id: "korbit", name: "Korbit", color: "#b07838" },
  { id: "claude", name: "Claude", color: "#FF9F1C" },
  { id: "openai-codex", name: "OpenAI Codex", color: "#808080" },
  { id: "jazzberry", name: "Jazzberry", color: "#d44d7f" },
  { id: "mesa", name: "Mesa", color: "#c06a33" },
  { id: "linearb", name: "LinearB", color: "#a37ce2" },
  { id: "augment", name: "Augment Code", color: "#968CFF" },
  { id: "kodus", name: "Kodus", color: "#6C63FF" },
  { id: "amazon-q", name: "Amazon Q Developer", color: "#232F3E" },
  { id: "codacy", name: "Codacy", color: "#242C33" },

  { id: "codeclimate", name: "Code Climate", color: "#1E293B" },
  { id: "kilo", name: "Kilo Review", color: "#000000" },
];
