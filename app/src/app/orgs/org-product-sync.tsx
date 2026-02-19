"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProductFilter } from "@/lib/product-filter";

/**
 * Syncs the global product filter selection into URL search params.
 * When the user changes the product filter via the global bar, this
 * component updates ?products= param, triggering a server re-fetch.
 *
 * Uses router.push (not replaceState) because the Orgs page needs
 * a server re-render to query ClickHouse with the new product filter.
 */
export function OrgProductSync() {
  const { selectedProductIds, allProducts } = useProductFilter();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);

  useEffect(() => {
    // Skip the first render — don't navigate on page load
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const params = new URLSearchParams();
    for (const [key, val] of searchParams.entries()) {
      if (key === "products" || key === "product" || key === "page") continue;
      params.append(key, val);
    }

    // Add product params when not all products are selected.
    // Use a sentinel value for empty selection so the server can
    // distinguish "no filter" (all) from "nothing selected" (none).
    const allSelected = selectedProductIds.length === allProducts.length;
    if (!allSelected) {
      if (selectedProductIds.length === 0) {
        params.set("products", "none");
      } else {
        params.set("products", selectedProductIds.join(","));
      }
    }

    const qs = params.toString();
    const newPath = `/orgs${qs ? `?${qs}` : ""}`;

    document.dispatchEvent(
      new CustomEvent("navigation-start", { detail: { href: newPath } }),
    );
    router.push(newPath);
  }, [selectedProductIds]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
