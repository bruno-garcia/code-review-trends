"use client";

import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
const STORAGE_KEY = "crt:selected-products";

export { getDefaultProductIds } from "./product-filter-defaults";

// --- Context types ---

export type ProductFilterProduct = {
  id: string;
  name: string;
  brand_color: string;
  avatar_url: string;
};

type ProductFilterContextValue = {
  selectedProductIds: string[];
  setSelectedProductIds: (ids: string[]) => void;
  allProducts: ProductFilterProduct[];
  defaultProductIds: string[];
  isDefault: boolean;
};

const ProductFilterContext = createContext<ProductFilterContextValue | null>(
  null,
);

// --- Provider ---

export function ProductFilterProvider({
  allProducts,
  defaultProductIds,
  children,
}: {
  allProducts: ProductFilterProduct[];
  defaultProductIds: string[];
  children: ReactNode;
}) {
  const validIds = useMemo(() => new Set(allProducts.map((p) => p.id)), [allProducts]);
  const [selectedProductIds, setSelectedRaw] =
    useState<string[]>(defaultProductIds);
  const initializedRef = useRef(false);
  const urlOverrideRef = useRef(false);

  const setSelectedProductIds = useCallback(
    (ids: string[]) => {
      setSelectedRaw(ids);
    },
    [],
  );

  // On mount: check URL params first, then localStorage.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    function readInitialSelection(): string[] | null {
      const params = new URLSearchParams(window.location.search);
      const productsParam = params.get("products");
      if (productsParam) {
        const ids = productsParam
          .split(",")
          .filter((id) => validIds.has(id));
        if (ids.length > 0) {
          urlOverrideRef.current = true;
          return ids;
        }
      }

      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            const ids = parsed.filter(
              (id): id is string =>
                typeof id === "string" && validIds.has(id),
            );
            if (ids.length > 0) return ids;
          }
        }
      } catch {
        // Invalid localStorage data — ignore
      }
      return null;
    }

    const ids = readInitialSelection();
    if (ids) {
      // Use startTransition to batch the update and avoid the lint warning
      // about synchronous setState in effects. This is initialization-only.
      startTransition(() => {
        setSelectedRaw(ids);
      });
    }
  }, [validIds]);

  // Persist to localStorage when selection changes (skip URL overrides)
  useEffect(() => {
    if (urlOverrideRef.current) {
      urlOverrideRef.current = false;
      return;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(selectedProductIds));
    } catch {
      // Storage full or unavailable — ignore
    }
  }, [selectedProductIds]);

  const isDefault = useMemo(() => {
    if (selectedProductIds.length !== defaultProductIds.length) return false;
    const selectedSet = new Set(selectedProductIds);
    return defaultProductIds.every((id) => selectedSet.has(id));
  }, [selectedProductIds, defaultProductIds]);

  return (
    <ProductFilterContext value={{
      selectedProductIds,
      setSelectedProductIds,
      allProducts,
      defaultProductIds,
      isDefault,
    }}>
      {children}
    </ProductFilterContext>
  );
}

// --- Hook ---

export function useProductFilter(): ProductFilterContextValue {
  const ctx = useContext(ProductFilterContext);
  if (!ctx) {
    throw new Error("useProductFilter must be used within a ProductFilterProvider");
  }
  return ctx;
}
