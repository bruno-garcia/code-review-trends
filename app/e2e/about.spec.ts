import { test, expect } from "@playwright/test";

test.describe("About page", () => {
  test("has methodology heading", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "Methodology" })).toBeVisible();
  });

  test("has link to status page", async ({ page }) => {
    await page.goto("/about");
    const link = page.getByRole("link", { name: /data collection status/i });
    await expect(link).toBeVisible();
    await link.click();
    await expect(page).toHaveURL("/status");
  });

  test("shows methodology sections", async ({ page }) => {
    await page.goto("/about");
    await expect(page.getByRole("heading", { name: "Data Source" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /What Counts as a/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: /AI Share/ })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Products vs. Bots" })).toBeVisible();
    await expect(page.getByRole("heading", { name: /PR Profile/ })).toBeVisible();
  });

  test("PR Profile section explains methodology", async ({ page }) => {
    await page.goto("/about");
    // Section heading is visible
    await expect(page.getByRole("heading", { name: /PR Profile/ })).toBeVisible();
    // Key caveats are present
    await expect(page.getByText("Progressive enrichment.")).toBeVisible();
    await expect(page.getByText("Correlation, not causation.")).toBeVisible();
  });
});
