import type { Metadata } from "next";
import Link from "next/link";
import { VersionStamp } from "@/components/version-stamp";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import { ThemeProvider, themeScript } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { getProductSummaries, getEnrichmentStats } from "@/lib/clickhouse";
import { getDefaultProductIds } from "@/lib/product-filter-defaults";
import { ProductFilterProvider } from "@/lib/product-filter";
import { ProductFilterBar } from "@/components/product-filter-bar";
import { SchemaBanner } from "@/components/schema-banner";
import { MigrationGate } from "@/components/migration-gate";
import { getSchemaStatus } from "@/lib/migrations";
import { NavigationProgress } from "@/components/navigation-progress";
import "./globals.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Code Review Trends — AI Bot Adoption on GitHub",
  description:
    "Track the adoption of AI code review bots on GitHub. Trends, statistics, and per-provider profiles.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Check schema version and auto-migrate if needed (before data queries).
  // Cached for 60s per serverless container — effectively free in the normal case.
  // On error (ClickHouse unreachable), returns status "error" — MigrationGate
  // will show a waiting screen instead of rendering children.
  const schemaStatus = await getSchemaStatus();

  // Gracefully handle missing ClickHouse during next build (pre-render).
  // Pages are force-dynamic — this gracefully handles cases where ClickHouse is temporarily unavailable.
  let summaries: Awaited<ReturnType<typeof getProductSummaries>> = [];
  let enrichmentIncomplete = false;
  try {
    const [summariesData, enrichment] = await Promise.all([
      getProductSummaries(),
      getEnrichmentStats(),
    ]);
    summaries = summariesData;
    enrichmentIncomplete =
      enrichment.total_discovered_repos > enrichment.enriched_repos ||
      enrichment.total_discovered_prs > enrichment.enriched_prs;
  } catch {
    // ClickHouse unavailable (e.g. during build) — render with empty filter list
  }
  const defaultProductIds = getDefaultProductIds(summaries);
  const allProducts = summaries.map((s) => ({
    id: s.id,
    name: s.name,
    brand_color: s.brand_color,
    avatar_url: s.avatar_url,
  }));

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme by setting class before paint */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="bg-theme-bg text-theme-text antialiased transition-colors">
        <ThemeProvider>
          <SchemaBanner status={schemaStatus} />
          <NavigationProgress />
          <nav className="border-b border-theme-border bg-theme-nav sticky top-0 z-50">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16 gap-4">
                <Link href="/" className="flex items-center flex-shrink-0">
                  <Logo />
                </Link>
                <div className="flex items-center gap-3 sm:gap-6 text-sm text-nav-link overflow-x-auto flex-shrink min-w-0">
                  <NavLinks />
                  <ThemeToggle />
                </div>
              </div>
            </div>
          </nav>
          <MigrationGate status={schemaStatus}>
            <ProductFilterProvider
              allProducts={allProducts}
              defaultProductIds={defaultProductIds}
            >
              <ProductFilterBar />
              <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
              </main>
            </ProductFilterProvider>
          </MigrationGate>
          <footer className="border-t border-theme-border py-8 text-center text-sm text-theme-muted">
            {enrichmentIncomplete && (
              <div className="mb-4 inline-flex items-center gap-2 justify-center" data-testid="data-import-status">
                <span className="relative flex h-2.5 w-2.5" aria-hidden="true">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
                </span>
                <span>
                  <Link
                    href="/status"
                    className="text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
                  >
                    Data import in progress
                  </Link>
                  {" "}— some statistics may be incomplete
                </span>
              </div>
            )}
            <p>
              Data sourced from{" "}
              <a
                href="https://www.gharchive.org/"
                className="underline hover:text-violet-400"
              >
                GH Archive
              </a>{" "}
              and the{" "}
              <a
                href="https://docs.github.com/en/rest"
                className="underline hover:text-violet-400"
              >
                GitHub API
              </a>
              .
            </p>
            <div className="mt-3">
              <VersionStamp />
            </div>
          </footer>
        </ThemeProvider>
      </body>
    </html>
  );
}
