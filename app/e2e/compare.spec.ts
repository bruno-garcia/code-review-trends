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
    await expect(table.getByText("PR Comments", { exact: true })).toBeVisible();
    await expect(table.getByText("Approval Rate")).toBeVisible();
    await expect(table.getByText("Reviews/Org")).toBeVisible();
    await expect(table.getByText("Comments/Repo")).toBeVisible();

    // Assert that at least one product has non-zero enriched reaction stats
    const rows = table.locator("tbody tr");
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    let foundNonZeroApproval = false;
    let foundNonZeroPRComments = false;

    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const cells = row.locator("td");
      
      // Get all cell values as text
      const cellTexts = await Promise.all(
        Array.from({ length: await cells.count() }).map((_, idx) => 
          cells.nth(idx).textContent()
        )
      );

      // Look for PR Comments and Approval Rate values
      // PR Comments is typically formatted as a number (e.g., "1,234")
      // Approval Rate is typically formatted as a percentage (e.g., "85%")
      for (const text of cellTexts) {
        if (text) {
          // Check for percentage values (approval rate)
          if (text.includes('%')) {
            const value = parseFloat(text.replace('%', ''));
            if (value > 0) {
              foundNonZeroApproval = true;
            }
          }
          // Check for numeric values that could be PR Comments
          const numericValue = parseInt(text.replace(/,/g, ''), 10);
          if (!isNaN(numericValue) && numericValue > 100) {
            // Use a threshold to avoid confusing small numbers from other columns
            foundNonZeroPRComments = true;
          }
        }
      }

      if (foundNonZeroApproval && foundNonZeroPRComments) {
        break;
      }
    }

    expect(foundNonZeroApproval).toBeTruthy();
    expect(foundNonZeroPRComments).toBeTruthy();
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

  test("shows comments per PR chart", async ({ page }) => {
    await page.goto("/compare");
    await expect(page.getByTestId("comments-per-pr-section")).toBeVisible();
    await expect(page.getByTestId("comments-per-pr-chart")).toBeVisible();
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
