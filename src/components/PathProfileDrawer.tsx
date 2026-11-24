import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import type { PathProfileResult } from '../types/rf.ts';

interface PathProfileDrawerProps {
  profile: PathProfileResult | null;
  loading: boolean;
  onClose: () => void;
  onExportKmz: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportCsv: () => void;
}

export const PathProfileDrawer: React.FC<PathProfileDrawerProps> = ({
  profile,
  loading,
  onClose,
  onExportKmz,
  onExportPng,
  onExportPdf,
  onExportCsv,
}) => {
  const [layers, setLayers] = useState({
    Building: true,
    Trees: true,
    BareEarth: true,
    Grassland: true,
    BuiltUp: true,
    Terrain: true,
    Fresnel: true,
    LOS: true,
  });
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const chartWrapRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState<number>(820);

  useEffect(() => {
    const el = chartWrapRef.current;
    if (!el) return;
    const updateWidth = () => {
      const w = Math.floor(el.getBoundingClientRect().width);
      if (w > 120) setChartWidth(w);
    };
    updateWidth();
    const ro = new ResizeObserver(updateWidth);
    ro.observe(el);
    window.addEventListener('resize', updateWidth);
    document.addEventListener('fullscreenchange', updateWidth);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', updateWidth);
      document.removeEventListener('fullscreenchange', updateWidth);
    };
  }, [Boolean(profile)]);

  const chartMeta = useMemo(() => {
    if (!profile || profile.samples.length === 0) return null;
    let maxH = 150;
    let minH = 0;
    for (const s of profile.samples) {
      const top = Math.max(
        s.terrainM + Math.max(s.buildingM, s.treesM, s.obstacleM),
        s.fresnelUpperM,
        s.losM
      );
      if (top > maxH) maxH = top;
      if (s.terrainM < minH) minH = s.terrainM;
    }
    maxH = Math.ceil(maxH / 25) * 25;
    minH = Math.floor(minH / 10) * 10;
    return { maxH, minH };
  }, [profile]);

  if (!profile && !loading) return null;

  const toggle = (key: keyof typeof layers) =>
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));

  const W = Math.max(360, chartWidth);
  const H = 150;
  const padL = 38;
  const padR = 16;
  const padT = 12;
  const padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const tickCount = W >= 1100 ? 15 : W >= 700 ? 10 : 6;

  const samples = profile?.samples ?? [];
  const minH = chartMeta?.minH ?? 0;
  const maxH = chartMeta?.maxH ?? 160;

  const xOf = (idx: number) =>
    padL + (idx / Math.max(1, samples.length - 1)) * plotW;
  const yOf = (val: number) =>
    padT + plotH - ((val - minH) / Math.max(1, maxH - minH)) * plotH;

  const terrainPath = samples.length
    ? `M ${xOf(0)},${yOf(minH)} ` +
      samples.map((s, i) => `L ${xOf(i).toFixed(1)},${yOf(s.terrainM).toFixed(1)}`).join(' ') +
      ` L ${xOf(samples.length - 1)},${yOf(minH)} Z`
    : '';

  const fresnelUpperPath = samples
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)},${yOf(s.fresnelUpperM).toFixed(1)}`)
    .join(' ');
  const fresnelLowerPath = samples
    .map((s, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)},${yOf(s.fresnelLowerM).toFixed(1)}`)
    .join(' ');

  const hoveredSample = hoverIdx !== null ? samples[hoverIdx] : null;
  const mainDbm = hoveredSample ? hoveredSample.rxPowerDbm : profile?.receivedPowerDbm;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-30 bg-[#1a1d21]/92 backdrop-blur-[2px] border-t border-white/15 text-slate-100 select-none">
      {/* Top Link Budget Header matching Screenshot 12 */}
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 pt-1.5 pb-1 text-[11px] leading-snug border-b border-white/10">
        {profile ? (
          <div className="space-y-0.5 font-sans">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span>
                <strong className="text-slate-300">Distance:</strong>{' '}
                <span className="font-mono">{profile.distanceKm} Km</span>
              </span>
              <span>
                <strong className="text-slate-300">Bearing to Rx:</strong>{' '}
                <span className="font-mono">{profile.bearingDeg}°</span>
              </span>
              <span>
                <strong className="text-slate-300">Downtilt to Rx:</strong>{' '}
                <span className="font-mono">{profile.downtiltDeg}°</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
              <span>
                <strong className="text-slate-300">Frequency:</strong>{' '}
                <span className="font-mono">{profile.frequencyMhz}MHz</span>
              </span>
              <span>
                <strong className="text-slate-300">Model:</strong> {profile.modelName}
              </span>
              <span>
                <strong className="text-slate-300">Path-loss:</strong>{' '}
                <span className="font-mono">{profile.pathLossDb}dB</span>
              </span>
              <span>
                <strong className="text-slate-300">Received-power:</strong>{' '}
                <span className="font-mono text-emerald-300">{profile.receivedPowerDbm}dBm</span>
              </span>
              <span>
                <strong className="text-slate-300">Field-strength:</strong>{' '}
                <span className="font-mono">{profile.fieldStrengthDbuvm}dBuV/m</span>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-slate-200">
              <span>
                <strong className="text-slate-300">Tx antenna gain:</strong>{' '}
                <span className="font-mono">
                  {profile.txGainDbd}dBd / {profile.txGainDbi}dBi
                </span>
              </span>
              <span>
                <strong className="text-slate-300">ERP:</strong>{' '}
                <span className="font-mono">
                  {profile.erpW}W / {profile.erpDbm}dBm
                </span>
              </span>
              <span>
                <strong className="text-slate-300">EIRP:</strong>{' '}
                <span className="font-mono">
                  {profile.eirpW}W / {profile.eirpDbm}dBm
                </span>
              </span>
              <span>
                <strong className="text-slate-300">Rx antenna gain:</strong>{' '}
                <span className="font-mono">
                  {profile.rxGainDbd}dBd / {profile.rxGainDbi}dBi
                </span>
              </span>
            </div>
          </div>
        ) : (
          <div className="text-xs text-slate-300 py-2">
            Computing terrain &amp; Fresnel link budget...
          </div>
        )}

        {/* Quick Export Links + Close */}
        <div className="flex items-center gap-2.5 text-[11px] shrink-0">
          <button
            type="button"
            onClick={onExportKmz}
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            KMZ
          </button>
          <button
            type="button"
            onClick={onExportPng}
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            PNG
          </button>
          <button
            type="button"
            onClick={onExportCsv}
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            CSV
          </button>
          <button
            type="button"
            onClick={onExportPdf}
            className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-medium"
          >
            PDF Report
          </button>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-0.5"
            aria-label="Close path profile"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Profile Graph + Right Legend */}
      {profile && (
        <div className="relative flex items-stretch px-2 py-1.5 gap-2">
          {/* Center Big Signal Readout matching Screenshot 12 */}
          <div className="pointer-events-none absolute top-2 left-1/2 -translate-x-1/2 z-10 text-center">
            <div className="text-[20px] font-semibold text-white font-mono drop-shadow">
              {Math.round(mainDbm ?? profile.receivedPowerDbm)} dBm
            </div>
            {hoveredSample && (
              <div className="text-[10px] text-slate-300 font-mono bg-black/60 px-1.5 py-0.5 rounded">
                {hoveredSample.distanceKm} km · Terrain {hoveredSample.terrainM}m · LOS{' '}
                {hoveredSample.losM}m
              </div>
            )}
          </div>

          <div ref={chartWrapRef} className="flex-1 min-w-0 relative">
            {/* Tx / Rx Anchor Labels */}
            <div className="pointer-events-none flex justify-between px-10 text-[10px] text-slate-300 font-mono -mb-3">
              <span>
                Tx: {profile.txLat.toFixed(5)}, {profile.txLng.toFixed(5)} ({profile.txHeightAgl}m AGL)
              </span>
              <span>
                Rx: {profile.rxLat.toFixed(5)}, {profile.rxLng.toFixed(5)} ({profile.rxHeightAgl}m AGL)
              </span>
            </div>

            <svg
              width="100%"
              height={H}
              viewBox={`0 0 ${W} ${H}`}
              className="block w-full h-[150px] cursor-crosshair"
              onMouseMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const relX = ((e.clientX - rect.left) / Math.max(1, rect.width)) * W;
                const frac = Math.max(0, Math.min(1, (relX - padL) / plotW));
                setHoverIdx(Math.round(frac * (samples.length - 1)));
              }}
              onMouseLeave={() => setHoverIdx(null)}
            >
              {/* Y Gridlines */}
              {[0, 50, 100, 150].map((val) => {
                if (val > maxH) return null;
                const y = yOf(val);
                return (
                  <g key={val}>
                    <line
                      x1={padL}
                      y1={y}
                      x2={padL + plotW}
                      y2={y}
                      stroke="rgba(255,255,255,0.14)"
                      strokeWidth="0.8"
                    />
                    <text
                      x={padL - 5}
                      y={y + 3}
                      textAnchor="end"
                      fontSize="9"
                      fill="#cbd5e1"
                      className="font-mono"
                    >
                      {val}
                    </text>
                  </g>
                );
              })}

              {/* X Axis Distance Ticks */}
              {Array.from({ length: tickCount }, (_, k) => {
                const frac = (k + 1) / tickCount;
                const d = (profile.distanceKm * frac).toFixed(1);
                const x = padL + frac * plotW;
                return (
                  <g key={k}>
                    <line
                      x1={x}
                      y1={padT}
                      x2={x}
                      y2={padT + plotH}
                      stroke="rgba(255,255,255,0.08)"
                      strokeWidth="0.6"
                    />
                    <text
                      x={x}
                      y={H - 5}
                      textAnchor="middle"
                      fontSize="9"
                      fill="#cbd5e1"
                      className="font-mono"
                    >
                      {d}
                    </text>
                  </g>
                );
              })}

              <text x={10} y={padT + plotH / 2} fontSize="9" fill="#94a3b8">
                m
              </text>

              {/* Terrain Base */}
              {layers.Terrain && <path d={terrainPath} fill="#c2b29b" opacity="0.72" />}

              {/* Clutter Bars */}
              {samples.map((s, i) => {
                const bw = Math.max(4, plotW / samples.length);
                const x = xOf(i) - bw / 2;
                const yBase = yOf(s.terrainM);
                return (
                  <g key={i}>
                    {layers.Grassland && s.grasslandM > 0 && (
                      <rect
                        x={x}
                        y={yOf(s.terrainM + s.grasslandM)}
                        width={bw}
                        height={Math.max(1, yBase - yOf(s.terrainM + s.grasslandM))}
                        fill="#84cc16"
                        opacity="0.75"
                      />
                    )}
                    {layers.BareEarth && s.bareEarthM > 0 && (
                      <rect
                        x={x}
                        y={yOf(s.terrainM + s.bareEarthM)}
                        width={bw}
                        height={Math.max(1, yBase - yOf(s.terrainM + s.bareEarthM))}
                        fill="#a8a29e"
                        opacity="0.7"
                      />
                    )}
                    {layers.BuiltUp && s.builtUpM > 0 && (
                      <rect
                        x={x}
                        y={yOf(s.terrainM + s.builtUpM)}
                        width={bw}
                        height={Math.max(1, yBase - yOf(s.terrainM + s.builtUpM))}
                        fill="#f87171"
                        opacity="0.55"
                      />
                    )}
                    {layers.Trees && s.treesM > 0 && (
                      <rect
                        x={x}
                        y={yOf(s.terrainM + s.treesM)}
                        width={bw}
                        height={Math.max(1, yBase - yOf(s.terrainM + s.treesM))}
                        fill="#22c55e"
                        opacity="0.65"
                      />
                    )}
                    {layers.Building && s.buildingM > 0 && (
                      <rect
                        x={x}
                        y={yOf(s.terrainM + s.buildingM)}
                        width={bw}
                        height={Math.max(1, yBase - yOf(s.terrainM + s.buildingM))}
                        fill="#e2e8f0"
                        opacity="0.82"
                      />
                    )}
                    {s.obstacleM > 0 && (
                      <rect
                        x={x}
                        y={yOf(s.terrainM + s.obstacleM)}
                        width={bw}
                        height={Math.max(1, yBase - yOf(s.terrainM + s.obstacleM))}
                        fill="#f97316"
                        opacity="0.9"
                      />
                    )}
                  </g>
                );
              })}

              {/* Fresnel Zone Dashed Red */}
              {layers.Fresnel && (
                <>
                  <path
                    d={fresnelUpperPath}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                  />
                  <path
                    d={fresnelLowerPath}
                    fill="none"
                    stroke="#ef4444"
                    strokeWidth="1"
                    strokeDasharray="3,3"
                  />
                </>
              )}

              {/* Direct LOS Line */}
              {layers.LOS && samples.length > 1 && (
                <line
                  x1={xOf(0)}
                  y1={yOf(samples[0].losM)}
                  x2={xOf(samples.length - 1)}
                  y2={yOf(samples[samples.length - 1].losM)}
                  stroke="#ef4444"
                  strokeWidth="1.5"
                />
              )}

              {/* Hover Crosshair */}
              {hoverIdx !== null && samples[hoverIdx] && (
                <line
                  x1={xOf(hoverIdx)}
                  y1={padT}
                  x2={xOf(hoverIdx)}
                  y2={padT + plotH}
                  stroke="#38bdf8"
                  strokeWidth="1"
                />
              )}
            </svg>
          </div>

          {/* Right Legend Checkboxes matching Screenshot 12 */}
          <div className="w-[108px] shrink-0 text-[10px] space-y-1 border-l border-white/10 pl-2 py-0.5 hidden sm:block">
            {[
              { key: 'Building' as const, label: 'Building', color: '#e2e8f0', line: false },
              { key: 'Trees' as const, label: 'Trees', color: '#22c55e', line: false },
              { key: 'BareEarth' as const, label: 'Bare earth', color: '#a8a29e', line: false },
              { key: 'Grassland' as const, label: 'Grassland', color: '#84cc16', line: false },
              { key: 'BuiltUp' as const, label: 'Built-up', color: '#f87171', line: false },
              { key: 'Terrain' as const, label: 'Terrain', color: '#c2b29b', line: false },
              { key: 'Fresnel' as const, label: 'Fresnel', color: '#ef4444', line: true, dash: true },
              { key: 'LOS' as const, label: 'LOS', color: '#ef4444', line: true, dash: false },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center gap-1.5 cursor-pointer hover:text-white text-slate-300"
              >
                <input
                  type="checkbox"
                  checked={layers[item.key]}
                  onChange={() => toggle(item.key)}
                  className="w-3 h-3 accent-blue-500"
                />
                {item.line ? (
                  <span
                    className="w-3 inline-block border-t-2"
                    style={{
                      borderColor: item.color,
                      borderStyle: item.dash ? 'dashed' : 'solid',
                    }}
                  />
                ) : (
                  <span
                    className="w-2.5 h-2.5 inline-block rounded-[1px]"
                    style={{ backgroundColor: item.color }}
                  />
                )}
                <span className="truncate">{item.label}</span>
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
