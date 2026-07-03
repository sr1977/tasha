export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <g fill="currentColor">
        <rect x="10" y="13" width="6" height="38" />
        <rect x="22" y="11" width="6" height="41" />
        <rect x="34" y="14" width="6" height="38" />
        <rect x="46" y="12" width="6" height="40" />
      </g>
      <path d="M6 52 58 11" stroke="var(--accent)" strokeWidth="8" fill="none" />
    </svg>
  );
}
