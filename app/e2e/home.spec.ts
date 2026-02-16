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

  test("AI share chart toggles between PR Reviews, Review Comments, and PR Comments", async ({
    page,
  }) => {
    await page.goto("/");
    const section = page.getByTestId("ai-share-section");
    const toggle = section.getByTestId("ai-share-toggle");
    await expect(toggle).toBeVisible();

    const reviewsBtn = section.getByTestId("toggle-reviews");
    const commentsBtn = section.getByTestId("toggle-comments");
    const prCommentsBtn = section.getByTestId("toggle-pr_comments");
    await expect(reviewsBtn).toHaveAttribute("aria-pressed", "true");
    await expect(commentsBtn).toHaveAttribute("aria-pressed", "false");
    await expect(prCommentsBtn).toHaveAttribute("aria-pressed", "false");

    await commentsBtn.click();
    await expect(commentsBtn).toHaveAttribute("aria-pressed", "true");
    await expect(reviewsBtn).toHaveAttribute("aria-pressed", "false");

    await prCommentsBtn.click();
    await expect(prCommentsBtn).toHaveAttribute("aria-pressed", "true");
    await expect(commentsBtn).toHaveAttribute("aria-pressed", "false");

    await reviewsBtn.click();
    await expect(reviewsBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("shows total volume section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("total-volume-section")).toBeVisible();
  });

  test("shows top organizations section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("top-orgs-section")).toBeVisible();
    await expect(page.getByTestId("top-orgs-chart")).toBeVisible();
  });

  test("shows data coverage", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("data-coverage")).toBeVisible();
  });
});
