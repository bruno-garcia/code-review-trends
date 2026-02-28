"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useFilterUrl } from "@/lib/product-filter";
import { navItems, FILTER_PAGES } from "@/lib/navigation";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const buildUrl = useFilterUrl();
  const menuRef = useRef<HTMLDivElement>(null);

  // Close on click outside or Escape
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
        data-testid="mobile-nav-toggle"
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

      {/* Dropdown panel — only rendered when open to avoid duplicate links in DOM */}
      {open && (
        <div
          className="fixed left-0 right-0 bg-theme-nav border-b border-theme-border shadow-lg"
          data-testid="mobile-nav-menu"
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
                  onClick={() => setOpen(false)}
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
      )}
    </div>
  );
}
