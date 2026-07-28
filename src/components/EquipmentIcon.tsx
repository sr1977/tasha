import type { Equipment } from '../types';

// Hard-edged kit marks — functional signal that a station needs shared equipment.
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

export function MedicineBallIcon({ className }: { className?: string }) {
  return (
    <svg
      className={`dumbbell ${className ?? ''}`}
      viewBox="0 0 24 24"
      role="img"
      aria-label="medicine ball"
      fill="currentColor"
    >
      {/* Solid domes split by the equator seam — stays legible at 14px, where a
          thin ring and stitch marks disappear. */}
      <path d="M2.2 10a10 10 0 0 1 19.6 0z" />
      <path d="M21.8 14a10 10 0 0 1-19.6 0z" />
      <path d="M9 11h6v2H9z" />
    </svg>
  );
}

/** The mark for a station's kit, or nothing at all for bodyweight. */
export function EquipmentIcon({ equipment }: { equipment: Equipment }) {
  if (equipment === 'dumbbells') return <DumbbellIcon />;
  if (equipment === 'medicine ball') return <MedicineBallIcon />;
  return null;
}
