import { test, expect } from "@playwright/test";

test.describe("Organization page", () => {
  test("homepage top orgs link to org detail pages", async ({ page }) => {
    await page.goto("/");
    const topOrgs = page.getByTestId("top-orgs-chart");
    await expect(topOrgs).toBeVisible();

    // Grab the first org link
    const firstOrgLink = topOrgs.locator("a").first();
    await expect(firstOrgLink).toBeVisible();
    const href = await firstOrgLink.getAttribute("href");
    expect(href).toMatch(/^\/orgs\//);
  });

  test("org detail page renders with stats and repos", async ({ page }) => {
    // Navigate via homepage to find a real org
    await page.goto("/");
    const topOrgs = page.getByTestId("top-orgs-chart");
    const firstOrgLink = topOrgs.locator("a").first();
    const href = await firstOrgLink.getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto(href!);

    // Header
    await expect(page.getByTestId("org-name")).toBeVisible();

    // Stats
    await expect(page.getByTestId("org-stats")).toBeVisible();

    // Repos table
    await expect(page.getByTestId("org-repos")).toBeVisible();
  });

  test("nonexistent org returns 404", async ({ page }) => {
    const response = await page.goto("/orgs/this-org-does-not-exist-xyz");
    expect(response?.status()).toBe(404);
  });
});
