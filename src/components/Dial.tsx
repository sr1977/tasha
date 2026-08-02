import { useRef } from 'react';

// ponytail: hand-rolled SVG knob instead of a dial library — the knob libs are
// unmaintained and this is ~60 lines with zero dependencies.
const SWEEP = 270; // degrees of travel, -135° (0) to +135° (100)

/** A rotary knob for a 0–100 value: drag around it, or arrow keys. */
export function Dial({
  value,
  onChange,
  label,
  ariaLabel = 'How should Tasha behave today?',
}: {
  value: number;
  onChange: (v: number) => void;
  label?: string;
  ariaLabel?: string;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const angle = (value / 100) * SWEEP - SWEEP / 2;

  const fromPointer = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    let a = (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI + 90;
    if (a > 180) a -= 360; // 0° = straight up, clockwise positive
    a = Math.max(-SWEEP / 2, Math.min(SWEEP / 2, a));
    onChange(Math.round(((a + SWEEP / 2) / SWEEP) * 100));
  };

  return (
    <svg
      ref={ref}
      className="dial"
      viewBox="-50 -50 100 100"
      role="slider"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={value}
      aria-valuetext={label ? `${value}, ${label}` : undefined}
      tabIndex={0}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        fromPointer(e);
      }}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && fromPointer(e)}
      onKeyDown={(e) => {
        if (e.key === 'ArrowUp' || e.key === 'ArrowRight') onChange(Math.min(100, value + 5));
        if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') onChange(Math.max(0, value - 5));
      }}
    >
      {/* tick marks along the sweep — every 5th is a major */}
      {Array.from({ length: 21 }, (_, i) => {
        const t = ((i / 20) * SWEEP - SWEEP / 2) * (Math.PI / 180);
        const major = i % 5 === 0;
        const inner = major ? 38 : 42;
        return (
          <line
            key={i}
            x1={Math.sin(t) * inner}
            y1={-Math.cos(t) * inner}
            x2={Math.sin(t) * 48}
            y2={-Math.cos(t) * 48}
            className={`tick${major ? ' major' : ''}${i * 5 <= value ? ' on' : ''}`}
          />
        );
      })}
      <circle r="34" className="knob" />
      {/* the number is the readout: scales with the knob, legible across the room */}
      <text className="readout" x="0" y="0" textAnchor="middle" dominantBaseline="central">
        {value}
      </text>
      {/* pointer */}
      <line x1="0" y1="-28" x2="0" y2="-49" className="pointer" transform={`rotate(${angle})`} />
    </svg>
  );
}
