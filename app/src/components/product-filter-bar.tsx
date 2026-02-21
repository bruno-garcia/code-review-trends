"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useProductFilter } from "@/lib/product-filter";
import { TimeRangeSelector } from "@/components/time-range-selector";
import { useTheme } from "@/components/theme-provider";
import { getThemedBrandColor, getAvatarStyle, getBrandAlpha } from "@/lib/theme-overrides";

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
  const { resolved } = useTheme();

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
  const isSelectionEmpty = selectedProducts.length === 0;

  // Only show filter on pages that use it
  if (pathname !== "/products" && pathname !== "/compare" && pathname !== "/repos" && pathname !== "/orgs") {
    return null;
  }

  // On /orgs and /repos, product changes trigger a server navigation (via
  // OrgProductSync / RepoProductSync). Fire the progress bar immediately on
  // user interaction rather than waiting for the useEffect to dispatch.
  const isServerSyncPage = pathname === "/orgs" || pathname === "/repos";

  function signalNavigation() {
    if (isServerSyncPage) {
      document.dispatchEvent(new CustomEvent("navigation-start"));
    }
  }

  function toggleProduct(id: string) {
    signalNavigation();
    if (selectedSet.has(id)) {
      setSelectedProductIds(selectedProductIds.filter((pid) => pid !== id));
    } else {
      setSelectedProductIds([...selectedProductIds, id]);
    }
  }

  function selectAll() {
    if (selectedProductIds.length === allProducts.length) return;
    signalNavigation();
    setSelectedProductIds(allProducts.map((p) => p.id));
  }

  function deselectAll() {
    if (selectedProductIds.length === 0) return;
    signalNavigation();
    setSelectedProductIds([]);
  }

  function resetToTop10() {
    if (selectedProductIds.length === defaultProductIds.length &&
        defaultProductIds.every((id) => selectedSet.has(id))) return;
    signalNavigation();
    setSelectedProductIds(defaultProductIds);
  }

  // Mobile nav is ~85px tall (py-3 + logo row + gap-y-2 + nav links row).
  // Desktop nav is h-16 (64px). Keep top-[85px]/top-16 in sync with layout.tsx nav.
  return (
    <div ref={barRef} data-testid="product-filter-bar" className="border-b border-theme-border bg-theme-bg sticky top-[85px] sm:top-16 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Compact row — entire bar is clickable to toggle the picker */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => setExpanded(!expanded)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setExpanded(!expanded); } }}
          className="min-h-12 py-2 cursor-pointer"
          aria-label={expanded ? "Collapse filter" : "Expand filter"}
          aria-expanded={expanded}
        >
          <div className="flex items-center gap-3">
            {/* Left: content rows — flex-wrap gives mobile a second row for time range */}
            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap sm:flex-nowrap items-center gap-x-3 gap-y-2">
                <span className="text-sm whitespace-nowrap shrink-0 text-theme-muted">
                  <span className={`font-semibold tabular-nums ${isSelectionEmpty ? "text-red-400" : "text-violet-400"}`}>{selectedProducts.length}</span>
                  {" of "}
                  <span className="font-semibold text-theme-text-secondary tabular-nums">{allProducts.length}</span>
                  {" products "}
                  <span className={`underline underline-offset-2 ${isSelectionEmpty ? "text-red-400 decoration-red-400/40 hover:decoration-red-400" : "text-violet-400 decoration-violet-400/40 hover:decoration-violet-400"}`}>selected</span>
                </span>
                {isSelectionEmpty && !expanded && (
                  <span className="text-xs text-red-400/80 hidden sm:inline">
                    Click to pick a product
                  </span>
                )}

                {/* Single instance — w-full on mobile forces to row 2, inline on desktop */}
                <div className="w-full sm:w-auto sm:border-l sm:border-theme-border sm:pl-3 sm:ml-1" onClick={(e) => e.stopPropagation()}>
                  <TimeRangeSelector />
                </div>

                <div className="flex-1 hidden sm:flex flex-wrap items-center gap-1.5">
                  {selectedProducts.map((p) => {
                    const color = getThemedBrandColor(p.id, p.brand_color, resolved);
                    const alpha = getBrandAlpha(resolved);
                    return (
                    <span
                      key={p.id}
                      className="flex items-center gap-1.5 px-2 py-1 rounded-full text-xs whitespace-nowrap border"
                      style={{
                        borderColor: color + alpha.border,
                        backgroundColor: color + alpha.bg,
                        color: color,
                      }}
                    >
                      <img
                        src={p.avatar_url}
                        alt=""
                        width={16}
                        height={16}
                        className="rounded-full"
                        style={getAvatarStyle(p.id, resolved)}
                      />
                      {p.name}
                    </span>
                    );
                  })}
                  {allProducts.length - selectedProducts.length > 0 && (
                    <span className="px-2 py-1 rounded-full text-xs whitespace-nowrap text-red-500 font-medium border border-dashed border-red-500/40 bg-red-500/10">
                      {allProducts.length - selectedProducts.length} unselected
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Right: chevron — vertically centered across both rows */}
            <span
              className="shrink-0 p-2 rounded-lg bg-theme-surface-alt border border-theme-border text-theme-text hover:bg-theme-border transition-colors"
              aria-hidden="true"
            >
              <ChevronDown
                className={`transition-transform duration-200 ${expanded ? "rotate-180" : ""}`}
              />
            </span>
          </div>
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

            {/* Product grid — ordered by growth rate */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-2">
              {allProducts.map((p, i) => {
                const isSelected = selectedSet.has(p.id);
                const color = getThemedBrandColor(p.id, p.brand_color, resolved);
                const alpha = getBrandAlpha(resolved);
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`filter-product-${p.id}`}
                    onClick={() => toggleProduct(p.id)}
                    aria-pressed={isSelected}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all border ${
                      isSelected
                        ? "text-theme-text"
                        : "border-theme-border text-theme-muted-dim opacity-50 hover:opacity-75"
                    }`}
                    style={
                      isSelected
                        ? {
                            borderColor: color + alpha.border,
                            backgroundColor: color + alpha.bg,
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
                      style={getAvatarStyle(p.id, resolved)}
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
