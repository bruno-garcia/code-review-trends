import { test, expect } from "@playwright/test";

test.describe("Categories page", () => {
  test("shows all six category groups", async ({ page }) => {
    await page.goto("/categories");
    await expect(page.getByTestId("categories-page")).toBeVisible();
    await expect(page.getByTestId("category-group-the-good")).toBeVisible();
    await expect(page.getByTestId("category-group-the-spicy")).toBeVisible();
    await expect(
      page.getByTestId("category-group-review-style"),
    ).toBeVisible();
    await expect(
      page.getByTestId("category-group-adoption-trust"),
    ).toBeVisible();
    await expect(
      page.getByTestId("category-group-effectiveness"),
    ).toBeVisible();
    await expect(
      page.getByTestId("category-group-specialization"),
    ).toBeVisible();
  });

  test("The Good group has Most Loved and Signal over Noise", async ({
    page,
  }) => {
    await page.goto("/categories");
    const group = page.getByTestId("category-group-the-good");
    await expect(group.getByTestId("category-most-loved")).toBeVisible();
    await expect(
      group.getByTestId("category-signal-over-noise"),
    ).toBeVisible();
  });

  test("The Spicy group has Love it or Hate it and Wall of Text", async ({
    page,
  }) => {
    await page.goto("/categories");
    const group = page.getByTestId("category-group-the-spicy");
    await expect(
      group.getByTestId("category-love-it-or-hate-it"),
    ).toBeVisible();
    await expect(group.getByTestId("category-wall-of-text")).toBeVisible();
  });

  test("Review Style group has all categories", async ({ page }) => {
    await page.goto("/categories");
    const group = page.getByTestId("category-group-review-style");
    await expect(
      group.getByTestId("category-reviews-the-code"),
    ).toBeVisible();
    await expect(
      group.getByTestId("category-review-verdicts"),
    ).toBeVisible();
    await expect(
      group.getByTestId("category-handles-big-prs"),
    ).toBeVisible();
  });

  test("Adoption & Trust group shows all categories", async ({ page }) => {
    await page.goto("/categories");
    const group = page.getByTestId("category-group-adoption-trust");
    await expect(group.getByTestId("category-big-projects")).toBeVisible();
    await expect(
      group.getByTestId("category-enterprise-ready"),
    ).toBeVisible();
    await expect(group.getByTestId("category-battle-tested")).toBeVisible();
    await expect(
      group.getByTestId("category-fastest-growing"),
    ).toBeVisible();
  });

  test("Effectiveness group shows merge correlation and response time", async ({
    page,
  }) => {
    await page.goto("/categories");
    const group = page.getByTestId("category-group-effectiveness");
    await expect(
      group.getByTestId("category-merge-correlation"),
    ).toBeVisible();
    await expect(group.getByTestId("category-response-time")).toBeVisible();
  });

  test("categories show product rankings with data", async ({ page }) => {
    await page.goto("/categories");
    const mostLoved = page.getByTestId("category-most-loved");
    await expect(mostLoved).toBeVisible();
    // Should have at least one product bar visible
    const bars = mostLoved.locator(".rounded-full.transition-all");
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThan(0);
  });

  test("editor's picks are shown on select categories", async ({ page }) => {
    await page.goto("/categories");
    const mostLoved = page.getByTestId("category-most-loved");
    await expect(mostLoved.getByText("Our take:")).toBeVisible();
  });

  test("Language Specialist shows language data", async ({ page }) => {
    await page.goto("/categories");
    const langSection = page.getByTestId("category-language-specialist");
    await expect(langSection).toBeVisible();
    // Seed data includes common languages
    await expect(
      langSection.getByText(/TypeScript|JavaScript|Python|Rust|Go/).first(),
    ).toBeVisible();
  });

  test("sticky navigation has jump links for all groups", async ({ page }) => {
    await page.goto("/categories");
    const nav = page.getByTestId("categories-nav");
    await expect(nav).toBeVisible();
    await expect(nav.getByText("The Good")).toBeVisible();
    await expect(nav.getByText("The Spicy")).toBeVisible();
    await expect(nav.getByText("Review Style")).toBeVisible();
    await expect(nav.getByText("Adoption & Trust")).toBeVisible();
    await expect(nav.getByText("Effectiveness")).toBeVisible();
    await expect(nav.getByText("Specialization")).toBeVisible();
  });

  test("navigation link from nav bar works", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Categories" }).click();
    await expect(page).toHaveURL(/\/categories/);
    await expect(page.getByTestId("categories-page")).toBeVisible();
  });
});
