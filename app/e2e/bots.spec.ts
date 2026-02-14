import { test, expect } from "@playwright/test";

test.describe("Bots listing page", () => {
  test("shows grid of bot cards", async ({ page }) => {
    await page.goto("/bots");
    const grid = page.getByTestId("bots-grid");
    await expect(grid).toBeVisible();
    // Should have multiple bot cards
    const cards = grid.locator("[data-testid^='bot-card-']");
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);
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
  test("shows bot info and charts", async ({ page }) => {
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-name")).toHaveText("CodeRabbit");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
    await expect(page.getByTestId("bot-activity-chart")).toBeVisible();
    await expect(page.getByTestId("bot-reactions-chart")).toBeVisible();
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
