"use client";

import {
  createContext,
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
  const urlOverride = useRef(false);

  // Enforce minimum 1 selection
  const setSelectedProductIds = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      setSelectedRaw(ids);
    },
    [],
  );

  // On mount: check URL params first, then localStorage
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const productsParam = params.get("products");
    if (productsParam) {
      const ids = productsParam
        .split(",")
        .filter((id) => validIds.has(id));
      if (ids.length > 0) {
        urlOverride.current = true;
        setSelectedRaw(ids);
        return;
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
          if (ids.length > 0) {
            setSelectedRaw(ids);
          }
        }
      }
    } catch {
      // Invalid localStorage data — ignore
    }
  }, [validIds]);

  // Persist to localStorage when selection changes (skip URL overrides)
  useEffect(() => {
    if (urlOverride.current) {
      urlOverride.current = false;
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
