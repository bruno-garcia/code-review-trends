"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useProductFilter } from "@/lib/product-filter";

/**
 * Syncs product filter state for pair comparison pages.
 *
 * On mount: sets the global filter to exactly the two pair products.
 * On change: when the user modifies the filter via the global bar,
 * navigates to /compare?products=... so they can explore with more
 * products on the interactive compare page.
 */
export function PairFilterSync({ productIds }: { productIds: [string, string] }) {
  const { selectedProductIds, setSelectedProductIds } = useProductFilter();
  const router = useRouter();
  const initializedRef = useRef(false);
  const pairIdsRef = useRef(productIds);

  // On mount: set filter to the pair products
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    setSelectedProductIds(productIds);
  }, [productIds, setSelectedProductIds]);

  // After init: if user changes the filter, navigate to /compare?products=...
  useEffect(() => {
    if (!initializedRef.current) return;

    // Don't navigate if the selection matches the pair (initial sync or no change)
    const pair = pairIdsRef.current;
    const isPairSelection =
      selectedProductIds.length === 2 &&
      selectedProductIds.includes(pair[0]) &&
      selectedProductIds.includes(pair[1]);
    if (isPairSelection) return;

    // User changed the filter — navigate to the interactive compare page
    const products = selectedProductIds.join(",");
    const newPath = products ? `/compare?products=${products}` : "/compare";

    document.dispatchEvent(
      new CustomEvent("navigation-start", { detail: { href: newPath } }),
    );
    router.push(newPath);
  }, [selectedProductIds, router]);

  return null;
}
