import { test, expect } from "@playwright/test";

test.describe("Compare page", () => {
  test("shows radar chart section", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByTestId("radar-section")).toBeVisible();
    await expect(page.getByText("Radar Overview")).toBeVisible();
  });

  test("shows detailed comparison table with all metrics", async ({ page }) => {
    await page.goto("/compare");
    const table = page.getByTestId("compare-table");
    await expect(table).toBeVisible();
    // Check key column headers exist
    await expect(table.getByText("Total Reviews")).toBeVisible();
    await expect(table.getByText("Organizations")).toBeVisible();
    await expect(table.getByText("Avg Comments/Review")).toBeVisible();
    await expect(table.getByText("Approval Rate")).toBeVisible();
    await expect(table.getByText("Reviews/Org")).toBeVisible();
    await expect(table.getByText("Comments/Repo")).toBeVisible();
  });

  test("table is sortable by clicking column headers", async ({ page }) => {
    await page.goto("/compare");
    const table = page.getByTestId("compare-table");
    // Default sort by Total Reviews — first row should have ★
    const firstRow = table.locator("tbody tr").first();
    await expect(firstRow.locator("text=★").first()).toBeVisible();

    // Click "Organizations" header to re-sort
    await table.getByRole('columnheader', { name: 'Organizations' }).getByRole('button').click();
    // After clicking, the sort indicator should appear on that column
    await expect(table.getByRole('columnheader', { name: 'Organizations' }).getByText('↓')).toBeVisible();
  });

  test("shows visual bar chart breakdowns", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByTestId("bar-charts-section")).toBeVisible();
    await expect(page.getByText("Visual Breakdowns")).toBeVisible();
  });

  test("bot names in table link to detail pages", async ({ page }) => {
    await page.goto("/compare");
    const botLink = page.getByTestId("compare-table").locator("tbody a").first();
    const href = await botLink.getAttribute("href");
    expect(href).toMatch(/^\/bots\//);
  });

  test("is reachable from nav", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Compare" }).click();
    await expect(page.getByTestId("compare-table")).toBeVisible();
  });
});
