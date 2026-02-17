"use client";

import { useTheme } from "@/components/theme-provider";
import { getThemedBrandColor, shouldInvertAvatar } from "@/lib/theme-overrides";

/**
 * Product header (avatar + name) with theme-aware colors and logo rendering.
 * Used on product detail pages where the parent is a server component.
 */
export function ThemedProductHeader({
  productId,
  name,
  avatarUrl,
  brandColor,
}: {
  productId: string;
  name: string;
  avatarUrl?: string;
  brandColor?: string;
}) {
  const { resolved } = useTheme();
  const color = brandColor ? getThemedBrandColor(productId, brandColor, resolved) : undefined;
  const invert = shouldInvertAvatar(productId, resolved);

  return (
    <div className="mt-4 flex items-center gap-4">
      {avatarUrl && (
        <img
          src={avatarUrl}
          alt={name}
          width={48}
          height={48}
          className="rounded-full bg-theme-surface border border-theme-border"
          style={invert ? { filter: "invert(1) hue-rotate(180deg)" } : undefined}
        />
      )}
      <h1
        className="text-4xl font-bold"
        data-testid="bot-name"
        style={{ color }}
      >
        {name}
      </h1>
    </div>
  );
}
