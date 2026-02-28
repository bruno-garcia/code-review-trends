"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFilterUrl } from "@/lib/product-filter";

const navItems = [
  { href: "/", label: "Overview" },
  { href: "/products", label: "Products" },
  { href: "/compare", label: "Compare" },
  { href: "/repos", label: "Repos" },
  { href: "/orgs", label: "Orgs" },
  { href: "/status", label: "Status" },
  { href: "/about", label: "About" },
];

const FILTER_PAGES = new Set(["/products", "/compare", "/repos", "/orgs"]);

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buildUrl = useFilterUrl();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  return (
    <div ref={menuRef} className="sm:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
        className="flex items-center justify-center w-9 h-9 text-nav-link hover:text-nav-link-active transition-colors"
      >
        {open ? (
          // ✕ close icon
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        ) : (
          // ☰ hamburger icon
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
        )}
      </button>

      {/* Dropdown panel — fixed to viewport edges so it spans full width */}
      <div
        className={`fixed left-0 right-0 bg-theme-nav border-b border-theme-border shadow-lg transition-all duration-200 ${
          open ? "opacity-100 visible" : "opacity-0 invisible"
        }`}
      >
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
          {navItems.map(({ href, label }) => {
            const isActive =
              href === "/" ? pathname === "/" : pathname.startsWith(href);
            const finalHref = FILTER_PAGES.has(href) ? buildUrl(href) : href;

            return (
              <Link
                key={href}
                href={finalHref}
                aria-current={isActive ? "page" : undefined}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  isActive
                    ? "text-nav-link-active font-medium bg-theme-surface"
                    : "text-nav-link hover:text-nav-link-active hover:bg-theme-surface/50"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
