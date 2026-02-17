/**
 * Linkable section heading with anchor. Hover to reveal a # link.
 * Uses scroll-margin-top to account for sticky nav (4rem) + filter bar (~3rem).
 */
export function SectionHeading({
  id,
  children,
  className = "",
}: {
  id: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <h2
      id={id}
      className={`text-2xl font-semibold mb-4 scroll-mt-32 group ${className}`}
    >
      <a href={`#${id}`} className="hover:text-violet-400 transition-colors">
        {children}
        <span className="ml-2 opacity-0 group-hover:opacity-50 transition-opacity text-theme-muted text-lg">#</span>
      </a>
    </h2>
  );
}
