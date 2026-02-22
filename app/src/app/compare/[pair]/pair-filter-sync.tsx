"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useProductFilter } from "@/lib/product-filter";

/**
 * Syncs product filter state for pair comparison pages.
 *
 * Lifecycle: init → synced → watching
 *
 * - init:     mount, sets filter to pair products
 * - synced:   waiting for the filter state to reflect our initialization
 * - watching: user changes detected → navigate to /compare?products=...
 */
export function PairFilterSync({ productIds }: { productIds: [string, string] }) {
  const { selectedProductIds, setSelectedProductIds } = useProductFilter();
  const router = useRouter();
  const phaseRef = useRef<"init" | "synced" | "watching">("init");
  const pairSet = new Set(productIds);

  // On mount: set filter to the pair products
  useEffect(() => {
    setSelectedProductIds([...productIds]);
    phaseRef.current = "synced";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Track initialization, then watch for user changes
  useEffect(() => {
    if (phaseRef.current === "init") return;

    const isPairSelection =
      selectedProductIds.length === 2 &&
      selectedProductIds.every((id) => pairSet.has(id));

    if (phaseRef.current === "synced") {
      // Wait until our setSelectedProductIds call has been reflected
      if (isPairSelection) {
        phaseRef.current = "watching";
      }
      return;
    }

    // phase === "watching": user changed the filter
    if (!isPairSelection) {
      const products = selectedProductIds.join(",");
      const newPath = products ? `/compare?products=${products}` : "/compare";
      document.dispatchEvent(
        new CustomEvent("navigation-start", { detail: { href: newPath } }),
      );
      router.push(newPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedProductIds]);

  return null;
}
