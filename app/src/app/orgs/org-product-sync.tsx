"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProductFilter } from "@/lib/product-filter";

/**
 * Syncs the global product filter selection into URL search params.
 * When the user changes the product filter via the global bar, this
 * component updates ?product= params, triggering a server re-fetch.
 *
 * It only adds params when not all products are selected (to keep
 * URLs clean when no filtering is active).
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
      if (key === "product" || key === "page") continue;
      params.append(key, val);
    }

    // Only add product params when not all products are selected
    const allSelected = selectedProductIds.length === allProducts.length;
    if (!allSelected) {
      for (const id of selectedProductIds) {
        params.append("product", id);
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
