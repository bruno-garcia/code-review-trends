import { test, expect, type Page } from "@playwright/test";

/** Expand the filter picker */
async function expandPicker(page: Page) {
  const expandBtn = page.getByLabel("Expand filter");
  if (await expandBtn.isVisible()) {
    await expandBtn.click();
    await expect(page.getByLabel("Collapse filter")).toBeVisible();
  }
}

test.describe("Compare pair pages", () => {
  test("pair page renders with both product names", async ({ page }) => {
    await page.goto("/compare/coderabbit-vs-github-copilot");
    await expect(page.getByTestId("compare-pair")).toBeVisible();
    const title = await page.title();
    expect(title).toMatch(/CodeRabbit/i);
    expect(title).toMatch(/Copilot/i);
  });

  test("pair page does not redirect away", async ({ page }) => {
    await page.goto("/compare/coderabbit-vs-github-copilot");
    await expect(page.getByTestId("compare-pair")).toBeVisible();
    // Wait a moment to ensure no redirect fires
    await page.waitForTimeout(1000);
    expect(page.url()).toContain("/compare/coderabbit-vs-github-copilot");
  });

  test("filter bar visible on pair page with 2 products selected", async ({ page }) => {
    await page.goto("/compare/coderabbit-vs-github-copilot");
    await expect(page.getByTestId("compare-pair")).toBeVisible();
    const bar = page.getByTestId("product-filter-bar");
    await expect(bar).toBeVisible();
    await expect(bar.getByText(/2 of \d+ products selected/)).toBeVisible();
  });

  test("compare table shows exactly the 2 pair products", async ({ page }) => {
    await page.goto("/compare/coderabbit-vs-github-copilot");
    const table = page.getByTestId("compare-table");
    await expect(table).toBeVisible();
    await expect(table.locator("tbody tr")).toHaveCount(2);
  });

  test("changing filter on pair page navigates to /compare", async ({ page }) => {
    await page.goto("/compare/coderabbit-vs-github-copilot");
    await expect(page.getByTestId("compare-pair")).toBeVisible();
    // Wait for filter to sync
    await expect(
      page.getByTestId("product-filter-bar").getByText(/2 of \d+ products selected/),
    ).toBeVisible();

    // Expand picker and add a third product
    await expandPicker(page);
    await page.getByTestId("filter-product-sourcery").click();

    // Should navigate to /compare with products in URL
    await page.waitForURL(/\/compare\?/);
    expect(page.url()).toContain("/compare?");
    expect(page.url()).toContain("products=");
  });

  test("invalid pair returns 404", async ({ page }) => {
    const res = await page.goto("/compare/fake-vs-nonexistent");
    expect(res?.status()).toBe(404);
  });

  test("sitemap includes pair URLs", async ({ request }) => {
    // Sitemap only has real entries when SITE_URL is set
    if (process.env.SITE_URL !== "https://codereviewtrends.com") {
      test.skip();
    }
    const res = await request.get("/sitemap.xml");
    const body = await res.text();
    expect(body).toMatch(/\/compare\/[a-z]+-vs-[a-z]+/);
  });
});
