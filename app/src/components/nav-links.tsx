"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFilterUrl } from "@/lib/product-filter";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/orgs", label: "Orgs" },
  { href: "/bots", label: "Bots" },
  { href: "/compare", label: "Compare" },
  { href: "/status", label: "Status" },
  { href: "/about", label: "About" },
];

/** Pages where global filter params (products, range) should be preserved in nav links */
const FILTER_PAGES = new Set(["/bots", "/compare", "/orgs"]);

const inactiveClasses =
  "text-nav-link hover:text-nav-link-active transition-colors";

export function NavLinks() {
  const pathname = usePathname();
  const buildUrl = useFilterUrl();

  return (
    <>
      {navItems.map(({ href, label }) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname.startsWith(href);

        const finalHref = FILTER_PAGES.has(href) ? buildUrl(href) : href;

        return (
          <Link
            key={href}
            href={finalHref}
            aria-current={isActive ? "page" : undefined}
            className={
              isActive
                ? "text-nav-link-active font-medium transition-colors whitespace-nowrap"
                : `${inactiveClasses} whitespace-nowrap`
            }
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
