"use client";

import Link from "next/link";
import { useFilterUrl } from "@/lib/product-filter";

/**
 * A Link to /compare that preserves global filter params (products, range).
 * Use in server components by importing this client component.
 */
export function CompareLink({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const buildUrl = useFilterUrl();

  return (
    <Link href={buildUrl("/compare")} className={className}>
      {children}
    </Link>
  );
}
