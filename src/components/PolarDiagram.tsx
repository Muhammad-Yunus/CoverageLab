import React from 'react';

interface PolarDiagramProps {
  title: string;
  pattern: number[]; // 36 values (0..350 deg) in dB relative to peak (0 to -20)
  rotationDeg?: number;
  size?: number;
}

export const PolarDiagram: React.FC<PolarDiagramProps> = ({
  title,
  pattern,
  rotationDeg = 0,
  size = 114,
}) => {
  const cx = size / 2;
  const cy = size / 2;
  const rMax = size * 0.46;

  const rings = [0.25, 0.5, 0.75, 1];
  const spokes = Array.from({ length: 12 }, (_, idx) => idx * 30);

  // Build SVG path for the radiation pattern
  const pts = (pattern.length ? pattern : new Array(36).fill(0)).map((val, idx) => {
    const db = Math.max(-20, Math.min(0, val));
    const norm = (db + 20) / 20;
    const angleDeg = idx * (360 / pattern.length) + rotationDeg - 90;
    const rad = (angleDeg * Math.PI) / 180;
    const r = norm * rMax;
    return `${(cx + Math.cos(rad) * r).toFixed(2)},${(cy + Math.sin(rad) * r).toFixed(2)}`;
  });

  return (
    <div className="flex flex-col items-center select-none">
      <span className="text-[12px] font-medium text-slate-200 mb-1.5">{title}</span>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="overflow-visible"
        aria-label={`${title} antenna polar diagram`}
      >
        {/* Outer grey circle background matching Screenshot 5 */}
        <circle cx={cx} cy={cy} r={rMax} fill="#c4c8cc" stroke="#1f2937" strokeWidth="1" />

        {/* Concentric attenuation grid rings */}
        {rings.slice(0, 3).map((frac, idx) => (
          <circle
            key={idx}
            cx={cx}
            cy={cy}
            r={rMax * frac}
            fill="none"
            stroke="#9aa0a6"
            strokeWidth="0.7"
          />
        ))}

        {/* Radial spokes every 30 degrees */}
        {spokes.map((deg) => {
          const rad = (deg * Math.PI) / 180;
          return (
            <line
              key={deg}
              x1={cx}
              y1={cy}
              x2={cx + Math.cos(rad) * rMax}
              y2={cy + Math.sin(rad) * rMax}
              stroke="#9aa0a6"
              strokeWidth="0.65"
            />
          );
        })}

        {/* Radiation lobe fill & outline */}
        <polygon
          points={pts.join(' ')}
          fill="rgba(160, 166, 173, 0.45)"
          stroke="#111827"
          strokeWidth="1.35"
        />

        {/* dB tick labels on bottom axis matching Screenshot 5 (-20 -15 -10 -5 0) */}
        {[
          { label: '-20', frac: 0.04 },
          { label: '-15', frac: 0.27 },
          { label: '-10', frac: 0.51 },
          { label: '-5', frac: 0.74 },
          { label: '0', frac: 0.94 },
        ].map((tick) => (
          <text
            key={tick.label}
            x={cx + rMax * tick.frac}
            y={cy + 3}
            fontSize="6.5"
            fill="#1f2937"
            textAnchor="middle"
            className="font-mono"
            style={{ writingMode: 'vertical-rl' }}
          >
            {tick.label}
          </text>
        ))}
      </svg>
    </div>
  );
};
