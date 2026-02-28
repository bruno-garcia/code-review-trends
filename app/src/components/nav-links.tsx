"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFilterUrl } from "@/lib/product-filter";
import { navItems, FILTER_PAGES } from "@/lib/navigation";

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
