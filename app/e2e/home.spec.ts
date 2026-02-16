import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test("has title and hero section", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/Code Review Trends/);
    await expect(page.getByTestId("hero")).toBeVisible();
    await expect(page.getByText("AI Code Review Trends")).toBeVisible();
  });

  test("shows AI share chart section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("ai-share-section")).toBeVisible();
    await expect(
      page.getByText("AI Share of Code Reviews"),
    ).toBeVisible();
  });

  test("AI share chart toggles between PR Reviews, Review Comments, and PR Comments", async ({
    page,
  }) => {
    await page.goto("/");
    const toggle = page.getByTestId("ai-share-toggle");
    await expect(toggle).toBeVisible();

    const reviewsBtn = page.getByTestId("toggle-reviews");
    const commentsBtn = page.getByTestId("toggle-comments");
    const prCommentsBtn = page.getByTestId("toggle-pr_comments");
    await expect(reviewsBtn).toHaveAttribute("aria-pressed", "true");
    await expect(commentsBtn).toHaveAttribute("aria-pressed", "false");
    await expect(prCommentsBtn).toHaveAttribute("aria-pressed", "false");

    await commentsBtn.click();
    await expect(commentsBtn).toHaveAttribute("aria-pressed", "true");
    await expect(reviewsBtn).toHaveAttribute("aria-pressed", "false");

    await prCommentsBtn.click();
    await expect(prCommentsBtn).toHaveAttribute("aria-pressed", "true");
    await expect(commentsBtn).toHaveAttribute("aria-pressed", "false");

    await reviewsBtn.click();
    await expect(reviewsBtn).toHaveAttribute("aria-pressed", "true");
  });

  test("shows review volume chart section", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("volume-section")).toBeVisible();
  });

  test("shows leaderboard with enriched columns", async ({ page }) => {
    await page.goto("/");
    const table = page.getByTestId("leaderboard-table");
    await expect(table).toBeVisible();
    // Check enriched columns exist
    await expect(table.getByText("Orgs")).toBeVisible();
    await expect(table.getByText("Approval")).toBeVisible();
    await expect(table.getByText("Avg C/R")).toBeVisible();
    await expect(table.getByText("PR Comments")).toBeVisible();
    // Should have bot rows
    const rows = table.locator("tbody tr");
    await expect(rows).not.toHaveCount(0);
  });

  test("leaderboard has link to compare page", async ({ page }) => {
    await page.goto("/");
    const link = page.getByText("Full comparison →");
    await expect(link).toBeVisible();
    await link.click();
    await expect(page.getByTestId("compare-table")).toBeVisible();
  });

  test("shows top organizations and bot sentiment sections", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("top-orgs-section")).toBeVisible();
    await expect(page.getByTestId("top-orgs-chart")).toBeVisible();
    await expect(page.getByTestId("bot-sentiment-section")).toBeVisible();
    await expect(page.getByTestId("bot-reaction-leaderboard")).toBeVisible();
  });

  test("leaderboard bot names link to detail pages", async ({ page }) => {
    await page.goto("/");
    const table = page.getByTestId("leaderboard-table");
    const botLink = table.locator("tbody a").first();
    const href = await botLink.getAttribute("href");
    expect(href).toMatch(/^\/bots\//);
  });

  test("volume chart container stacks above leaderboard for tooltip visibility", async ({
    page,
  }) => {
    await page.goto("/");
    const volumeSection = page.getByTestId("volume-section");
    // The chart wrapper div is the direct parent of .recharts-responsive-container
    const chartWrapper = volumeSection.locator(
      "div:has(> .recharts-responsive-container)",
    );

    // The chart wrapper must create a stacking context above following content
    const styles = await chartWrapper.evaluate((el) => {
      const cs = window.getComputedStyle(el);
      return { zIndex: cs.zIndex, position: cs.position };
    });
    expect(Number(styles.zIndex)).toBeGreaterThanOrEqual(10);
    expect(styles.position).toBe("relative");
  });

  test("volume chart tooltip appears on hover and is not obscured", async ({
    page,
  }) => {
    await page.goto("/");
    const volumeSection = page.getByTestId("volume-section");
    // Scroll the chart into view first — it's below the fold
    await volumeSection.scrollIntoViewIfNeeded();

    const chartWrapper = volumeSection.locator(".recharts-wrapper").first();
    await expect(chartWrapper).toBeVisible();

    // Hover across the chart area to trigger the Recharts tooltip
    const box = await chartWrapper.boundingBox();
    expect(box).not.toBeNull();

    // Perform a smooth mouse movement across the chart to trigger the tooltip.
    // Using steps lets Playwright interpolate intermediate mousemove events
    // without arbitrary waitForTimeout calls.
    await page.mouse.move(
      box!.x + box!.width * 0.1,
      box!.y + box!.height * 0.3,
    );
    await page.mouse.move(
      box!.x + box!.width * 0.9,
      box!.y + box!.height * 0.3,
      { steps: 20 },
    );

    // The Recharts tooltip wrapper should become visible
    const tooltip = volumeSection.locator(".recharts-tooltip-wrapper");
    await expect(tooltip).toHaveCSS("visibility", "visible", { timeout: 5000 });

    // Verify the tooltip has content and is rendered with non-zero dimensions
    const tooltipBox = await tooltip.boundingBox();
    expect(tooltipBox).not.toBeNull();
    expect(tooltipBox!.height).toBeGreaterThan(0);
  });
});
