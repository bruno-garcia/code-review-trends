import { test, expect } from "@playwright/test";

test.describe("OG Images", () => {
  const ogRoutes = [
    { path: "/opengraph-image", label: "homepage" },
    { path: "/compare/opengraph-image", label: "compare" },
    { path: "/orgs/opengraph-image", label: "orgs" },
  ];

  for (const { path, label } of ogRoutes) {
    test(`${label} OG image returns valid PNG`, async ({ request }) => {
      const res = await request.get(path);
      expect(res.status()).toBe(200);
      expect(res.headers()["content-type"]).toBe("image/png");
      const body = await res.body();
      // Sanity check: a real PNG is at least a few KB
      expect(body.length).toBeGreaterThan(5_000);
    });
  }

  test("per-product OG image returns valid PNG", async ({ request }) => {
    // Use a product that always exists in the bots table (seeded by 002_bot_data.sql)
    const res = await request.get("/products/coderabbit/opengraph-image");
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const body = await res.body();
    expect(body.length).toBeGreaterThan(5_000);
  });

  test("compare pair OG image returns valid PNG", async ({ request }) => {
    const res = await request.get(
      "/compare/coderabbit-vs-copilot/opengraph-image",
    );
    expect(res.status()).toBe(200);
    expect(res.headers()["content-type"]).toBe("image/png");
    const body = await res.body();
    expect(body.length).toBeGreaterThan(5_000);
  });
});

test.describe("OG meta tags", () => {
  test("homepage has og:image meta tag", async ({ page }) => {
    await page.goto("/");
    const ogImage = page.locator('meta[property="og:image"]');
    await expect(ogImage).toHaveAttribute("content", /opengraph-image/);
  });

  test("homepage has twitter:card meta tag", async ({ page }) => {
    await page.goto("/");
    const card = page.locator('meta[name="twitter:card"]');
    await expect(card).toHaveAttribute("content", "summary_large_image");
  });

  test("homepage has canonical URL", async ({ page }) => {
    await page.goto("/");
    const canonical = page.locator('link[rel="canonical"]');
    await expect(canonical).toHaveAttribute(
      "href",
      /codereviewtrends\.com/,
    );
  });

  test("bot page has dynamic og:title with product name", async ({
    page,
  }) => {
    await page.goto("/products/coderabbit");
    // generateMetadata queries ClickHouse — verify the og:title includes the product name
    const ogTitle = page.locator('meta[property="og:title"]');
    await expect(ogTitle).toHaveAttribute("content", /CodeRabbit/);
  });
});

test.describe("SEO files", () => {
  test("sitemap.xml returns valid XML", async ({ request }) => {
    const res = await request.get("/sitemap.xml");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("<urlset");
    // Without SITE_URL=https://codereviewtrends.com, sitemap returns empty.
    // In CI/dev, just verify it's valid XML.
    if (process.env.SITE_URL === "https://codereviewtrends.com") {
      expect(body).toContain("codereviewtrends.com");
      expect(body).toContain("/products");
      expect(body).toContain("/compare");
      expect(body).toContain("/orgs");
      expect(body).toContain("/about");
    }
  });

  test("robots.txt returns valid response", async ({ request }) => {
    const res = await request.get("/robots.txt");
    expect(res.status()).toBe(200);
    const body = await res.text();
    expect(body).toContain("User-Agent: *");
    // Without SITE_URL=https://codereviewtrends.com, robots blocks all crawling (safe default).
    if (process.env.SITE_URL === "https://codereviewtrends.com") {
      expect(body).toContain("Allow: /");
      expect(body).toContain("Sitemap:");
    } else {
      expect(body).toContain("Disallow: /");
    }
  });
});
