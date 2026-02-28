import { test, expect } from "@playwright/test";

test.describe("Organization listing page", () => {
  test("shows org page with filter controls", async ({ page }) => {
    await page.goto("/orgs");
    await expect(page.getByRole("heading", { name: "Organizations" })).toBeVisible();
    await expect(page.getByTestId("org-filters")).toBeVisible();
    await expect(page.getByTestId("org-list")).toBeVisible();
  });

  test("product filter returns orgs for that product", async ({ page }) => {
    // Regression: getOrgList with productIds crashed with double-WHERE SQL error.
    // This test exercises the product-filter code path (Phase 1 + Phase 2).
    const response = await page.goto("/orgs?products=sentry");
    expect(response?.status()).toBe(200);
    await expect(page.getByTestId("org-list")).toBeVisible();
    // With seed data, at least one org should appear for Sentry
    const orgRows = page.locator("[data-testid='org-list'] a[href^='/orgs/']");
    const count = await orgRows.count();
    expect(count).toBeGreaterThan(0);
  });

  test("sort buttons are present", async ({ page }) => {
    await page.goto("/orgs");
    await expect(page.getByTestId("sort-stars")).toBeVisible();
    await expect(page.getByTestId("sort-repos")).toBeVisible();
    await expect(page.getByTestId("sort-prs")).toBeVisible();

    await page.getByTestId("sort-repos").click();
    await page.waitForURL(/sort=repos/);
    await expect(page.getByTestId("org-list")).toBeVisible();
  });

  test("search box filters organizations", async ({ page }) => {
    await page.goto("/orgs");
    const search = page.getByTestId("org-search");
    await expect(search).toBeVisible();
    await search.fill("microsoft");
    await page.waitForURL(/q=microsoft/);
    await expect(page.getByTestId("org-list")).toBeVisible();
  });

  test("language filter chips are visible", async ({ page }) => {
    await page.goto("/orgs");
    await expect(page.getByTestId("language-filters")).toBeAttached();
  });

  test("nav has Orgs link", async ({ page }) => {
    await page.goto("/");
    // Scope to desktop nav to avoid matching the hidden mobile hamburger menu
    const desktopNav = page.locator("nav .hidden.sm\\:flex");
    const orgLink = desktopNav.locator("a", { hasText: "Orgs" });
    await expect(orgLink).toBeVisible();
    await orgLink.click();
    await page.waitForURL("/orgs");
  });

  test("nonexistent org returns 404", async ({ page }) => {
    const response = await page.goto("/orgs/this-org-does-not-exist-xyz");
    expect(response?.status()).toBe(404);
  });
});
