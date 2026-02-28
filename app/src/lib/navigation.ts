/** Canonical navigation items — shared by desktop NavLinks and mobile MobileNav. */
export const navItems = [
  { href: "/", label: "Overview" },
  { href: "/products", label: "Products" },
  { href: "/compare", label: "Compare" },
  { href: "/repos", label: "Repos" },
  { href: "/orgs", label: "Orgs" },
  { href: "/status", label: "Status" },
  { href: "/about", label: "About" },
] as const;

/** Pages where global filter params (products, range) should be preserved in nav links. */
export const FILTER_PAGES = new Set(["/products", "/compare", "/repos", "/orgs"]);
