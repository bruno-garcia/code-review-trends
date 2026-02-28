import { test, expect } from "@playwright/test";

test.describe("Navigation active state", () => {
  test("Overview link is active on home page", async ({ page }) => {
    await page.goto("/");
    const overviewLink = page.getByRole("link", { name: "Overview" });
    await expect(overviewLink).toHaveAttribute("aria-current", "page");
    await expect(overviewLink).toHaveClass(/font-medium/);
    await expect(overviewLink).toHaveClass(/text-nav-link-active/);
  });

  test("Products link is active on products page", async ({ page }) => {
    await page.goto("/products");
    const productsLink = page.getByRole("link", { name: "Products", exact: true });
    await expect(productsLink).toHaveAttribute("aria-current", "page");
    await expect(productsLink).toHaveClass(/font-medium/);

    // Overview should not be active
    const overviewLink = page.getByRole("link", { name: "Overview" });
    await expect(overviewLink).not.toHaveAttribute("aria-current", "page");
  });

  test("Products link stays active on product detail sub-page", async ({ page }) => {
    await page.goto("/products/coderabbitai");
    const productsLink = page.getByRole("link", { name: "Products", exact: true });
    await expect(productsLink).toHaveAttribute("aria-current", "page");
    await expect(productsLink).toHaveClass(/font-medium/);
  });

  test("Compare link is active on compare page", async ({ page }) => {
    await page.goto("/compare");
    const compareLink = page.getByRole("link", { name: "Compare" });
    await expect(compareLink).toHaveAttribute("aria-current", "page");
    await expect(compareLink).toHaveClass(/font-medium/);
  });

  test("inactive links do not have aria-current", async ({ page }) => {
    await page.goto("/");
    const productsLink = page.getByRole("link", { name: "Products", exact: true });
    await expect(productsLink).not.toHaveAttribute("aria-current", "page");
    const compareLink = page.getByRole("link", { name: "Compare" });
    await expect(compareLink).not.toHaveAttribute("aria-current", "page");
  });
});

test.describe("Navigation on mobile viewport", () => {
  test("hamburger menu opens and shows all nav links on 375px viewport", async ({ page }) => {
    // Set mobile viewport (iPhone SE dimensions)
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    // Desktop nav links should be hidden on mobile
    const desktopNav = page.locator("nav .hidden.sm\\:flex");
    await expect(desktopNav).toBeHidden();

    // Hamburger button should be visible
    const hamburger = page.getByTestId("mobile-nav-toggle");
    await expect(hamburger).toBeVisible();

    // Open the menu
    await hamburger.click();
    const menu = page.getByTestId("mobile-nav-menu");
    await expect(menu).toBeVisible();

    // Verify all nav links are present and accessible
    await expect(menu.getByRole("link", { name: "Overview" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Products", exact: true })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Compare" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Repos" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Orgs" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "Status" })).toBeVisible();
    await expect(menu.getByRole("link", { name: "About" })).toBeVisible();

    // Verify theme toggle is accessible
    const themeToggle = page.locator("nav").getByTestId("theme-toggle");
    await expect(themeToggle).toBeVisible();
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

  test("navigation links work on mobile via hamburger", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto("/");

    const hamburger = page.getByTestId("mobile-nav-toggle");

    // Open menu and click Products
    await hamburger.click();
    await page.getByTestId("mobile-nav-menu").getByRole("link", { name: "Products", exact: true }).click();
    await expect(page).toHaveURL("/products");

    // Menu should close after navigation, open again for Compare
    await hamburger.click();
    await page.getByTestId("mobile-nav-menu").getByRole("link", { name: "Compare" }).click();
    await expect(page).toHaveURL("/compare");

    // Open again for About
    await hamburger.click();
    await page.getByTestId("mobile-nav-menu").getByRole("link", { name: "About" }).click();
    await expect(page).toHaveURL("/about");

    // Open again for Overview
    await hamburger.click();
    await page.getByTestId("mobile-nav-menu").getByRole("link", { name: "Overview" }).click();
    await expect(page).toHaveURL("/");
  });
});
