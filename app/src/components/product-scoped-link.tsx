"use client";

import Link from "next/link";
import { useProductFilter } from "@/lib/product-filter";

/**
 * A link that sets the global product filter to a single product on click,
 * then navigates to the target page. Used on product detail pages to link
 * to orgs/repos filtered by that product.
 */
export function ProductScopedLink({
  productId,
  href,
  className,
  children,
}: {
  productId: string;
  href: string;
  className?: string;
  children: React.ReactNode;
}) {
  const { setSelectedProductIds } = useProductFilter();

  return (
    <Link
      href={href}
      className={className}
      onClick={() => setSelectedProductIds([productId])}
    >
      {children}
    </Link>
  );
}
