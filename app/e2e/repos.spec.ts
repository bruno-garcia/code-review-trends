import { test, expect } from "@playwright/test";

test.describe("Repos listing page", () => {
  test("renders with 200 status and shows repo list", async ({ page }) => {
    const response = await page.goto("/repos");
    expect(response?.status()).toBe(200);
    await expect(page.locator("h1")).toHaveText("Repositories");
    await expect(page.locator('[data-testid="repo-list"]')).toBeVisible();
  });

  test("shows filter controls", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.locator('[data-testid="repo-filters"]')).toBeVisible();
  });

  test("shows product filter bar", async ({ page }) => {
    await page.goto("/repos");
    await expect(page.locator('[data-testid="product-filter-bar"]')).toBeVisible();
  });

  test("product filter changes repo count", async ({ page }) => {
    // Load unfiltered page and get total count
    await page.goto("/repos");
    const countText = page.locator("p.mt-2");
    await expect(countText).toBeVisible();
    const unfilteredText = await countText.textContent();
    const unfilteredMatch = unfilteredText?.match(/([\d,]+)\s+repositories/);
    // Skip test if no data
    if (!unfilteredMatch) return;
    const unfilteredCount = parseInt(unfilteredMatch[1].replace(/,/g, ""), 10);
    if (unfilteredCount < 2) {
      test.skip(true, "Not enough repo data for filter test");
      return;
    }

    // Load with a single product filter — count should be different
    const response = await page.goto("/repos?products=coderabbit");
    expect(response?.status()).toBe(200);
    const filteredText = await countText.textContent();
    const filteredMatch = filteredText?.match(/([\d,]+)\s+repositories/);
    // If no repos match the filter, the "X repositories" text may not appear
    if (!filteredMatch) return;
    const filteredCount = parseInt(filteredMatch![1].replace(/,/g, ""), 10);
    expect(filteredCount).toBeLessThanOrEqual(unfilteredCount);
  });

  test("product=none shows no results", async ({ page }) => {
    const response = await page.goto("/repos?products=none");
    expect(response?.status()).toBe(200);
    await expect(page.getByText("No repositories match")).toBeVisible();
  });

  test("search filters repos", async ({ page }) => {
    const response = await page.goto("/repos?q=react");
    expect(response?.status()).toBe(200);
    await expect(page.locator('[data-testid="repo-list"]')).toBeVisible();
  });

  test("sort options work without errors", async ({ page }) => {
    for (const sort of ["stars", "prs", "comments"]) {
      const response = await page.goto(`/repos?sort=${sort}`);
      expect(response?.status()).toBe(200);
    }
  });
});

test.describe("Repo detail page", () => {
  test("renders with 200 status and shows stats", async ({ page }) => {
    // Navigate from list to get a real repo name
    await page.goto("/repos");
    const firstRow = page.locator('[data-testid="repo-row"]').first();
    if ((await firstRow.count()) === 0) return; // no data

    await firstRow.click();
    await page.waitForURL(/\/repos\/.+\/.+/);
    expect(page.url()).toMatch(/\/repos\/.+\/.+/);

    await expect(page.locator('[data-testid="repo-name"]')).toBeVisible();
    await expect(page.locator('[data-testid="repo-stats"]')).toBeVisible();
  });

  test("shows AI review products with non-zero PR counts", async ({ page }) => {
    await page.goto("/repos");
    const firstRow = page.locator('[data-testid="repo-row"]').first();
    if ((await firstRow.count()) === 0) return;

    await firstRow.click();
    await page.waitForURL(/\/repos\/.+\/.+/);

    const productsSection = page.locator('[data-testid="repo-products"]');
    // Products section may not exist for repos with no bot activity
    if ((await productsSection.count()) === 0) return;

    await expect(productsSection).toBeVisible();
    // At least one product card should show a non-zero PR count
    const prCounts = productsSection.locator("text=/\\d+ PRs/i");
    if ((await prCounts.count()) > 0) {
      const text = await prCounts.first().textContent();
      const num = parseInt(text?.replace(/[^\d]/g, "") ?? "0", 10);
      expect(num).toBeGreaterThan(0);
    }
  });

  test("back link navigates to repos list", async ({ page }) => {
    await page.goto("/repos");
    const firstRow = page.locator('[data-testid="repo-row"]').first();
    if ((await firstRow.count()) === 0) return;

    await firstRow.click();
    await page.waitForURL(/\/repos\/.+\/.+/);
    await page.locator('a:has-text("Back to repositories")').click();
    await expect(page).toHaveURL(/\/repos$/);
  });

  test("returns 404 for nonexistent repo", async ({ page }) => {
    const response = await page.goto("/repos/nonexistent-owner-xyz/nonexistent-repo-xyz");
    expect(response?.status()).toBe(404);
  });

  test("GitHub link is present", async ({ page }) => {
    await page.goto("/repos");
    const firstRow = page.locator('[data-testid="repo-row"]').first();
    if ((await firstRow.count()) === 0) return;

    await firstRow.click();
    await page.waitForURL(/\/repos\/.+\/.+/);
    const ghLink = page.locator('a[href^="https://github.com/"]').first();
    await expect(ghLink).toBeVisible();
  });
});
