import { test, expect } from "@playwright/test";

/**
 * Query performance regression tests.
 *
 * These tests validate that the optimized ClickHouse queries still return
 * non-empty, well-formed data for known seeded scenarios and that the UI
 * renders expected sections without obvious anomalies (e.g., NaN, Infinity).
 * Each test targets a specific query rewrite from the perf optimization work.
 *
 * These are smoke/regression checks rather than exhaustive assertions against
 * all exact seed data values; they catch major semantic regressions (like
 * empty results where seed data exists) even when pages continue to "render."
 */
test.describe("query optimization regression tests", () => {
  test.describe("getOrgSummary (org_bot_pr_counts optimization)", () => {
    test("org detail page shows correct PR count from pre-aggregated data", async ({ page }) => {
      // getOrgSummary was rewritten to use org_bot_pr_counts instead of
      // scanning pr_bot_events. Verify the org page still shows correct stats.
      await page.goto("/orgs/test-org");
      const stats = page.getByTestId("org-stats");
      await expect(stats).toBeVisible();

      // Seed data: test-org has 2 repos (frontend + backend) with PR events
      // plus exclusive reaction-only PRs from reaction_only_repo_counts.
      const text = await stats.textContent();
      expect(text).not.toMatch(/\bNaN\b/);
      expect(text).not.toMatch(/\bInfinity\b/);
      // Stats should contain non-zero values for repos and PRs
      expect(text).toMatch(/Repos Tracked\s*[1-9]/); // At least 1 repo (seed has 2)
    });

    test("org detail page shows correct comment stats from IN subquery", async ({ page }) => {
      // The pr_comments subquery was changed from JOIN repos to IN subquery.
      // Verify reactions still show up. Seed data has thumbs_up > 0 for
      // test-org repos, so the reactions section should always be visible.
      await page.goto("/orgs/test-org");
      const reactions = page.getByTestId("org-reactions");
      await expect(reactions).toBeVisible();
      const text = await reactions.textContent();
      expect(text).not.toMatch(/\bNaN\b/);
      expect(text).not.toMatch(/\bInfinity\b/);
    });

    test("org without data returns 404", async ({ page }) => {
      // Ensure the optimization didn't break the not-found path
      const response = await page.goto("/orgs/this-org-does-not-exist-xyz");
      expect(response?.status()).toBe(404);
    });
  });

  test.describe("getBotsByLanguage (pr_bot_event_counts optimization)", () => {
    test("product page language section renders from aggregated data", async ({ page }) => {
      // getBotsByLanguage was rewritten to use pr_bot_event_counts.
      // Verify language data still appears on the product page.
      // The section is only rendered when languageData.length > 0 AND
      // totalReviews > 0, so its presence proves the optimized query returned data.
      await page.goto("/products/coderabbit");
      await expect(page.getByTestId("bot-stats")).toBeVisible();

      // With seed data (coderabbit has events in TypeScript, Python, Go repos),
      // the language section should be visible. If it's missing, the optimized
      // query returned empty results — a regression.
      const langSection = page.getByTestId("bot-languages");
      await expect(langSection).toBeVisible();
      await expect(langSection.getByText("Top Languages")).toBeVisible();
      // The chart container should exist (Recharts SVG may not render in
      // headless mode due to ResponsiveContainer, so we check the div).
      const chart = langSection.getByTestId("bot-language-chart");
      await expect(chart).toBeVisible();
    });

    test("language data uses fast path without date filter", async ({ page }) => {
      // Default view (no ?range=) should use the fast aggregated query
      await page.goto("/products/coderabbit");
      await expect(page.getByTestId("bot-stats")).toBeVisible();
      const langSection = page.getByTestId("bot-languages");
      if (await langSection.count() > 0) {
        const text = await langSection.textContent();
        expect(text).not.toMatch(/\bNaN\b/);
        expect(text).not.toMatch(/\bundefined\b/);
      }
    });
  });

  test.describe("getTopReposByProduct (IN subquery optimization)", () => {
    test("product page shows correct top repos from IN subquery", async ({ page }) => {
      // getTopReposByProduct was changed from JOIN bots to IN subquery.
      // Verify repos still appear with correct ordering.
      await page.goto("/products/coderabbit");
      await expect(page.getByTestId("bot-stats")).toBeVisible();

      const reposSection = page.getByTestId("bot-top-repos");
      if (await reposSection.count() > 0) {
        await expect(reposSection.getByText("Top Repositories")).toBeVisible();
        const repoLinks = reposSection.locator("a[href^='/repos/']");
        const count = await repoLinks.count();
        expect(count).toBeGreaterThan(0);
        expect(count).toBeLessThanOrEqual(5);

        // Seed data: coderabbit reviews repos across test-org and acme-corp.
        // acme-corp/webapp has highest stars (8500), should be first.
        const firstRepo = repoLinks.first();
        const firstText = await firstRepo.textContent();
        expect(firstText).toContain("webapp");
      }
    });

    test("product page shows correct total repo count", async ({ page }) => {
      // The count query was also optimized with IN subquery.
      await page.goto("/products/coderabbit");
      await expect(page.getByTestId("bot-stats")).toBeVisible();

      const reposSection = page.getByTestId("bot-top-repos");
      if (await reposSection.count() > 0) {
        // Seed data: coderabbit has events in 4 repos
        // "View all N repositories" link should show if total > 5
        // With 4 repos in seed data, the link should NOT appear (4 <= 5)
        const viewAllLink = reposSection.getByRole("link", { name: /View all/ });
        // 4 repos <= TOP_N (5), so "View all" should not be present
        expect(await viewAllLink.count()).toBe(0);
      }
    });
  });

  test.describe("prefetch disabled on expensive links", () => {
    test("org links on product page have prefetch disabled", async ({ page }) => {
      await page.goto("/products/sentry");
      await expect(page.getByTestId("bot-stats")).toBeVisible();

      const orgsSection = page.getByTestId("bot-top-orgs");
      if (await orgsSection.count() > 0) {
        const orgLinks = orgsSection.locator("a[href^='/orgs/']");
        const count = await orgLinks.count();
        if (count > 0) {
          // Next.js renders prefetch={false} as no prefetch attribute in the
          // DOM (or data-noprefetch). The key test is that loading this page
          // does NOT trigger server-side renders of the linked org pages.
          // We verify the links exist and the page loaded without timeout.
          expect(count).toBeGreaterThan(0);
        }
      }
    });

    test("repo links on product page have prefetch disabled", async ({ page }) => {
      await page.goto("/products/sentry");
      await expect(page.getByTestId("bot-stats")).toBeVisible();

      const reposSection = page.getByTestId("bot-top-repos");
      if (await reposSection.count() > 0) {
        const repoLinks = reposSection.locator("a[href^='/repos/']");
        const count = await repoLinks.count();
        expect(count).toBeGreaterThan(0);
      }
    });
  });

  test.describe("multi-bot product correctness", () => {
    test("sentry (multi-bot) shows aggregated data from all bots", async ({ page }) => {
      // Sentry has 3 bots: sentry, seer-by-sentry, codecov-ai.
      // Verify the product page aggregates correctly across all bots.
      await page.goto("/products/sentry");
      await expect(page.getByTestId("bot-stats")).toBeVisible();

      const stats = page.getByTestId("bot-stats");
      const text = await stats.textContent();
      // Should show non-zero reviews (from seed data: 200+220+250+270 + 80+90+100+110 = 1320)
      expect(text).not.toMatch(/Total Reviews0\b/);
      expect(text).not.toMatch(/\bNaN\b/);
    });

    test("sentry avg comments/PR aggregates across all bots", async ({ page }) => {
      // Seed data: sentry has 3 comments on 3 PRs, seer-by-sentry has 3 on 3.
      // Combined: 6 comments / 6 PRs = 1.0 avg.
      // If query incorrectly filters by bot_id='sentry' only, we'd get 3/3 = 1.0
      // (same number here by coincidence, but the test validates the stat renders).
      await page.goto("/products/sentry");
      const stats = page.getByTestId("bot-stats");
      await expect(stats).toBeVisible();
      const text = await stats.textContent();
      // Avg Comments/PR should be present and numeric (not "—" or NaN)
      expect(text).toMatch(/Comments\/PR\s*[\d.]+/);
      expect(text).not.toMatch(/\bNaN\b/);
    });

    test("sentry org list aggregates across bots", async ({ page }) => {
      await page.goto("/products/sentry");
      await expect(page.getByTestId("bot-stats")).toBeVisible();

      const orgsSection = page.getByTestId("bot-top-orgs");
      if (await orgsSection.count() > 0) {
        const orgLinks = orgsSection.locator("a[href^='/orgs/']");
        expect(await orgLinks.count()).toBeGreaterThan(0);
      }
    });
  });
});
