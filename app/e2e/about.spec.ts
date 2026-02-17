import { test, expect } from "@playwright/test";

test.describe("About page", () => {
  test("has methodology heading", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "Methodology" })).toBeVisible();
  });

  test("shows data collection progress section", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByTestId("data-collection-section")).toBeVisible();
    await expect(
      page.getByText("Data Collection Progress"),
    ).toBeVisible();
  });

  test("shows data collection stats or empty message", async ({ page }) => {
    await page.goto("/about");
    const section = page.getByTestId("data-collection-section");
    await expect(section).toBeVisible();
    // With no data, shows "No data collection stats available yet."
    // With data, shows progress bars. Either state is valid.
    const hasStats = await page.getByTestId("data-collection-stats").isVisible().catch(() => false);
    if (hasStats) {
      const stats = page.getByTestId("data-collection-stats");
      await expect(stats.getByText("BigQuery Backfill")).toBeVisible();
      await expect(stats.getByText("GitHub API Enrichment")).toBeVisible();
    } else {
      await expect(section.getByText("No data collection stats")).toBeVisible();
    }
  });

  test("shows methodology sections", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "Data Source" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /What Counts as a/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /AI Share/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Products vs. Bots" })).toBeVisible();
  });
});
