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
import { usePathname } from "next/navigation";
import { parseTimeRange, type TimeRangeKey } from "./time-range";

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
  range: TimeRangeKey;
  setRange: (range: TimeRangeKey) => void;
};

const ProductFilterContext = createContext<ProductFilterContextValue | null>(
  null,
);

/**
 * Pages where products are synced to URL via replaceState.
 * /orgs is excluded — OrgProductSync handles it via router.push
 * (needed to trigger server re-renders for ClickHouse queries).
 */
const PRODUCT_SYNC_PAGES = ["/bots", "/compare"];

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
  const [range, setRangeRaw] = useState<TimeRangeKey>("all");
  const initializedRef = useRef(false);
  const pathname = usePathname();

  const setSelectedProductIds = useCallback(
    (ids: string[]) => {
      setSelectedRaw(ids);
    },
    [],
  );

  const setRange = useCallback((r: TimeRangeKey) => {
    setRangeRaw(r);
  }, []);

  // Guards the sync effect from running with stale state during the
  // same render cycle as the init effect's startTransition.
  const skipNextSyncRef = useRef(false);

  // On mount: read products + range from URL.
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const params = new URLSearchParams(window.location.search);

    // Products
    const productsParam = params.get("products");
    if (productsParam) {
      const ids = productsParam
        .split(",")
        .filter((id) => validIds.has(id));
      if (ids.length > 0) {
        skipNextSyncRef.current = true;
        startTransition(() => {
          setSelectedRaw(ids);
        });
      }
    }

    // Range
    const rangeParam = params.get("range");
    const parsed = parseTimeRange(rangeParam);
    if (parsed !== "all") {
      startTransition(() => {
        setRangeRaw(parsed);
      });
    }
  }, [validIds]);

  // Sync products to URL via replaceState on matching pages.
  // Preserves all existing params (range, chart toggles, sorts, hash).
  useEffect(() => {
    if (!initializedRef.current) return;

    // Skip one sync cycle after init read products from URL —
    // the startTransition hasn't committed yet, so selectedProductIds
    // still holds defaults and would incorrectly wipe ?products=.
    if (skipNextSyncRef.current) {
      skipNextSyncRef.current = false;
      return;
    }

    const isSyncPage = PRODUCT_SYNC_PAGES.some(
      (p) => pathname === p,
    );
    if (!isSyncPage) return;

    const params = new URLSearchParams(window.location.search);

    const isDefault =
      selectedProductIds.length === defaultProductIds.length &&
      defaultProductIds.every((id) => selectedProductIds.includes(id));

    if (!isDefault && selectedProductIds.length > 0) {
      params.set("products", selectedProductIds.join(","));
    } else {
      params.delete("products");
    }

    const qs = params.toString();
    const newUrl = `${window.location.pathname}${qs ? `?${qs}` : ""}${window.location.hash}`;
    const currentUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`;

    if (newUrl !== currentUrl) {
      window.history.replaceState(null, "", newUrl);
    }
  }, [pathname, selectedProductIds, defaultProductIds]);

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
      range,
      setRange,
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

// --- URL builder ---

/**
 * Returns a function that builds a URL path with global filter params preserved.
 * Use for internal navigation links to keep products and range sticky.
 */
export function useFilterUrl() {
  const { selectedProductIds, isDefault, range } = useProductFilter();

  return useCallback(
    (basePath: string, extraParams?: Record<string, string>) => {
      const params = new URLSearchParams();
      if (!isDefault) {
        params.set("products", selectedProductIds.join(","));
      }
      if (range !== "all") {
        params.set("range", range);
      }
      if (extraParams) {
        for (const [k, v] of Object.entries(extraParams)) {
          if (v) params.set(k, v);
        }
      }
      const qs = params.toString();
      return qs ? `${basePath}?${qs}` : basePath;
    },
    [selectedProductIds, isDefault, range],
  );
}
