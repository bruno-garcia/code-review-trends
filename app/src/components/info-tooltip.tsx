/**
 * Reusable tooltip with ⓘ icon.
 * Pure CSS (group-hover), no JS needed.
 */
export function InfoTooltip({
  text,
  children,
}: {
  text: string;
  children: React.ReactNode;
}) {
  return (
    <span className="relative group/tip inline-flex items-center">
      {children}
      <span className="ml-1 text-theme-muted/50 cursor-help" aria-label={text}>
        ⓘ
      </span>
      <span
        role="tooltip"
        className="invisible group-hover/tip:visible absolute z-10 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs leading-relaxed text-theme-text bg-theme-surface-alt border border-theme-border rounded-lg shadow-lg w-72 whitespace-normal"
      >
        {text}
      </span>
    </span>
  );
}
