"use client";

import { useTheme } from "@/components/theme-provider";
import { getThemedBrandColor, getAvatarStyle } from "@/lib/theme-overrides";

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
  return (
    <div className="mt-4 flex items-center gap-4">
      {avatarUrl && (
        <img
          src={avatarUrl}
          alt={name}
          width={48}
          height={48}
          className="rounded-full bg-theme-surface border border-theme-border"
          style={getAvatarStyle(productId, resolved)}
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
