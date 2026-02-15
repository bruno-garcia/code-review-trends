import { test, expect } from "@playwright/test";

test.describe("Version stamp", () => {
  test("shows commit SHA in footer", async ({ page }) => {
    await page.goto("/");
    const stamp = page.getByTestId("version-stamp");
    await expect(stamp).toBeVisible();
    // SHA should be a 7-char hex string (or "unknown" in edge cases)
    const text = await stamp.textContent();
    expect(text).toMatch(/^[a-f0-9]{7}$|^unknown$/);
  });

  test("version stamp is present on all pages", async ({ page }) => {
    for (const path of ["/", "/bots", "/compare"]) {
      await page.goto(path);
      await expect(page.getByTestId("version-stamp")).toBeVisible();
    }
  });

  test("clicking version stamp copies to clipboard", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/");
    const stamp = page.getByTestId("version-stamp");
    await stamp.click();
    await expect(page.getByTestId("version-copied")).toBeVisible();
  });
});
