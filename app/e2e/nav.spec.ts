import { test, expect } from "@playwright/test";

test.describe("Navigation active state", () => {
  test("Overview link is active on home page", async ({ page }) => {
    await page.goto("/");
    const overviewLink = page.getByRole("link", { name: "Overview" });
    await expect(overviewLink).toHaveAttribute("aria-current", "page");
    await expect(overviewLink).toHaveClass(/font-medium/);
    await expect(overviewLink).toHaveClass(/text-nav-link-active/);
  });

  test("Bots link is active on bots page", async ({ page }) => {
    await page.goto("/bots");
    const botsLink = page.getByRole("link", { name: "Bots" });
    await expect(botsLink).toHaveAttribute("aria-current", "page");
    await expect(botsLink).toHaveClass(/font-medium/);

    // Overview should not be active
    const overviewLink = page.getByRole("link", { name: "Overview" });
    await expect(overviewLink).not.toHaveAttribute("aria-current", "page");
  });

  test("Bots link stays active on bot detail sub-page", async ({ page }) => {
    await page.goto("/bots/coderabbitai");
    const botsLink = page.getByRole("link", { name: "Bots" });
    await expect(botsLink).toHaveAttribute("aria-current", "page");
    await expect(botsLink).toHaveClass(/font-medium/);
  });

  test("Compare link is active on compare page", async ({ page }) => {
    await page.goto("/compare");
    const compareLink = page.getByRole("link", { name: "Compare" });
    await expect(compareLink).toHaveAttribute("aria-current", "page");
    await expect(compareLink).toHaveClass(/font-medium/);
  });

  test("inactive links do not have aria-current", async ({ page }) => {
    await page.goto("/");
    const botsLink = page.getByRole("link", { name: "Bots" });
    await expect(botsLink).not.toHaveAttribute("aria-current", "page");
    const compareLink = page.getByRole("link", { name: "Compare" });
    await expect(compareLink).not.toHaveAttribute("aria-current", "page");
  });
});

test.describe("Navigation on mobile viewport", () => {
  test("all nav links are accessible on 375px viewport", async ({ page }) => {
    // Set mobile viewport (iPhone SE dimensions)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // Get the nav element to scope queries
    const nav = page.locator("nav");

    // Verify all nav links are present and accessible
    const overviewLink = nav.getByRole("link", { name: "Overview" });
    await expect(overviewLink).toBeVisible();

    const botsLink = nav.getByRole("link", { name: "Bots" });
    await expect(botsLink).toBeVisible();

    const compareLink = nav.getByRole("link", { name: "Compare" });
    await expect(compareLink).toBeVisible();

    const aboutLink = nav.getByRole("link", { name: "About" });
    await expect(aboutLink).toBeVisible();

    const statusLink = nav.getByRole("link", { name: "Status" });
    await expect(statusLink).toBeVisible();

    const githubLink = nav.getByRole("link", { name: "GitHub" });
    await expect(githubLink).toBeVisible();

    // Verify theme toggle is accessible
    const themeToggle = nav.getByTestId("theme-toggle");
    await expect(themeToggle).toBeVisible();

    // Verify we can click on the theme toggle buttons
    const lightTheme = nav.getByTestId("theme-light");
    await expect(lightTheme).toBeVisible();
    await lightTheme.click();

    const darkTheme = nav.getByTestId("theme-dark");
    await expect(darkTheme).toBeVisible();
    await darkTheme.click();

    const systemTheme = nav.getByTestId("theme-system");
    await expect(systemTheme).toBeVisible();
  });

  test("no horizontal page overflow on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // Check that the body doesn't have horizontal scroll
    const hasHorizontalScroll = await page.evaluate(() => {
      return document.body.scrollWidth > document.body.clientWidth;
    });
    expect(hasHorizontalScroll).toBe(false);
  });

  test("navigation links work on mobile", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // Get the nav element to scope queries
    const nav = page.locator("nav");

    // Click on Bots link
    const botsLink = nav.getByRole("link", { name: "Bots" });
    await botsLink.click();
    await expect(page).toHaveURL("/bots");

    // Click on Compare link
    const compareLink = nav.getByRole("link", { name: "Compare" });
    await compareLink.click();
    await expect(page).toHaveURL("/compare");

    // Click on About link
    const aboutLink = nav.getByRole("link", { name: "About" });
    await aboutLink.click();
    await expect(page).toHaveURL("/about");

    // Click on Overview link
    const overviewLink = nav.getByRole("link", { name: "Overview" });
    await overviewLink.click();
    await expect(page).toHaveURL("/");
  });
});
