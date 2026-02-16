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
