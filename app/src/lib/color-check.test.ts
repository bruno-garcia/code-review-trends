/**
 * Validates that chart COLORS don't visually conflict with site theme colors.
 *
 * Uses CIE76 color distance (Euclidean distance in Lab space) which
 * approximates human perception better than raw RGB distance.
 *
 * Run: npx tsx src/lib/color-check.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { COLORS } from "../components/charts.js";
import { THEME_COLORS } from "./theme.js";

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

// --- Tests ---

/**
 * Minimum perceptual distance a chart color must have from any theme color.
 * ΔE of 25 means colors are clearly distinguishable to most people.
 */
const MIN_DISTANCE = 25;

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
