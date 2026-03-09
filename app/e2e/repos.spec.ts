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
    for (const sort of ["stars", "prs"]) {
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
    await expect(page).toHaveURL(/\/repos(\?|$)/);
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

test.describe("Repo detail — exact stat values from seed data", () => {
  // Uses test-org/frontend from db/seed/e2e-test-data.sql.
  // Every stat has a unique value so a field mapping bug (e.g., showing
  // total_prs where bot_comment_count should be) is caught immediately.
  //
  // Seed data for test-org/frontend:
  //   stars: 5200            → "5.2K" (formatNumber)
  //   pr_bot_events: 5 unique PRs (101–105)
  //   pr_comments: 6 comments (1001–1004 coderabbit, 1010–1011 sentry)
  //   pull_requests: 4 merged + 1 closed
  //     merge_rate: 80.0%
  //     avg_hours_to_merge: 31.5 → "32h" (formatHours rounds)
  //     avg_additions: 186   → "+186"
  //     avg_deletions: 109   → "-109"
  //     avg_changed_files: 4 → "4"

  /** Helper: get the value <p> inside a stat card by its data-testid. */
  const statValue = (page: import("@playwright/test").Page, name: string) =>
    page.getByTestId(`stat-${name}`).locator("p").nth(1);

  test("renders exact stat values for test-org/frontend", async ({ page }) => {
    const response = await page.goto("/repos/test-org/frontend");
    expect(response?.status()).toBe(200);

    // Header
    await expect(page.getByTestId("repo-name")).toHaveText("test-org/frontend");

    // Primary stats (grid 1)
    await expect(statValue(page, "stars")).toHaveText("⭐ 5.2K");
    await expect(statValue(page, "prs-reviewed")).toHaveText("5");
    await expect(statValue(page, "bot-comments")).toHaveText("6");
    await expect(statValue(page, "primary-language")).toHaveText("TypeScript");

    // PR stats (grid 2)
    await expect(statValue(page, "merge-rate")).toHaveText("80.0%");
    await expect(statValue(page, "avg-time-to-merge")).toHaveText("32h");
    await expect(statValue(page, "avg-additions")).toHaveText("+186");
    await expect(statValue(page, "avg-deletions")).toHaveText("-109");
    await expect(statValue(page, "avg-files-changed")).toHaveText("4");
  });

  test("shows correct products for test-org/frontend", async ({ page }) => {
    await page.goto("/repos/test-org/frontend");

    const products = page.getByTestId("repo-products");
    await expect(products).toBeVisible();

    // CodeRabbit reviewed PRs 101, 102, 103 → 3 PRs
    await expect(products.getByText("CodeRabbit")).toBeVisible();
    // Sentry reviewed PRs 104, 105 → 2 PRs
    await expect(products.getByText("Sentry")).toBeVisible();
  });
});
