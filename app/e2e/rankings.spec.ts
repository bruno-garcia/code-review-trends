import { test, expect } from "@playwright/test";

test.describe("Rankings page", () => {
  test("shows category groups with data", async ({ page }) => {
    await page.goto("/rankings");
    await expect(page.getByTestId("rankings-page")).toBeVisible();
    // Adoption & Trust and Specialization always have data (BigQuery aggregates)
    await expect(
      page.getByTestId("category-group-adoption-trust"),
    ).toBeVisible();
    await expect(
      page.getByTestId("category-group-specialization"),
    ).toBeVisible();
  });

  test("The Good group has Most Loved and Signal over Noise", async ({
    page,
  }) => {
    await page.goto("/rankings");
    const group = page.getByTestId("category-group-the-good");
    await expect(group.getByTestId("category-most-loved")).toBeVisible();
    await expect(
      group.getByTestId("category-signal-over-noise"),
    ).toBeVisible();
  });

  test("The Spicy group has Love it or Hate it and Wall of Text", async ({
    page,
  }) => {
    await page.goto("/rankings");
    const group = page.getByTestId("category-group-the-spicy");
    await expect(
      group.getByTestId("category-love-it-or-hate-it"),
    ).toBeVisible();
    await expect(group.getByTestId("category-wall-of-text")).toBeVisible();
  });

  test("Review Style group shows cards with data", async ({ page }) => {
    await page.goto("/rankings");
    // Handles Big PRs always has data from seed; the others depend on
    // review_state and pr_comment_count which may be missing.
    const group = page.getByTestId("category-group-review-style");
    await expect(
      group.getByTestId("category-handles-big-prs"),
    ).toBeVisible();
  });

  test("Adoption & Trust group shows all categories", async ({ page }) => {
    await page.goto("/rankings");
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
    await page.goto("/rankings");
    const group = page.getByTestId("category-group-effectiveness");
    await expect(
      group.getByTestId("category-merge-correlation"),
    ).toBeVisible();
    await expect(group.getByTestId("category-response-time")).toBeVisible();
  });

  test("rankings show product data with bars", async ({ page }) => {
    await page.goto("/rankings");
    // Use enterprise-ready which always has data from BigQuery aggregates
    const card = page.getByTestId("category-enterprise-ready");
    await expect(card).toBeVisible();
    const bars = card.locator(".rounded-full.transition-all");
    const barCount = await bars.count();
    expect(barCount).toBeGreaterThan(0);
  });

  test("editor's picks are shown on select categories", async ({ page }) => {
    await page.goto("/rankings");
    const mostLoved = page.getByTestId("category-most-loved");
    await expect(mostLoved.getByText("Our take:")).toBeVisible();
  });

  test("Language Specialist shows language data", async ({ page }) => {
    await page.goto("/rankings");
    const langSection = page.getByTestId("category-language-specialist");
    await expect(langSection).toBeVisible();
    // Seed data includes common languages
    await expect(
      langSection.getByText(/TypeScript|JavaScript|Python|Rust|Go/).first(),
    ).toBeVisible();
  });

  test("sticky navigation has jump links for visible groups", async ({
    page,
  }) => {
    await page.goto("/rankings");
    const nav = page.getByTestId("rankings-nav");
    await expect(nav).toBeVisible();
    // Adoption & Trust and Specialization always visible
    await expect(nav.getByText("Adoption & Trust")).toBeVisible();
    await expect(nav.getByText("Specialization")).toBeVisible();
  });

  test("Fastest Growing has window toggle that updates data", async ({
    page,
  }) => {
    await page.goto("/rankings");
    const card = page.getByTestId("category-fastest-growing");
    await expect(card).toBeVisible();
    // Default is 4w
    await expect(card.getByText("last 4 weeks vs previous 4")).toBeVisible();
    // Click 12w
    await card.getByRole("button", { name: "12w" }).click();
    await expect(card.getByText("last 12 weeks vs previous 12")).toBeVisible();
    // Click 8w
    await card.getByRole("button", { name: "8w" }).click();
    await expect(card.getByText("last 8 weeks vs previous 8")).toBeVisible();
  });

  test("navigation link from nav bar works", async ({ page }) => {
    await page.goto("/rankings");
    await expect(page.getByTestId("rankings-page")).toBeVisible();
    // Verify the nav link is present and active
    const navLink = page.getByRole("link", { name: "Rankings" });
    await expect(navLink).toBeVisible();
    await expect(navLink).toHaveAttribute("aria-current", "page");
  });

  test("empty categories are hidden, not shown as insufficient data", async ({
    page,
  }) => {
    await page.goto("/rankings");
    // The page should not contain "Insufficient data" text — empty cards
    // are simply not rendered
    const insufficientText = page.getByText("Insufficient data");
    await expect(insufficientText).toHaveCount(0);
  });
});
