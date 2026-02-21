import { test, expect } from "@playwright/test";

test.describe("Bots listing page", () => {
  test("shows grid of bot cards", async ({ page }) => {
    await page.goto("/bots");
    const grid = page.getByTestId("bots-grid");
    await expect(grid).toBeVisible();
    const cards = grid.locator("[data-testid^='bot-card-']");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    // Cards should show stat labels
    const firstCard = cards.first();
    await expect(firstCard.getByText("Orgs")).toBeVisible();
    await expect(firstCard.getByText("Approval")).toBeVisible();
    await expect(firstCard.getByText("PR Comments")).toBeVisible();
  });

  test("has compare button linking to compare page", async ({ page }) => {
    await page.goto("/bots");
    const btn = page.getByText("Compare All →");
    await expect(btn).toBeVisible();
    await btn.click();
    await page.waitForURL("/compare");
    await expect(page.getByTestId("compare-table")).toBeVisible({ timeout: 15_000 });
  });

  test("bot card links to detail page", async ({ page }) => {
    await page.goto("/bots");
    const firstCard = page
      .getByTestId("bots-grid")
      .locator("[data-testid^='bot-card-']")
      .first();
    await firstCard.click();
    await page.waitForURL(/\/bots\/.+/);
    await expect(page.getByTestId("bot-name")).toBeVisible({ timeout: 15_000 });
  });

  test("shows review volume chart", async ({ page }) => {
    await page.goto("/bots");
    await expect(page.getByTestId("volume-section")).toBeVisible();
  });

  test("shows leaderboard table", async ({ page }) => {
    await page.goto("/bots");
    const table = page.getByTestId("leaderboard-table");
    await expect(table).toBeVisible();
  });

  test("leaderboard table headers are clickable for sorting", async ({ page }) => {
    await page.goto("/bots");
    const table = page.getByTestId("leaderboard-table");
    await expect(table).toBeVisible();
    // Click "Repos" header to sort
    const reposHeader = table.getByRole("columnheader", { name: "Repos" });
    await expect(reposHeader).toBeVisible();
    await reposHeader.getByRole("button").click();
    await expect(reposHeader.getByText("↓")).toBeVisible();
    // Click again to reverse
    await reposHeader.getByRole("button").click();
    await expect(reposHeader.getByText("↑")).toBeVisible();
  });

  test("links to compare page for full comparison", async ({ page }) => {
    await page.goto("/bots");
    const link = page.getByText("Compare All →");
    await expect(link).toBeVisible();
  });
});

test.describe("Bot detail page", () => {
  test("shows bot stats", async ({ page }) => {
    await page.goto("/bots/coderabbit");
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
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-activity-chart")).toBeVisible();
    const toggle = page.getByTestId("bot-activity-toggle");
    await expect(toggle).toBeVisible();
    await page.getByTestId("toggle-repos").click();
    await expect(page.getByTestId("toggle-repos")).toHaveAttribute("aria-pressed", "true");
  });

  test("shows comments per PR in stats", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    const stats = page.getByTestId("bot-stats");
    await expect(stats.getByText("Comments/PR")).toBeVisible();
  });

  test("renders multi-bot product page without errors", async ({ page }) => {
    // Regression: /bots/sentry crashed when a bot had no github_login
    const response = await page.goto("/bots/sentry");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("bot-name")).toHaveText("Sentry");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    // Bot history section only appears when there are multiple bots with activity data
    // In CI/local dev with empty tables, this section won't be visible
  });

  test("bot history shows raw bot login names", async ({ page }) => {
    await page.goto("/bots/sentry");
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

  test("returns 404 for unknown bot", async ({ page }) => {
    const response = await page.goto("/bots/nonexistent");
    expect(response?.status()).toBe(404);
  });

  test("has back link to bots page", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    const backLink = page.getByText("← Back to all products");
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page.getByTestId("bots-grid")).toBeVisible();
  });
});
