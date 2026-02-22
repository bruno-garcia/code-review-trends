import { test, expect } from "@playwright/test";

test.describe("Compare pair pages", () => {
  test("pair page renders with both product names", async ({ page }) => {
    await page.goto("/compare/coderabbit-vs-copilot");
    await expect(page.getByTestId("compare-pair")).toBeVisible();
    const title = await page.title();
    expect(title).toMatch(/CodeRabbit/i);
    expect(title).toMatch(/Copilot/i);
  });

  test("invalid pair returns 404", async ({ page }) => {
    const res = await page.goto("/compare/fake-vs-nonexistent");
    expect(res?.status()).toBe(404);
  });

  test("sitemap includes pair URLs", async ({ request }) => {
    // Sitemap only has real entries when SITE_URL is set
    if (process.env.SITE_URL !== "https://codereviewtrends.com") {
      test.skip();
    }
    const res = await request.get("/sitemap.xml");
    const body = await res.text();
    expect(body).toMatch(/\/compare\/[a-z]+-vs-[a-z]+/);
  });
});
