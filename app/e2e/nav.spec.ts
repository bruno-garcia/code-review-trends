import { test, expect } from "@playwright/test";

test.describe("Navigation active state", () => {
  test("Dashboard link is active on home page", async ({ page }) => {
    await page.goto("/");
    const dashboardLink = page.getByRole("link", { name: "Dashboard" });
    await expect(dashboardLink).toHaveAttribute("aria-current", "page");
    await expect(dashboardLink).toHaveClass(/font-medium/);
    await expect(dashboardLink).toHaveClass(/text-nav-link-active/);
  });

  test("Bots link is active on bots page", async ({ page }) => {
    await page.goto("/bots");
    const botsLink = page.getByRole("link", { name: "Bots" });
    await expect(botsLink).toHaveAttribute("aria-current", "page");
    await expect(botsLink).toHaveClass(/font-medium/);

    // Dashboard should not be active
    const dashboardLink = page.getByRole("link", { name: "Dashboard" });
    await expect(dashboardLink).not.toHaveAttribute("aria-current", "page");
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
