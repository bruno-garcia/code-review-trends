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
  {
    href: "https://github.com/bruno-garcia/code-review-trends",
    label: "GitHub",
    isExternal: true,
  },
];

const inactiveClasses =
  "text-nav-link hover:text-nav-link-active transition-colors";

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {navItems.map(({ href, label, isExternal }) => {
        if (isExternal) {
          return (
            <a
              key={href}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className={`${inactiveClasses} whitespace-nowrap`}
            >
              {label}
            </a>
          );
        }

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
