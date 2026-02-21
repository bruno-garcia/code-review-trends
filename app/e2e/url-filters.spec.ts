import { test, expect, type Page } from "@playwright/test";

/**
 * Tests for URL-based filter stickiness across the site.
 * Verifies that products, time range, chart toggles, table sorts,
 * and anchors are all shareable via URL and persist across navigation.
 */

/** Expand the filter picker */
async function expandPicker(page: Page) {
  const expandBtn = page.getByLabel("Expand filter");
  if (await expandBtn.isVisible()) {
    await expandBtn.click();
    await expect(page.getByLabel("Collapse filter")).toBeVisible();
  }
}

// ---------------------------------------------------------------------------
// Products in URL
// ---------------------------------------------------------------------------

test.describe("Products in URL", () => {
  test("selecting products on /products writes ?products= to URL", async ({
    page,
  }) => {
    await page.goto("/products");
    await expandPicker(page);

    // Deselect all, then select one specific product
    await page.getByTestId("filter-deselect-all").click();
    await page
      .getByTestId("product-filter-bar")
      .getByRole("button", { name: /coderabbit/i })
      .click();

    await expect(page).toHaveURL(/products=coderabbit/);
  });

  test("default selection keeps URL clean (no ?products=)", async ({
    page,
  }) => {
    await page.goto("/products");
    const url = new URL(page.url());
    expect(url.searchParams.has("products")).toBe(false);
  });

  test("resetting to top 10 removes ?products= from URL", async ({
    page,
  }) => {
    await page.goto("/products?products=coderabbit,copilot");
    await expect(page).toHaveURL(/products=/);

    await expandPicker(page);
    await page.getByTestId("filter-reset").click();

    // Wait for URL sync — top 10 is the default, so ?products= is removed
    await page.waitForTimeout(300);
    const url = new URL(page.url());
    expect(url.searchParams.has("products")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Time range in URL
// ---------------------------------------------------------------------------

test.describe("Time range in URL", () => {
  test("changing time range updates URL", async ({ page }) => {
    await page.goto("/products");
    await page.getByTestId("time-range-6m").click();
    await expect(page).toHaveURL(/range=6m/);
  });

  test("selecting All Time removes ?range= from URL", async ({ page }) => {
    await page.goto("/products?range=6m");
    await page.getByTestId("time-range-all").click();
    await page.waitForURL((url) => !url.search.includes("range="));
    const url = new URL(page.url());
    expect(url.searchParams.has("range")).toBe(false);
  });

  test("time range is restored from URL on load", async ({ page }) => {
    await page.goto("/products?range=3m");
    await expect(page.getByTestId("time-range-3m")).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await expect(page.getByTestId("time-range-all")).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });
});

// ---------------------------------------------------------------------------
// Cross-page navigation preserves global filters
// ---------------------------------------------------------------------------

test.describe("Cross-page filter stickiness", () => {
  test("Products → Compare preserves products + range", async ({ page }) => {
    await page.goto("/products?products=coderabbit,copilot&range=6m");
    await expect(
      page.getByTestId("product-filter-bar").getByText(/2 of \d+ products/),
    ).toBeVisible();

    // Click Compare in nav
    const nav = page.locator("nav");
    await nav.getByRole("link", { name: "Compare", exact: true }).click();

    // Verify on Compare page with params preserved
    await expect(page).toHaveURL(/\/compare/);
    await expect(page).toHaveURL(/products=coderabbit%2Ccopilot|products=coderabbit,copilot/);
    await expect(page).toHaveURL(/range=6m/);

    // Data should be filtered
    await expect(
      page.getByTestId("compare-table").locator("tbody tr"),
    ).toHaveCount(2);
  });

  test("Compare → Orgs preserves products + range", async ({ page }) => {
    await page.goto("/compare?products=coderabbit,copilot&range=6m");

    const nav = page.locator("nav");
    await Promise.all([
      page.waitForURL(/\/orgs/),
      nav.getByRole("link", { name: "Orgs", exact: true }).click(),
    ]);

    await expect(page).toHaveURL(/products=coderabbit%2Ccopilot|products=coderabbit,copilot/);
    await expect(page).toHaveURL(/range=6m/);

    // Orgs page should show filtered results
    await expect(
      page.getByTestId("product-filter-bar").getByText(/2 of \d+ products/),
    ).toBeVisible();
  });

  test("Orgs → Products preserves products + range", async ({ page }) => {
    await page.goto("/orgs?products=coderabbit,copilot&range=6m");

    const nav = page.locator("nav");
    await nav.getByRole("link", { name: "Products", exact: true }).click();

    await expect(page).toHaveURL(/\/products/);
    await expect(page).toHaveURL(/products=coderabbit%2Ccopilot|products=coderabbit,copilot/);
    await expect(page).toHaveURL(/range=6m/);

    await expect(
      page.getByTestId("product-filter-bar").getByText(/2 of \d+ products/),
    ).toBeVisible();
  });

  test("full journey: bots → compare → status → bots keeps selection", async ({
    page,
  }) => {
    // Start on Products with custom selection
    await page.goto("/products?products=coderabbit,copilot,sentry&range=3m");
    await expect(
      page.getByTestId("product-filter-bar").getByText(/3 of \d+ products/),
    ).toBeVisible();

    const nav = page.locator("nav");

    // → Compare
    await nav.getByRole("link", { name: "Compare", exact: true }).click();
    await expect(page).toHaveURL(/\/compare/);
    await expect(
      page.getByTestId("compare-table").locator("tbody tr"),
    ).toHaveCount(3);

    // → Status (non-filter page — no filter bar)
    await nav.getByRole("link", { name: "Status", exact: true }).click();
    await expect(page).toHaveURL("/status");

    // → Back to Products — selection should survive the detour through Status
    await nav.getByRole("link", { name: "Products", exact: true }).click();
    await expect(page).toHaveURL(/\/products/);
    await expect(page).toHaveURL(/products=/);
    await expect(page).toHaveURL(/range=3m/);

    await expect(
      page.getByTestId("product-filter-bar").getByText(/3 of \d+ products/),
    ).toBeVisible();
  });

  test("full journey: orgs → overview → compare keeps selection", async ({
    page,
  }) => {
    await page.goto("/orgs?products=coderabbit,copilot");
    await expect(
      page.getByTestId("product-filter-bar").getByText(/2 of \d+ products/),
    ).toBeVisible();

    const nav = page.locator("nav");

    // → Overview (non-filter page)
    await nav.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page).toHaveURL("/");

    // → Compare — selection should survive
    await nav.getByRole("link", { name: "Compare", exact: true }).click();
    await expect(page).toHaveURL(/\/compare/);
    await expect(page).toHaveURL(/products=/);

    await expect(
      page.getByTestId("compare-table").locator("tbody tr"),
    ).toHaveCount(2);
  });

  test("non-filter pages get clean URLs", async ({ page }) => {
    await page.goto("/products?products=coderabbit,copilot&range=6m");

    const nav = page.locator("nav");

    // Status link should be clean
    const statusHref = await nav
      .getByRole("link", { name: "Status", exact: true })
      .getAttribute("href");
    expect(statusHref).toBe("/status");

    // About link should be clean
    const aboutHref = await nav
      .getByRole("link", { name: "About", exact: true })
      .getAttribute("href");
    expect(aboutHref).toBe("/about");

    // Overview link should be clean
    const overviewHref = await nav
      .getByRole("link", { name: "Overview", exact: true })
      .getAttribute("href");
    expect(overviewHref).toBe("/");
  });
});

// ---------------------------------------------------------------------------
// Chart toggle URL state
// ---------------------------------------------------------------------------

test.describe("Chart toggles in URL", () => {
  test("AI share toggle writes ?ai_share= to URL", async ({ page }) => {
    await page.goto("/");
    const section = page.getByTestId("ai-share-section");
    await section.getByTestId("toggle-comments").click();

    await page.waitForTimeout(200);
    expect(page.url()).toContain("ai_share=comments");
  });

  test("volume toggle writes ?volume= to URL", async ({ page }) => {
    await page.goto("/");
    const section = page.getByTestId("total-volume-section");
    await section.getByTestId("toggle-comments").click();

    await page.waitForTimeout(200);
    expect(page.url()).toContain("volume=comments");
  });

  test("AI share toggle restores from URL on load", async ({ page }) => {
    await page.goto("/?ai_share=comments");
    const section = page.getByTestId("ai-share-section");
    await expect(
      section.getByTestId("toggle-comments"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      section.getByTestId("toggle-reviews"),
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("volume toggle restores from URL on load", async ({ page }) => {
    await page.goto("/?volume=comments");
    const section = page.getByTestId("total-volume-section");
    await expect(
      section.getByTestId("toggle-comments"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      section.getByTestId("toggle-reviews"),
    ).toHaveAttribute("aria-pressed", "false");
  });

  test("both chart toggles in one URL", async ({ page }) => {
    await page.goto("/?ai_share=comments&volume=comments");
    const aiSection = page.getByTestId("ai-share-section");
    const volSection = page.getByTestId("total-volume-section");

    await expect(
      aiSection.getByTestId("toggle-comments"),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      volSection.getByTestId("toggle-comments"),
    ).toHaveAttribute("aria-pressed", "true");
  });

  test("bot detail activity toggle writes ?activity= to URL", async ({
    page,
  }) => {
    await page.goto("/products/coderabbit");
    const section = page.getByTestId("bot-activity-chart");
    await section.getByTestId("toggle-repos").click();

    await page.waitForTimeout(200);
    expect(page.url()).toContain("activity=repos");
  });

  test("default toggle values keep URL clean", async ({ page }) => {
    await page.goto("/");
    // Default is "reviews" — URL should not have ai_share or volume
    const url = new URL(page.url());
    expect(url.searchParams.has("ai_share")).toBe(false);
    expect(url.searchParams.has("volume")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Table sort URL state
// ---------------------------------------------------------------------------

test.describe("Table sort in URL", () => {
  test("compare table sort writes ?sort= and ?dir= to URL", async ({
    page,
  }) => {
    await page.goto("/compare");
    const table = page.getByTestId("compare-table");

    // Click "Total Reviews" column header
    await table.getByRole("button", { name: "Total Reviews" }).click();
    await page.waitForTimeout(200);
    expect(page.url()).toContain("sort=total_reviews");

    // Click again to flip direction
    await table.getByRole("button", { name: "Total Reviews" }).click();
    await page.waitForTimeout(200);
    expect(page.url()).toContain("dir=asc");
  });

  test("compare table sort restores from URL on load", async ({ page }) => {
    await page.goto("/compare?sort=total_reviews&dir=asc");
    const table = page.getByTestId("compare-table");

    // The "Total Reviews" header should show the sort indicator
    const header = table.getByRole("button", { name: /Total Reviews/ });
    await expect(header).toContainText("↑");
  });


});

// ---------------------------------------------------------------------------
// Hash anchors
// ---------------------------------------------------------------------------

test.describe("Hash anchors", () => {
  test("anchor hash preserved alongside query params", async ({ page }) => {
    await page.goto(
      "/compare?products=coderabbit,copilot&range=6m#sentiment",
    );

    const url = new URL(page.url());
    expect(url.hash).toBe("#sentiment");
    expect(url.searchParams.get("products")).toContain("coderabbit");
    expect(url.searchParams.get("range")).toBe("6m");
  });

  test("changing sort preserves hash", async ({ page }) => {
    await page.goto("/compare#detailed");

    const table = page.getByTestId("compare-table");
    await table
      .getByRole("button", { name: "Total Reviews" })
      .click();

    await page.waitForTimeout(200);
    const url = new URL(page.url());
    expect(url.hash).toBe("#detailed");
    expect(url.searchParams.get("sort")).toBe("total_reviews");
  });
});

// ---------------------------------------------------------------------------
// Combined: full shareable URL
// ---------------------------------------------------------------------------

test.describe("Full shareable URL", () => {
  test("complete URL with all params renders exact view", async ({
    page,
  }) => {
    await page.goto(
      "/compare?products=coderabbit,copilot&range=6m&sort=total_reviews&dir=asc",
    );

    // Products: exactly 2
    await expect(
      page.getByTestId("product-filter-bar").getByText(/2 of \d+ products/),
    ).toBeVisible();
    await expect(
      page.getByTestId("compare-table").locator("tbody tr"),
    ).toHaveCount(2);

    // Range: 6M selected
    await expect(page.getByTestId("time-range-6m")).toHaveAttribute(
      "aria-checked",
      "true",
    );

    // Sort: Total Reviews ascending
    const header = page
      .getByTestId("compare-table")
      .getByRole("button", { name: /Total Reviews/ });
    await expect(header).toContainText("↑");
  });

  test("homepage with chart toggles renders exact view", async ({
    page,
  }) => {
    await page.goto("/?ai_share=comments&volume=comments");

    await expect(
      page
        .getByTestId("ai-share-section")
        .getByTestId("toggle-comments"),
    ).toHaveAttribute("aria-pressed", "true");

    await expect(
      page
        .getByTestId("total-volume-section")
        .getByTestId("toggle-comments"),
    ).toHaveAttribute("aria-pressed", "true");
  });
});
