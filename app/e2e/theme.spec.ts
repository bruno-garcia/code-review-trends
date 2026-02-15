import { test, expect } from "@playwright/test";

test.describe("Theme toggle", () => {
  test("shows theme toggle with system selected by default", async ({ page }) => {
    await page.goto("/");
    const toggle = page.getByTestId("theme-toggle");
    await expect(toggle).toBeVisible();
    await expect(page.getByTestId("theme-system")).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("theme-light")).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByTestId("theme-dark")).toHaveAttribute("aria-pressed", "false");
  });

  test("clicking dark adds dark class to html", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("theme-dark").click();
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain("dark");
    const stored = await page.evaluate(() => localStorage.getItem("theme"));
    expect(stored).toBe("dark");
  });

  test("clicking light removes dark class from html", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("theme-light").click();
    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).not.toContain("dark");
    const stored = await page.evaluate(() => localStorage.getItem("theme"));
    expect(stored).toBe("light");
  });

  test("switching between light and dark changes background color", async ({ page }) => {
    await page.goto("/");

    await page.getByTestId("theme-light").click();
    await page.waitForTimeout(100);
    const lightBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    await page.getByTestId("theme-dark").click();
    await page.waitForTimeout(100);
    const darkBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);

    // Light should be white, dark should be a dark color — they must differ
    expect(lightBg).not.toBe(darkBg);
    expect(lightBg).toBe("rgb(255, 255, 255)");
  });

  test("CSS variables update when theme changes", async ({ page }) => {
    await page.goto("/");

    // Light mode
    await page.getByTestId("theme-light").click();
    await page.waitForTimeout(100);
    const lightBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--theme-bg").trim(),
    );

    // Dark mode
    await page.getByTestId("theme-dark").click();
    await page.waitForTimeout(100);
    const darkBg = await page.evaluate(() =>
      getComputedStyle(document.documentElement).getPropertyValue("--theme-bg").trim(),
    );

    expect(lightBg).not.toBe(darkBg);
  });

  test("theme persists across page navigations", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("theme-dark").click();
    await page.waitForTimeout(100);

    // Navigate to another page via client-side navigation
    await page.getByRole("link", { name: "Bots" }).click();
    await page.waitForURL("**/bots");

    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain("dark");
    await expect(page.getByTestId("theme-dark")).toHaveAttribute("aria-pressed", "true");
  });

  test("theme persists across full page loads", async ({ page }) => {
    await page.goto("/");
    await page.getByTestId("theme-dark").click();
    await page.waitForTimeout(100);

    // Full page reload
    await page.goto("/bots");
    await page.waitForTimeout(200);

    const htmlClass = await page.evaluate(() => document.documentElement.className);
    expect(htmlClass).toContain("dark");
    await expect(page.getByTestId("theme-dark")).toHaveAttribute("aria-pressed", "true");
  });

  test("system mode follows prefers-color-scheme", async ({ page }) => {
    // Emulate dark color scheme
    await page.emulateMedia({ colorScheme: "dark" });
    await page.goto("/");

    // System should be default and should resolve to dark
    await expect(page.getByTestId("theme-system")).toHaveAttribute("aria-pressed", "true");
    const darkHtml = await page.evaluate(() => document.documentElement.className);
    expect(darkHtml).toContain("dark");

    // Switch system to light
    await page.emulateMedia({ colorScheme: "light" });
    await page.waitForTimeout(200);
    const lightHtml = await page.evaluate(() => document.documentElement.className);
    expect(lightHtml).not.toContain("dark");
  });
});
