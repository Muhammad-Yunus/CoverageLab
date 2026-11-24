import React, { useEffect, useState } from 'react';
import { Crosshair, MapPin, Plus, X } from 'lucide-react';
import type { RfProjectDTO } from '../types/rf.ts';

export interface NewSitePayload {
  name: string;
  network: string;
  txLat: number;
  txLng: number;
  txHeightM: number;
  frequencyMhz: number;
  rfPower: number;
  rangeKm: number;
  mode: 'fresh' | 'clone';
}

interface NewSiteModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentProject: RfProjectDTO;
  mapCenter: { lat: number; lng: number };
  isSignedIn: boolean;
  onCreateSite: (payload: NewSitePayload) => Promise<void>;
}

export const NewSiteModal: React.FC<NewSiteModalProps> = ({
  isOpen,
  onClose,
  currentProject,
  mapCenter,
  isSignedIn,
  onCreateSite,
}) => {
  const [name, setName] = useState('');
  const [network, setNetwork] = useState('LoRa Network');
  const [txLat, setTxLat] = useState<number>(mapCenter.lat);
  const [txLng, setTxLng] = useState<number>(mapCenter.lng);
  const [txHeightM, setTxHeightM] = useState<number>(15);
  const [frequencyMhz, setFrequencyMhz] = useState<number>(923);
  const [rfPower, setRfPower] = useState<number>(27);
  const [rangeKm, setRangeKm] = useState<number>(5.0);
  const [mode, setMode] = useState<'fresh' | 'clone'>('fresh');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setName('');
      setNetwork(currentProject.network || 'LoRa Network');
      setTxLat(Number(mapCenter.lat.toFixed(6)));
      setTxLng(Number(mapCenter.lng.toFixed(6)));
      setTxHeightM(currentProject.txHeightM || 15);
      setFrequencyMhz(currentProject.frequencyMhz || 923);
      setRfPower(currentProject.rfPower || 27);
      setRangeKm(currentProject.rangeKm || 5.0);
      setMode('fresh');
      setError(null);
    }
  }, [isOpen, mapCenter.lat, mapCenter.lng, currentProject]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Site name is required.');
      return;
    }
    if (!Number.isFinite(txLat) || txLat < -85 || txLat > 85) {
      setError('Latitude must be between -85 and 85.');
      return;
    }
    if (!Number.isFinite(txLng) || txLng < -180 || txLng > 180) {
      setError('Longitude must be between -180 and 180.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await onCreateSite({
        name: trimmedName,
        network: network.trim() || 'Private RF',
        txLat: Number(txLat.toFixed(6)),
        txLng: Number(txLng.toFixed(6)),
        txHeightM: Math.max(1, txHeightM || 10),
        frequencyMhz: Math.max(30, frequencyMhz || 923),
        rfPower: Number.isFinite(rfPower) ? rfPower : 27,
        rangeKm: Math.max(0.5, Math.min(100, rangeKm || 5)),
        mode,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create site');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Create New RF Site"
    >
      <div className="bg-[#2b2f34] text-slate-100 rounded-md shadow-2xl w-full max-w-md border border-slate-700 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700 bg-[#23272b]">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-[#f59e0b]" />
            <h2 className="text-sm font-semibold">Create New RF Site</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1"
            aria-label="Close new site modal"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 space-y-3 text-xs">
          {!isSignedIn && (
            <div className="p-2.5 rounded bg-amber-500/15 border border-amber-500/35 text-amber-200 text-[11px] leading-snug">
              Sign in is required to store new sites in PostgreSQL. Clicking Create Site will open
              sign-in and save this site automatically.
            </div>
          )}

          {error && (
            <div className="p-2 rounded bg-rose-500/20 border border-rose-500/40 text-rose-200 text-[11px]">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-slate-300 mb-1">Site Name *</label>
              <input
                type="text"
                autoFocus
                placeholder="e.g. Bandung Relay 01"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full h-8 px-2.5 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Network</label>
              <input
                type="text"
                placeholder="e.g. LoRa Network"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="w-full h-8 px-2.5 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-slate-300">Transmitter Coordinates</label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setTxLat(Number(mapCenter.lat.toFixed(6)));
                    setTxLng(Number(mapCenter.lng.toFixed(6)));
                  }}
                  className="text-[11px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1"
                >
                  <Crosshair className="w-3 h-3" />
                  Map Center
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setTxLat(Number(currentProject.txLat.toFixed(6)));
                    setTxLng(Number(currentProject.txLng.toFixed(6)));
                  }}
                  className="text-[11px] text-slate-400 hover:text-slate-200"
                >
                  Current Tx
                </button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div>
                <input
                  type="number"
                  step="0.000001"
                  value={txLat}
                  onChange={(e) => setTxLat(parseFloat(e.target.value) || 0)}
                  aria-label="New site latitude"
                  className="w-full h-8 px-2.5 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400">Latitude (D.D)</span>
              </div>
              <div>
                <input
                  type="number"
                  step="0.000001"
                  value={txLng}
                  onChange={(e) => setTxLng(parseFloat(e.target.value) || 0)}
                  aria-label="New site longitude"
                  className="w-full h-8 px-2.5 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
                />
                <span className="text-[10px] text-slate-400">Longitude (D.D)</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <div>
              <label className="block text-slate-300 mb-1">Tx Height (m)</label>
              <input
                type="number"
                min="1"
                max="500"
                value={txHeightM}
                onChange={(e) => setTxHeightM(parseFloat(e.target.value) || 10)}
                className="w-full h-8 px-2 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Freq (MHz)</label>
              <input
                type="number"
                min="30"
                max="30000"
                value={frequencyMhz}
                onChange={(e) => setFrequencyMhz(parseFloat(e.target.value) || 923)}
                className="w-full h-8 px-2 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Power (dBm)</label>
              <input
                type="number"
                step="0.5"
                value={rfPower}
                onChange={(e) => setRfPower(parseFloat(e.target.value) || 27)}
                className="w-full h-8 px-2 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-300 mb-1">Range (km)</label>
              <input
                type="number"
                min="0.5"
                max="100"
                step="0.5"
                value={rangeKm}
                onChange={(e) => setRangeKm(parseFloat(e.target.value) || 5)}
                className="w-full h-8 px-2 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-slate-300 mb-1">Initial RF Preset</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setMode('fresh');
                  setTxHeightM(15);
                  setFrequencyMhz(923);
                  setRfPower(27);
                  setRangeKm(5);
                }}
                className={`py-1.5 px-2 rounded-sm border text-left transition-colors ${
                  mode === 'fresh'
                    ? 'bg-cyan-600/25 border-cyan-500 text-white'
                    : 'bg-[#23272b] border-slate-600 text-slate-300 hover:bg-[#34393f]'
                }`}
              >
                <div className="font-medium">Fresh Defaults</div>
                <div className="text-[10px] text-slate-400">923 MHz · 27 dBm · 5 km</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('clone');
                  setTxHeightM(currentProject.txHeightM);
                  setFrequencyMhz(currentProject.frequencyMhz);
                  setRfPower(currentProject.rfPower);
                  setRangeKm(currentProject.rangeKm);
                }}
                className={`py-1.5 px-2 rounded-sm border text-left transition-colors ${
                  mode === 'clone'
                    ? 'bg-cyan-600/25 border-cyan-500 text-white'
                    : 'bg-[#23272b] border-slate-600 text-slate-300 hover:bg-[#34393f]'
                }`}
              >
                <div className="font-medium">Clone Active Site</div>
                <div className="text-[10px] text-slate-400 truncate">
                  Copy {currentProject.name} settings
                </div>
              </button>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-sm bg-[#3a3f45] hover:bg-[#495057] text-slate-200 font-medium"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-3.5 py-1.5 rounded-sm bg-[#1ea853] hover:bg-[#189046] text-white font-medium flex items-center gap-1.5 disabled:opacity-60"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{submitting ? 'Creating...' : isSignedIn ? 'Create Site' : 'Sign in & Create'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
