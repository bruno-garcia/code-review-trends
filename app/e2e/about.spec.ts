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

  test("shows data collection stats with progress bars", async ({ page }) => {
    await page.goto("/about");
    const stats = page.getByTestId("data-collection-stats");
    await expect(stats).toBeVisible();

    // BigQuery section
    await expect(stats.getByText("BigQuery Backfill")).toBeVisible();
    await expect(stats.getByText("Weeks covered")).toBeVisible();

    // GitHub enrichment section
    await expect(stats.getByText("GitHub API Enrichment")).toBeVisible();
    await expect(stats.getByText("Repositories")).toBeVisible();
    await expect(stats.getByText("Pull Requests")).toBeVisible();
    await expect(stats.getByText("Bot Comments")).toBeVisible();
  });

  test("shows methodology sections", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "Data Source" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /What Counts as a/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /AI Share/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Products vs. Bots" })).toBeVisible();
  });
});
