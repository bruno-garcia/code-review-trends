import { test, expect } from "@playwright/test";

test.describe("Status page", () => {
  test("has status heading", async ({ page }) => {
    await page.goto("/status");
    await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
  });

  test("shows data collection section", async ({ page }) => {
    await page.goto("/status");
    await expect(page.getByTestId("data-collection-section")).toBeVisible();
  });

  test("shows stats or empty message", async ({ page }) => {
    await page.goto("/status");
    const section = page.getByTestId("data-collection-section");
    await expect(section).toBeVisible();
    // With no data, shows empty message. With data, shows progress bars.
    const hasStats = await page.getByTestId("data-collection-stats").isVisible().catch(() => false);
    if (hasStats) {
      const stats = page.getByTestId("data-collection-stats");
      await expect(stats.getByText("BigQuery Import")).toBeVisible();
      await expect(stats.getByText("GitHub API Enrichment")).toBeVisible();
    } else {
      await expect(page.getByTestId("no-data-message")).toBeVisible();
    }
  });

  test("is reachable from nav", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Status" }).click();
    await expect(page).toHaveURL("/status");
    await expect(page.getByRole("heading", { name: "Status" })).toBeVisible();
  });
});
