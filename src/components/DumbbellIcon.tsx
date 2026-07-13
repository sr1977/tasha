// Hard-edged dumbbell mark — functional signal that a station needs the weights.
export function DumbbellIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`dumbbell ${className ?? ''}`}
      viewBox="0 0 24 24"
      role="img"
      aria-label="dumbbells"
      fill="currentColor"
    >
      <path d="M2 8h2v8H2zM5 6h2v12H5zM17 6h2v12h-2zM20 8h2v8h-2zM7 11h10v2H7z" />
    </svg>
  );
}
