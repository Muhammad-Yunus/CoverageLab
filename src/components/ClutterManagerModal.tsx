import React, { useEffect, useState } from 'react';
import { Save, Trash2, X, MapPin } from 'lucide-react';
import type { ClutterProfileDTO, LandCoverItem, ObstacleClassItem } from '../types/rf.ts';
import { LandCoverIllustration } from './LandCoverIllustrations.tsx';

interface ClutterManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: ClutterProfileDTO[];
  activeProfileId: number | null;
  onSelectProfile: (id: number) => void;
  onSaveProfile: (profile: ClutterProfileDTO) => Promise<ClutterProfileDTO | null>;
  onCreateProfile: (name: string, base: ClutterProfileDTO) => Promise<ClutterProfileDTO | null>;
  onDeleteProfile: (id: number) => Promise<void>;
  onDestroyAllObstacles: () => Promise<void>;
  onStartPlaceObstacle: (obs: ObstacleClassItem) => void;
  obstacleCount: number;
}

export const ClutterManagerModal: React.FC<ClutterManagerModalProps> = ({
  isOpen,
  onClose,
  profiles,
  activeProfileId,
  onSelectProfile,
  onSaveProfile,
  onCreateProfile,
  onDeleteProfile,
  onDestroyAllObstacles,
  onStartPlaceObstacle,
  obstacleCount,
}) => {
  const activeProfile =
    profiles.find((p) => p.id === activeProfileId) ?? profiles[0] ?? null;

  const [draft, setDraft] = useState<ClutterProfileDTO | null>(activeProfile);
  const [newProfileName, setNewProfileName] = useState('Custom Clutter');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (activeProfile) {
      setDraft(structuredClone(activeProfile));
      setNewProfileName(activeProfile.name.slice(0, 12));
    }
  }, [activeProfile, isOpen]);

  if (!isOpen || !draft) return null;

  const updateLandCover = (idx: number, field: keyof LandCoverItem, val: number) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.landCover];
      next[idx] = { ...next[idx], [field]: Number.isNaN(val) ? 0 : val };
      return { ...prev, landCover: next };
    });
  };

  const updateObstacle = (
    idx: number,
    field: keyof ObstacleClassItem,
    val: string | number
  ) => {
    setDraft((prev) => {
      if (!prev) return prev;
      const next = [...prev.obstacles];
      next[idx] = { ...next[idx], [field]: val };
      return { ...prev, obstacles: next };
    });
  };

  const handleOk = async () => {
    setBusy(true);
    try {
      await onSaveProfile(draft);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleCreate = async () => {
    if (!newProfileName.trim()) return;
    setBusy(true);
    try {
      const created = await onCreateProfile(newProfileName.trim(), draft);
      if (created) {
        onSelectProfile(created.id);
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-3 sm:p-5"
      role="dialog"
      aria-modal="true"
      aria-label="Clutter manager"
    >
      <div className="bg-white text-slate-900 rounded-md shadow-2xl w-full max-w-[820px] max-h-[92vh] flex flex-col border border-slate-300 overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-white">
          <h2 className="text-[19px] font-medium text-slate-800">Clutter manager</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-700 p-1 rounded transition-colors"
            aria-label="Close clutter manager"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto cl-scroll space-y-5">
          {/* Top Two-Column Controls matching Screenshot 1 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 mb-1">
                  Edit clutter profile
                </label>
                <select
                  value={draft.id}
                  onChange={(e) => onSelectProfile(Number(e.target.value))}
                  className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 mb-1">
                  Buildings attenuation
                </label>
                <select
                  value={draft.buildingsAtten}
                  onChange={(e) =>
                    setDraft({ ...draft, buildingsAtten: Number(e.target.value) })
                  }
                  className="w-full h-9 px-3 text-sm bg-white border border-slate-300 rounded text-slate-800 focus:outline-none focus:border-blue-500"
                >
                  {[0.05, 0.1, 0.15, 0.2, 0.35, 0.5, 0.75, 1.0, 1.5, 2.0].map((v) => (
                    <option key={v} value={v}>
                      {v} dB/m
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-[13px] font-semibold text-slate-700 mb-1">
                  Create new/Delete clutter profile
                </label>
                <div className="flex items-stretch">
                  <input
                    type="text"
                    value={newProfileName}
                    onChange={(e) => setNewProfileName(e.target.value)}
                    placeholder="Profile name"
                    className="flex-1 h-9 px-3 text-sm bg-white border border-slate-300 rounded-l text-slate-800 focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleCreate}
                    title="Save new clutter profile"
                    className="h-9 px-3 bg-[#15803d] hover:bg-[#166534] text-white flex items-center justify-center transition-colors disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                  </button>
                  <button
                    type="button"
                    disabled={busy || draft.isSystem}
                    onClick={() => onDeleteProfile(draft.id)}
                    title={
                      draft.isSystem
                        ? 'System presets cannot be deleted'
                        : 'Delete selected clutter profile'
                    }
                    className="h-9 px-3 bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded-r flex items-center justify-center transition-colors disabled:opacity-45"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="pt-2 flex items-center gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={onDestroyAllObstacles}
                  className="px-4 py-2 text-[13px] font-medium bg-[#dc2626] hover:bg-[#b91c1c] text-white rounded shadow-sm transition-colors"
                >
                  Destroy all obstacles
                </button>
                {obstacleCount > 0 && (
                  <span className="text-xs text-slate-500 tabular-nums">
                    {obstacleCount} placed on map
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Main 2-column Grid: Land Cover (left) + My Obstacles (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-1">
            {/* Land Cover 3x3 grid */}
            <div>
              <h3 className="text-center text-[20px] font-medium text-slate-800 mb-3">
                Land Cover
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {draft.landCover.map((lc, idx) => (
                  <div
                    key={lc.key}
                    className="relative rounded overflow-hidden border border-slate-300 bg-slate-100 h-[106px]"
                  >
                    <div className="absolute inset-0">
                      <LandCoverIllustration typeKey={lc.key} />
                    </div>
                    <div className="relative z-10 h-full flex flex-col justify-between p-1.5 bg-white/25 backdrop-blur-[1px]">
                      <div className="text-center text-[11px] font-bold text-slate-900 leading-tight drop-shadow-[0_1px_1px_rgba(255,255,255,0.95)] truncate">
                        {lc.label}
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-stretch h-6 bg-white/95 border border-slate-300 rounded overflow-hidden">
                          <input
                            type="number"
                            step="1"
                            min="0"
                            value={lc.heightM}
                            onChange={(e) =>
                              updateLandCover(idx, 'heightM', parseFloat(e.target.value))
                            }
                            aria-label={`${lc.label} height in meters`}
                            className="w-full px-1.5 text-[11px] text-slate-900 bg-transparent focus:outline-none tabular-nums"
                          />
                          <span className="px-1.5 bg-slate-100 border-l border-slate-300 text-[10px] text-slate-600 flex items-center">
                            m
                          </span>
                        </div>
                        <div className="flex items-stretch h-6 bg-white/95 border border-slate-300 rounded overflow-hidden">
                          <input
                            type="number"
                            step="0.01"
                            min="0"
                            value={lc.attenDbm}
                            onChange={(e) =>
                              updateLandCover(idx, 'attenDbm', parseFloat(e.target.value))
                            }
                            aria-label={`${lc.label} attenuation in dB/m`}
                            className="w-full px-1.5 text-[11px] text-slate-900 bg-transparent focus:outline-none tabular-nums"
                          />
                          <span className="px-1 bg-slate-100 border-l border-slate-300 text-[10px] text-slate-600 flex items-center whitespace-nowrap">
                            dB/m
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* My Obstacles 3x3 grid */}
            <div>
              <h3 className="text-center text-[20px] font-medium text-slate-800 mb-3">
                My Obstacles
              </h3>
              <div className="grid grid-cols-3 gap-2">
                {draft.obstacles.map((obs, idx) => (
                  <div
                    key={obs.index}
                    className="rounded border border-slate-200 bg-white p-1.5 flex flex-col justify-between h-[106px] shadow-[0_1px_0_rgba(0,0,0,0.04)]"
                  >
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={obs.name}
                        onChange={(e) => updateObstacle(idx, 'name', e.target.value)}
                        aria-label={`Obstacle ${obs.index} name`}
                        className="w-full min-w-0 h-6 px-1.5 text-[11px] text-slate-800 border border-slate-300 rounded focus:outline-none focus:border-blue-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          onStartPlaceObstacle(obs);
                          onClose();
                        }}
                        title={`Click to place ${obs.name} on map`}
                        style={{ backgroundColor: obs.color }}
                        className="w-9 h-6 shrink-0 rounded border border-black/15 flex items-center justify-center hover:scale-105 transition-transform"
                        aria-label={`Place ${obs.name} on map`}
                      >
                        <MapPin className="w-3 h-3 text-white drop-shadow" />
                      </button>
                    </div>
                    <div className="flex items-stretch h-6 bg-white border border-slate-300 rounded overflow-hidden">
                      <input
                        type="number"
                        step="1"
                        min="1"
                        value={obs.heightM}
                        onChange={(e) =>
                          updateObstacle(idx, 'heightM', parseFloat(e.target.value) || 0)
                        }
                        aria-label={`${obs.name} height`}
                        className="w-full px-1.5 text-[11px] text-slate-900 focus:outline-none tabular-nums"
                      />
                      <span className="px-1.5 bg-slate-100 border-l border-slate-300 text-[10px] text-slate-600 flex items-center">
                        m
                      </span>
                    </div>
                    <div className="flex items-stretch h-6 bg-white border border-slate-300 rounded overflow-hidden">
                      <input
                        type="number"
                        step="0.05"
                        min="0"
                        value={obs.attenDbm}
                        onChange={(e) =>
                          updateObstacle(idx, 'attenDbm', parseFloat(e.target.value) || 0)
                        }
                        aria-label={`${obs.name} attenuation`}
                        className="w-full px-1.5 text-[11px] text-slate-900 focus:outline-none tabular-nums"
                      />
                      <span className="px-1 bg-slate-100 border-l border-slate-300 text-[10px] text-slate-600 flex items-center whitespace-nowrap">
                        dB/m
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-slate-500 mt-1.5">
                Click any colored obstacle swatch to place that obstacle directly on the map.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-slate-200 bg-slate-50">
          <button
            type="button"
            disabled={busy}
            onClick={handleOk}
            className="px-5 py-1.5 text-sm font-medium bg-[#6c757d] hover:bg-[#5a6268] text-white rounded transition-colors disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'OK'}
          </button>
        </div>
      </div>
    </div>
  );
};
