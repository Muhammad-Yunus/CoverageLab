import React from 'react';
import { Database, FileText, Play, Plus, Trash2, X } from 'lucide-react';
import { getUnitSymbol } from '../lib/colourSchemas.ts';
import type { RfProjectDTO, SimulationDTO } from '../types/rf.ts';

interface SavedLayersModalProps {
  isOpen: boolean;
  onClose: () => void;
  projects: RfProjectDTO[];
  simulations: SimulationDTO[];
  onLoadProject: (p: RfProjectDTO) => void;
  onDeleteProject: (id: number) => void;
  onSelectSimulation: (s: SimulationDTO) => void;
  onDeleteSimulation: (id: number) => void;
  onExportSimPdf: (s: SimulationDTO) => void;
  onOpenNewSite: () => void;
}

export const SavedLayersModal: React.FC<SavedLayersModalProps> = ({
  isOpen,
  onClose,
  projects,
  simulations,
  onLoadProject,
  onDeleteProject,
  onSelectSimulation,
  onDeleteSimulation,
  onExportSimPdf,
  onOpenNewSite,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Saved Simulations and Site Templates"
    >
      <div className="bg-[#2b2f34] text-slate-100 rounded-md shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col border border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-700 bg-[#23272b]">
          <div className="flex items-center gap-2">
            <Database className="w-4 h-4 text-cyan-400" />
            <h2 className="text-base font-semibold">Saved Sites, Templates &amp; Coverage Layers</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Close database layers modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 overflow-y-auto cl-scroll space-y-6">
          {/* Saved Sites / Templates */}
          <div>
            <div className="flex items-center justify-between mb-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Site Configurations ({projects.length})
              </h3>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenNewSite();
                }}
                className="px-2.5 py-1 text-xs font-medium bg-[#1ea853] hover:bg-[#179045] text-white rounded flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Site</span>
              </button>
            </div>
            {projects.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">No site templates stored yet.</p>
            ) : (
              <div className="divide-y divide-slate-700 border border-slate-700 rounded bg-[#23272b]">
                {projects.map((p) => (
                  <div
                    key={p.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-[#2f343a]"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        {p.name}{' '}
                        <span className="text-xs font-normal text-slate-400">· {p.network}</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {p.txLat.toFixed(5)}, {p.txLng.toFixed(5)} · {p.frequencyMhz} MHz ·{' '}
                        {p.rfPower} {p.rfPowerUnit} · {p.rangeKm} km
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onLoadProject(p);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-xs font-medium bg-cyan-600 hover:bg-cyan-500 text-white rounded flex items-center gap-1"
                      >
                        <Play className="w-3 h-3" />
                        Load
                      </button>
                      {p.userId !== null && (
                        <button
                          type="button"
                          onClick={() => onDeleteProject(p.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded"
                          aria-label={`Delete ${p.name}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Saved Coverage Simulations */}
          <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2.5">
              PostgreSQL Simulation Runs ({simulations.length})
            </h3>
            {simulations.length === 0 ? (
              <p className="text-xs text-slate-400 py-3">
                Run a simulation with the green Play button to store a coverage heatmap layer in PostgreSQL.
              </p>
            ) : (
              <div className="divide-y divide-slate-700 border border-slate-700 rounded bg-[#23272b]">
                {simulations.map((s) => (
                  <div
                    key={s.id}
                    className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 hover:bg-[#2f343a]"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-emerald-300 truncate">
                        {s.layerLabel}
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">
                        {s.frequencyMhz} MHz · Range {s.rangeKm} km · Avg {s.stats.avgVal}{' '}
                        {getUnitSymbol(s.measuredUnit)} · Coverage {s.stats.coveragePct}%
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          onSelectSimulation(s);
                          onClose();
                        }}
                        className="px-2.5 py-1 text-xs font-medium bg-[#1ea853] hover:bg-[#189046] text-white rounded"
                      >
                        Display
                      </button>
                      <button
                        type="button"
                        onClick={() => onExportSimPdf(s)}
                        className="px-2.5 py-1 text-xs font-medium bg-slate-600 hover:bg-slate-500 text-white rounded flex items-center gap-1"
                      >
                        <FileText className="w-3 h-3" />
                        PDF
                      </button>
                      {s.userId !== null && (
                        <button
                          type="button"
                          onClick={() => onDeleteSimulation(s.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-400 rounded"
                          aria-label={`Delete simulation ${s.layerLabel}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
