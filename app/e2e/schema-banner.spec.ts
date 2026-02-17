import { test, expect } from "@playwright/test";

/**
 * Schema banner tests.
 *
 * When the DB schema version matches the app's expected version,
 * no banner should appear. When there's a mismatch, the banner shows.
 *
 * These tests run against the real ClickHouse instance (Docker/CI),
 * which should have the correct schema version recorded.
 */

test.describe("Schema banner", () => {
  test("no banner shown when schema version matches", async ({ page }) => {
    await page.goto("/");
    // The page should load normally
    await expect(page).toHaveTitle(/Code Review Trends/);
    // No schema banner should be visible
    await expect(page.getByTestId("schema-banner")).not.toBeVisible();
  });
});
