import { test, expect } from "@playwright/test";

test.describe("Compare page", () => {
  test("shows radar chart section", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByTestId("radar-section")).toBeVisible();
    await expect(page.getByText("Radar Overview")).toBeVisible();
  });

  test("shows comparison table with column headers", async ({ page }) => {
    await page.goto("/compare");
    const table = page.getByTestId("compare-table");
    await expect(table).toBeVisible();
    await expect(table.getByText("Reviews", { exact: true })).toBeVisible();
    await expect(table.getByText("Orgs", { exact: true })).toBeVisible();
    await expect(table.getByText("PR Cmts", { exact: true })).toBeVisible();
    await expect(table.getByText("👍 Rate")).toBeVisible();
  });

  test("table headers are clickable for sorting", async ({ page }) => {
    await page.goto("/compare");
    const table = page.getByTestId("compare-table");
    await expect(table).toBeVisible();
    // Click "Orgs" header to sort
    const orgHeader = table.getByRole('columnheader', { name: 'Orgs' });
    await expect(orgHeader).toBeVisible();
    await orgHeader.getByRole('button').click();
    await expect(orgHeader.getByText('↓')).toBeVisible();
  });

  test("shows visual bar chart breakdowns", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByTestId("bar-charts-section")).toBeVisible();
    await expect(page.getByText("Visual Breakdowns")).toBeVisible();
  });

  test("shows comments per PR chart", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByTestId("comments-per-pr-section")).toBeVisible();
    await expect(page.getByTestId("comments-per-pr-chart")).toBeVisible();
  });

  test("shows bot sentiment section", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByTestId("bot-sentiment-section")).toBeVisible();
    await expect(page.getByText("Bot Sentiment")).toBeVisible();
  });

  test("bot names in table link to detail pages", async ({ page }) => {
    await page.goto("/compare");
    const botLink = page.getByTestId("compare-table").locator("tbody a").first();
    const href = await botLink.getAttribute("href");
    expect(href).toMatch(/^\/products\//);
  });

  test("is reachable from nav", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: "Compare" }).click();
    await expect(page.getByTestId("compare-table")).toBeVisible();
  });
});
