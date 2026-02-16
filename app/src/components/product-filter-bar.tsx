"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useProductFilter } from "@/lib/product-filter";
import { TimeRangeSelector } from "@/components/time-range-selector";

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="20"
      height="20"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 6l4 4 4-4" />
    </svg>
  );
}

export function ProductFilterBar() {
  const pathname = usePathname();
  const {
    selectedProductIds,
    setSelectedProductIds,
    allProducts,
    defaultProductIds,
  } = useProductFilter();
  const [expanded, setExpanded] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  // Collapse when clicking outside the filter bar
  useEffect(() => {
    if (!expanded) return;
    function handleClick(e: MouseEvent) {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setExpanded(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded]);

  const selectedSet = new Set(selectedProductIds);
  const selectedProducts = allProducts.filter((p) => selectedSet.has(p.id));

  // Only show filter on pages that use it
  if (pathname !== "/bots" && pathname !== "/compare") {
    return null;
  }

  function toggleProduct(id: string) {
    if (selectedSet.has(id)) {
      // Enforce minimum 1
      if (selectedProductIds.length <= 1) return;
      setSelectedProductIds(selectedProductIds.filter((pid) => pid !== id));
    } else {
      setSelectedProductIds([...selectedProductIds, id]);
    }
  }

  function selectAll() {
    setSelectedProductIds(allProducts.map((p) => p.id));
  }

  function deselectAll() {
    // Keep first selected product (minimum 1 rule)
    if (selectedProductIds.length > 0) {
      setSelectedProductIds([selectedProductIds[0]]);
    }
  }

  function resetToTop10() {
    setSelectedProductIds(defaultProductIds);
  }

  return (
    <div ref={barRef} data-testid="product-filter-bar" className="border-b border-theme-border bg-theme-bg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Compact row — entire bar is clickable to toggle the picker */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
          className="flex items-center gap-3 min-h-12 py-2 cursor-pointer"
          aria-label={expanded ? "Collapse filter" : "Expand filter"}
          aria-expanded={expanded}
        >
          <span className="text-xs text-theme-muted-dim whitespace-nowrap shrink-0">
            Showing {selectedProducts.length} of {allProducts.length} products
          </span>

          <div className="border-l border-theme-border pl-3 ml-1" onClick={(e) => e.stopPropagation()}>
            <TimeRangeSelector />
          </div>

          <div className="flex-1 flex flex-wrap items-center gap-1.5">
            {selectedProducts.map((p) => (
              <span
                key={p.id}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs whitespace-nowrap border"
                style={{
                  borderColor: p.brand_color + "60",
                  backgroundColor: p.brand_color + "15",
                  color: p.brand_color,
                }}
              >
                <img
                  src={p.avatar_url}
                  alt=""
                  width={16}
                  height={16}
                  className="rounded-full"
                />
                {p.name}
              </span>
            ))}
          </div>

          <span
            className="shrink-0 p-1.5 rounded text-theme-muted"
            aria-hidden="true"
          >
            <ChevronDown
              className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </span>
        </div>

        {/* Expanded picker */}
        <div
          className={`overflow-hidden transition-all duration-200 ${
            expanded ? "max-h-[500px] opacity-100 pb-4" : "max-h-0 opacity-0"
          }`}
        >
          <div data-testid="product-filter-picker">
            {/* Quick actions */}
            <div className="flex items-center gap-2 mb-3">
              <button
                type="button"
                data-testid="filter-select-all"
                onClick={selectAll}
                className="text-xs px-2.5 py-1 rounded bg-theme-surface-alt text-theme-text-secondary hover:bg-theme-border transition-colors"
              >
                Select All
              </button>
              <button
                type="button"
                data-testid="filter-deselect-all"
                onClick={deselectAll}
                className="text-xs px-2.5 py-1 rounded bg-theme-surface-alt text-theme-text-secondary hover:bg-theme-border transition-colors"
              >
                Deselect All
              </button>
              <button
                type="button"
                data-testid="filter-reset"
                onClick={resetToTop10}
                className="text-xs px-2.5 py-1 rounded bg-theme-surface-alt text-theme-text-secondary hover:bg-theme-border transition-colors"
              >
                Reset to Top 10
              </button>
            </div>

            {/* Product grid — ordered by ranking (total reviews DESC) */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {allProducts.map((p, i) => {
                const isSelected = selectedSet.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`filter-product-${p.id}`}
                    onClick={() => toggleProduct(p.id)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border ${
                      isSelected
                        ? "border-opacity-60 text-theme-text"
                        : "border-theme-border text-theme-muted-dim opacity-50 hover:opacity-75"
                    }`}
                    style={
                      isSelected
                        ? {
                            borderColor: p.brand_color + "60",
                            backgroundColor: p.brand_color + "15",
                          }
                        : undefined
                    }
                  >
                    <img
                      src={p.avatar_url}
                      alt=""
                      width={20}
                      height={20}
                      className="rounded-full"
                    />
                    <span className="truncate flex-1 text-left">{p.name}</span>
                    <span className={`text-xs tabular-nums shrink-0 ${isSelected ? "text-theme-muted" : "text-theme-muted-dim"}`}>
                      #{i + 1}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
