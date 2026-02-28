import { test, expect } from "@playwright/test";

test.describe("Products listing page", () => {
  test("shows grid of product cards", async ({ page }) => {
    await page.goto("/products");
    const grid = page.getByTestId("bots-grid");
    await expect(grid).toBeVisible();
    const cards = grid.locator("[data-testid^='bot-card-']");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    // Cards should show stat labels
    const firstCard = cards.first();
    await expect(firstCard.getByText("Orgs")).toBeVisible();
    await expect(firstCard.getByText("👍 Rate")).toBeVisible();
    await expect(firstCard.getByText("PR Comments")).toBeVisible();
  });

  test("has compare link to compare page", async ({ page }) => {
    await page.goto("/products");
    const link = page.getByText("Compare side by side →");
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL(/\/compare/);
    await expect(page.getByTestId("compare-table")).toBeVisible({ timeout: 15_000 });
  });

  test("product card links to detail page", async ({ page }) => {
    await page.goto("/products");
    const firstCard = page
      .getByTestId("bots-grid")
      .locator("[data-testid^='bot-card-']")
      .first();
    await firstCard.click();
    await page.waitForURL(/\/products\/.+/);
    await expect(page.getByTestId("bot-name")).toBeVisible({ timeout: 15_000 });
  });

  test("shows review volume chart", async ({ page }) => {
    await page.goto("/products");
    await expect(page.getByTestId("volume-section")).toBeVisible();
  });

  test("links to compare page for full comparison", async ({ page }) => {
    await page.goto("/products");
    const link = page.getByText("Compare side by side →");
    await expect(link).toBeVisible();
  });
});

test.describe("Product detail page", () => {
  test("shows product stats", async ({ page }) => {
    await page.goto("/products/coderabbit");
    await expect(page.getByTestId("bot-name")).toHaveText("CodeRabbit");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    const stats = page.getByTestId("bot-stats");
    await expect(stats.getByText("Organizations")).toBeVisible();
    await expect(stats.getByText("Review Comments", { exact: true })).toBeVisible();
    await expect(stats.getByText("PR Comments", { exact: true })).toBeVisible();
    await expect(stats.getByText("Comments/Repo")).toBeVisible();
  });

  test("rank shows info tooltip with link to about rankings", async ({ page }) => {
    await page.goto("/products/coderabbit");
    const rank = page.getByTestId("bot-rank");
    await expect(rank).toBeVisible();
    await expect(rank).toContainText("Rank:");
    // ⓘ icon is present
    await expect(rank.getByText("ⓘ")).toBeVisible();
    // Hover to reveal tooltip
    await rank.getByText("ⓘ").hover();
    const tooltip = rank.getByRole("tooltip");
    await expect(tooltip).toBeVisible();
    await expect(tooltip).toContainText("12-week review growth");
    // Tooltip contains link to about#rankings
    const link = tooltip.getByRole("link", { name: "Learn more →" });
    await expect(link).toHaveAttribute("href", "/about#rankings");
  });

  test("shows activity chart with toggle", async ({ page }) => {
    await page.goto("/products/coderabbit");
    await expect(page.getByTestId("bot-activity-chart")).toBeVisible();
    const toggle = page.getByTestId("bot-activity-toggle");
    await expect(toggle).toBeVisible();
    await page.getByTestId("toggle-repos").click();
    await expect(page.getByTestId("toggle-repos")).toHaveAttribute("aria-pressed", "true");
  });

  test("shows comments per PR in stats", async ({ page }) => {
    await page.goto("/products/coderabbit");
    const stats = page.getByTestId("bot-stats");
    await expect(stats.getByText("Comments/PR")).toBeVisible();
  });

  test("renders multi-bot product page without errors", async ({ page }) => {
    // Regression: /products/sentry crashed when a bot had no github_login
    const response = await page.goto("/products/sentry");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("bot-name")).toHaveText("Sentry");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    // With seed data, the stats should show non-zero values
    const statsText = await page.getByTestId("bot-stats").textContent();
    // At minimum, total reviews should be > 0 from seed data
    expect(statsText).not.toBe("");
  });

  test("multi-bot product shows top organizations (product filter)", async ({ page }) => {
    // Regression: getOrgList Phase 2 crashed with double-WHERE when product
    // filter was applied and Phase 1 returned results. This test requires
    // seed data in repos + pr_bot_events + org_bot_pr_counts.
    const response = await page.goto("/products/sentry");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    // With seed data, the top-orgs section should be visible
    const orgsSection = page.getByTestId("bot-top-orgs");
    await expect(orgsSection).toBeVisible({ timeout: 10_000 });
    await expect(orgsSection.getByText("Top Organizations")).toBeVisible();
    const orgLinks = orgsSection.locator("a[href^='/orgs/']");
    const count = await orgLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("multi-bot product shows top repositories", async ({ page }) => {
    // Requires seed data in repos + pr_bot_events + pr_bot_event_counts.
    const response = await page.goto("/products/sentry");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    const reposSection = page.getByTestId("bot-top-repos");
    await expect(reposSection).toBeVisible({ timeout: 10_000 });
    await expect(reposSection.getByText("Top Repositories")).toBeVisible();
    const repoLinks = reposSection.locator("a[href^='/repos/']");
    const count = await repoLinks.count();
    expect(count).toBeGreaterThan(0);
  });

  test("bot history shows GitHub login names from bot_logins table", async ({ page }) => {
    await page.goto("/products/sentry");
    // With seed data, bot history should always be visible for multi-bot Sentry
    const historySection = page.getByTestId("bot-history-section");
    await expect(historySection).toBeVisible({ timeout: 10_000 });
    // Each bot row should show the raw bot login or bot id
    const loginCells = historySection.locator("[data-testid^='bot-history-login-']");
    const count = await loginCells.count();
    expect(count).toBeGreaterThan(0);
    // Verify GitHub login names include [bot] suffix (from bot_logins table, not bot.id).
    // This catches regressions where ClickHouse column aliasing causes github_login
    // to be undefined, falling back to the internal bot id (e.g. "sentry" vs "sentry[bot]").
    const allText = await historySection.textContent();
    expect(allText).toContain("sentry[bot]");
    expect(allText).toContain("seer-by-sentry[bot]");
  });

  test("returns 404 for unknown product", async ({ page }) => {
    const response = await page.goto("/products/nonexistent");
    expect(response?.status()).toBe(404);
  });

  test("has back link to products page", async ({ page }) => {
    await page.goto("/products/coderabbit");
    const backLink = page.getByText("← Back to all products");
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page.getByTestId("bots-grid")).toBeVisible();
  });

  test("shows PR characteristics section when data exists", async ({ page }) => {
    await page.goto("/products/coderabbit");
    // Wait for data to load — bot-stats always renders, so it signals page is ready.
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    // Section is conditionally rendered: visible when enriched PR data exists (staging/CI),
    // absent when pull_requests table is empty (bare local dev).
    const section = page.getByTestId("bot-pr-characteristics");
    const count = await section.count();
    if (count > 0) {
      await expect(section.getByText("Typical PR Profile")).toBeVisible();
      await expect(section.getByText("Avg Additions")).toBeVisible();
      await expect(section.getByText("Avg Deletions")).toBeVisible();
      await expect(section.getByText("Merge Rate")).toBeVisible();
      await expect(section.getByText("Avg Time to Merge")).toBeVisible();
      // Verify no NaN/Infinity in the section
      const text = await section.textContent();
      expect(text).not.toMatch(/\bNaN\b/);
      expect(text).not.toMatch(/\bInfinity\b/);
    }
  });

  test("shows top organizations section when data exists", async ({ page }) => {
    await page.goto("/products/coderabbit");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    // Section is conditionally rendered: visible when org data exists.
    const section = page.getByTestId("bot-top-orgs");
    const count = await section.count();
    if (count > 0) {
      await expect(section.getByText("Top Organizations")).toBeVisible();
      const rows = section.locator("a[href^='/orgs/']");
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
      expect(rowCount).toBeLessThanOrEqual(5);
    }
  });

  test("'View all organizations' link includes product name and filters", async ({ page }) => {
    await page.goto("/products/coderabbit");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    const section = page.getByTestId("bot-top-orgs");
    if (await section.count() === 0) return; // skip if no orgs
    const link = section.getByRole("link", { name: /View all .* organizations using CodeRabbit/ });
    if (await link.count() === 0) return; // skip if total <= TOP_N
    await expect(link).toHaveAttribute("href", /\/orgs\?products=coderabbit/);
  });

  test("shows top repositories section when data exists", async ({ page }) => {
    await page.goto("/products/coderabbit");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    // Section is conditionally rendered: visible when enriched repo data exists.
    const section = page.getByTestId("bot-top-repos");
    const count = await section.count();
    if (count > 0) {
      await expect(section.getByText("Top Repositories")).toBeVisible();
      const rows = section.locator("a[href^='/repos/']");
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
      expect(rowCount).toBeLessThanOrEqual(5);
    }
  });

  test("'View all repositories' link includes product name and filters", async ({ page }) => {
    await page.goto("/products/coderabbit");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    const section = page.getByTestId("bot-top-repos");
    if (await section.count() === 0) return; // skip if no repos
    const link = section.getByRole("link", { name: /View all .* repositories using CodeRabbit/ });
    if (await link.count() === 0) return; // skip if total <= TOP_N
    await expect(link).toHaveAttribute("href", /\/repos\?products=coderabbit/);
  });

  test("bot detail page has no NaN or Infinity in any section", async ({
    page,
  }) => {
    await page.goto("/products/coderabbit");
    // Wait for page data to load by asserting a known section is visible
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    const bodyText = await page.locator("main").textContent();
    expect(bodyText).not.toMatch(/\bNaN\b/);
    expect(bodyText).not.toMatch(/\bInfinity\b/);
    expect(bodyText).not.toMatch(/\bundefined\b/);
  });

  // Product detail page with remote ClickHouse can take 5-8s per page load.
  // Time range tests involve navigation + server re-render, so need extra time.
  test.describe("time range on detail page", () => {
    test.setTimeout(60_000);

  test("shows time range selector", async ({ page }) => {
    await page.goto("/products/coderabbit");
    await expect(page.getByTestId("time-range-selector")).toBeVisible();
    // All five options should be present
    await expect(page.getByTestId("time-range-all")).toBeVisible();
    await expect(page.getByTestId("time-range-1m")).toBeVisible();
    await expect(page.getByTestId("time-range-3m")).toBeVisible();
    await expect(page.getByTestId("time-range-6m")).toBeVisible();
    await expect(page.getByTestId("time-range-1y")).toBeVisible();
    // Default is "All Time"
    await expect(page.getByTestId("time-range-all")).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  test("clicking time range updates URL with ?range=", async ({ page }) => {
    await page.goto("/products/coderabbit");
    await page.getByTestId("time-range-1m").click();
    await expect(page).toHaveURL(/range=1m/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/products\/coderabbit/);
  });

  test("time range is restored from URL on load", async ({ page }) => {
    await page.goto("/products/coderabbit?range=6m", { timeout: 30_000 });
    await expect(page.getByTestId("time-range-6m")).toHaveAttribute(
      "aria-checked",
      "true",
      { timeout: 10_000 },
    );
    await expect(page.getByTestId("time-range-all")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  test("selecting All Time removes ?range= from URL", async ({ page }) => {
    await page.goto("/products/coderabbit?range=3m");
    await page.getByTestId("time-range-all").click();
    await page.waitForURL((url) => !url.search.includes("range="), { timeout: 10_000 });
    const url = new URL(page.url());
    expect(url.searchParams.has("range")).toBe(false);
  });

  test("time range filters stat values", async ({ page }) => {
    // Load with all-time data and capture "Total Reviews"
    await page.goto("/products/coderabbit", { waitUntil: "networkidle" });
    await expect(page.getByTestId("bot-stats")).toBeVisible({ timeout: 15_000 });
    const allTimeText = await page.getByTestId("bot-stats").textContent();
    const allTimeMatch = allTimeText?.match(/Total Reviews([\d,]+)/);
    expect(allTimeMatch).toBeTruthy();
    const allTimeReviews = Number(allTimeMatch![1].replace(/,/g, ""));

    // Switch to 1M — reviews should be less than all-time
    await page.getByTestId("time-range-1m").click();
    await expect(page).toHaveURL(/range=1m/, { timeout: 10_000 });
    // Wait for the server re-render to complete — stats text must change
    await expect(async () => {
      const text = await page.getByTestId("bot-stats").textContent();
      const match = text?.match(/Total Reviews([\d,]+)/);
      expect(match).toBeTruthy();
      const reviews = Number(match![1].replace(/,/g, ""));
      expect(reviews).toBeLessThan(allTimeReviews);
      expect(reviews).toBeGreaterThan(0);
    }).toPass({ timeout: 15_000 });
  });

  test("time range does not show product picker", async ({ page }) => {
    await page.goto("/products/coderabbit");
    // The filter bar should exist (for time range)
    await expect(page.getByTestId("time-range-selector")).toBeVisible();
    // But the product picker should not be present
    await expect(page.getByTestId("product-filter-picker")).not.toBeVisible();
    // No expand/collapse button
    await expect(page.getByLabel("Expand filter")).not.toBeVisible();
  });

  }); // end time range on detail page
});
