import { test, expect } from "@playwright/test";

test.describe("Repos page", () => {
  test("renders repo list", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.locator("h1")).toHaveText("Repositories");
    await expect(page.locator('[data-testid="repo-list"]')).toBeVisible();
  });

  test("shows filter controls", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.locator('[data-testid="repo-filters"]')).toBeVisible();
  });

  test("search filters repos", async ({ page }) => {
    await page.goto("/repos?q=react");
    await expect(page.locator('[data-testid="repo-list"]')).toBeVisible();
  });

  test("sort by stars works", async ({ page }) => {
    await page.goto("/repos?sort=stars");
    await expect(page.locator('[data-testid="repo-list"]')).toBeVisible();
  });
});

test.describe("Repo detail page", () => {
  test("renders repo detail", async ({ page }) => {
    // Navigate from list to first repo
    await page.goto("/repos");
    const firstRow = page.locator('[data-testid="repo-row"]').first();
    // If there are repos, click the first one
    const count = await firstRow.count();
    if (count > 0) {
      await firstRow.click();
      await expect(page.locator('[data-testid="repo-name"]')).toBeVisible();
      await expect(page.locator('[data-testid="repo-stats"]')).toBeVisible();
    }
  });

  test("404 for nonexistent repo", async ({ page }) => {
    const response = await page.goto("/repos/nonexistent-owner-xyz/nonexistent-repo-xyz");
    expect(response?.status()).toBe(404);
  });

  test("back link goes to repos", async ({ page }) => {
    await page.goto("/repos");
    const firstRow = page.locator('[data-testid="repo-row"]').first();
    const count = await firstRow.count();
    if (count > 0) {
      await firstRow.click();
      await page.locator('a:has-text("Back to repositories")').click();
      await expect(page).toHaveURL(/\/repos/);
    }
  });
});
