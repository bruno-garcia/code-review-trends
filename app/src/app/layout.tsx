import type { Metadata } from "next";
import Link from "next/link";
import { VersionStamp } from "@/components/version-stamp";
import { Logo } from "@/components/logo";
import "./globals.css";

export const metadata: Metadata = {
  title: "Code Review Trends — AI Bot Adoption on GitHub",
  description:
    "Track the adoption of AI code review bots on GitHub. Trends, statistics, and per-provider profiles.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className="bg-[#0a0a0f] text-gray-100 antialiased">
        <nav className="border-b border-[#1e1e2e] bg-[#0a0a0f]/80 backdrop-blur sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-16">
              <Link href="/" className="flex items-center">
                <Logo />
              </Link>
              <div className="flex items-center gap-6 text-sm text-gray-400">
                <Link href="/" className="hover:text-violet-300 transition-colors">
                  Dashboard
                </Link>
                <Link
                  href="/bots"
                  className="hover:text-violet-300 transition-colors"
                >
                  Bots
                </Link>
                <Link
                  href="/compare"
                  className="hover:text-violet-300 transition-colors"
                >
                  Compare
                </Link>
                <a
                  href="https://github.com/bruno-garcia/code-review-trends"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-violet-300 transition-colors"
                >
                  GitHub
                </a>
              </div>
            </div>
          </div>
        </nav>
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {children}
        </main>
        <footer className="border-t border-[#1e1e2e] py-8 text-center text-sm text-gray-500">
          <p>
            Data sourced from{" "}
            <a
              href="https://www.gharchive.org/"
              className="underline hover:text-violet-300"
            >
              GH Archive
            </a>{" "}
            and the{" "}
            <a
              href="https://docs.github.com/en/rest"
              className="underline hover:text-violet-300"
            >
              GitHub API
            </a>
            .
          </p>
          <div className="mt-3">
            <VersionStamp />
          </div>
        </footer>
      </body>
    </html>
  );
}
