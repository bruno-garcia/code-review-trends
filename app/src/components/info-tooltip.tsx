/**
 * Reusable tooltip with ⓘ icon.
 * Pure CSS (group-hover + group-focus-within), no JS needed.
 * Keyboard accessible via tabIndex on the wrapper.
 *
 * Pass `text` for plain-text tooltips, or `content` for rich JSX (e.g. links).
 * Exactly one of `text` or `content` must be provided.
 *
 * The tooltip is wrapped in an invisible padded container that bridges the gap
 * between the trigger and the tooltip bubble. This lets the mouse travel from
 * the ⓘ icon into the tooltip without losing hover. A 150 ms fade-out delay
 * gives extra time to reach the tooltip when the cursor briefly leaves.
 */
export function InfoTooltip(
  props: { children: React.ReactNode } & (
    | { text: string; content?: never }
    | { content: React.ReactNode; text?: never }
  ),
) {
  const { children, text, content } = props;
  const tooltip = content ?? text;
  return (
    <span className="relative group/tip inline-flex items-center outline-none" tabIndex={0}>
      {children}
      <span className="ml-1 text-theme-muted/50 cursor-help" aria-hidden="true">
        ⓘ
      </span>
      {/* Outer shell: pb-2 fills the gap between trigger and bubble so hover
          is continuous. pointer-events flip keeps it click-through when hidden. */}
      <span
        className="absolute z-10 bottom-full left-1/2 -translate-x-1/2 pb-2 pointer-events-none group-hover/tip:pointer-events-auto group-focus-within/tip:pointer-events-auto"
      >
        <span
          role="tooltip"
          className="block px-3 py-2 text-xs leading-relaxed text-theme-text bg-theme-surface-alt border border-theme-border rounded-lg shadow-lg w-72 whitespace-normal opacity-0 transition-opacity duration-150 delay-150 group-hover/tip:opacity-100 group-hover/tip:delay-0 group-focus-within/tip:opacity-100 group-focus-within/tip:delay-0"
        >
          {tooltip}
        </span>
      </span>
    </span>
  );
}
