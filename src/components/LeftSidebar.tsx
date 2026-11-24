import React, { useState } from 'react';
import {
  Building2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Download,
  HelpCircle,
  MapPin,
  Palette,
  Play,
  Plus,
  Radio,
  Save,
  Smartphone,
  Trees,
  Wifi,
} from 'lucide-react';
import type {
  AntennaPatternDTO,
  ClutterProfileDTO,
  RfProjectDTO,
} from '../types/rf.ts';
import { COLOUR_SCHEMAS } from '../lib/colourSchemas.ts';
import { PolarDiagram } from './PolarDiagram.tsx';
import { formatCoordDms } from '../lib/geoUtils.ts';

type SectionKey = 'site' | 'signal' | 'antenna' | 'rx' | 'env' | 'output';

interface LeftSidebarProps {
  project: RfProjectDTO;
  onChangeProject: (patch: Partial<RfProjectDTO>) => void;
  templates: RfProjectDTO[];
  onSelectTemplate: (id: number) => void;
  antennaPatterns: AntennaPatternDTO[];
  clutterProfiles: ClutterProfileDTO[];
  onOpenClutterManager: () => void;
  onSaveProject: () => void;
  onRunSimulation: () => void;
  simulating: boolean;
  simProgress: number;
  lastCompletedName: string | null;
  exportFormat: 'PDF' | 'KMZ' | 'PNG' | 'CSV';
  onChangeExportFormat: (fmt: 'PDF' | 'KMZ' | 'PNG' | 'CSV') => void;
  onDownloadExport: () => void;
  logs: string[];
  onShowTooltip: (msg: string) => void;
  showParameters: boolean;
  onExpandSidebar: () => void;
  onOpenNewSite: () => void;
}

export const LeftSidebar: React.FC<LeftSidebarProps> = ({
  project,
  onChangeProject,
  templates,
  onSelectTemplate,
  antennaPatterns,
  clutterProfiles,
  onOpenClutterManager,
  onSaveProject,
  onRunSimulation,
  simulating,
  simProgress,
  lastCompletedName,
  exportFormat,
  onChangeExportFormat,
  onDownloadExport,
  logs,
  onShowTooltip,
  showParameters,
  onExpandSidebar,
  onOpenNewSite,
}) => {
  const [openSection, setOpenSection] = useState<SectionKey | null>('site');
  const [showAntennaModalNote, setShowAntennaModalNote] = useState(false);

  const toggleSection = (key: SectionKey) => {
    setOpenSection((prev) => (prev === key ? null : key));
  };

  const handleCompactSelectSection = (key: SectionKey) => {
    setOpenSection(key);
    onExpandSidebar();
  };

  const activePattern =
    antennaPatterns.find((p) => p.id === project.antennaPatternId) ?? antennaPatterns[0];

  const rowBtnClass =
    'w-full flex items-center justify-between px-4 py-2.5 text-[13px] font-medium transition-colors border-b border-[#23272b]/80';

  const compactNavItems: Array<{ key: SectionKey; label: string; icon: React.ReactNode }> = [
    { key: 'site', label: 'Site / Tx', icon: <MapPin className="w-4 h-4" /> },
    { key: 'signal', label: 'Signal', icon: <Radio className="w-4 h-4" /> },
    { key: 'antenna', label: 'Antenna', icon: <Wifi className="w-4 h-4" /> },
    { key: 'rx', label: 'Mobile / Rx', icon: <Smartphone className="w-4 h-4" /> },
    { key: 'env', label: 'Environment', icon: <Building2 className="w-4 h-4" /> },
    { key: 'output', label: 'Output', icon: <Palette className="w-4 h-4" /> },
  ];

  // Compact mode ("Hide parameter sidebar"): shows only the slim Left Menu icon rail
  if (!showParameters) {
    return (
      <aside
        aria-label="Left menu"
        className="w-[48px] shrink-0 bg-[#2b2f34] border-r border-[#1c1f22] flex flex-col items-center py-2 justify-between select-none z-30"
      >
        <div className="flex flex-col items-center gap-1 w-full px-1.5">
          <button
            type="button"
            onClick={onOpenNewSite}
            title="Create New Site"
            aria-label="Create New Site"
            className="w-9 h-8 rounded-sm bg-[#3a3f45] hover:bg-[#495057] text-[#f59e0b] flex items-center justify-center transition-colors border border-white/10"
          >
            <Plus className="w-4 h-4" />
          </button>

          <div className="w-6 h-px bg-[#1c1f22] my-1" />

          {compactNavItems.map((item) => {
            const active = openSection === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => handleCompactSelectSection(item.key)}
                title={`${item.label} — click to open parameters`}
                aria-label={item.label}
                className={`w-9 h-9 rounded-sm flex items-center justify-center transition-colors ${
                  active
                    ? 'bg-[#3b4046] text-white border border-white/15'
                    : 'text-slate-300 hover:bg-[#34393f] hover:text-white'
                }`}
              >
                {item.icon}
              </button>
            );
          })}

          <div className="w-6 h-px bg-[#1c1f22] my-1" />

          <button
            type="button"
            onClick={onSaveProject}
            title="Save site configuration"
            aria-label="Save site configuration"
            className="w-9 h-8 rounded-sm bg-[#1493a8] hover:bg-[#117e91] text-white flex items-center justify-center shadow transition-colors"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={simulating}
            onClick={onRunSimulation}
            title="Run RF Propagation Simulation"
            aria-label="Run simulation"
            className="w-9 h-8 rounded-sm bg-[#28a745] hover:bg-[#218838] text-white flex items-center justify-center shadow transition-colors disabled:opacity-60"
          >
            <Play className="w-4 h-4 fill-current" />
          </button>
        </div>

        <button
          type="button"
          onClick={onExpandSidebar}
          title="Show full parameter sidebar"
          aria-label="Show full parameter sidebar"
          className="w-9 h-8 rounded-sm text-slate-300 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </aside>
    );
  }

  return (
    <aside
      aria-label="Parameter sidebar"
      className="fixed md:static top-[46px] bottom-0 left-0 z-30 w-[268px] sm:w-[276px] shrink-0 bg-[#2b2f34] border-r border-[#1c1f22] flex flex-col shadow-2xl md:shadow-none select-none"
    >
      {/* Top Site Template Selector + New Site Button */}
      <div className="px-3.5 py-2.5 border-b border-[#212529] flex items-center gap-1.5">
        <select
          value={project.id || ''}
          onChange={(e) => {
            const val = Number(e.target.value);
            if (val) onSelectTemplate(val);
          }}
          aria-label="Site templates"
          className="flex-1 min-w-0 h-7 px-2 text-xs bg-white text-slate-900 rounded-sm border border-slate-400 focus:outline-none"
        >
          {templates.length === 0 ? (
            <option value="">No templates available.</option>
          ) : (
            <>
              <option value="" disabled>
                Select site template...
              </option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.network})
                </option>
              ))}
            </>
          )}
        </select>
        <button
          type="button"
          onClick={onOpenNewSite}
          title="Create New Site"
          aria-label="Create New Site"
          className="h-7 px-2 rounded-sm bg-[#1ea853] hover:bg-[#179045] text-white text-[11px] font-medium flex items-center gap-1 shrink-0 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>New</span>
        </button>
      </div>

      {/* Scrollable Accordion Area */}
      <div className="flex-1 overflow-y-auto cl-scroll">
        {/* 1. Site / Tx */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('site')}
            className={`${rowBtnClass} ${
              openSection === 'site'
                ? 'bg-[#3b4046] text-white'
                : 'bg-[#2b2f34] text-slate-200 hover:bg-[#34393f]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <MapPin className="w-4 h-4 text-slate-200" />
              <span>Site / Tx</span>
            </span>
            {openSection === 'site' ? (
              <ChevronDown className="w-4 h-4 text-slate-300" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {openSection === 'site' && (
            <div className="px-4 py-3 space-y-2.5 bg-[#2b2f34] text-xs border-b border-[#212529]">
              <div className="flex items-center gap-2">
                <label className="w-[74px] text-slate-200 shrink-0">Name</label>
                <input
                  type="text"
                  value={project.name}
                  onChange={(e) => onChangeProject({ name: e.target.value })}
                  className="flex-1 min-w-0 h-7 px-2 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onShowTooltip('Site name used for simulation layers and PDF reports.')}
                  className="text-white/90 hover:text-amber-400 shrink-0"
                  aria-label="Name help"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-[74px] text-slate-200 shrink-0">Network</label>
                <input
                  type="text"
                  value={project.network}
                  onChange={(e) => onChangeProject({ network: e.target.value })}
                  className="flex-1 min-w-0 h-7 px-2 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onShowTooltip('Logical network group name (e.g. LoRa Network, Private LTE).')}
                  className="text-white/90 hover:text-amber-400 shrink-0"
                  aria-label="Network help"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-[74px] text-slate-200 shrink-0">Coordinates</label>
                <select
                  value={project.coordFormat}
                  onChange={(e) => onChangeProject({ coordFormat: e.target.value })}
                  className="flex-1 min-w-0 h-7 px-1.5 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none"
                >
                  <option value="Decimal Degrees">Decimal Degrees</option>
                  <option value="DMS">Degrees Min Sec</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-[74px] text-slate-200 shrink-0">Latitude</label>
                {project.coordFormat === 'DMS' ? (
                  <div className="flex-1 h-7 px-2 bg-slate-200 text-slate-800 rounded-sm flex items-center font-mono text-[11px]">
                    {formatCoordDms(project.txLat, true)}
                  </div>
                ) : (
                  <input
                    type="number"
                    step="0.0001"
                    value={project.txLat}
                    onChange={(e) =>
                      onChangeProject({ txLat: parseFloat(e.target.value) || 0 })
                    }
                    className="flex-1 min-w-0 h-7 px-2 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
                  />
                )}
                <span className="w-7 text-slate-200 font-mono text-[11px]">D.D</span>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-[74px] text-slate-200 shrink-0">Longitude</label>
                {project.coordFormat === 'DMS' ? (
                  <div className="flex-1 h-7 px-2 bg-slate-200 text-slate-800 rounded-sm flex items-center font-mono text-[11px]">
                    {formatCoordDms(project.txLng, false)}
                  </div>
                ) : (
                  <input
                    type="number"
                    step="0.0001"
                    value={project.txLng}
                    onChange={(e) =>
                      onChangeProject({ txLng: parseFloat(e.target.value) || 0 })
                    }
                    className="flex-1 min-w-0 h-7 px-2 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
                  />
                )}
                <span className="w-7 text-slate-200 font-mono text-[11px]">D.D</span>
              </div>

              <div className="flex items-center gap-1.5">
                <label className="w-[74px] text-slate-200 shrink-0">Height</label>
                <input
                  type="number"
                  min="1"
                  max="500"
                  value={project.txHeightM}
                  onChange={(e) =>
                    onChangeProject({ txHeightM: parseFloat(e.target.value) || 1 })
                  }
                  className="w-12 h-7 px-1.5 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
                />
                <span className="text-slate-200">m</span>
                <select
                  value={project.txHeightMode}
                  onChange={(e) => onChangeProject({ txHeightMode: e.target.value })}
                  className="flex-1 min-w-0 h-7 px-1 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none text-[11px]"
                >
                  <option value="Meters AGL">Meters AGL</option>
                  <option value="Meters AMSL">Meters AMSL</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 2. Signal */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('signal')}
            className={`${rowBtnClass} ${
              openSection === 'signal'
                ? 'bg-[#3b4046] text-white'
                : 'bg-[#2b2f34] text-slate-200 hover:bg-[#34393f]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Radio className="w-4 h-4 text-slate-200" />
              <span>Signal</span>
            </span>
            {openSection === 'signal' ? (
              <ChevronDown className="w-4 h-4 text-slate-300" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {openSection === 'signal' && (
            <div className="px-4 py-3 space-y-2.5 bg-[#2b2f34] text-xs border-b border-[#212529]">
              <div className="flex items-center gap-2">
                <label className="w-[74px] text-slate-200 shrink-0">Frequency</label>
                <input
                  type="number"
                  min="30"
                  max="30000"
                  value={project.frequencyMhz}
                  onChange={(e) =>
                    onChangeProject({ frequencyMhz: parseFloat(e.target.value) || 923 })
                  }
                  className="w-20 h-7 px-2 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
                />
                <span className="text-slate-200">MHz</span>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-[74px] text-slate-200 shrink-0">RF power</label>
                <input
                  type="number"
                  step="0.5"
                  value={project.rfPower}
                  onChange={(e) =>
                    onChangeProject({ rfPower: parseFloat(e.target.value) || 0 })
                  }
                  className="w-16 h-7 px-2 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
                />
                <select
                  value={project.rfPowerUnit}
                  onChange={(e) => onChangeProject({ rfPowerUnit: e.target.value })}
                  className="w-16 h-7 px-1 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none"
                >
                  <option value="dBm">dBm</option>
                  <option value="Watts">Watts</option>
                  <option value="ERP (W)">ERP (W)</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onShowTooltip('Transmitter output power into antenna feed (converted to EIRP via antenna gain).')
                  }
                  className="text-white/90 hover:text-amber-400 shrink-0"
                  aria-label="RF power help"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-[74px] text-slate-200 shrink-0">Bandwidth</label>
                <select
                  value={project.bandwidthKhz}
                  onChange={(e) =>
                    onChangeProject({ bandwidthKhz: Number(e.target.value) })
                  }
                  className="w-24 h-7 px-1.5 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none"
                >
                  <option value={100}>100 KHz</option>
                  <option value={125}>125 KHz</option>
                  <option value={250}>250 KHz</option>
                  <option value={500}>500 KHz</option>
                  <option value={1000}>1 MHz</option>
                  <option value={5000}>5 MHz</option>
                  <option value={10000}>10 MHz</option>
                  <option value={20000}>20 MHz</option>
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onShowTooltip('Channel bandwidth sets the Johnson-Nyquist thermal noise floor (-174 dBm/Hz + 10log10(BW)).')
                  }
                  className="text-white/90 hover:text-amber-400 shrink-0"
                  aria-label="Bandwidth help"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 3. Antenna */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('antenna')}
            className={`${rowBtnClass} ${
              openSection === 'antenna'
                ? 'bg-[#3b4046] text-white'
                : 'bg-[#2b2f34] text-slate-200 hover:bg-[#34393f]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Wifi className="w-4 h-4 text-slate-200" />
              <span>Antenna</span>
            </span>
            {openSection === 'antenna' ? (
              <ChevronDown className="w-4 h-4 text-slate-300" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {openSection === 'antenna' && (
            <div className="px-4 py-3 space-y-3 bg-[#2b2f34] text-xs border-b border-[#212529]">
              <div className="flex items-center gap-1.5">
                <label className="w-12 text-slate-200 shrink-0">Pattern</label>
                <select
                  value={project.antennaPatternId ?? activePattern?.id ?? ''}
                  onChange={(e) => {
                    const pat = antennaPatterns.find((p) => p.id === Number(e.target.value));
                    if (pat) {
                      onChangeProject({
                        antennaPatternId: pat.id,
                        txGainDbi: pat.gainDbi,
                      });
                    }
                  }}
                  className="flex-1 min-w-0 h-7 px-1.5 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none text-[11px]"
                >
                  {antennaPatterns.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setShowAntennaModalNote((v) => !v)}
                  title="Antenna pattern info"
                  className="w-8 h-7 rounded bg-[#28a745] hover:bg-[#218838] text-white flex items-center justify-center shrink-0"
                >
                  <Radio className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onShowTooltip(
                      activePattern?.description || 'Horizontal and Vertical antenna radiation pattern.'
                    )
                  }
                  className="text-white/90 hover:text-amber-400 shrink-0"
                  aria-label="Antenna pattern help"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>

              {showAntennaModalNote && activePattern && (
                <div className="p-2 rounded bg-[#212529] border border-slate-600 text-[11px] text-slate-300">
                  <div className="font-semibold text-white">{activePattern.name}</div>
                  <div>
                    Peak Gain: {activePattern.gainDbi} dBi · Polarisation: {activePattern.polarisation}
                  </div>
                </div>
              )}

              {/* Side-by-side Polar Diagrams matching Screenshot 5 */}
              {activePattern && (
                <div className="grid grid-cols-2 gap-2 pt-0.5">
                  <PolarDiagram
                    title="Horizontal"
                    pattern={activePattern.horizontalPattern}
                    rotationDeg={project.azimuthDeg}
                    size={112}
                  />
                  <PolarDiagram
                    title="Vertical"
                    pattern={activePattern.verticalPattern}
                    rotationDeg={project.tiltDeg}
                    size={112}
                  />
                </div>
              )}

              {/* Azimuth slider */}
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <label className="w-14 text-slate-200 shrink-0">Azimuth</label>
                  <input
                    type="range"
                    min="0"
                    max="359"
                    value={project.azimuthDeg}
                    onChange={(e) =>
                      onChangeProject({ azimuthDeg: Number(e.target.value) })
                    }
                    className="cl-slider flex-1"
                  />
                </div>
                <div className="flex items-center justify-between pl-16 text-[12px] text-slate-200">
                  <span className="flex items-center gap-1 font-mono tabular-nums">
                    {project.azimuthDeg} °
                    <Compass className="w-3.5 h-3.5 text-slate-300" />
                  </span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span>Show</span>
                    <input
                      type="checkbox"
                      checked={project.showAzimuth}
                      onChange={(e) =>
                        onChangeProject({ showAzimuth: e.target.checked })
                      }
                      className="w-3.5 h-3.5 accent-blue-600"
                    />
                  </label>
                </div>
              </div>

              {/* Gain input */}
              <div className="flex items-center gap-2">
                <label className="w-14 text-slate-200 shrink-0">Gain</label>
                <input
                  type="number"
                  step="0.05"
                  value={project.txGainDbi}
                  onChange={(e) =>
                    onChangeProject({ txGainDbi: parseFloat(e.target.value) || 0 })
                  }
                  className="w-14 h-7 px-1.5 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
                />
                <span className="text-slate-200">dBi</span>
              </div>
            </div>
          )}
        </div>

        {/* 4. Mobile / Rx */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('rx')}
            className={`${rowBtnClass} ${
              openSection === 'rx'
                ? 'bg-[#3b4046] text-white'
                : 'bg-[#2b2f34] text-slate-200 hover:bg-[#34393f]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Smartphone className="w-4 h-4 text-slate-200" />
              <span>Mobile / Rx</span>
            </span>
            {openSection === 'rx' ? (
              <ChevronDown className="w-4 h-4 text-slate-300" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {openSection === 'rx' && (
            <div className="px-4 py-3 space-y-2.5 bg-[#2b2f34] text-xs border-b border-[#212529]">
              <div className="flex items-center gap-2">
                <label className="w-[78px] text-slate-200 shrink-0">Latitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={project.rxLat}
                  onChange={(e) =>
                    onChangeProject({ rxLat: parseFloat(e.target.value) || 0 })
                  }
                  className="flex-1 min-w-0 h-7 px-2 bg-[#c8ced4] focus:bg-white text-slate-900 font-mono rounded-sm border border-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onShowTooltip('Mobile/Receiver latitude for Path Profile & Multipoint analysis.')}
                  className="text-white/90 hover:text-amber-400 shrink-0"
                  aria-label="Rx latitude help"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-[78px] text-slate-200 shrink-0">Longitude</label>
                <input
                  type="number"
                  step="0.0001"
                  value={project.rxLng}
                  onChange={(e) =>
                    onChangeProject({ rxLng: parseFloat(e.target.value) || 0 })
                  }
                  className="flex-1 min-w-0 h-7 px-2 bg-[#c8ced4] focus:bg-white text-slate-900 font-mono rounded-sm border border-slate-400 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => onShowTooltip('Mobile/Receiver longitude. Drag the black Rx pin on the map to adjust.')}
                  className="text-white/90 hover:text-amber-400 shrink-0"
                  aria-label="Rx longitude help"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-[78px] text-slate-200 shrink-0">Height</label>
                <input
                  type="number"
                  min="0.5"
                  max="200"
                  step="0.5"
                  value={project.rxHeightM}
                  onChange={(e) =>
                    onChangeProject({ rxHeightM: parseFloat(e.target.value) || 1 })
                  }
                  className="w-14 h-7 px-2 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
                />
                <span className="text-slate-200 flex-1">m</span>
                <button
                  type="button"
                  onClick={() => onShowTooltip('Receiver antenna height above ground level (AGL).')}
                  className="text-white/90 hover:text-amber-400 shrink-0"
                  aria-label="Rx height help"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-[78px] text-slate-200 shrink-0">Receive Gain</label>
                <input
                  type="number"
                  step="0.5"
                  value={project.rxGainDbi}
                  onChange={(e) =>
                    onChangeProject({ rxGainDbi: parseFloat(e.target.value) || 0 })
                  }
                  className="w-14 h-7 px-2 bg-white text-slate-900 font-mono rounded-sm border border-slate-300 focus:outline-none"
                />
                <span className="text-slate-200 flex-1">dBi</span>
                <button
                  type="button"
                  onClick={() => onShowTooltip('Receiver antenna gain in dBi.')}
                  className="text-white/90 hover:text-amber-400 shrink-0"
                  aria-label="Rx gain help"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-[78px] text-slate-200 shrink-0">Measured units</label>
                <select
                  value={project.measuredUnit}
                  onChange={(e) => onChangeProject({ measuredUnit: e.target.value })}
                  className="flex-1 min-w-0 h-7 px-1.5 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none text-[11px]"
                >
                  <option value="Received Power (dBm)">Received Power (dBm)</option>
                  <option value="Path Loss (dB)">Path Loss (dB)</option>
                  <option value="Field Strength (dBuV/m)">Field Strength (dBuV/m)</option>
                  <option value="SNR (dB)">SNR (dB)</option>
                </select>
              </div>
            </div>
          )}
        </div>

        {/* 5. Environment */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('env')}
            className={`${rowBtnClass} ${
              openSection === 'env'
                ? 'bg-[#3b4046] text-white'
                : 'bg-[#2b2f34] text-slate-200 hover:bg-[#34393f]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Building2 className="w-4 h-4 text-slate-200" />
              <span>Environment</span>
            </span>
            {openSection === 'env' ? (
              <ChevronDown className="w-4 h-4 text-slate-300" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {openSection === 'env' && (
            <div className="px-4 py-3 space-y-2.5 bg-[#2b2f34] text-xs border-b border-[#212529]">
              <div className="flex items-center gap-2">
                <label className="w-14 text-slate-200 shrink-0">Profile</label>
                <select
                  value={project.clutterProfileId ?? clutterProfiles[0]?.id ?? ''}
                  onChange={(e) =>
                    onChangeProject({ clutterProfileId: Number(e.target.value) })
                  }
                  className="flex-1 min-w-0 h-7 px-1.5 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none"
                >
                  {clutterProfiles.map((cp) => (
                    <option key={cp.id} value={cp.id}>
                      {cp.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={onOpenClutterManager}
                  title="Open Clutter manager"
                  className="w-9 h-7 rounded bg-[#28a745] hover:bg-[#218838] text-white flex items-center justify-center shrink-0 transition-colors"
                >
                  <Trees className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() =>
                    onShowTooltip('Select an environmental clutter profile or click the green tree button to open Clutter Manager.')
                  }
                  className="text-white/90 hover:text-amber-400 shrink-0"
                  aria-label="Environment help"
                >
                  <HelpCircle className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 6. Output */}
        <div>
          <button
            type="button"
            onClick={() => toggleSection('output')}
            className={`${rowBtnClass} ${
              openSection === 'output'
                ? 'bg-[#3b4046] text-white'
                : 'bg-[#2b2f34] text-slate-200 hover:bg-[#34393f]'
            }`}
          >
            <span className="flex items-center gap-2.5">
              <Palette className="w-4 h-4 text-slate-200" />
              <span>Output</span>
            </span>
            {openSection === 'output' ? (
              <ChevronDown className="w-4 h-4 text-slate-300" />
            ) : (
              <ChevronLeft className="w-4 h-4 text-slate-400" />
            )}
          </button>

          {openSection === 'output' && (
            <div className="px-4 py-3 space-y-3 bg-[#2b2f34] text-xs border-b border-[#212529]">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <label className="w-16 text-slate-200 shrink-0">Range</label>
                  <input
                    type="range"
                    min="0.5"
                    max="100"
                    step="0.1"
                    value={project.rangeKm}
                    onChange={(e) =>
                      onChangeProject({ rangeKm: parseFloat(e.target.value) })
                    }
                    className="cl-slider flex-1"
                  />
                  <button
                    type="button"
                    onClick={() => onShowTooltip('Maximum simulation radius in kilometers (0.5 km to 100 km).')}
                    className="text-white/90 hover:text-amber-400 shrink-0"
                    aria-label="Range help"
                  >
                    <HelpCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="flex items-center justify-between pl-[72px] text-[12px] text-slate-200">
                  <span className="font-mono tabular-nums">{project.rangeKm.toFixed(1)} km</span>
                  <label className="flex items-center gap-1.5 cursor-pointer">
                    <span>Show</span>
                    <input
                      type="checkbox"
                      checked={project.showRange}
                      onChange={(e) =>
                        onChangeProject({ showRange: e.target.checked })
                      }
                      className="w-3.5 h-3.5 accent-blue-600"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <label className="w-20 text-slate-200 shrink-0">Colour schema</label>
                <select
                  value={project.colourSchema}
                  onChange={(e) => onChangeProject({ colourSchema: e.target.value })}
                  className="flex-1 min-w-0 h-7 px-1.5 bg-white text-slate-900 rounded-sm border border-slate-300 focus:outline-none text-[11px]"
                >
                  {COLOUR_SCHEMAS.map((cs) => (
                    <option key={cs.name} value={cs.name}>
                      {cs.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() =>
                    onShowTooltip(`Active colour schema: ${project.colourSchema}. Right-hand dBm legend updates dynamically.`)
                  }
                  title="Colour schema palette"
                  className="w-9 h-7 rounded bg-[#28a745] hover:bg-[#218838] text-white flex items-center justify-center shrink-0"
                >
                  <Palette className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Save + Play Buttons matching Screenshot 2-9 */}
        <div className="flex items-center justify-center gap-2.5 py-4 px-4">
          <button
            type="button"
            onClick={onSaveProject}
            title="Save site configuration to PostgreSQL"
            className="w-10 h-9 rounded bg-[#1493a8] hover:bg-[#117e91] text-white flex items-center justify-center shadow transition-colors"
            aria-label="Save site configuration"
          >
            <Save className="w-4 h-4" />
          </button>
          <button
            type="button"
            disabled={simulating}
            onClick={onRunSimulation}
            title="Run RF Propagation Simulation"
            className="w-10 h-9 rounded bg-[#28a745] hover:bg-[#218838] text-white flex items-center justify-center shadow transition-colors disabled:opacity-60"
            aria-label="Run simulation"
          >
            <Play className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-4 pb-2">
          <div className="h-2.5 w-full rounded bg-[#212529] border border-[#3a3f46] overflow-hidden">
            <div
              className="h-full bg-[#28a745] transition-all duration-200"
              style={{ width: `${simProgress}%` }}
            />
          </div>
        </div>

        {/* Download Box matching Screenshot 9 */}
        {lastCompletedName && (
          <div className="mx-3 mb-2 p-2.5 rounded bg-[#262a2f] border border-[#3c424a] text-center space-y-1.5">
            <div className="text-[12px] font-medium text-slate-200 truncate">
              {lastCompletedName}
            </div>
            <div className="flex items-center justify-center gap-1">
              <select
                value={exportFormat}
                onChange={(e) =>
                  onChangeExportFormat(e.target.value as 'PDF' | 'KMZ' | 'PNG' | 'CSV')
                }
                aria-label="Export format"
                className="h-6 px-1.5 text-[11px] bg-white text-slate-900 rounded-sm border border-slate-400 focus:outline-none"
              >
                <option value="KMZ">KMZ</option>
                <option value="PDF">PDF</option>
                <option value="PNG">PNG</option>
                <option value="CSV">CSV</option>
              </select>
              <button
                type="button"
                onClick={onDownloadExport}
                title={`Download ${exportFormat}`}
                className="h-6 px-2 rounded-sm bg-[#464c54] hover:bg-[#565d67] text-white flex items-center justify-center"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Monospace Console Log Box matching Screenshot 2/7/9 */}
      <div className="h-[110px] shrink-0 mx-2.5 mb-2.5 p-2 rounded bg-[#1d2024] border border-[#363b42] overflow-y-auto cl-scroll font-mono text-[10.5px] leading-[1.45] text-[#98a6b3]">
        {logs.map((line, idx) => (
          <div key={idx} className="whitespace-pre-wrap break-words">
            {line}
          </div>
        ))}
      </div>
    </aside>
  );
};
