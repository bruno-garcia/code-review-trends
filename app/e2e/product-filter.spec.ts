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

  test("default filter shows top 10", async ({ page }) => {
    await page.goto("/products");
    const bar = page.getByTestId("product-filter-bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByText(/10 of \d+ products selected/)).toBeVisible();
  });

  test("filter bar expand/collapse", async ({ page }) => {
    await page.goto("/products");

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

  test("toggle product in picker updates card grid", async ({ page }) => {
    await page.goto("/products");
    await expandPicker(page);

    const bar = page.getByTestId("product-filter-bar");
    const allText = await bar.innerText();
    const allMatch = allText.match(/(\d+) of (\d+) products/);
    const selectedCount = parseInt(allMatch![1], 10);

    // Deselect the first product
    const picker = page.getByTestId("product-filter-picker");
    const firstButton = picker.locator("[data-testid^='filter-product-']").first();
    const testId = await firstButton.getAttribute("data-testid");
    const productId = testId!.replace("filter-product-", "");
    await firstButton.click();

    await expect(bar.getByText(new RegExp(`${selectedCount - 1} of \\d+ products selected`))).toBeVisible();

    // Re-select it
    await page.getByTestId(`filter-product-${productId}`).click();
    await expect(bar.getByText(new RegExp(`${selectedCount} of \\d+ products selected`))).toBeVisible();
  });

  test("select all / deselect all", async ({ page }) => {
    await page.goto("/products");
    await expandPicker(page);
    const bar = page.getByTestId("product-filter-bar");

    // Deselect all
    await page.getByTestId("filter-deselect-all").click();
    await expect(bar.getByText(/0 of \d+ products selected/)).toBeVisible();

    // Select all
    await page.getByTestId("filter-select-all").click();
    const allText = await bar.innerText();
    const match = allText.match(/(\d+) of (\d+) products/);
    expect(match).toBeTruthy();
    expect(match![1]).toBe(match![2]);
  });

  test("select top 10", async ({ page }) => {
    await page.goto("/products");
    await expandPicker(page);

    // Start from all selected, click Select Top 10
    await page.getByTestId("filter-reset").click();
    const bar = page.getByTestId("product-filter-bar");
    await expect(bar.getByText(/10 of \d+ products selected/)).toBeVisible();
  });

  test("persistence across navigation", async ({ page }) => {
    await page.goto("/products");
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

    // Navigate to compare
    await page.getByRole("link", { name: "Compare", exact: true }).click();
    await expect(page.getByTestId("compare-table").locator("tbody tr")).toHaveCount(3);

    // Navigate back to products
    await page.getByRole("link", { name: "Products", exact: true }).click();
    await expect(
      page.getByTestId("bots-grid").locator("[data-testid^='bot-card-']"),
    ).toHaveCount(3);
  });

  test("URL override with ?products=", async ({ page }) => {
    await page.goto("/products?products=coderabbit,copilot");
    await expect(
      page.getByTestId("product-filter-bar").getByText(/2 of \d+ products selected/),
    ).toBeVisible();
    await expect(
      page.getByTestId("bots-grid").locator("[data-testid^='bot-card-']"),
    ).toHaveCount(2);
  });

  test("compare page respects filter", async ({ page }) => {
    await page.goto("/compare?products=coderabbit,copilot,sourcery");
    const table = page.getByTestId("compare-table");
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(3);
  });

  test("products page respects filter", async ({ page }) => {
    await page.goto("/products?products=coderabbit,copilot,sourcery,bito,sentry");
    await expect(
      page.getByTestId("bots-grid").locator("[data-testid^='bot-card-']"),
    ).toHaveCount(5);
  });

  test("unfiltered sections remain unfiltered on home", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ai-share-section")).toBeVisible();
    await expect(page.getByTestId("top-orgs-section")).toBeVisible();
    await expect(page.getByTestId("product-filter-bar")).not.toBeVisible();
  });

  test("product detail page unaffected by filter", async ({ page }) => {
    // Set filter to exclude coderabbit
    await page.goto("/products?products=copilot");
    await expect(
      page.getByTestId("product-filter-bar").getByText(/1 of \d+ products selected/),
    ).toBeVisible();

    // Navigate directly to coderabbit detail — should still work
    await page.goto("/products/coderabbit");
    await expect(page.getByTestId("bot-name")).toHaveText("CodeRabbit");
    await expect(page.getByTestId("bot-stats")).toBeVisible();
  });
});
