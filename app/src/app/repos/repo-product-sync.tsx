"use client";

import { useEffect, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useProductFilter } from "@/lib/product-filter";

/**
 * Syncs the global product filter selection into URL search params.
 * When the user changes the product filter via the global bar, this
 * component updates ?products= param, triggering a server re-fetch.
 */
export function RepoProductSync() {
  const { selectedProductIds, allProducts } = useProductFilter();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isInitialMount = useRef(true);

  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    const params = new URLSearchParams();
    for (const [key, val] of searchParams.entries()) {
      if (key === "products" || key === "product" || key === "page") continue;
      params.append(key, val);
    }

    const allSelected = selectedProductIds.length === allProducts.length;
    if (!allSelected) {
      if (selectedProductIds.length === 0) {
        params.set("products", "none");
      } else {
        params.set("products", selectedProductIds.join(","));
      }
    }

    const qs = params.toString().replaceAll("%2C", ",");
    const newPath = `/repos${qs ? `?${qs}` : ""}`;

    const currentPath = `${window.location.pathname}${window.location.search}`;
    if (newPath === currentPath) return;

    document.dispatchEvent(
      new CustomEvent("navigation-start", { detail: { href: newPath } }),
    );
    router.push(newPath);
  }, [selectedProductIds]); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
