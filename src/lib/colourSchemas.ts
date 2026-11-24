export interface ColourStop {
  value: number; // dBm (or unit value)
  color: string; // hex
}

export interface ColourSchemaDef {
  name: string;
  unitLabel: string;
  stops: ColourStop[]; // ordered from highest (strongest signal) to lowest (weakest)
}

export const COLOUR_SCHEMAS: ColourSchemaDef[] = [
  {
    name: 'LORA',
    unitLabel: 'dBm',
    stops: [
      { value: -50, color: '#39e600' },
      { value: -54, color: '#3ae100' },
      { value: -58, color: '#45d700' },
      { value: -62, color: '#4ece00' },
      { value: -66, color: '#53c800' },
      { value: -70, color: '#58c000' },
      { value: -74, color: '#54cb1b' },
      { value: -78, color: '#44d63a' },
      { value: -82, color: '#38db56' },
      { value: -86, color: '#27e177' },
      { value: -90, color: '#14e89a' },
      { value: -94, color: '#0ce6b6' },
      { value: -98, color: '#05dcda' },
      { value: -102, color: '#00c9f0' },
      { value: -106, color: '#00b4fb' },
      { value: -110, color: '#009cff' },
      { value: -114, color: '#0082f7' },
      { value: -118, color: '#0068ec' },
      { value: -122, color: '#0450dd' },
      { value: -126, color: '#083bcf' },
      { value: -130, color: '#0c29bf' },
      { value: -134, color: '#1218af' },
      { value: -138, color: '#180c9f' },
      { value: -142, color: '#1e048f' },
    ],
  },
  {
    name: 'RAINBOW',
    unitLabel: 'dBm',
    stops: [
      { value: -60, color: '#d91f1f' },
      { value: -65, color: '#e65119' },
      { value: -70, color: '#cc9a00' },
      { value: -75, color: '#aacc00' },
      { value: -80, color: '#6dd400' },
      { value: -85, color: '#22c91a' },
      { value: -90, color: '#00be70' },
      { value: -95, color: '#00b4b4' },
      { value: -100, color: '#008ee0' },
      { value: -105, color: '#0055cc' },
    ],
  },
  {
    name: 'RAINBOW45',
    unitLabel: 'dBm',
    stops: [
      { value: -45, color: '#e11d48' },
      { value: -55, color: '#f97316' },
      { value: -65, color: '#eab308' },
      { value: -75, color: '#84cc16' },
      { value: -85, color: '#10b981' },
      { value: -95, color: '#06b6d4' },
      { value: -105, color: '#2563eb' },
      { value: -115, color: '#4338ca' },
    ],
  },
  {
    name: 'LTE',
    unitLabel: 'dBm',
    stops: [
      { value: -60, color: '#16a34a' },
      { value: -70, color: '#65a30d' },
      { value: -80, color: '#ca8a04' },
      { value: -90, color: '#ea580c' },
      { value: -100, color: '#dc2626' },
      { value: -110, color: '#991b1b' },
      { value: -120, color: '#581c87' },
    ],
  },
  {
    name: 'RSRP',
    unitLabel: 'dBm',
    stops: [
      { value: -65, color: '#15803d' },
      { value: -75, color: '#22c55e' },
      { value: -85, color: '#84cc16' },
      { value: -95, color: '#eab308' },
      { value: -105, color: '#f97316' },
      { value: -115, color: '#ef4444' },
      { value: -125, color: '#7f1d1d' },
    ],
  },
  {
    name: 'CALIB',
    unitLabel: 'dBm',
    stops: [
      { value: -50, color: '#fef08a' },
      { value: -65, color: '#facc15' },
      { value: -80, color: '#f97316' },
      { value: -95, color: '#dc2626' },
      { value: -110, color: '#9333ea' },
      { value: -125, color: '#3b82f6' },
    ],
  },
  {
    name: 'GREEN',
    unitLabel: 'dBm',
    stops: [
      { value: -55, color: '#bbf7d0' },
      { value: -70, color: '#4ade80' },
      { value: -85, color: '#22c55e' },
      { value: -100, color: '#15803d' },
      { value: -115, color: '#14532d' },
    ],
  },
  {
    name: 'HF',
    unitLabel: 'dBm',
    stops: [
      { value: -55, color: '#ef4444' },
      { value: -70, color: '#f59e0b' },
      { value: -85, color: '#10b981' },
      { value: -100, color: '#06b6d4' },
      { value: -115, color: '#1d4ed8' },
    ],
  },
  {
    name: 'PLASMA',
    unitLabel: 'dBm',
    stops: [
      { value: -55, color: '#f0f921' },
      { value: -70, color: '#fdb42f' },
      { value: -85, color: '#ed7953' },
      { value: -100, color: '#cc4778' },
      { value: -115, color: '#9c179e' },
      { value: -130, color: '#46039f' },
    ],
  },
  {
    name: 'RGB',
    unitLabel: 'dBm',
    stops: [
      { value: -60, color: '#ff0000' },
      { value: -80, color: '#00ff00' },
      { value: -100, color: '#0000ff' },
      { value: -120, color: '#000080' },
    ],
  },
  {
    name: 'SATCOM',
    unitLabel: 'dBm',
    stops: [
      { value: -70, color: '#38bdf8' },
      { value: -85, color: '#0ea5e9' },
      { value: -100, color: '#0284c7' },
      { value: -115, color: '#1d4ed8' },
      { value: -130, color: '#312e81' },
    ],
  },
  {
    name: 'Cellular (5)',
    unitLabel: 'dBm',
    stops: [
      { value: -65, color: '#22c55e' },
      { value: -75, color: '#84cc16' },
      { value: -85, color: '#eab308' },
      { value: -95, color: '#f97316' },
      { value: -105, color: '#ef4444' },
    ],
  },
  {
    name: 'Red',
    unitLabel: 'dBm',
    stops: [
      { value: -60, color: '#dc2626' },
      { value: -80, color: '#ef4444' },
      { value: -100, color: '#f87171' },
      { value: -120, color: '#fecaca' },
    ],
  },
  {
    name: 'Green',
    unitLabel: 'dBm',
    stops: [
      { value: -60, color: '#15803d' },
      { value: -80, color: '#22c55e' },
      { value: -100, color: '#4ade80' },
      { value: -120, color: '#bbf7d0' },
    ],
  },
  {
    name: 'Blue',
    unitLabel: 'dBm',
    stops: [
      { value: -60, color: '#1d4ed8' },
      { value: -80, color: '#3b82f6' },
      { value: -100, color: '#60a5fa' },
      { value: -120, color: '#bfdbfe' },
    ],
  },
  {
    name: 'Microwave (7)',
    unitLabel: 'dBm',
    stops: [
      { value: -45, color: '#b91c1c' },
      { value: -55, color: '#ea580c' },
      { value: -65, color: '#eab308' },
      { value: -75, color: '#22c55e' },
      { value: -85, color: '#06b6d4' },
      { value: -95, color: '#2563eb' },
      { value: -105, color: '#4f46e5' },
    ],
  },
  {
    name: 'Greyscale GIS',
    unitLabel: 'dBm',
    stops: [
      { value: -60, color: '#f8fafc' },
      { value: -75, color: '#cbd5e1' },
      { value: -90, color: '#94a3b8' },
      { value: -105, color: '#475569' },
      { value: -120, color: '#1e293b' },
    ],
  },
  {
    name: 'Rainbow (24)',
    unitLabel: 'dBm',
    stops: [
      { value: -50, color: '#d91f1f' },
      { value: -58, color: '#eb5e28' },
      { value: -66, color: '#f59e0b' },
      { value: -74, color: '#eab308' },
      { value: -82, color: '#84cc16' },
      { value: -90, color: '#22c55e' },
      { value: -98, color: '#14b8a6' },
      { value: -106, color: '#06b6d4' },
      { value: -114, color: '#3b82f6' },
      { value: -122, color: '#6366f1' },
      { value: -130, color: '#8b5cf6' },
    ],
  },
  {
    name: 'TV broadcasting (4)',
    unitLabel: 'dBm',
    stops: [
      { value: -55, color: '#16a34a' },
      { value: -70, color: '#eab308' },
      { value: -85, color: '#f97316' },
      { value: -100, color: '#dc2626' },
    ],
  },
  {
    name: 'Boundary - RED',
    unitLabel: 'dBm',
    stops: [
      { value: -60, color: '#dc2626' },
      { value: -95, color: '#ef4444' },
      { value: -110, color: '#f87171' },
    ],
  },
];

export function getColourSchema(name: string): ColourSchemaDef {
  return COLOUR_SCHEMAS.find((s) => s.name === name) ?? COLOUR_SCHEMAS[0];
}

export function getUnitSymbol(measuredUnit?: string): string {
  switch (measuredUnit) {
    case 'Path Loss (dB)':
    case 'SNR (dB)':
      return 'dB';
    case 'Field Strength (dBuV/m)':
      return 'dBuV/m';
    default:
      return 'dBm';
  }
}

export function getColourSchemaForUnit(name: string, measuredUnit?: string): ColourSchemaDef {
  const base = getColourSchema(name);
  if (!measuredUnit || measuredUnit === 'Received Power (dBm)') {
    return base;
  }

  const count = base.stops.length;
  const denom = Math.max(1, count - 1);

  if (measuredUnit === 'SNR (dB)') {
    const high = 45;
    const low = -15;
    return {
      ...base,
      unitLabel: 'dB',
      stops: base.stops.map((s, idx) => ({
        color: s.color,
        value: Math.round(high - ((high - low) * idx) / denom),
      })),
    };
  }

  if (measuredUnit === 'Field Strength (dBuV/m)') {
    const high = 110;
    const low = 20;
    return {
      ...base,
      unitLabel: 'dBuV/m',
      stops: base.stops.map((s, idx) => ({
        color: s.color,
        value: Math.round(high - ((high - low) * idx) / denom),
      })),
    };
  }

  if (measuredUnit === 'Path Loss (dB)') {
    // Path loss is ascending: lowest loss = strongest signal (index 0 color), highest loss = weakest
    const lowLoss = 65;
    const highLoss = 165;
    return {
      ...base,
      unitLabel: 'dB',
      stops: base.stops.map((s, idx) => ({
        color: s.color,
        value: Math.round(lowLoss + ((highLoss - lowLoss) * idx) / denom),
      })),
    };
  }

  return base;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return [r, g, b];
}

export function valueToRgba(
  val: number,
  schemaName: string,
  alpha = 205,
  measuredUnit?: string
): [number, number, number, number] | null {
  if (val <= -900 || Number.isNaN(val)) return null;
  const schema = getColourSchemaForUnit(schemaName, measuredUnit);
  const stops = schema.stops;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const isAscending = first.value < last.value; // e.g., Path Loss (65 dB -> 165 dB)

  if (isAscending) {
    if (val > last.value) return null;
    if (val <= first.value) {
      const [r, g, b] = hexToRgb(first.color);
      return [r, g, b, alpha];
    }
    for (let i = 0; i < stops.length - 1; i++) {
      const low = stops[i];
      const high = stops[i + 1];
      if (val >= low.value && val <= high.value) {
        const t = (val - low.value) / Math.max(0.0001, high.value - low.value);
        const [r1, g1, b1] = hexToRgb(low.color);
        const [r2, g2, b2] = hexToRgb(high.color);
        return [
          Math.round(r1 + (r2 - r1) * t),
          Math.round(g1 + (g2 - g1) * t),
          Math.round(b1 + (b2 - b1) * t),
          alpha,
        ];
      }
    }
    const [r, g, b] = hexToRgb(last.color);
    return [r, g, b, alpha];
  }

  if (val < last.value) return null;
  if (val >= first.value) {
    const [r, g, b] = hexToRgb(first.color);
    return [r, g, b, alpha];
  }
  for (let i = 0; i < stops.length - 1; i++) {
    const high = stops[i];
    const low = stops[i + 1];
    if (val <= high.value && val >= low.value) {
      const t = (high.value - val) / Math.max(0.0001, high.value - low.value);
      const [r1, g1, b1] = hexToRgb(high.color);
      const [r2, g2, b2] = hexToRgb(low.color);
      return [
        Math.round(r1 + (r2 - r1) * t),
        Math.round(g1 + (g2 - g1) * t),
        Math.round(b1 + (b2 - b1) * t),
        alpha,
      ];
    }
  }
  const [r, g, b] = hexToRgb(last.color);
  return [r, g, b, alpha];
}

