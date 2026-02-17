import { test, expect } from "@playwright/test";

test.describe("Organization listing page", () => {
  test("shows org page with filter controls", async ({ page }) => {
    await page.goto("/orgs");
    await expect(page.getByRole("heading", { name: "Organizations" })).toBeVisible();
    await expect(page.getByTestId("org-filters")).toBeVisible();
    await expect(page.getByTestId("org-list")).toBeVisible();
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
    const orgLink = page.locator("nav a", { hasText: "Orgs" });
    await expect(orgLink).toBeVisible();
    await orgLink.click();
    await page.waitForURL("/orgs");
  });

  test("nonexistent org returns 404", async ({ page }) => {
    const response = await page.goto("/orgs/this-org-does-not-exist-xyz");
    expect(response?.status()).toBe(404);
  });
});
