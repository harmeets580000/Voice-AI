/**
 * Placeholder brand logo — a rounded "soundwave + ring" mark in the accent color plus an
 * optional wordmark. Uses theme tokens so it adapts to light/dark. Swap the SVG later for a
 * real brand asset.
 */
export function Logo({
  withWordmark = true,
  size = 28,
}: {
  withWordmark?: boolean;
  size?: number;
}) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        aria-hidden
        className="shrink-0"
      >
        <rect width="32" height="32" rx="9" fill="var(--accent)" />
        <g
          stroke="var(--on-accent)"
          strokeWidth="2.2"
          strokeLinecap="round"
        >
          <line x1="10" y1="13" x2="10" y2="19" />
          <line x1="14.5" y1="9.5" x2="14.5" y2="22.5" />
          <line x1="19" y1="12" x2="19" y2="20" />
          <line x1="23" y1="14.5" x2="23" y2="17.5" />
        </g>
      </svg>
      {withWordmark && (
        <span className="font-display text-[15px] font-semibold tracking-tight text-text">
          AI Receptionist
        </span>
      )}
    </span>
  );
}
