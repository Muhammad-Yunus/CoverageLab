/// <reference types="google.maps" />
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AdvancedMarker,
  Map as GoogleMap,
  useMap,
} from '@vis.gl/react-google-maps';
import {
  Compass,
  Download,
  HelpCircle,
  Home,
  Layers,
  List,
  Maximize2,
  Minimize2,
  Minus,
  Plus,
  Search,
  Settings,
  Share2,
  Trash2,
  X,
} from 'lucide-react';
import type {
  MeshNodeDTO,
  MultipointLinkDTO,
  ObstacleClassItem,
  PathProfileResult,
  PlacedObstacleDTO,
  RfProjectDTO,
  SimulationDTO,
} from '../types/rf.ts';
import { getColourSchemaForUnit } from '../lib/colourSchemas.ts';
import {
  bearingDeg,
  destinationPoint,
  haversineKm,
  rasterizeSimulationToDataUrl,
} from '../lib/geoUtils.ts';
import { PathProfileDrawer } from './PathProfileDrawer.tsx';

export type ActiveToolMode = 'none' | 'path' | 'multipoint' | 'mesh' | 'place_obstacle';

interface RfMapCanvasProps {
  project: RfProjectDTO;
  onChangeProject: (patch: Partial<RfProjectDTO>) => void;
  activeSimulation: SimulationDTO | null;
  simulations: SimulationDTO[];
  visibleSimIds: Record<number, boolean>;
  onToggleSimVisible: (id: number) => void;
  toolMode: ActiveToolMode;
  pendingObstacle: ObstacleClassItem | null;
  placedObstacles: PlacedObstacleDTO[];
  multipointLinks: MultipointLinkDTO[];
  meshNodes: MeshNodeDTO[];
  pathProfile: PathProfileResult | null;
  pathProfileLoading: boolean;
  onClosePathProfile: () => void;
  onMapClick: (lat: number, lng: number) => void;
  onClearMultipoint: () => void;
  onSelectMeshNode: (node: MeshNodeDTO) => void;
  selectedMeshNodeId: number | null;
  onDeleteMeshNode: (id: number) => void;
  onExportKmz: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onExportCsv: () => void;
  onOpenHelp: () => void;
  showObstaclesOnMap: boolean;
  onMapCenterChange?: (center: { lat: number; lng: number }) => void;
}

const MAP_TYPES: Array<'roadmap' | 'terrain' | 'satellite' | 'hybrid'> = [
  'roadmap',
  'terrain',
  'satellite',
  'hybrid',
];

function GroundOverlaysController({
  simulations,
  visibleSimIds,
  colourSchemaOverride,
  opacity,
}: {
  simulations: SimulationDTO[];
  visibleSimIds: Record<number, boolean>;
  colourSchemaOverride: string;
  opacity: number;
}) {
  const map = useMap();
  const overlaysRef = useRef<google.maps.GroundOverlay[]>([]);

  useEffect(() => {
    overlaysRef.current.forEach((ov) => ov.setMap(null));
    overlaysRef.current = [];

    if (!map || typeof google === 'undefined') return;

    simulations.forEach((sim) => {
      if (!visibleSimIds[sim.id]) return;
      const dataUrl = rasterizeSimulationToDataUrl(sim, colourSchemaOverride);
      if (!dataUrl) return;
      const bounds = new google.maps.LatLngBounds(
        { lat: sim.bounds.south, lng: sim.bounds.west },
        { lat: sim.bounds.north, lng: sim.bounds.east }
      );
      const overlay = new google.maps.GroundOverlay(dataUrl, bounds, {
        opacity,
        clickable: false,
      });
      overlay.setMap(map);
      overlaysRef.current.push(overlay);
    });

    return () => {
      overlaysRef.current.forEach((ov) => ov.setMap(null));
      overlaysRef.current = [];
    };
  }, [map, simulations, visibleSimIds, colourSchemaOverride, opacity]);

  return null;
}

function VectorLayersController({
  project,
  toolMode,
  placedObstacles,
  multipointLinks,
  meshNodes,
  showObstaclesOnMap,
}: {
  project: RfProjectDTO;
  toolMode: ActiveToolMode;
  placedObstacles: PlacedObstacleDTO[];
  multipointLinks: MultipointLinkDTO[];
  meshNodes: MeshNodeDTO[];
  showObstaclesOnMap: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map || typeof google === 'undefined') return;
    const shapes: Array<google.maps.Circle | google.maps.Polygon | google.maps.Polyline> = [];

    // 1. Range Circle (if Output -> Show checked)
    if (project.showRange) {
      const rangeCircle = new google.maps.Circle({
        map,
        center: { lat: project.txLat, lng: project.txLng },
        radius: project.rangeKm * 1000,
        strokeColor: '#3b82f6',
        strokeOpacity: 0.75,
        strokeWeight: 1.5,
        fillColor: '#3b82f6',
        fillOpacity: 0.06,
        clickable: false,
      });
      shapes.push(rangeCircle);
    }

    // 2. Azimuth Beam Wedge (if Antenna -> Show checked)
    if (project.showAzimuth) {
      const wedgePts: google.maps.LatLngLiteral[] = [{ lat: project.txLat, lng: project.txLng }];
      const halfBeam = 30;
      for (let a = -halfBeam; a <= halfBeam; a += 5) {
        const pt = destinationPoint(
          project.txLat,
          project.txLng,
          project.rangeKm,
          (project.azimuthDeg + a + 360) % 360
        );
        wedgePts.push(pt);
      }
      wedgePts.push({ lat: project.txLat, lng: project.txLng });
      const wedge = new google.maps.Polygon({
        map,
        paths: wedgePts,
        strokeColor: '#f59e0b',
        strokeOpacity: 0.9,
        strokeWeight: 1.5,
        fillColor: '#f59e0b',
        fillOpacity: 0.14,
        clickable: false,
      });
      shapes.push(wedge);
    }

    // 3. Placed Obstacles
    if (showObstaclesOnMap) {
      placedObstacles.forEach((obs) => {
        const c = new google.maps.Circle({
          map,
          center: { lat: obs.lat, lng: obs.lng },
          radius: obs.radiusM,
          strokeColor: obs.color,
          strokeWeight: 2,
          fillColor: obs.color,
          fillOpacity: 0.35,
          clickable: false,
        });
        shapes.push(c);
      });
    }

    // 4. Path Profile LOS Line (Tx -> Rx)
    if (toolMode === 'path') {
      const line = new google.maps.Polyline({
        map,
        path: [
          { lat: project.txLat, lng: project.txLng },
          { lat: project.rxLat, lng: project.rxLng },
        ],
        strokeColor: '#ef4444',
        strokeOpacity: 0.95,
        strokeWeight: 2.5,
        clickable: false,
      });
      shapes.push(line);
    }

    // 5. Multipoint Links (Blue lines from each placed Tx to Rx)
    if (toolMode === 'multipoint' || multipointLinks.length > 0) {
      multipointLinks.forEach((link) => {
        const line = new google.maps.Polyline({
          map,
          path: [
            { lat: link.txLat, lng: link.txLng },
            { lat: link.rxLat, lng: link.rxLng },
          ],
          strokeColor: '#0284c7',
          strokeOpacity: 0.85,
          strokeWeight: 2,
          clickable: false,
        });
        shapes.push(line);
      });
    }

    // 6. Mesh / MANET Inter-Node Links
    if (toolMode === 'mesh' && meshNodes.length > 1) {
      for (let i = 0; i < meshNodes.length; i++) {
        for (let j = i + 1; j < meshNodes.length; j++) {
          const line = new google.maps.Polyline({
            map,
            path: [
              { lat: meshNodes[i].lat, lng: meshNodes[i].lng },
              { lat: meshNodes[j].lat, lng: meshNodes[j].lng },
            ],
            strokeColor: '#22c55e',
            strokeOpacity: 0.7,
            strokeWeight: 1.5,
            clickable: false,
          });
          shapes.push(line);
        }
      }
    }

    return () => {
      shapes.forEach((s) => s.setMap(null));
    };
  }, [
    map,
    project.txLat,
    project.txLng,
    project.rxLat,
    project.rxLng,
    project.rangeKm,
    project.showRange,
    project.azimuthDeg,
    project.showAzimuth,
    toolMode,
    placedObstacles,
    multipointLinks,
    meshNodes,
    showObstaclesOnMap,
  ]);

  return null;
}

export const RfMapCanvas: React.FC<RfMapCanvasProps> = ({
  project,
  onChangeProject,
  activeSimulation,
  simulations,
  visibleSimIds,
  onToggleSimVisible,
  toolMode,
  pendingObstacle,
  placedObstacles,
  multipointLinks,
  meshNodes,
  pathProfile,
  pathProfileLoading,
  onClosePathProfile,
  onMapClick,
  onClearMultipoint,
  onSelectMeshNode,
  selectedMeshNodeId,
  onDeleteMeshNode,
  onExportKmz,
  onExportPng,
  onExportPdf,
  onExportCsv,
  onOpenHelp,
  showObstaclesOnMap,
  onMapCenterChange,
}) => {
  const map = useMap();
  const containerRef = useRef<HTMLDivElement>(null);

  const [cursorCoords, setCursorCoords] = useState<{ lat: number; lng: number }>({
    lat: project.txLat,
    lng: project.txLng,
  });
  const [mapTypeIdx, setMapTypeIdx] = useState<number>(0); // roadmap default matching Screenshot 2-12
  const [showLayerMenu, setShowLayerMenu] = useState(false);
  const [showSearchBox, setShowSearchBox] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<
    Array<{ address: string; lat: number; lng: number }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showMeshPanel, setShowMeshPanel] = useState(true);

  const activeLegendUnit =
    activeSimulation && visibleSimIds[activeSimulation.id]
      ? activeSimulation.measuredUnit
      : project.measuredUnit;

  const schemaDef = useMemo(
    () => getColourSchemaForUnit(project.colourSchema, activeLegendUnit),
    [project.colourSchema, activeLegendUnit]
  );

  const cursorDistKm = useMemo(
    () => haversineKm(project.txLat, project.txLng, cursorCoords.lat, cursorCoords.lng),
    [project.txLat, project.txLng, cursorCoords]
  );

  const cursorBearing = useMemo(
    () => bearingDeg(project.txLat, project.txLng, cursorCoords.lat, cursorCoords.lng),
    [project.txLat, project.txLng, cursorCoords]
  );

  const selectedMeshNode = useMemo(
    () => meshNodes.find((m) => m.id === selectedMeshNodeId) ?? meshNodes[0] ?? null,
    [meshNodes, selectedMeshNodeId]
  );

  // Sync map center when template loads
  const prevProjectIdRef = useRef<number>(project.id);
  useEffect(() => {
    if (map && project.id !== prevProjectIdRef.current) {
      prevProjectIdRef.current = project.id;
      map.panTo({ lat: project.txLat, lng: project.txLng });
      map.setZoom(13);
    }
  }, [map, project.id, project.txLat, project.txLng]);

  const handleHomeReset = useCallback(() => {
    if (!map) return;
    map.panTo({ lat: project.txLat, lng: project.txLng });
    map.setZoom(13);
  }, [map, project.txLat, project.txLng]);

  const handleZoom = useCallback(
    (delta: number) => {
      if (!map) return;
      const current = map.getZoom() ?? 13;
      map.setZoom(Math.max(2, Math.min(20, current + delta)));
    },
    [map]
  );

  const handleSearchSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await fetch(`/api/geocode/search?q=${encodeURIComponent(searchQuery.trim())}`);
      const data = await res.json();
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false)).catch(() => {});
    }
  };

  const activeMapType = MAP_TYPES[mapTypeIdx];

  return (
    <div
      ref={containerRef}
      className="relative flex-1 min-w-0 h-full bg-[#e5e3df] overflow-hidden"
    >
      {/* Google Maps Viewport (explicit 100% height/width per CF2) */}
      <div className="w-full h-full pr-[34px]">
        <GoogleMap
          mapId="DEMO_MAP_ID"
          defaultCenter={{ lat: project.txLat, lng: project.txLng }}
          defaultZoom={13}
          mapTypeId={activeMapType}
          gestureHandling="greedy"
          disableDefaultUI={true}
          internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
          style={{ width: '100%', height: '100%' }}
          onCameraChanged={(ev) => {
            if (onMapCenterChange && ev.detail?.center) {
              onMapCenterChange({
                lat: ev.detail.center.lat,
                lng: ev.detail.center.lng,
              });
            }
          }}
          onMousemove={(ev) => {
            if (ev.detail.latLng) {
              setCursorCoords({
                lat: ev.detail.latLng.lat,
                lng: ev.detail.latLng.lng,
              });
            }
          }}
          onClick={(ev) => {
            if (ev.detail.latLng) {
              onMapClick(ev.detail.latLng.lat, ev.detail.latLng.lng);
            }
          }}
        >
          <GroundOverlaysController
            simulations={simulations}
            visibleSimIds={visibleSimIds}
            colourSchemaOverride={project.colourSchema}
            opacity={project.overlayOpacity}
          />

          <VectorLayersController
            project={project}
            toolMode={toolMode}
            placedObstacles={placedObstacles}
            multipointLinks={multipointLinks}
            meshNodes={meshNodes}
            showObstaclesOnMap={showObstaclesOnMap}
          />

          {/* Primary Orange Tx Marker (matching Screenshots 2-9) */}
          <AdvancedMarker
            position={{ lat: project.txLat, lng: project.txLng }}
            draggable={true}
            title={`Tx: ${project.name} (Drag to reposition)`}
            onDragEnd={(ev) => {
              if (ev.latLng) {
                onChangeProject({
                  txLat: Number(ev.latLng.lat().toFixed(6)),
                  txLng: Number(ev.latLng.lng().toFixed(6)),
                });
              }
            }}
          >
            <div className="relative flex flex-col items-center cursor-grab active:cursor-grabbing -translate-y-1/2">
              <div className="px-1.5 py-0.5 rounded-sm bg-[#f59e0b] border border-[#b45309] text-[#111827] text-[11px] font-bold leading-none shadow-md">
                Tx
              </div>
              <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent border-t-[#f59e0b]" />
            </div>
          </AdvancedMarker>

          {/* Rx Receiver Marker (shown in Path Profile, Multipoint, or Mesh modes, matching Screenshots 10-12) */}
          {(toolMode === 'path' || toolMode === 'multipoint' || toolMode === 'mesh') && (
            <AdvancedMarker
              position={{ lat: project.rxLat, lng: project.rxLng }}
              draggable={true}
              title="Rx Receiver (Drag to move)"
              onDragEnd={(ev) => {
                if (ev.latLng) {
                  onChangeProject({
                    rxLat: Number(ev.latLng.lat().toFixed(6)),
                    rxLng: Number(ev.latLng.lng().toFixed(6)),
                  });
                }
              }}
            >
              <div className="relative flex flex-col items-center cursor-grab active:cursor-grabbing -translate-y-1/2">
                <div
                  className={`px-1.5 py-0.5 rounded-sm border text-[11px] font-bold leading-none shadow-md ${
                    toolMode === 'multipoint'
                      ? 'bg-[#facc15] border-[#a16207] text-slate-900'
                      : 'bg-[#111827] border-slate-300 text-white'
                  }`}
                >
                  Rx
                </div>
                <div
                  className={`w-0 h-0 border-l-[5px] border-r-[5px] border-t-[7px] border-l-transparent border-r-transparent ${
                    toolMode === 'multipoint' ? 'border-t-[#facc15]' : 'border-t-[#111827]'
                  }`}
                />
              </div>
            </AdvancedMarker>
          )}

          {/* Multipoint Links & Signal Readout Labels (Screenshot 10) */}
          {multipointLinks.map((link) => (
            <AdvancedMarker
              key={link.id}
              position={{ lat: link.txLat, lng: link.txLng }}
              title={`Multipoint Tx -> Rx: ${link.rxPowerDbm} dBm`}
            >
              <div className="flex flex-col items-center -translate-y-1/2">
                <span className="text-[12px] font-bold text-[#1d4ed8] drop-shadow-[0_1px_2px_rgba(255,255,255,0.95)] whitespace-nowrap mb-0.5">
                  {Math.round(link.rxPowerDbm)} dBm
                </span>
                <div className="w-3 h-3 rounded-full bg-[#1d4ed8] border-2 border-white shadow" />
              </div>
            </AdvancedMarker>
          ))}

          {/* Mesh / MANET Nodes with Yellow Selection Reticle (Screenshot 11) */}
          {toolMode === 'mesh' &&
            meshNodes.map((node) => {
              const isSelected = selectedMeshNode?.id === node.id;
              return (
                <AdvancedMarker
                  key={node.id}
                  position={{ lat: node.lat, lng: node.lng }}
                  onClick={() => {
                    onSelectMeshNode(node);
                    setShowMeshPanel(true);
                  }}
                  title={node.label}
                >
                  <div className="relative p-1.5 cursor-pointer">
                    {isSelected && (
                      <div className="absolute inset-0 pointer-events-none">
                        <span className="absolute top-0 left-0 w-2.5 h-2.5 border-t-2 border-l-2 border-yellow-400" />
                        <span className="absolute top-0 right-0 w-2.5 h-2.5 border-t-2 border-r-2 border-yellow-400" />
                        <span className="absolute bottom-0 left-0 w-2.5 h-2.5 border-b-2 border-l-2 border-yellow-400" />
                        <span className="absolute bottom-0 right-0 w-2.5 h-2.5 border-b-2 border-r-2 border-yellow-400" />
                      </div>
                    )}
                    <div className="w-6 h-6 rounded-full bg-[#f59e0b] border-2 border-[#78350f] text-slate-900 flex items-center justify-center shadow-md">
                      <Share2 className="w-3.5 h-3.5" />
                    </div>
                  </div>
                </AdvancedMarker>
              );
            })}
        </GoogleMap>
      </div>

      {/* Top-Left Floating Coordinate & Bearing/Distance HUD (Screenshots 2-11) */}
      <div className="pointer-events-none absolute top-3 left-14 z-20 flex flex-col items-start gap-1">
        {toolMode === 'multipoint' && (
          <div className="px-2 py-0.5 rounded bg-[#23272b]/85 text-white text-[11px] font-medium shadow">
            Multipoint links
          </div>
        )}
        {toolMode === 'place_obstacle' && pendingObstacle && (
          <div className="px-2.5 py-1 rounded bg-amber-600 text-white text-[11px] font-medium shadow">
            Click map to place {pendingObstacle.name} ({pendingObstacle.heightM}m,{' '}
            {pendingObstacle.attenDbm} dB/m)
          </div>
        )}
        <div className="px-2.5 py-1 rounded-sm bg-[#3a3f45]/80 text-white font-mono text-[11.5px] leading-tight shadow-md backdrop-blur-[1px]">
          <div>
            {cursorCoords.lat.toFixed(6)}, {cursorCoords.lng.toFixed(6)}
          </div>
          <div>
            {cursorDistKm >= 1
              ? `${cursorDistKm.toFixed(3)}Km`
              : `${Math.round(cursorDistKm * 1000)}m`}{' '}
            {cursorBearing.toFixed(1)}°
          </div>
        </div>
      </div>

      {/* Mesh Node Inspector Floating Panel (Screenshot 11) */}
      {toolMode === 'mesh' && selectedMeshNode && showMeshPanel && (
        <div className="absolute top-3 left-3 z-20 w-[238px] rounded bg-[#23272b]/90 backdrop-blur-[2px] border border-white/15 text-slate-100 shadow-xl overflow-hidden text-[11px]">
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#1b1e22]/90 border-b border-white/10">
            <span className="font-semibold text-white truncate">{selectedMeshNode.label}</span>
            <button
              type="button"
              onClick={() => setShowMeshPanel(false)}
              className="text-slate-400 hover:text-white"
              aria-label="Close mesh node inspector"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-2.5 space-y-2 font-mono text-[10.5px]">
            <div className="grid grid-cols-2 gap-y-0.5">
              <span className="text-slate-400">Latitude</span>
              <span className="text-right">{selectedMeshNode.lat.toFixed(6)}</span>
              <span className="text-slate-400">Longitude</span>
              <span className="text-right">{selectedMeshNode.lng.toFixed(6)}</span>
            </div>
            <div>
              <div className="font-sans font-semibold text-slate-200 mb-0.5">Site / Tx</div>
              <div className="grid grid-cols-2">
                <span className="text-slate-400">Height</span>
                <span className="text-right">{selectedMeshNode.heightM} m</span>
              </div>
            </div>
            <div>
              <div className="font-sans font-semibold text-slate-200 mb-0.5">Signal</div>
              <div className="grid grid-cols-2">
                <span className="text-slate-400">Frequency</span>
                <span className="text-right">{selectedMeshNode.frequencyMhz} MHz</span>
                <span className="text-slate-400">RF Power</span>
                <span className="text-right">{selectedMeshNode.rfPowerDbm} dBm</span>
                <span className="text-slate-400">Bandwidth</span>
                <span className="text-right">{selectedMeshNode.bandwidthMhz} MHz</span>
              </div>
            </div>
            <div>
              <div className="font-sans font-semibold text-slate-200 mb-0.5">Antenna</div>
              <div className="grid grid-cols-2">
                <span className="text-slate-400">Gain</span>
                <span className="text-right">{selectedMeshNode.gainDbi} dBi</span>
                <span className="text-slate-400">Azimuth</span>
                <span className="text-right">{selectedMeshNode.azimuthDeg}°</span>
                <span className="text-slate-400">Tilt</span>
                <span className="text-right">{selectedMeshNode.tiltDeg}°</span>
              </div>
            </div>
            <div>
              <div className="font-sans font-semibold text-slate-200 mb-0.5">Mobile / Rx</div>
              <div className="grid grid-cols-2">
                <span className="text-slate-400">Sensitivity</span>
                <span className="text-right">{selectedMeshNode.sensitivityDbm} dBm</span>
                <span className="text-slate-400">Noise floor</span>
                <span className="text-right">{selectedMeshNode.noiseFloorDbm} dBm</span>
              </div>
            </div>
          </div>
          <div className="flex items-center justify-between px-2.5 py-1.5 bg-[#363b42] border-t border-white/10 text-xs">
            <span className="font-semibold text-white">MANET</span>
            <div className="flex items-center gap-2 text-slate-300">
              <button
                type="button"
                onClick={onExportPdf}
                title="Export PDF Report"
                className="hover:text-white"
              >
                <Download className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onDeleteMeshNode(selectedMeshNode.id)}
                title="Remove selected mesh node"
                className="hover:text-rose-400"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={handleHomeReset}
                title="Center map"
                className="hover:text-white"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
          <div className="px-2.5 py-1 bg-[#1b1e22] text-[11px] text-slate-300 font-mono">
            {meshNodes.length} Nodes · Click map to add node
          </div>
        </div>
      )}

      {/* Multipoint Analysis Tool Tooltip Box (Screenshot 10) */}
      {toolMode === 'multipoint' && (
        <div className="absolute top-12 right-12 z-20 w-[230px] rounded bg-[#2b2f34]/92 border border-white/15 p-3 text-slate-100 shadow-xl text-[11.5px] leading-snug">
          <div className="font-semibold text-center text-white mb-1.5">
            Multipoint analysis tool
          </div>
          <p className="text-slate-300 text-[11px]">
            Left click to place transmitters. Links will be tested from the point back to the Rx
            marker. The point height is set in Site / Tx and the receiver Rx height is set in
            Mobile / Rx.
          </p>
          {multipointLinks.length > 0 && (
            <button
              type="button"
              onClick={onClearMultipoint}
              className="mt-2 w-full py-1 rounded bg-rose-600 hover:bg-rose-500 text-white text-[11px] font-medium"
            >
              Clear {multipointLinks.length} links
            </button>
          )}
        </div>
      )}

      {/* Top-Right Map Control Buttons (Search, Layers, Home, Map Style, Help) matching Screenshots 2-12 */}
      <div className="absolute top-2.5 right-[44px] z-20 flex flex-col items-end gap-1.5">
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShowSearchBox((v) => !v)}
            title="Search location / address"
            className="w-7 h-7 rounded-sm bg-[#2b2f34]/90 hover:bg-[#1f2327] text-white border border-white/20 flex items-center justify-center shadow"
            aria-label="Search location"
          >
            <Search className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setShowLayerMenu((v) => !v)}
            title="Active coverage layers"
            className="w-7 h-7 rounded-sm bg-[#2b2f34]/90 hover:bg-[#1f2327] text-white border border-white/20 flex items-center justify-center shadow"
            aria-label="Toggle coverage layers"
          >
            <List className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handleHomeReset}
            title="Center map on Tx"
            className="w-7 h-7 rounded-sm bg-[#2b2f34]/90 hover:bg-[#1f2327] text-white border border-white/20 flex items-center justify-center shadow"
            aria-label="Center map on Tx"
          >
            <Home className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={() => setMapTypeIdx((i) => (i + 1) % MAP_TYPES.length)}
            title={`Map Type: ${activeMapType.toUpperCase()} (Click to switch)`}
            className="w-7 h-7 rounded-sm bg-[#2b2f34]/90 hover:bg-[#1f2327] text-white border border-white/20 flex items-center justify-center shadow overflow-hidden"
            aria-label="Switch map basemap style"
          >
            <Layers className="w-4 h-4 text-emerald-300" />
          </button>

          <button
            type="button"
            onClick={onOpenHelp}
            title="RF Propagation Help & Documentation"
            className="w-7 h-7 rounded-sm bg-[#2b2f34]/90 hover:bg-[#1f2327] text-white border border-white/20 flex items-center justify-center shadow"
            aria-label="Help documentation"
          >
            <HelpCircle className="w-4 h-4" />
          </button>
        </div>

        {/* Search Address Dropdown */}
        {showSearchBox && (
          <div className="w-64 rounded bg-[#2b2f34]/95 border border-white/20 p-2 shadow-xl text-xs">
            <form onSubmit={handleSearchSubmit} className="flex gap-1">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search city or coordinates..."
                className="flex-1 min-w-0 h-7 px-2 bg-white text-slate-900 rounded-sm focus:outline-none"
              />
              <button
                type="submit"
                disabled={searching}
                className="px-2 h-7 bg-cyan-600 hover:bg-cyan-500 text-white rounded-sm"
              >
                {searching ? '...' : 'Go'}
              </button>
            </form>
            {searchResults.length > 0 && (
              <div className="mt-1.5 divide-y divide-white/10 max-h-40 overflow-y-auto">
                {searchResults.map((r, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => {
                      if (map) {
                        map.panTo({ lat: r.lat, lng: r.lng });
                        map.setZoom(13);
                      }
                      onChangeProject({
                        txLat: Number(r.lat.toFixed(6)),
                        txLng: Number(r.lng.toFixed(6)),
                      });
                      setShowSearchBox(false);
                    }}
                    className="w-full text-left py-1.5 px-1 text-[11px] text-slate-200 hover:bg-white/10 truncate"
                  >
                    {r.address}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Active Layer Checklist Dropdown matching Screenshot 9 */}
        {(showLayerMenu || (activeSimulation && simulations.length > 0)) && showLayerMenu && (
          <div className="min-w-[230px] max-w-[300px] rounded bg-[#2b2f34]/92 border border-white/20 p-2 shadow-xl text-[11px] space-y-1">
            {simulations.length === 0 ? (
              <div className="text-slate-400">No coverage layers generated yet.</div>
            ) : (
              simulations.slice(0, 6).map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-1.5 cursor-pointer text-slate-100 hover:text-white"
                >
                  <input
                    type="checkbox"
                    checked={Boolean(visibleSimIds[s.id])}
                    onChange={() => onToggleSimVisible(s.id)}
                    className="w-3.5 h-3.5 accent-blue-500"
                  />
                  <span className="truncate font-mono">{s.layerLabel}</span>
                </label>
              ))
            )}
          </div>
        )}

        {/* Active Layer Badge matching Screenshot 9-12 when simulation is visible */}
        {!showLayerMenu && activeSimulation && visibleSimIds[activeSimulation.id] && (
          <div className="rounded bg-[#3a3f45]/85 border border-white/15 px-2 py-0.5 text-[10.5px] font-mono text-white shadow flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={true}
              onChange={() => onToggleSimVisible(activeSimulation.id)}
              className="w-3 h-3 accent-blue-500"
            />
            <span className="truncate max-w-[235px]">{activeSimulation.layerLabel}</span>
          </div>
        )}
      </div>

      {/* Compass Rose + Zoom Controls (+ / C / -) matching Screenshots 2-12 */}
      <div className="absolute top-[110px] right-[44px] z-20 flex flex-col items-center gap-3 select-none">
        <button
          type="button"
          onClick={handleHomeReset}
          title="Reset bearing & center on Tx"
          className="w-11 h-11 rounded-full bg-[#3a3f45]/75 hover:bg-[#2b2f34] border-2 border-white/50 text-white flex items-center justify-center shadow-lg transition-colors"
          aria-label="Compass reset"
        >
          <Compass className="w-6 h-6" />
        </button>

        <div className="flex flex-col bg-white/85 rounded-sm border border-slate-400 overflow-hidden shadow text-slate-700">
          <button
            type="button"
            onClick={() => handleZoom(1)}
            className="w-7 h-7 flex items-center justify-center hover:bg-slate-200 border-b border-slate-300"
            aria-label="Zoom in"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={handleHomeReset}
            className="w-7 h-7 flex items-center justify-center hover:bg-slate-200 border-b border-slate-300 text-[11px] font-semibold"
            aria-label="Center map"
          >
            C
          </button>
          <button
            type="button"
            onClick={() => handleZoom(-1)}
            className="w-7 h-7 flex items-center justify-center hover:bg-slate-200"
            aria-label="Zoom out"
          >
            <Minus className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Bottom-Right Fullscreen Button */}
      <button
        type="button"
        onClick={toggleFullscreen}
        title="Toggle Fullscreen"
        className="absolute bottom-3 right-[44px] z-20 w-7 h-7 rounded-sm bg-[#2b2f34]/90 hover:bg-[#1f2327] text-white border border-white/20 flex items-center justify-center shadow"
        aria-label="Toggle fullscreen"
      >
        {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
      </button>

      {/* Right-Edge Vertical dBm Colour Scale Legend matching Screenshots 2-12 */}
      <div
        className="absolute top-0 right-0 bottom-0 w-[34px] z-20 bg-[#23272b] border-l border-[#181b1e] flex flex-col text-[10px] font-mono select-none"
        aria-label="Signal strength color legend"
      >
        <div className="py-1 text-center text-[10px] font-semibold text-slate-200 bg-[#3a3f45] border-b border-[#181b1e]">
          {schemaDef.unitLabel}
        </div>
        <div className="flex-1 flex flex-col">
          {schemaDef.stops.map((stop) => (
            <div
              key={stop.value}
              style={{ backgroundColor: stop.color }}
              className="flex-1 flex items-center justify-center text-[10px] font-semibold text-slate-950/90 leading-none border-b border-black/10"
            >
              {stop.value}
            </div>
          ))}
        </div>
      </div>

      {/* Bottom Path Profile & Link Budget Overlay (Screenshot 12) */}
      {(toolMode === 'path' || pathProfile || pathProfileLoading) && (
        <PathProfileDrawer
          profile={pathProfile}
          loading={pathProfileLoading}
          onClose={onClosePathProfile}
          onExportKmz={onExportKmz}
          onExportPng={onExportPng}
          onExportPdf={onExportPdf}
          onExportCsv={onExportCsv}
        />
      )}
    </div>
  );
};
