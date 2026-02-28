/**
 * Validates that chart COLORS don't visually conflict with site theme colors
 * and that brand colors used as text are readable on dark backgrounds.
 *
 * Uses CIE76 color distance (Euclidean distance in Lab space) for chart
 * colors, and WCAG 2.1 contrast ratio for text readability.
 *
 * Run: npm test
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COLORS } from "./colors.js";
import { THEME_COLORS, TEXT_BACKGROUND_COLORS } from "./theme.js";
import { BRAND_COLORS } from "./brand-colors.js";
import { getThemedBrandColor } from "./theme-overrides.js";

// --- sRGB → CIELAB conversion ---

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

function srgbToLinear(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

function rgbToXyz(r: number, g: number, b: number): [number, number, number] {
  const lr = srgbToLinear(r);
  const lg = srgbToLinear(g);
  const lb = srgbToLinear(b);
  // D65 illuminant
  return [
    lr * 0.4124564 + lg * 0.3575761 + lb * 0.1804375,
    lr * 0.2126729 + lg * 0.7151522 + lb * 0.0721750,
    lr * 0.0193339 + lg * 0.1191920 + lb * 0.9503041,
  ];
}

function f(t: number): number {
  const delta = 6 / 29;
  return t > delta ** 3
    ? Math.cbrt(t)
    : t / (3 * delta * delta) + 4 / 29;
}

function xyzToLab(x: number, y: number, z: number): [number, number, number] {
  // D65 reference white
  const xn = 0.95047, yn = 1.0, zn = 1.08883;
  const L = 116 * f(y / yn) - 16;
  const a = 500 * (f(x / xn) - f(y / yn));
  const b = 200 * (f(y / yn) - f(z / zn));
  return [L, a, b];
}

function hexToLab(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  const [x, y, z] = rgbToXyz(r, g, b);
  return xyzToLab(x, y, z);
}

/** CIE76 color difference — ΔE < 20 is "close", < 10 is "very similar" */
function deltaE(hex1: string, hex2: string): number {
  const [L1, a1, b1] = hexToLab(hex1);
  const [L2, a2, b2] = hexToLab(hex2);
  return Math.sqrt((L1 - L2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
}

// --- WCAG 2.1 contrast ratio ---

function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  const [lr, lg, lb] = [r, g, b].map(srgbToLinear);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/** WCAG contrast ratio (1:1 to 21:1). AA requires ≥ 4.5 for normal text. */
function contrastRatio(hex1: string, hex2: string): number {
  const l1 = relativeLuminance(hex1);
  const l2 = relativeLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

// --- Tests ---

/**
 * Minimum perceptual distance a chart color must have from any theme color.
 * ΔE of 25 means colors are clearly distinguishable to most people.
 */
const MIN_DISTANCE = 25;

/**
 * Minimum WCAG contrast ratio for brand colors used as text on dark backgrounds.
 * WCAG AA requires 4.5:1 for normal text, 3:1 for large text.
 * We use 4.5 since product names appear at normal text sizes.
 */
const MIN_CONTRAST_RATIO = 4.5;

describe("Chart color conflicts", () => {
  for (const chartColor of COLORS) {
    for (const themeColor of THEME_COLORS) {
      it(`${chartColor} is distinguishable from theme ${themeColor}`, () => {
        const dist = deltaE(chartColor, themeColor);
        assert.ok(
          dist >= MIN_DISTANCE,
          `Chart color ${chartColor} is too close to theme color ${themeColor} ` +
          `(ΔE = ${dist.toFixed(1)}, minimum = ${MIN_DISTANCE}). ` +
          `Pick a more distinct color.`,
        );
      });
    }
  }

  it("chart colors are mutually distinguishable", () => {
    for (let i = 0; i < COLORS.length; i++) {
      for (let j = i + 1; j < COLORS.length; j++) {
        const dist = deltaE(COLORS[i], COLORS[j]);
        assert.ok(
          dist >= 15,
          `Chart colors ${COLORS[i]} and ${COLORS[j]} are too similar ` +
          `(ΔE = ${dist.toFixed(1)}, minimum = 15). ` +
          `Pick more distinct colors.`,
        );
      }
    }
  });
});

describe("Brand color text readability", () => {
  // Test brand colors against BOTH dark and light theme backgrounds.
  // Apply getThemedBrandColor() per theme so the test validates the full pipeline:
  // raw bots.ts color → theme override → displayed color → readable on screen.
  // This catches products missing a theme override for either theme.
  for (const { id, name, color } of BRAND_COLORS) {
    for (const { color: bgColor, theme } of TEXT_BACKGROUND_COLORS) {
      const displayed = getThemedBrandColor(id, color, theme);
      it(`${name} (${displayed}) is readable on ${theme} ${bgColor}`, () => {
        const ratio = contrastRatio(displayed, bgColor);
        assert.ok(
          ratio >= MIN_CONTRAST_RATIO,
          `${name}'s brand color ${displayed} (raw: ${color}, id: ${id}) has insufficient contrast against ` +
          `${theme} background ${bgColor} (ratio = ${ratio.toFixed(2)}, ` +
          `minimum = ${MIN_CONTRAST_RATIO}). ` +
          `Add a brand_color_${theme} override in theme-overrides.ts.`,
        );
      });
    }
  }

  it("brand colors are mutually distinguishable (dark)", () => {
    for (let i = 0; i < BRAND_COLORS.length; i++) {
      for (let j = i + 1; j < BRAND_COLORS.length; j++) {
        const ci = getThemedBrandColor(BRAND_COLORS[i].id, BRAND_COLORS[i].color, "dark");
        const cj = getThemedBrandColor(BRAND_COLORS[j].id, BRAND_COLORS[j].color, "dark");
        const dist = deltaE(ci, cj);
        assert.ok(
          dist >= 10,
          `Brand colors for ${BRAND_COLORS[i].name} (${ci}) and ` +
          `${BRAND_COLORS[j].name} (${cj}) are too similar on dark ` +
          `(ΔE = ${dist.toFixed(1)}, minimum = 10). ` +
          `Pick more distinct brand colors.`,
        );
      }
    }
  });

  it("brand colors are mutually distinguishable (light)", () => {
    for (let i = 0; i < BRAND_COLORS.length; i++) {
      for (let j = i + 1; j < BRAND_COLORS.length; j++) {
        const ci = getThemedBrandColor(BRAND_COLORS[i].id, BRAND_COLORS[i].color, "light");
        const cj = getThemedBrandColor(BRAND_COLORS[j].id, BRAND_COLORS[j].color, "light");
        const dist = deltaE(ci, cj);
        assert.ok(
          dist >= 10,
          `Brand colors for ${BRAND_COLORS[i].name} (${ci}) and ` +
          `${BRAND_COLORS[j].name} (${cj}) are too similar on light ` +
          `(ΔE = ${dist.toFixed(1)}, minimum = 10). ` +
          `Pick more distinct brand colors.`,
        );
      }
    }
  });
});
