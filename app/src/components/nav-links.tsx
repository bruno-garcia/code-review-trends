"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Dashboard" },
  { href: "/bots", label: "Bots" },
  { href: "/compare", label: "Compare" },
];

export function NavLinks() {
  const pathname = usePathname();

  return (
    <>
      {links.map(({ href, label }) => {
        const isActive =
          href === "/" ? pathname === "/" : pathname.startsWith(href);

        return (
          <Link
            key={href}
            href={href}
            className={
              isActive
                ? "text-nav-link-active font-medium transition-colors"
                : "text-nav-link hover:text-nav-link-active transition-colors"
            }
          >
            {label}
          </Link>
        );
      })}
      <a
        href="https://github.com/bruno-garcia/code-review-trends"
        target="_blank"
        rel="noopener noreferrer"
        className="text-nav-link hover:text-nav-link-active transition-colors"
      >
        GitHub
      </a>
    </>
  );
}
