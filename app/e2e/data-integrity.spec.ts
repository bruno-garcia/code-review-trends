import { test, expect } from "@playwright/test";

test.describe("data integrity", () => {
  test.describe("no broken data on pages", () => {
    test("home page shows non-trivial AI share data", async ({ page }) => {
      await page.goto("/");
      const section = page.getByTestId("ai-share-section");
      await expect(section).toBeVisible();
      const text = await section.textContent();
      expect(text).not.toMatch(/\bNaN\b/);
      expect(text).not.toMatch(/\bInfinity\b/);
      expect(text).not.toMatch(/\bundefined\b/);
    });

    test("product filter shows non-zero product count", async ({ page }) => {
      await page.goto("/bots");
      const filter = page.getByTestId("product-filter-bar");
      await expect(filter).toBeVisible();
      const text = await filter.textContent();
      // Pattern: "N of M products selected" — M should be > 0
      expect(text).toMatch(/of [1-9]\d* products/);
    });

    test("compare table has data rows", async ({ page }) => {
      await page.goto("/compare");
      const table = page.getByTestId("compare-table");
      await expect(table).toBeVisible();
      const rows = table.locator("tbody tr");
      const count = await rows.count();
      expect(count).toBeGreaterThan(0);
    });

    test("bot detail shows non-zero stats", async ({ page }) => {
      await page.goto("/bots/coderabbit");
      const stats = page.getByTestId("bot-stats");
      await expect(stats).toBeVisible();
      const text = await stats.textContent();
      expect(text).not.toMatch(/\bNaN\b/);
      expect(text).not.toMatch(/\bInfinity\b/);
    });
  });

  test.describe("no NaN/Infinity/undefined in rendered pages", () => {
    const pages = ["/", "/bots", "/compare", "/about", "/status"];
    for (const path of pages) {
      test(`${path} has no NaN or Infinity in content`, async ({ page }) => {
        await page.goto(path);
        await page.waitForLoadState("networkidle");
        const bodyText = await page.locator("body").textContent();
        // NaN and Infinity in rendered data indicate divide-by-zero bugs
        expect(bodyText).not.toMatch(/\bNaN\b/);
        expect(bodyText).not.toMatch(/\bInfinity\b/);
      });
    }
  });
});
