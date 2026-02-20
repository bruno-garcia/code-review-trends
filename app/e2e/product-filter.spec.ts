import { test, expect, type Page } from "@playwright/test";

// No localStorage to clear — products are now persisted via URL params only.

/** Expand the filter picker */
async function expandPicker(page: Page) {
  const expandBtn = page.getByLabel("Expand filter");
  if (await expandBtn.isVisible()) {
    await expandBtn.click();
    await expect(page.getByLabel("Collapse filter")).toBeVisible();
  }
}

test.describe("Product filter", () => {
  test("filter bar hidden on home page", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("product-filter-bar")).not.toBeVisible();
  });

  test("default filter shows top 10 on bots page", async ({ page }) => {
    await page.goto("/bots");
    const bar = page.getByTestId("product-filter-bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByText(/10 of \d+ products selected/)).toBeVisible();

    const rows = page.getByTestId("leaderboard-table").locator("tbody tr");
    await expect(rows).toHaveCount(10);
  });

  test("filter bar expand/collapse", async ({ page }) => {
    await page.goto("/bots");

    // Initially collapsed
    await expect(page.getByLabel("Expand filter")).toBeVisible();
    await expect(page.getByLabel("Collapse filter")).not.toBeVisible();

    // Expand
    await page.getByLabel("Expand filter").click();
    await expect(page.getByLabel("Collapse filter")).toBeVisible();
    await expect(page.getByTestId("filter-select-all")).toBeVisible();

    // Collapse
    await page.getByLabel("Collapse filter").click();
    await expect(page.getByLabel("Expand filter")).toBeVisible();
  });

  test("toggle product in picker updates leaderboard", async ({ page }) => {
    await page.goto("/bots");
    await expandPicker(page);

    // Get the first product button in the picker and toggle it off
    const picker = page.getByTestId("product-filter-picker");
    const firstButton = picker.locator("[data-testid^='filter-product-']").first();
    const testId = await firstButton.getAttribute("data-testid");
    const productId = testId!.replace("filter-product-", "");
    await firstButton.click();

    const bar = page.getByTestId("product-filter-bar");
    await expect(bar.getByText(/9 of \d+ products selected/)).toBeVisible();
    await expect(page.getByTestId("leaderboard-table").locator("tbody tr")).toHaveCount(9);

    // Re-select it
    await page.getByTestId(`filter-product-${productId}`).click();
    await expect(bar.getByText(/10 of \d+ products selected/)).toBeVisible();
    await expect(page.getByTestId("leaderboard-table").locator("tbody tr")).toHaveCount(10);
  });

  test("select all / deselect all", async ({ page }) => {
    await page.goto("/bots");
    await expandPicker(page);
    const bar = page.getByTestId("product-filter-bar");

    // Select all
    await page.getByTestId("filter-select-all").click();
    const allText = await bar.innerText();
    const match = allText.match(/(\d+) of (\d+) products/);
    expect(match).toBeTruthy();
    expect(match![1]).toBe(match![2]);

    // Deselect all — truly empties the selection
    await page.getByTestId("filter-deselect-all").click();
    await expect(bar.getByText(/0 of \d+ products selected/)).toBeVisible();
  });

  test("reset to top 10", async ({ page }) => {
    await page.goto("/bots");
    await expandPicker(page);

    // Change from default
    await page.getByTestId("filter-select-all").click();
    const bar = page.getByTestId("product-filter-bar");
    await expect(bar.getByText(/10 of \d+ products selected/)).not.toBeVisible();

    // Reset
    await page.getByTestId("filter-reset").click();
    await expect(bar.getByText(/10 of \d+ products selected/)).toBeVisible();
  });

  test("persistence across navigation", async ({ page }) => {
    await page.goto("/bots");
    await expandPicker(page);

    // Deselect all → 0 products, then add 3 → 3
    await page.getByTestId("filter-deselect-all").click();
    const bar = page.getByTestId("product-filter-bar");
    await expect(bar.getByText(/0 of \d+ products selected/)).toBeVisible();

    // Select 3 products
    const picker = page.getByTestId("product-filter-picker");
    const allButtons = picker.locator("[data-testid^='filter-product-']");
    for (let i = 0; i < 3; i++) {
      await allButtons.nth(i).click();
    }
    await expect(bar.getByText(/3 of \d+ products selected/)).toBeVisible();

    // Navigate to compare (use exact match to avoid "Compare All →" link)
    await page.getByRole("link", { name: "Compare", exact: true }).click();
    await expect(page.getByTestId("compare-table").locator("tbody tr")).toHaveCount(3);

    // Navigate back to bots
    await page.getByRole("link", { name: "Bots" }).click();
    await expect(
      page.getByTestId("bots-grid").locator("[data-testid^='bot-card-']"),
    ).toHaveCount(3);
  });

  test("persistence across reload", async ({ page }) => {
    await page.goto("/bots");
    await expandPicker(page);

    await page.getByTestId("filter-deselect-all").click();
    await expect(
      page.getByTestId("product-filter-bar").getByText(/0 of \d+ products selected/),
    ).toBeVisible();

    // Reload — empty selection is not persisted, falls back to defaults
    await page.reload();
    await expect(
      page.getByTestId("product-filter-bar").getByText(/10 of \d+ products selected/),
    ).toBeVisible();
  });

  test("URL override with ?products=", async ({ page }) => {
    await page.goto("/bots?products=coderabbit,copilot");
    await expect(
      page.getByTestId("product-filter-bar").getByText(/2 of \d+ products selected/),
    ).toBeVisible();
    await expect(page.getByTestId("leaderboard-table").locator("tbody tr")).toHaveCount(2);
  });

  test("compare page respects filter", async ({ page }) => {
    await page.goto("/compare?products=coderabbit,copilot,sourcery");
    const table = page.getByTestId("compare-table");
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(3);
  });

  test("bots page respects filter", async ({ page }) => {
    await page.goto("/bots?products=coderabbit,copilot,sourcery,bito,sentry");
    await expect(
      page.getByTestId("bots-grid").locator("[data-testid^='bot-card-']"),
    ).toHaveCount(5);
  });

  test("unfiltered sections remain unfiltered on home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ai-share-section")).toBeVisible();
    await expect(page.getByTestId("top-orgs-section")).toBeVisible();
    // data-coverage is conditionally rendered based on data availability
    // Filter bar should not be visible on home
    await expect(page.getByTestId("product-filter-bar")).not.toBeVisible();
  });

  test("bot detail page unaffected by filter", async ({ page }) => {
    // Set filter to exclude coderabbit via URL on bots page
    await page.goto("/bots?products=copilot");
    await expect(
      page.getByTestId("product-filter-bar").getByText(/1 of \d+ products selected/),
    ).toBeVisible();

    // Navigate directly to coderabbit detail — should still work
    await page.goto("/bots/coderabbit");
    await expect(page.getByTestId("bot-name")).toHaveText("CodeRabbit");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
  });
});
