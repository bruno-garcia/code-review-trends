"use client";

import { useState } from "react";
import { useProductFilter } from "@/lib/product-filter";

function ChevronDown({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
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
  const {
    selectedProductIds,
    setSelectedProductIds,
    allProducts,
    defaultProductIds,
  } = useProductFilter();
  const [expanded, setExpanded] = useState(false);

  const selectedSet = new Set(selectedProductIds);
  const selectedProducts = allProducts.filter((p) => selectedSet.has(p.id));

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
    <div data-testid="product-filter-bar" className="border-b border-gray-800 bg-gray-950">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Compact row */}
        <div className="flex items-center gap-3 h-12">
          <span className="text-xs text-gray-500 whitespace-nowrap shrink-0">
            Showing {selectedProducts.length} of {allProducts.length} products
          </span>

          <div className="flex-1 overflow-x-auto flex items-center gap-1.5 scrollbar-none">
            {selectedProducts.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setExpanded(true);
                }}
                className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs whitespace-nowrap shrink-0 border transition-colors hover:brightness-125"
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
              </button>
            ))}
          </div>

          <button
            onClick={() => setExpanded(!expanded)}
            className="shrink-0 p-1.5 rounded text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition-colors"
            aria-label={expanded ? "Collapse filter" : "Expand filter"}
          >
            <ChevronDown
              className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
            />
          </button>
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
                data-testid="filter-select-all"
                onClick={selectAll}
                className="text-xs px-2.5 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Select All
              </button>
              <button
                data-testid="filter-deselect-all"
                onClick={deselectAll}
                className="text-xs px-2.5 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Deselect All
              </button>
              <button
                data-testid="filter-reset"
                onClick={resetToTop10}
                className="text-xs px-2.5 py-1 rounded bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Reset to Top 10
              </button>
            </div>

            {/* Product grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {allProducts.map((p) => {
                const isSelected = selectedSet.has(p.id);
                return (
                  <button
                    key={p.id}
                    data-testid={`filter-product-${p.id}`}
                    onClick={() => toggleProduct(p.id)}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border ${
                      isSelected
                        ? "border-opacity-60 text-gray-100"
                        : "border-gray-800 text-gray-500 opacity-50 hover:opacity-75"
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
                    <span className="truncate">{p.name}</span>
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
