import { test, expect } from "@playwright/test";

test.describe("Bots listing page", () => {
  test("shows grid of bot cards with enriched stats", async ({ page }) => {
    await page.goto("/bots");
    const grid = page.getByTestId("bots-grid");
    await expect(grid).toBeVisible();
    const cards = grid.locator("[data-testid^='bot-card-']");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
    // Cards should show orgs and approval rate
    const firstCard = cards.first();
    await expect(firstCard.getByText("Orgs")).toBeVisible();
    await expect(firstCard.getByText("Approval")).toBeVisible();
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
    await expect(page.getByTestId("bot-name")).toBeVisible();
  });
});

test.describe("Bot detail page", () => {
  test("shows enriched bot stats", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-name")).toHaveText("CodeRabbit");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    // Check for new stat labels
    await expect(page.getByText("Organizations")).toBeVisible();
    await expect(page.getByText("Avg Comments/Review")).toBeVisible();
    await expect(page.getByText("Approval Rate")).toBeVisible();
    await expect(page.getByText("Comments/Repo")).toBeVisible();
  });

  test("shows activity chart with toggle", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-activity-chart")).toBeVisible();
    const toggle = page.getByTestId("bot-activity-toggle");
    await expect(toggle).toBeVisible();
    // Toggle to repos view
    await page.getByTestId("toggle-repos").click();
    await expect(page.getByTestId("toggle-repos")).toHaveClass(/bg-indigo-600/);
  });

  test("shows reaction chart", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-reactions-chart")).toBeVisible();
  });

  test("shows reactions by PR size chart", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("reactions-by-pr-size")).toBeVisible();
  });

  test("shows language breakdown chart", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-language-chart")).toBeVisible();
  });

  test("shows comments per PR section", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-comments-per-pr")).toBeVisible();
  });

  test("returns 404 for unknown bot", async ({ page }) => {
    const response = await page.goto("/bots/nonexistent");
    expect(response?.status()).toBe(404);
  });

  test("has back link to bots page", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    const backLink = page.getByText("← Back to all bots");
    await expect(backLink).toBeVisible();
    await backLink.click();
    await expect(page.getByTestId("bots-grid")).toBeVisible();
  });
});
