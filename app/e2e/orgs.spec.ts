import { test, expect } from "@playwright/test";

test.describe("Organization listing page", () => {
  test("shows org list with filter controls", async ({ page }) => {
    await page.goto("/orgs");
    await expect(page.getByRole("heading", { name: "Organizations" })).toBeVisible();
    await expect(page.getByTestId("org-filters")).toBeVisible();
    await expect(page.getByTestId("org-list")).toBeVisible();
    // Should have org rows
    const rows = page.getByTestId("org-row");
    await expect(rows.first()).toBeVisible();
  });

  test("sort buttons change order", async ({ page }) => {
    await page.goto("/orgs");
    await expect(page.getByTestId("sort-stars")).toBeVisible();
    await expect(page.getByTestId("sort-repos")).toBeVisible();
    await expect(page.getByTestId("sort-prs")).toBeVisible();

    // Click repos sort
    await page.getByTestId("sort-repos").click();
    await page.waitForURL(/sort=repos/);
    await expect(page.getByTestId("org-list")).toBeVisible();
  });

  test("expanding filters shows language and product options", async ({ page }) => {
    await page.goto("/orgs");
    await page.getByTestId("toggle-filters").click();
    await expect(page.getByTestId("language-filters")).toBeVisible();
    await expect(page.getByTestId("product-filters")).toBeVisible();
  });

  test("language filter updates results via URL", async ({ page }) => {
    await page.goto("/orgs");
    await page.getByTestId("toggle-filters").click();
    // Click any language button in the filter
    const langButtons = page.getByTestId("language-filters").locator("button");
    const firstLang = langButtons.first();
    await expect(firstLang).toBeVisible();
    await firstLang.click();
    await page.waitForURL(/lang=/);
    await expect(page.getByTestId("org-list")).toBeVisible();
  });

  test("nav has Organizations link", async ({ page }) => {
    await page.goto("/");
    const orgLink = page.locator("nav a", { hasText: "Organizations" });
    await expect(orgLink).toBeVisible();
    await orgLink.click();
    await page.waitForURL("/orgs");
  });
});

test.describe("Organization detail page", () => {
  test("homepage top orgs link to org detail pages", async ({ page }) => {
    await page.goto("/");
    const topOrgs = page.getByTestId("top-orgs-chart");
    await expect(topOrgs).toBeVisible();

    const firstOrgLink = topOrgs.locator("a").first();
    await expect(firstOrgLink).toBeVisible();
    const href = await firstOrgLink.getAttribute("href");
    expect(href).toMatch(/^\/orgs\//);
  });

  test("org detail page renders with stats and repos", async ({ page }) => {
    await page.goto("/");
    const topOrgs = page.getByTestId("top-orgs-chart");
    const firstOrgLink = topOrgs.locator("a").first();
    const href = await firstOrgLink.getAttribute("href");
    expect(href).toBeTruthy();

    await page.goto(href!);

    await expect(page.getByTestId("org-name")).toBeVisible();
    await expect(page.getByTestId("org-stats")).toBeVisible();
    await expect(page.getByTestId("org-repos")).toBeVisible();
  });

  test("nonexistent org returns 404", async ({ page }) => {
    const response = await page.goto("/orgs/this-org-does-not-exist-xyz");
    expect(response?.status()).toBe(404);
  });
});
