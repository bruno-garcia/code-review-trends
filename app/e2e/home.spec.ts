import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("has title and hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Code Review Trends/);
    await expect(page.getByTestId("hero")).toBeVisible();
    await expect(page.getByText("AI Code Review Trends")).toBeVisible();
  });

  test("shows AI share chart section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ai-share-section")).toBeVisible();
    await expect(
      page.getByText("AI Share of Code Reviews"),
    ).toBeVisible();
  });

  test("AI share chart toggles between PR Reviews and Review Comments", async ({
    page,
  }) => {
    await page.goto("/");
    const toggle = page.getByTestId("ai-share-toggle");
    await expect(toggle).toBeVisible();

    const reviewsBtn = page.getByTestId("toggle-reviews");
    const commentsBtn = page.getByTestId("toggle-comments");
    await expect(reviewsBtn).toHaveClass(/bg-indigo-600/);
    await expect(commentsBtn).not.toHaveClass(/bg-indigo-600/);

    await commentsBtn.click();
    await expect(commentsBtn).toHaveClass(/bg-indigo-600/);
    await expect(reviewsBtn).not.toHaveClass(/bg-indigo-600/);

    await reviewsBtn.click();
    await expect(reviewsBtn).toHaveClass(/bg-indigo-600/);
  });

  test("shows review volume chart section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("volume-section")).toBeVisible();
  });

  test("shows leaderboard with enriched columns", async ({ page }) => {
    await page.goto("/");
    const table = page.getByTestId("leaderboard-table");
    await expect(table).toBeVisible();
    // Check enriched columns exist
    await expect(table.getByText("Orgs")).toBeVisible();
    await expect(table.getByText("Approval")).toBeVisible();
    await expect(table.getByText("Avg Comments/Review")).toBeVisible();
    // Should have bot rows
    const rows = table.locator("tbody tr");
    await expect(rows).not.toHaveCount(0);
  });

  test("leaderboard has link to compare page", async ({ page }) => {
    await page.goto("/");
    const link = page.getByText("Full comparison →");
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.getByTestId("compare-table")).toBeVisible();
  });

  test("shows top organizations and bot sentiment sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("top-orgs-section")).toBeVisible();
    await expect(page.getByTestId("top-orgs-chart")).toBeVisible();
    await expect(page.getByTestId("bot-sentiment-section")).toBeVisible();
    await expect(page.getByTestId("bot-reaction-leaderboard")).toBeVisible();
  });

  test("leaderboard bot names link to detail pages", async ({ page }) => {
    await page.goto("/");
    const table = page.getByTestId("leaderboard-table");
    const botLink = table.locator("tbody a").first();
    const href = await botLink.getAttribute("href");
    expect(href).toMatch(/^\/bots\//);
  });
});
