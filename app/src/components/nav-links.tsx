"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navItems = [
  { href: "/", label: "Dashboard" },
  { href: "/bots", label: "Bots" },
  { href: "/compare", label: "Compare" },
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
              className={inactiveClasses}
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
                ? "text-nav-link-active font-medium transition-colors"
                : inactiveClasses
            }
          >
            {label}
          </Link>
        );
      })}
    </>
  );
}
