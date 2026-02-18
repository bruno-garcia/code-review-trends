import { test, expect, Page } from "@playwright/test";

/** Get a computed CSS custom property value from the Sentry feedback host element. */
async function getSentryVar(page: Page, name: string): Promise<string> {
  return page.evaluate((prop) => {
    const host = document.getElementById("sentry-feedback");
    if (!host) return "";
    return getComputedStyle(host).getPropertyValue(prop).trim();
  }, name);
}

test.describe("Sentry feedback widget theme", () => {
  test.beforeEach(async ({ page }) => {
    // Clear saved theme so each test starts from "system" default
    await page.addInitScript(() => localStorage.removeItem("theme"));
    await page.goto("/");
    // Wait for the Sentry SDK to inject the feedback widget
    await expect(page.locator("#sentry-feedback")).toBeAttached({ timeout: 10_000 });
  });

  test("feedback widget is visible on page load", async ({ page }) => {
    const visible = await page.evaluate(() => {
      const host = document.querySelector("#sentry-feedback");
      if (!host?.shadowRoot) return false;
      const btn = host.shadowRoot.querySelector("button");
      if (!btn) return false;
      const rect = btn.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    });
    expect(visible).toBe(true);
  });

  test("uses light colors on light theme", async ({ page }) => {
    await page.getByTestId("theme-light").click();

    await expect(async () => {
      expect(await getSentryVar(page, "--background")).toBe("#ffffff");
      expect(await getSentryVar(page, "--foreground")).toBe("#2b2233");
    }).toPass();
  });

  test("uses dark colors on dark theme", async ({ page }) => {
    await page.getByTestId("theme-dark").click();

    await expect(async () => {
      expect(await getSentryVar(page, "--background")).toBe("#12121a");
      expect(await getSentryVar(page, "--foreground")).toBe("#ebe6ef");
    }).toPass();
  });

  test("toggles theme dynamically without losing the widget", async ({ page }) => {
    // Light
    await page.getByTestId("theme-light").click();
    await expect(async () => {
      expect(await getSentryVar(page, "--background")).toBe("#ffffff");
    }).toPass();

    // Dark
    await page.getByTestId("theme-dark").click();
    await expect(async () => {
      expect(await getSentryVar(page, "--background")).toBe("#12121a");
    }).toPass();

    // Back to light
    await page.getByTestId("theme-light").click();
    await expect(async () => {
      expect(await getSentryVar(page, "--background")).toBe("#ffffff");
    }).toPass();

    // Widget still visible after cycling
    await expect(page.locator("#sentry-feedback")).toBeAttached();
  });
});
