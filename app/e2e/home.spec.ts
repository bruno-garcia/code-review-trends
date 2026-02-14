import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("has title and hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Code Review Trends/);
    await expect(page.getByTestId("hero")).toBeVisible();
    await expect(
      page.getByText("AI Code Review Trends"),
    ).toBeVisible();
  });

  test("shows AI share chart section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ai-share-section")).toBeVisible();
    await expect(
      page.getByText("AI Share of Code Reviews"),
    ).toBeVisible();
  });

  test("AI share chart toggles between PR Reviews and Review Comments", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByTestId("ai-share-toggle");
    await expect(toggle).toBeVisible();

    // PR Reviews is selected by default
    const reviewsBtn = page.getByTestId("toggle-reviews");
    const commentsBtn = page.getByTestId("toggle-comments");
    await expect(reviewsBtn).toHaveClass(/bg-indigo-600/);
    await expect(commentsBtn).not.toHaveClass(/bg-indigo-600/);

    // Click comments toggle
    await commentsBtn.click();
    await expect(commentsBtn).toHaveClass(/bg-indigo-600/);
    await expect(reviewsBtn).not.toHaveClass(/bg-indigo-600/);

    // Click back to reviews
    await reviewsBtn.click();
    await expect(reviewsBtn).toHaveClass(/bg-indigo-600/);
  });

  test("shows review volume chart section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("volume-section")).toBeVisible();
  });

  test("shows leaderboard with bot entries", async ({ page }) => {
    await page.goto("/");
    const table = page.getByTestId("leaderboard-table");
    await expect(table).toBeVisible();
    // Should have at least one bot row
    const rows = table.locator("tbody tr");
    await expect(rows).not.toHaveCount(0);
  });

  test("leaderboard links go to bot detail pages", async ({ page }) => {
    await page.goto("/");
    const firstBotLink = page
      .getByTestId("leaderboard-table")
      .locator("tbody tr a")
      .first();
    const href = await firstBotLink.getAttribute("href");
    expect(href).toMatch(/^\/bots\//);
  });
});
