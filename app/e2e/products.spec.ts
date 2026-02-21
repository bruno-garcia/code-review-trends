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

  test("has compare button linking to compare page", async ({ page }) => {
    await page.goto("/products");
    const btn = page.getByText("Compare All →");
    await expect(btn).toBeVisible();
    await btn.click();
    await page.waitForURL("/compare");
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
    const link = page.getByText("Compare All →");
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
    await page.goto("/bots/coderabbit");
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
    // Bot history section only appears when there are multiple bots with activity data
    // In CI/local dev with empty tables, this section won't be visible
  });

  test("bot history shows raw bot login names", async ({ page }) => {
    await page.goto("/products/sentry");
    const historySection = page.getByTestId("bot-history-section");
    // Section only appears with activity data — skip in empty-DB environments
    if (!(await historySection.isVisible().catch(() => false))) {
      test.skip(true, "Bot history section not visible, likely due to empty activity data.");
      return;
    }
    // Each bot row should show the raw bot login or bot id
    const loginCells = historySection.locator("[data-testid^='bot-history-login-']");
    const count = await loginCells.count();
    expect(count).toBeGreaterThan(0);
    // Verify known Sentry bot identifiers are present
    const allText = await historySection.textContent();
    expect(allText).toContain("sentry");
    expect(allText).toContain("seer-by-sentry");
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
    await page.goto("/bots/coderabbit");
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
    await page.goto("/bots/coderabbit");
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

  test("shows top repositories section when data exists", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    // Section is conditionally rendered: visible when enriched repo data exists.
    const section = page.getByTestId("bot-top-repos");
    const count = await section.count();
    if (count > 0) {
      await expect(section.getByText("Top Repositories")).toBeVisible();
      const rows = section.locator("a[href^='https://github.com/']");
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);
      expect(rowCount).toBeLessThanOrEqual(5);
    }
  });

  test("bot detail page has no NaN or Infinity in any section", async ({
    page,
  }) => {
    await page.goto("/bots/coderabbit");
    // Wait for page data to load by asserting a known section is visible
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    const bodyText = await page.locator("main").textContent();
    expect(bodyText).not.toMatch(/\bNaN\b/);
    expect(bodyText).not.toMatch(/\bInfinity\b/);
    expect(bodyText).not.toMatch(/\bundefined\b/);
  });
});
