import type { Metadata } from "next";
import Link from "next/link";

import { VersionStamp } from "@/components/version-stamp";
import { Logo } from "@/components/logo";
import { NavLinks } from "@/components/nav-links";
import { MobileNav } from "@/components/mobile-nav";
import { ThemeProvider, themeScript } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { getProductSummaries } from "@/lib/clickhouse";
import { getDefaultProductIds } from "@/lib/product-filter-defaults";
import { ProductFilterProvider } from "@/lib/product-filter";
import { ProductFilterBar } from "@/components/product-filter-bar";
import { SchemaBanner } from "@/components/schema-banner";
import { MigrationGate } from "@/components/migration-gate";
import { getSchemaStatus } from "@/lib/migrations";
import { NavigationProgress } from "@/components/navigation-progress";
import { OG_DEFAULTS } from "@/lib/constants";
import "./globals.css";

export const revalidate = 300; // 5 minutes — matches in-memory query cache TTL

const PROD_URL = "https://codereviewtrends.com";

function resolveMetadataBase(): URL {
  const raw = process.env.SITE_URL?.trim();
  if (!raw) return new URL(PROD_URL);
  try {
    return new URL(raw);
  } catch {
    console.warn(`Invalid SITE_URL "${raw}", falling back to ${PROD_URL}`);
    return new URL(PROD_URL);
  }
}

export const metadata: Metadata = {
  metadataBase: resolveMetadataBase(),
  title: {
    default: "Code Review Trends — AI Code Review Adoption on GitHub",
    template: "%s — Code Review Trends",
  },
  description:
    "Track the adoption of AI code review bots on GitHub. Trends, statistics, and per-provider profiles for AI code review products.",
  manifest: "/manifest.json",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/favicon.ico", sizes: "16x16 32x32 48x48" },
    ],
    apple: "/apple-icon.png",
  },
  openGraph: OG_DEFAULTS,
  twitter: {
    card: "summary_large_image",
  },
  alternates: {
    canonical: "/",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Check schema version and auto-migrate if needed (before data queries).
  // Cached for 60s per serverless container — effectively free in the normal case.
  // Connection failures throw → global-error.tsx (500, not ISR-cached).
  const schemaStatus = await getSchemaStatus();

  // Product summaries are critical — they drive the filter on every page.
  // If this fails, let it throw → error boundary → 500.
  // (connection() in query() prevents static prerendering during build.)
  const summaries = await getProductSummaries();
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
          <ProductFilterProvider
            allProducts={allProducts}
            defaultProductIds={defaultProductIds}
          >
            <SchemaBanner status={schemaStatus} />
            <NavigationProgress />
            <nav className="border-b border-theme-border bg-theme-nav sticky top-0 z-50 overflow-x-hidden">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative">
                <div className="flex items-center py-3 sm:py-0 sm:h-16 gap-x-3 sm:gap-x-4">
                  <Link href="/" className="flex items-center flex-shrink-0">
                    <Logo />
                  </Link>
                  {/* Mobile spacer: pushes hamburger + theme toggle to the right */}
                  <div className="flex-1 sm:hidden" />
                  {/* Mobile: hamburger menu */}
                  <MobileNav />
                  {/* Theme toggle — always visible */}
                  <div className="sm:order-last">
                    <ThemeToggle />
                  </div>
                  {/* Desktop nav links — hidden on mobile */}
                  <div className="hidden sm:flex items-center gap-6 text-sm text-nav-link ml-auto">
                    <NavLinks />
                  </div>
                </div>
              </div>
            </nav>
            <MigrationGate status={schemaStatus}>
              <ProductFilterBar />
              <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {children}
              </main>
              </MigrationGate>
          <footer className="border-t border-theme-border py-8 text-sm text-theme-muted">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                  <a
                    href="https://github.com/bruno-garcia/code-review-trends"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:text-theme-text transition-colors"
                  >
                    GitHub
                  </a>
                  <span className="text-theme-border">·</span>
                  <Link
                    href="/about"
                    className="hover:text-theme-text transition-colors"
                  >
                    Methodology
                  </Link>
                  <span className="text-theme-border">·</span>
                  <Link
                    href="/about#who"
                    className="hover:text-theme-text transition-colors"
                  >
                    Made by Bruno Garcia
                  </Link>
                </div>
                <VersionStamp />
              </div>
            </div>
          </footer>
          </ProductFilterProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
