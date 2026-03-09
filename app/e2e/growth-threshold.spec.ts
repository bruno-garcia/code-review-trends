import { test, expect } from "@playwright/test";

test.describe("Growth threshold and 'New' badge", () => {
  test.describe("Homepage leaderboard", () => {
    test("no product shows growth above 999% or below -999%", async ({ page }) => {
      await page.goto("/");
      const section = page.getByTestId("top-products-section");
      await expect(section).toBeVisible();

      // Gather all growth text values (e.g., "+33.2%", "New")
      const growthTexts = await section.locator(".text-xs.tabular-nums").allTextContents();
      for (const text of growthTexts) {
        const match = text.match(/([+-]?[\d.]+)%/);
        if (match) {
          const value = parseFloat(match[1]);
          expect(value).toBeLessThanOrEqual(999);
          expect(value).toBeGreaterThanOrEqual(-999);
        }
      }
    });

    test("no NaN, Infinity, or undefined in leaderboard", async ({ page }) => {
      await page.goto("/");
      const section = page.getByTestId("top-products-section");
      await expect(section).toBeVisible();
      const text = await section.textContent();
      expect(text).not.toMatch(/\bNaN\b/);
      expect(text).not.toMatch(/\bInfinity\b/);
      expect(text).not.toMatch(/\bundefined\b/);
    });
  });

  test.describe("Product detail page — new product", () => {
    test("Kodus shows 'New' badge", async ({ page }) => {
      await page.goto("/products/kodus");
      await expect(page.getByTestId("bot-name")).toHaveText("Kodus");
      const badge = page.getByTestId("new-product-badge");
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText("New");
    });

    test("Kodus growth stat card shows 'New' instead of percentage", async ({ page }) => {
      await page.goto("/products/kodus");
      await expect(page.getByTestId("bot-stats")).toBeVisible();
      const stats = page.getByTestId("bot-stats");
      // The growth stat card should show "New" text
      await expect(stats.getByText("Growth (12w)")).toBeVisible();
      const growthCard = stats.locator(":has(> :text('Growth (12w)'))");
      await expect(growthCard.getByText("New")).toBeVisible();
    });

    test("Kodus page has no NaN or Infinity", async ({ page }) => {
      await page.goto("/products/kodus");
      await expect(page.getByTestId("bot-stats")).toBeVisible();
      const text = await page.locator("main").textContent();
      expect(text).not.toMatch(/\bNaN\b/);
      expect(text).not.toMatch(/\bInfinity\b/);
      expect(text).not.toMatch(/\bundefined\b/);
    });
  });

  test.describe("Product detail page — established product", () => {
    // These tests require CodeRabbit to have enough review data (>=100 prev_12w)
    // to qualify as "established". In CI with a fresh DB (only smoke test data),
    // CodeRabbit has no review activity and appears as "New". Skip gracefully.
    test("CodeRabbit does NOT show 'New' badge", async ({ page }) => {
      await page.goto("/products/coderabbit");
      await expect(page.getByTestId("bot-name")).toHaveText("CodeRabbit");
      const badge = page.getByTestId("new-product-badge");
      const isNew = await badge.isVisible().catch(() => false);
      test.skip(isNew, "CodeRabbit appears as New in CI (insufficient data)");
      await expect(badge).not.toBeVisible();
    });

    test("CodeRabbit shows a numeric growth percentage", async ({ page }) => {
      await page.goto("/products/coderabbit");
      await expect(page.getByTestId("bot-stats")).toBeVisible();
      const stats = page.getByTestId("bot-stats");
      await expect(stats.getByText("Growth (12w)")).toBeVisible();
      const growthCard = stats.locator(":has(> :text('Growth (12w)'))");
      const growthText = await growthCard.textContent();
      // In CI with minimal data, CodeRabbit may show "New" instead of a percentage
      test.skip(growthText?.includes("New") ?? false, "CodeRabbit appears as New in CI (insufficient data)");
      expect(growthText).toMatch(/%/);
      expect(growthText).not.toContain("New");
    });
  });

  test.describe("Products listing page", () => {
    test("default top-10 view has no extreme growth values", async ({ page }) => {
      await page.goto("/products");
      const grid = page.getByTestId("bots-grid");
      await expect(grid).toBeVisible();
      const text = await grid.textContent();
      // No growth values over 999%
      const growthMatches = text?.matchAll(/([+-]?\d{4,})\.?\d*%/g) ?? [];
      for (const match of growthMatches) {
        const val = parseFloat(match[1]);
        expect(val).toBeLessThanOrEqual(999);
        expect(val).toBeGreaterThanOrEqual(-999);
      }
    });

    test("no NaN, Infinity, or undefined on products listing", async ({ page }) => {
      await page.goto("/products");
      const grid = page.getByTestId("bots-grid");
      await expect(grid).toBeVisible();
      const text = await grid.textContent();
      expect(text).not.toMatch(/\bNaN\b/);
      expect(text).not.toMatch(/\bInfinity\b/);
      expect(text).not.toMatch(/\bundefined\b/);
    });
  });

  test.describe("Compare table", () => {
    test.setTimeout(30_000);

    test("no extreme growth values in compare table", async ({ page }) => {
      await page.goto("/compare");
      const table = page.getByTestId("compare-table");
      await expect(table).toBeVisible({ timeout: 15_000 });
      // Check specifically the growth column cells — they start with + or -
      // and end with %, or show "New". The regex matches "+1234.5%" patterns.
      const rows = table.locator("tbody tr");
      const rowCount = await rows.count();
      for (let i = 0; i < rowCount; i++) {
        // Growth is the first td (after the product name th/td)
        const firstTd = rows.nth(i).locator("td").first();
        const cellText = await firstTd.textContent();
        if (!cellText || cellText === "New") continue;
        const match = cellText.match(/([+-]?\d+\.?\d*)%/);
        if (match) {
          const val = parseFloat(match[1]);
          expect(val).toBeLessThanOrEqual(999);
          expect(val).toBeGreaterThanOrEqual(-999);
        }
      }
    });
  });

  test.describe("About page methodology", () => {
    test("documents the growth threshold", async ({ page }) => {
      await page.goto("/about#rankings");
      const main = page.locator("main");
      await expect(main.getByText("Minimum Baseline")).toBeVisible();
      // Mentions 100 reviews threshold
      await expect(main.getByText("100 reviews")).toBeVisible();
      // Mentions the New badge
      await expect(main.getByText("New", { exact: true }).first()).toBeVisible();
      // Mentions the cap
      await expect(main.getByText("±999%")).toBeVisible();
    });

    test("has anchor link for growth-threshold", async ({ page }) => {
      await page.goto("/about#growth-threshold");
      await expect(page.locator("#growth-threshold")).toBeVisible();
    });
  });
});
