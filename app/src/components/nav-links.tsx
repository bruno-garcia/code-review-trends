"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/bots", label: "Bots" },
  { href: "/orgs", label: "Orgs" },
  { href: "/compare", label: "Compare" },
  { href: "/about", label: "About" },
  { href: "/status", label: "Status" },
];

const inactiveClasses =
  "text-nav-link hover:text-nav-link-active transition-colors";

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {navItems.map(({ href, label }) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
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
