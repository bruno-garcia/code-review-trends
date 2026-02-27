import { describe, test, expect } from "vitest";
import {
  getThemedBrandColor,
  getBrandAlpha,
  shouldInvertAvatar,
  getAvatarStyle,
  INVERT_AVATAR_STYLE,
} from "./theme-overrides";

describe("getThemedBrandColor", () => {
  test("returns default color for unknown product", () => {
    expect(getThemedBrandColor("unknown-product", "#ff0000", "dark")).toBe("#ff0000");
    expect(getThemedBrandColor("unknown-product", "#ff0000", "light")).toBe("#ff0000");
  });

  test("copilot: overrides light, uses default for dark", () => {
    expect(getThemedBrandColor("copilot", "#e5e7eb", "light")).toBe("#58a6ff");
    expect(getThemedBrandColor("copilot", "#e5e7eb", "dark")).toBe("#e5e7eb");
  });

  test("openai-codex: overrides both themes", () => {
    expect(getThemedBrandColor("openai-codex", "#808080", "dark")).toBe("#b0b0b0");
    expect(getThemedBrandColor("openai-codex", "#808080", "light")).toBe("#343434");
  });

  test("sentry: overrides both themes", () => {
    expect(getThemedBrandColor("sentry", "#9589c4", "dark")).toBe("#b8a9e0");
    expect(getThemedBrandColor("sentry", "#9589c4", "light")).toBe("#6c5d99");
  });

  test("bito: overrides light only (dark passes WCAG with raw color)", () => {
    expect(getThemedBrandColor("bito", "#94a3b8", "dark")).toBe("#94a3b8");
    expect(getThemedBrandColor("bito", "#94a3b8", "light")).toBe("#546e7a");
  });

  test("augment: overrides light only", () => {
    expect(getThemedBrandColor("augment", "#968CFF", "light")).toBe("#6c5ce7");
    expect(getThemedBrandColor("augment", "#968CFF", "dark")).toBe("#968CFF");
  });

  test("linearb: overrides light only", () => {
    expect(getThemedBrandColor("linearb", "#a37ce2", "light")).toBe("#7c4dbd");
    expect(getThemedBrandColor("linearb", "#a37ce2", "dark")).toBe("#a37ce2");
  });

  test("cubic: overrides light only", () => {
    expect(getThemedBrandColor("cubic", "#edc00c", "light")).toBe("#b8960a");
    expect(getThemedBrandColor("cubic", "#edc00c", "dark")).toBe("#edc00c");
  });

  test("baz: overrides light only", () => {
    expect(getThemedBrandColor("baz", "#39FF14", "light")).toBe("#1a8f0a");
    expect(getThemedBrandColor("baz", "#39FF14", "dark")).toBe("#39FF14");
  });
});

describe("getBrandAlpha", () => {
  test("dark theme returns lower opacity", () => {
    const alpha = getBrandAlpha("dark");
    expect(alpha.border).toBe("60");
    expect(alpha.bg).toBe("15");
  });

  test("light theme returns higher opacity", () => {
    const alpha = getBrandAlpha("light");
    expect(alpha.border).toBe("90");
    expect(alpha.bg).toBe("20");
  });
});

describe("shouldInvertAvatar", () => {
  test("returns false for unknown product", () => {
    expect(shouldInvertAvatar("unknown", "dark")).toBe(false);
    expect(shouldInvertAvatar("unknown", "light")).toBe(false);
  });

  test("openai-codex: inverts on dark, not on light", () => {
    expect(shouldInvertAvatar("openai-codex", "dark")).toBe(true);
    expect(shouldInvertAvatar("openai-codex", "light")).toBe(false);
  });

  test("copilot: does not invert on either theme", () => {
    expect(shouldInvertAvatar("copilot", "dark")).toBe(false);
    expect(shouldInvertAvatar("copilot", "light")).toBe(false);
  });

  test("sentry: does not invert on either theme", () => {
    expect(shouldInvertAvatar("sentry", "dark")).toBe(false);
    expect(shouldInvertAvatar("sentry", "light")).toBe(false);
  });
});

describe("getAvatarStyle", () => {
  test("returns invert style for openai-codex on dark", () => {
    expect(getAvatarStyle("openai-codex", "dark")).toEqual(INVERT_AVATAR_STYLE);
  });

  test("returns undefined for openai-codex on light", () => {
    expect(getAvatarStyle("openai-codex", "light")).toBeUndefined();
  });

  test("returns undefined for unknown product", () => {
    expect(getAvatarStyle("unknown", "dark")).toBeUndefined();
    expect(getAvatarStyle("unknown", "light")).toBeUndefined();
  });

  test("returns undefined for copilot on both themes", () => {
    expect(getAvatarStyle("copilot", "dark")).toBeUndefined();
    expect(getAvatarStyle("copilot", "light")).toBeUndefined();
  });
});

describe("INVERT_AVATAR_STYLE", () => {
  test("has correct CSS filter property", () => {
    expect(INVERT_AVATAR_STYLE).toEqual({ filter: "invert(1) hue-rotate(180deg)" });
  });
});
