import { test, expect } from "@playwright/test";

test.describe("Bots listing page", () => {
  test("shows grid of bot cards with enriched stats", async ({ page }) => {
    await page.goto("/bots");
    const grid = page.getByTestId("bots-grid");
    await expect(grid).toBeVisible();
    const cards = grid.locator("[data-testid^='bot-card-']");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    // Cards should show orgs, approval rate, and PR comments
    const firstCard = cards.first();
    await expect(firstCard.getByText("Orgs")).toBeVisible();
    await expect(firstCard.getByText("Approval")).toBeVisible();
    await expect(firstCard.getByText("PR Comments")).toBeVisible();

    // Assert that at least one bot has non-zero enriched stats
    let foundNonZeroApproval = false;
    let foundNonZeroPRComments = false;
    
    for (let i = 0; i < count; i++) {
      const card = cards.nth(i);
      
      // Extract approval rate value (format: "XX%")
      const approvalText = await card.locator('div:has-text("Approval") p').textContent();
      if (approvalText) {
        const approvalValue = parseFloat(approvalText.replace('%', ''));
        if (approvalValue > 0) {
          foundNonZeroApproval = true;
        }
      }
      
      // Extract PR Comments value
      const prCommentsText = await card.locator('div:has-text("PR Comments") p').textContent();
      if (prCommentsText) {
        const prCommentsValue = parseInt(prCommentsText.replace(/,/g, ''), 10);
        if (prCommentsValue > 0) {
          foundNonZeroPRComments = true;
        }
      }
      
      if (foundNonZeroApproval && foundNonZeroPRComments) {
        break;
      }
    }
    
    expect(foundNonZeroApproval).toBeTruthy();
    expect(foundNonZeroPRComments).toBeTruthy();
  });

  test("has compare button linking to compare page", async ({ page }) => {
    await page.goto("/bots");
    const btn = page.getByText("Compare All →");
    await expect(btn).toBeVisible();
    await btn.click();
    await expect(page.getByTestId("compare-table")).toBeVisible();
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
    const rows = table.locator("tbody tr");
    await expect(rows).not.toHaveCount(0);
  });

  test("shows bot sentiment section", async ({ page }) => {
    await page.goto("/bots");
    await expect(page.getByTestId("bot-sentiment-section")).toBeVisible();
    
    // Verify that bot sentiment has actual data, not "No data"
    const chart = page.getByTestId("bot-reaction-leaderboard");
    await expect(chart).toBeVisible();
    const noDataText = chart.getByText("No data");
    await expect(noDataText).not.toBeVisible();
  });
});

test.describe("Bot detail page", () => {
  test("shows enriched bot stats", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-name")).toHaveText("CodeRabbit");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    // Check for stat labels
    const stats = page.getByTestId("bot-stats");
    await expect(stats.getByText("Organizations")).toBeVisible();
    await expect(stats.getByText("Review Comments", { exact: true })).toBeVisible();
    await expect(stats.getByText("PR Comments", { exact: true })).toBeVisible();
    await expect(stats.getByText("Comments/Repo")).toBeVisible();
  });

  test("shows activity chart with toggle", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-activity-chart")).toBeVisible();
    const toggle = page.getByTestId("bot-activity-toggle");
    await expect(toggle).toBeVisible();
    // Toggle to repos view
    await page.getByTestId("toggle-repos").click();
    await expect(page.getByTestId("toggle-repos")).toHaveAttribute("aria-pressed", "true");
  });

  test("shows new charts and sections", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-language-chart")).toBeVisible();
    await expect(page.getByTestId("bot-comments-per-pr")).toBeVisible();
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
