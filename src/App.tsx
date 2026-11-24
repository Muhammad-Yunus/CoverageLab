import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { APIProvider } from '@vis.gl/react-google-maps';
import {
  BookOpen,
  Box,
  CircleDot,
  Database,
  FileText,
  GitFork,
  Menu,
  Mountain,
  Palette,
  Radio,
  RefreshCw,
  Ruler,
  Share2,
  User as UserIcon,
} from 'lucide-react';
import type {
  AntennaPatternDTO,
  ClutterProfileDTO,
  MeshNodeDTO,
  MultipointLinkDTO,
  ObstacleClassItem,
  PathProfileResult,
  PlacedObstacleDTO,
  RfProjectDTO,
  SimulationDTO,
  UserDTO,
} from './types/rf.ts';
import { COLOUR_SCHEMAS } from './lib/colourSchemas.ts';
import { formatFooterCoord } from './lib/geoUtils.ts';
import {
  exportPathProfileCsv,
  exportRfReportPdf,
  exportSimulationKmzKml,
  exportSimulationPng,
} from './lib/exportUtils.ts';
import { LeftSidebar } from './components/LeftSidebar.tsx';
import { RfMapCanvas, type ActiveToolMode } from './components/RfMapCanvas.tsx';
import { ClutterManagerModal } from './components/ClutterManagerModal.tsx';
import { AuthModal } from './components/AuthModal.tsx';
import { SavedLayersModal } from './components/SavedLayersModal.tsx';
import { HelpDocsModal } from './components/HelpDocsModal.tsx';
import { NewSiteModal, type NewSitePayload } from './components/NewSiteModal.tsx';

const FALLBACK_PROJECT: RfProjectDTO = {
  id: 0,
  userId: null,
  name: 'Jakarta IoT',
  network: 'LoRa Network',
  isTemplate: true,
  coordFormat: 'Decimal Degrees',
  txLat: -6.175637,
  txLng: 106.826727,
  txHeightM: 5,
  txHeightMode: 'Meters AGL',
  frequencyMhz: 923,
  rfPower: 27,
  rfPowerUnit: 'dBm',
  bandwidthKhz: 100,
  antennaPatternId: 1,
  azimuthDeg: 0,
  tiltDeg: 0,
  txGainDbi: 2.15,
  showAzimuth: false,
  rxLat: -6.166336,
  rxLng: 106.816526,
  rxHeightM: 15,
  rxGainDbi: 17,
  measuredUnit: 'Received Power (dBm)',
  clutterProfileId: 3,
  rangeKm: 9.3,
  showRange: false,
  colourSchema: 'LORA',
  overlayOpacity: 0.65,
};

export default function App() {
  // In-memory auth session token (per security guidelines, never stored in localStorage)
  const [authToken, setAuthToken] = useState<string | null>(null);
  const [user, setUser] = useState<UserDTO | null>(null);
  const [mapsApiKey, setMapsApiKey] = useState<string>('');

  // Reference & workspace state loaded from PostgreSQL via Drizzle ORM
  const [antennaPatterns, setAntennaPatterns] = useState<AntennaPatternDTO[]>([]);
  const [clutterProfiles, setClutterProfiles] = useState<ClutterProfileDTO[]>([]);
  const [projects, setProjects] = useState<RfProjectDTO[]>([]);
  const [project, setProject] = useState<RfProjectDTO>(FALLBACK_PROJECT);
  const [simulations, setSimulations] = useState<SimulationDTO[]>([]);
  const [visibleSimIds, setVisibleSimIds] = useState<Record<number, boolean>>({});
  const [placedObstacles, setPlacedObstacles] = useState<PlacedObstacleDTO[]>([]);
  const [multipointLinks, setMultipointLinks] = useState<MultipointLinkDTO[]>([]);
  const [meshNodes, setMeshNodes] = useState<MeshNodeDTO[]>([]);

  // UI & Interactive tools
  const [toolMode, setToolMode] = useState<ActiveToolMode>('none');
  const [pendingObstacle, setPendingObstacle] = useState<ObstacleClassItem | null>(null);
  const [showObstaclesOnMap, setShowObstaclesOnMap] = useState(true);
  const [selectedMeshNodeId, setSelectedMeshNodeId] = useState<number | null>(null);
  const [pathProfile, setPathProfile] = useState<PathProfileResult | null>(null);
  const [pathProfileLoading, setPathProfileLoading] = useState(false);

  // Simulation execution state
  const [simulating, setSimulating] = useState(false);
  const [simProgress, setSimProgress] = useState(0);
  const [exportFormat, setExportFormat] = useState<'PDF' | 'KMZ' | 'PNG' | 'CSV'>('KMZ');
  const [logs, setLogs] = useState<string[]>([
    'Connecting to PostgreSQL via Drizzle ORM...',
  ]);
  const [toast, setToast] = useState<string | null>(null);

  // Modals & Responsive Parameter Sidebar Toggle
  const [showParameterSidebar, setShowParameterSidebar] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth >= 768 : true
  );
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>({
    lat: FALLBACK_PROJECT.txLat,
    lng: FALLBACK_PROJECT.txLng,
  });
  const [newSiteModalOpen, setNewSiteModalOpen] = useState(false);
  const [pendingNewSite, setPendingNewSite] = useState<NewSitePayload | null>(null);
  const [clutterModalOpen, setClutterModalOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [savedModalOpen, setSavedModalOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [dbReady, setDbReady] = useState(false);

  const appendLog = useCallback((line: string) => {
    setLogs((prev) => [...prev.slice(-30), line]);
  }, []);

  const showNotice = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3800);
  }, []);

  const authHeaders = useCallback((): Record<string, string> => {
    const h: Record<string, string> = { 'Content-Type': 'application/json' };
    if (authToken) h.Authorization = `Bearer ${authToken}`;
    return h;
  }, [authToken]);

  const loadBootstrap = useCallback(
    async (
      tokenOverride?: string | null,
      opts?: { preserveActiveProject?: boolean }
    ) => {
      try {
        const headers: Record<string, string> = {};
        if (tokenOverride) headers.Authorization = `Bearer ${tokenOverride}`;

        const res = await fetch('/api/bootstrap', {
          headers,
          credentials: 'same-origin',
        });
        if (!res.ok) throw new Error('Bootstrap failed');
        const data = await res.json();

        if (data.user !== undefined) {
          setUser(data.user);
        }
        if (data.mapsApiKey) {
          setMapsApiKey(data.mapsApiKey);
        }
        setAntennaPatterns(data.antennaPatterns || []);
        setClutterProfiles(data.clutterProfiles || []);
        setProjects(data.projects || []);
        setSimulations(data.simulations || []);
        setPlacedObstacles(data.placedObstacles || []);
        setMultipointLinks(data.multipointLinks || []);
        setMeshNodes(data.meshNodes || []);

        if (!opts?.preserveActiveProject && data.projects && data.projects.length > 0) {
          setProject(data.projects[0]);
          setMapCenter({ lat: data.projects[0].txLat, lng: data.projects[0].txLng });
        }
        if (data.simulations && data.simulations.length > 0) {
          setVisibleSimIds({ [data.simulations[0].id]: true });
        }
        if (data.meshNodes && data.meshNodes.length > 0) {
          setSelectedMeshNodeId(data.meshNodes[0].id);
        }
        setDbReady(true);

        const bw = data.projects?.[0]?.bandwidthKhz ?? 100;
        const nf = (-174 + 10 * Math.log10(bw * 1000) + 8).toFixed(0);
        setLogs([
          'SNR level: 5dB',
          `Johnson-Nyquist channel noise: ${nf}dBm`,
          `Updated range: ${data.projects?.[0]?.rangeKm ?? 9.3}km. Max: 100km`,
          'Computed resolution: 1 MP (Plan limit 4 MP)',
          'Adjusted resolution: 10m',
        ]);
      } catch (err) {
        appendLog(
          `DB Error: ${err instanceof Error ? err.message : 'Unable to reach PostgreSQL'}`
        );
      }
    },
    [appendLog]
  );

  useEffect(() => {
    loadBootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleChangeProject = useCallback((patch: Partial<RfProjectDTO>) => {
    setProject((prev) => ({ ...prev, ...patch }));
  }, []);

  const activePattern = useMemo(
    () =>
      antennaPatterns.find((p) => p.id === project.antennaPatternId) ??
      antennaPatterns[0] ?? {
        id: 1,
        name: 'OEM Half-Wave Dipole',
        gainDbi: 2.15,
        polarisation: 'Vertical',
        horizontalPattern: new Array(36).fill(0),
        verticalPattern: new Array(36).fill(0),
        description: '',
        isSystem: true,
      },
    [antennaPatterns, project.antennaPatternId]
  );

  const activeClutter = useMemo(
    () =>
      clutterProfiles.find((c) => c.id === project.clutterProfileId) ??
      clutterProfiles[0] ?? {
        id: 1,
        userId: null,
        name: 'Temperate',
        buildingsAtten: 0.1,
        landCover: [],
        obstacles: [],
        isSystem: true,
      },
    [clutterProfiles, project.clutterProfileId]
  );

  const activeSimulation = useMemo(() => {
    return simulations.find((s) => visibleSimIds[s.id]) ?? simulations[0] ?? null;
  }, [simulations, visibleSimIds]);

  // Run RF Simulation on server & persist in PostgreSQL
  const handleRunSimulation = async () => {
    setSimulating(true);
    setSimProgress(20);
    appendLog(`Running '${project.name}' (${project.frequencyMhz} MHz, ${project.rangeKm} km)...`);

    const timer = setInterval(() => {
      setSimProgress((p) => (p < 88 ? p + 12 : p));
    }, 120);

    try {
      const res = await fetch('/api/rf/simulate', {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          ...project,
          projectId: project.id || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Simulation failed');

      setSimulations((prev) => [data, ...prev]);
      setVisibleSimIds((prev) => ({ ...prev, [data.id]: true }));
      setSimProgress(100);
      appendLog(`Completed '${project.name}'`);
      appendLog(
        `Terrain: ${data.stats.terrainMs}ms, API: ${data.stats.apiMs}ms (${data.stats.elevationSource})`
      );
      appendLog(
        `SNR level: ${data.stats.snrThresholdDb}dB · Noise floor: ${data.stats.noiseFloorDbm}dBm`
      );
    } catch (err) {
      appendLog(`Error: ${err instanceof Error ? err.message : 'Simulation failed'}`);
      showNotice('Simulation failed. Check server logs.');
    } finally {
      clearInterval(timer);
      setSimulating(false);
    }
  };

  // Save site project/template to PostgreSQL
  const handleSaveProject = async () => {
    if (!user) {
      showNotice('Sign in to save site configurations to your PostgreSQL workspace.');
      setAuthModalOpen(true);
      return;
    }
    try {
      const isExistingOwned = project.id && project.userId === user.id;
      const url = isExistingOwned ? `/api/projects/${project.id}` : '/api/projects';
      const method = isExistingOwned ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: JSON.stringify({ ...project, isTemplate: true }),
      });
      const saved = await res.json();
      if (!res.ok) throw new Error(saved.error || 'Save failed');

      setProject(saved);
      setProjects((prev) => {
        const filtered = prev.filter((p) => p.id !== saved.id);
        return [saved, ...filtered];
      });
      appendLog(`Saved '${saved.name}' to PostgreSQL.`);
      showNotice(`Saved '${saved.name}' to database.`);
    } catch (err) {
      showNotice(err instanceof Error ? err.message : 'Save failed');
    }
  };

  // Create a brand new RF Site and persist in PostgreSQL via Drizzle ORM
  const persistNewSite = useCallback(
    async (payload: NewSitePayload, tokenOverride?: string | null) => {
      if (!user && !tokenOverride) {
        setPendingNewSite(payload);
        setNewSiteModalOpen(false);
        setAuthModalOpen(true);
        showNotice('Sign in to save your new RF site to PostgreSQL.');
        return;
      }

      const defaultPatternId = antennaPatterns[0]?.id ?? project.antennaPatternId ?? 1;
      const defaultClutterId =
        clutterProfiles.find((c) => c.name === 'Temperate')?.id ??
        clutterProfiles[0]?.id ??
        project.clutterProfileId ??
        1;

      const base =
        payload.mode === 'clone'
          ? {
              ...project,
              name: payload.name,
              network: payload.network,
              txLat: payload.txLat,
              txLng: payload.txLng,
              txHeightM: payload.txHeightM,
              frequencyMhz: payload.frequencyMhz,
              rfPower: payload.rfPower,
              rangeKm: payload.rangeKm,
              rxLat: Number((payload.txLat + 0.008).toFixed(6)),
              rxLng: Number((payload.txLng + 0.008).toFixed(6)),
              isTemplate: true,
            }
          : {
              name: payload.name,
              network: payload.network,
              isTemplate: true,
              coordFormat: 'Decimal Degrees',
              txLat: payload.txLat,
              txLng: payload.txLng,
              txHeightM: payload.txHeightM,
              txHeightMode: 'Meters AGL',
              frequencyMhz: payload.frequencyMhz,
              rfPower: payload.rfPower,
              rfPowerUnit: 'dBm',
              bandwidthKhz: 100,
              antennaPatternId: defaultPatternId,
              azimuthDeg: 0,
              tiltDeg: 0,
              txGainDbi: antennaPatterns[0]?.gainDbi ?? 2.15,
              showAzimuth: false,
              rxLat: Number((payload.txLat + 0.008).toFixed(6)),
              rxLng: Number((payload.txLng + 0.008).toFixed(6)),
              rxHeightM: 1.5,
              rxGainDbi: 2.15,
              measuredUnit: 'Received Power (dBm)',
              clutterProfileId: defaultClutterId,
              rangeKm: payload.rangeKm,
              showRange: false,
              colourSchema: 'LORA',
              overlayOpacity: 0.65,
            };

      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      const tok = tokenOverride ?? authToken;
      if (tok) headers.Authorization = `Bearer ${tok}`;

      const res = await fetch('/api/projects', {
        method: 'POST',
        headers,
        credentials: 'same-origin',
        body: JSON.stringify(base),
      });
      const created = await res.json();
      if (!res.ok) throw new Error(created.error || 'Failed to create site');

      setProject(created);
      setProjects((prev) => [created, ...prev.filter((p) => p.id !== created.id)]);
      setMapCenter({ lat: created.txLat, lng: created.txLng });
      setVisibleSimIds({});
      setPathProfile(null);
      setShowParameterSidebar(true);
      setNewSiteModalOpen(false);
      setPendingNewSite(null);
      appendLog(`Created new site '${created.name}' (${created.txLat}, ${created.txLng}) in PostgreSQL.`);
      showNotice(`Created site '${created.name}'.`);
    },
    [user, authToken, antennaPatterns, clutterProfiles, project, appendLog, showNotice]
  );

  // Fetch Path Profile between Tx and Rx
  const fetchPathProfile = useCallback(
    async (overrideRx?: { lat: number; lng: number }) => {
      setPathProfileLoading(true);
      try {
        const res = await fetch('/api/rf/path-profile', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            ...project,
            rxLat: overrideRx?.lat ?? project.rxLat,
            rxLng: overrideRx?.lng ?? project.rxLng,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Path profile error');
        setPathProfile(data);
        appendLog(
          `Path Profile: ${data.distanceKm} km · Loss ${data.pathLossDb} dB · Rx ${data.receivedPowerDbm} dBm`
        );
      } catch (err) {
        appendLog(`Path Profile Error: ${err instanceof Error ? err.message : 'Failed'}`);
      } finally {
        setPathProfileLoading(false);
      }
    },
    [project, authHeaders, appendLog]
  );

  // Automatically refresh path profile if Rx/Tx changes while Path Profile tool is active
  useEffect(() => {
    if (toolMode === 'path') {
      const t = setTimeout(() => {
        fetchPathProfile();
      }, 280);
      return () => clearTimeout(t);
    }
  }, [
    toolMode,
    project.txLat,
    project.txLng,
    project.txHeightM,
    project.rxLat,
    project.rxLng,
    project.rxHeightM,
    project.frequencyMhz,
    project.rfPower,
    project.txGainDbi,
    project.rxGainDbi,
    project.clutterProfileId,
    fetchPathProfile,
  ]);

  const handleToggleTool = (mode: ActiveToolMode) => {
    setPendingObstacle(null);
    if (toolMode === mode) {
      setToolMode('none');
      if (mode === 'path') setPathProfile(null);
    } else {
      setToolMode(mode);
      if (mode === 'path') {
        fetchPathProfile();
      } else {
        setPathProfile(null);
      }
    }
  };

  // Map Click handler for Path Profile (sets Rx), Multipoint (adds link), Mesh (adds node), Place Obstacle
  const handleMapClick = async (lat: number, lng: number) => {
    if (toolMode === 'path') {
      handleChangeProject({
        rxLat: Number(lat.toFixed(6)),
        rxLng: Number(lng.toFixed(6)),
      });
      return;
    }

    if (toolMode === 'place_obstacle' && pendingObstacle) {
      if (!user) {
        showNotice('Sign in to place and persist obstacles in PostgreSQL.');
        setAuthModalOpen(true);
        return;
      }
      try {
        const res = await fetch('/api/obstacles', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            projectId: project.id || null,
            clutterProfileId: project.clutterProfileId,
            obstacleClassIndex: pendingObstacle.index,
            name: pendingObstacle.name,
            color: pendingObstacle.color,
            lat,
            lng,
            radiusM: 140,
            heightM: pendingObstacle.heightM,
            attenDbm: pendingObstacle.attenDbm,
          }),
        });
        const created = await res.json();
        if (!res.ok) throw new Error(created.error || 'Failed to place obstacle');
        setPlacedObstacles((prev) => [...prev, created]);
        appendLog(`Placed obstacle '${created.name}' at ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
        setToolMode('none');
        setPendingObstacle(null);
      } catch (err) {
        showNotice(err instanceof Error ? err.message : 'Obstacle error');
      }
      return;
    }

    if (toolMode === 'multipoint') {
      if (!user) {
        showNotice('Sign in to save multipoint links to PostgreSQL.');
        setAuthModalOpen(true);
        return;
      }
      try {
        const res = await fetch('/api/multipoint', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            ...project,
            projectId: project.id || null,
            txLat: lat,
            txLng: lng,
          }),
        });
        const link = await res.json();
        if (!res.ok) throw new Error(link.error || 'Multipoint failed');
        setMultipointLinks((prev) => [link, ...prev]);
        appendLog(
          `Multipoint Link: ${link.distanceKm} km -> Rx ${link.rxPowerDbm} dBm (SNR ${link.snrDb} dB)`
        );
      } catch (err) {
        showNotice(err instanceof Error ? err.message : 'Multipoint error');
      }
      return;
    }

    if (toolMode === 'mesh') {
      if (!user) {
        showNotice('Sign in to add MANET / Mesh nodes to PostgreSQL.');
        setAuthModalOpen(true);
        return;
      }
      try {
        const res = await fetch('/api/mesh', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({
            projectId: project.id || null,
            label: `${project.frequencyMhz} MHz - Mesh Node`,
            nodeType: 'MANET',
            lat,
            lng,
            heightM: project.txHeightM,
            frequencyMhz: project.frequencyMhz,
            rfPowerDbm: project.rfPower,
            bandwidthMhz: project.bandwidthKhz / 1000,
            gainDbi: project.txGainDbi,
            azimuthDeg: project.azimuthDeg,
            tiltDeg: project.tiltDeg,
          }),
        });
        const node = await res.json();
        if (!res.ok) throw new Error(node.error || 'Mesh node error');
        setMeshNodes((prev) => [...prev, node]);
        setSelectedMeshNodeId(node.id);
        appendLog(`Added Mesh Node #${node.id} at ${lat.toFixed(5)}, ${lng.toFixed(5)}`);
      } catch (err) {
        showNotice(err instanceof Error ? err.message : 'Mesh node error');
      }
    }
  };

  // Clutter manager CRUD handlers
  const handleSaveClutterProfile = async (draft: ClutterProfileDTO) => {
    if (!user) {
      showNotice('Sign in to save customized clutter profiles to PostgreSQL.');
      setAuthModalOpen(true);
      return null;
    }
    const res = await fetch(`/api/clutter-profiles/${draft.id}`, {
      method: 'PUT',
      headers: authHeaders(),
      body: JSON.stringify(draft),
    });
    const saved = await res.json();
    if (!res.ok) {
      showNotice(saved.error || 'Failed to save clutter profile');
      return null;
    }
    setClutterProfiles((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      return exists ? prev.map((p) => (p.id === saved.id ? saved : p)) : [...prev, saved];
    });
    handleChangeProject({ clutterProfileId: saved.id });
    appendLog(`Clutter profile '${saved.name}' saved.`);
    return saved;
  };

  const handleCreateClutterProfile = async (name: string, base: ClutterProfileDTO) => {
    if (!user) {
      showNotice('Sign in to create new clutter profiles in PostgreSQL.');
      setAuthModalOpen(true);
      return null;
    }
    const res = await fetch('/api/clutter-profiles', {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        name,
        buildingsAtten: base.buildingsAtten,
        landCover: base.landCover,
        obstacles: base.obstacles,
      }),
    });
    const created = await res.json();
    if (!res.ok) {
      showNotice(created.error || 'Failed to create profile');
      return null;
    }
    setClutterProfiles((prev) => [...prev, created]);
    handleChangeProject({ clutterProfileId: created.id });
    appendLog(`Created clutter profile '${created.name}'.`);
    return created;
  };

  const handleDeleteClutterProfile = async (id: number) => {
    if (!user) {
      setAuthModalOpen(true);
      return;
    }
    const res = await fetch(`/api/clutter-profiles/${id}`, {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.ok) {
      setClutterProfiles((prev) => {
        const next = prev.filter((p) => p.id !== id);
        if (next[0]) handleChangeProject({ clutterProfileId: next[0].id });
        return next;
      });
      appendLog(`Deleted clutter profile #${id}.`);
    }
  };

  const handleDestroyAllObstacles = async () => {
    if (!user) {
      showNotice('Sign in to manage obstacles.');
      setAuthModalOpen(true);
      return;
    }
    const res = await fetch('/api/obstacles', {
      method: 'DELETE',
      headers: authHeaders(),
    });
    if (res.ok) {
      setPlacedObstacles([]);
      appendLog('Destroyed all user obstacles.');
    }
  };

  const handleDownloadExport = async () => {
    if (exportFormat === 'PDF') {
      let prof = pathProfile;
      if (!prof) {
        const res = await fetch('/api/rf/path-profile', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(project),
        });
        if (res.ok) prof = await res.json();
      }
      exportRfReportPdf({
        project,
        pattern: activePattern,
        clutter: activeClutter,
        simulation: activeSimulation,
        pathProfile: prof,
        placedObstacles,
        multipointLinks,
        meshNodes,
        user,
      });
      appendLog(`Exported structured PDF report for '${project.name}'.`);
      return;
    }

    if (!activeSimulation) {
      showNotice('Run a simulation first to export coverage layers.');
      return;
    }
    if (exportFormat === 'KMZ') exportSimulationKmzKml(activeSimulation, project.colourSchema);
    else if (exportFormat === 'PNG') exportSimulationPng(activeSimulation, project.colourSchema);
    else if (exportFormat === 'CSV' && pathProfile) {
      exportPathProfileCsv(pathProfile, project.name);
    } else {
      exportSimulationKmzKml(activeSimulation, project.colourSchema);
    }
  };

  const handleExportFullPdf = async (simOverride?: SimulationDTO) => {
    let prof = pathProfile;
    if (!prof) {
      try {
        const res = await fetch('/api/rf/path-profile', {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify(project),
        });
        if (res.ok) prof = await res.json();
      } catch {
        // continue with null path profile
      }
    }
    exportRfReportPdf({
      project,
      pattern: activePattern,
      clutter: activeClutter,
      simulation: simOverride ?? activeSimulation,
      pathProfile: prof,
      placedObstacles,
      multipointLinks,
      meshNodes,
      user,
    });
    appendLog(`Generated structured PDF report for '${project.name}'.`);
  };

  const cycleColourSchema = () => {
    const idx = COLOUR_SCHEMAS.findIndex((c) => c.name === project.colourSchema);
    const next = COLOUR_SCHEMAS[(idx + 1) % COLOUR_SCHEMAS.length];
    handleChangeProject({ colourSchema: next.name });
  };

  const mainContent = (
    <div className="h-screen w-screen flex flex-col bg-[#23272b] text-slate-100 overflow-hidden">
        {/* Top Navigation Header Bar matching Screenshots 2-12 */}
        <header className="h-[46px] shrink-0 bg-[#2b2f34] border-b border-[#181b1e] flex items-center justify-between px-3 select-none z-40">
          {/* Left Zone: Brand + Operator + Toolbar Icons */}
          <div className="flex items-center min-w-0">
            <div className="flex items-center justify-between w-[210px] sm:w-[260px] pr-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-full bg-[#f59e0b] text-[#111827] flex items-center justify-center shrink-0 shadow-sm">
                  <Radio className="w-4 h-4 stroke-[2.4]" />
                </div>
                <span className="font-display text-[17px] font-medium tracking-tight text-white whitespace-nowrap">
                  CoverageLab
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="text-[12.5px] text-slate-300 hover:text-white truncate max-w-[95px] hidden sm:inline-block"
                title={user ? `Signed in as ${user.email}` : 'Click to Sign In / Register'}
              >
                {user ? user.name : 'Operator'}
              </button>
            </div>

            {/* Workbench Toolbar Icons matching Screenshot 2 */}
            <div className="flex items-center gap-1 sm:gap-1.5 pl-2 border-l border-white/10">
              <button
                type="button"
                onClick={() => setShowParameterSidebar((v) => !v)}
                title={
                  showParameterSidebar
                    ? 'Hide parameter sidebar (show left menu only)'
                    : 'Show full parameter sidebar'
                }
                aria-expanded={showParameterSidebar}
                className={`w-8 h-8 rounded-sm flex items-center justify-center transition-colors ${
                  showParameterSidebar
                    ? 'bg-white/15 text-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                aria-label="Toggle parameter sidebar"
              >
                <Menu className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleToggleTool('path')}
                title="Path Profile & Link Budget Tool"
                className={`w-8 h-8 rounded-sm flex items-center justify-center transition-colors ${
                  toolMode === 'path'
                    ? 'bg-white/15 text-white border-b-2 border-white'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                aria-label="Path Profile tool"
              >
                <Ruler className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => setSavedModalOpen(true)}
                title="Saved Sites & PostgreSQL Coverage Layers"
                className="w-8 h-8 rounded-sm text-slate-300 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Database layers"
              >
                <Database className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleToggleTool('multipoint')}
                title="Multipoint Analysis Tool"
                className={`w-8 h-8 rounded-sm flex items-center justify-center transition-colors ${
                  toolMode === 'multipoint'
                    ? 'bg-white text-slate-900'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                aria-label="Multipoint analysis tool"
              >
                <GitFork className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => handleToggleTool('mesh')}
                title="Mesh / MANET Analysis Tool"
                className={`w-8 h-8 rounded-sm flex items-center justify-center transition-colors ${
                  toolMode === 'mesh'
                    ? 'bg-white text-slate-900'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
                aria-label="Mesh network tool"
              >
                <Share2 className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setToolMode('none');
                  setPendingObstacle(null);
                  setPathProfile(null);
                  setVisibleSimIds({});
                }}
                title="Clear active map tools & overlays"
                className="w-8 h-8 rounded-sm text-slate-300 hover:bg-white/10 hover:text-white flex items-center justify-center transition-colors"
                aria-label="Clear overlays"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Right Zone: Engine Tag, PDF Report, Docs, Account */}
          <div className="flex items-center gap-2.5 sm:gap-3.5 shrink-0">
            <div className="hidden md:flex items-center gap-1.5 text-[11px] font-mono text-slate-300">
              <span
                className={`w-1.5 h-1.5 rounded-full ${
                  dbReady ? 'bg-emerald-400' : 'bg-amber-400'
                }`}
              />
              <span>API 3.38.0 UI 3.27.3</span>
            </div>

            <button
              type="button"
              onClick={() => handleExportFullPdf()}
              title="Export Structured RF Analysis PDF Report"
              className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded bg-[#1ea853] hover:bg-[#179045] text-white text-xs font-medium transition-colors"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Export PDF</span>
            </button>

            <button
              type="button"
              onClick={() => setHelpModalOpen(true)}
              title="RF Engineering Documentation"
              className="w-8 h-8 rounded-sm text-slate-200 hover:bg-white/10 flex items-center justify-center"
              aria-label="Documentation"
            >
              <BookOpen className="w-4 h-4" />
            </button>

            <button
              type="button"
              onClick={() => setAuthModalOpen(true)}
              title={user ? `Account: ${user.name}` : 'Sign In / Register'}
              className={`w-8 h-8 rounded-sm flex items-center justify-center transition-colors ${
                user
                  ? 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
                  : 'text-slate-200 hover:bg-white/10'
              }`}
              aria-label="User account"
            >
              <UserIcon className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Main Workspace Body */}
        <div className="flex-1 min-h-0 flex relative">
          <LeftSidebar
            project={project}
            onChangeProject={handleChangeProject}
            templates={projects}
            onSelectTemplate={(id) => {
              const found = projects.find((p) => p.id === id);
              if (found) {
                setProject(found);
                appendLog(`Loaded template '${found.name}' from PostgreSQL.`);
              }
            }}
            antennaPatterns={antennaPatterns}
            clutterProfiles={clutterProfiles}
            onOpenClutterManager={() => setClutterModalOpen(true)}
            onSaveProject={handleSaveProject}
            onRunSimulation={handleRunSimulation}
            simulating={simulating}
            simProgress={simProgress}
            lastCompletedName={activeSimulation?.siteName ?? null}
            exportFormat={exportFormat}
            onChangeExportFormat={setExportFormat}
            onDownloadExport={handleDownloadExport}
            logs={logs}
            onShowTooltip={showNotice}
            showParameters={showParameterSidebar}
            onExpandSidebar={() => setShowParameterSidebar(true)}
            onOpenNewSite={() => setNewSiteModalOpen(true)}
          />

          {/* Right Map Stage + Bottom Toolbar */}
          <main className="flex-1 min-w-0 flex flex-col h-full">
            <div className="flex-1 min-h-0 relative flex">
              <RfMapCanvas
                project={project}
                onChangeProject={handleChangeProject}
                activeSimulation={activeSimulation}
                simulations={simulations}
                visibleSimIds={visibleSimIds}
                onToggleSimVisible={(id) =>
                  setVisibleSimIds((prev) => ({ ...prev, [id]: !prev[id] }))
                }
                toolMode={toolMode}
                pendingObstacle={pendingObstacle}
                placedObstacles={placedObstacles}
                multipointLinks={multipointLinks}
                meshNodes={meshNodes}
                pathProfile={pathProfile}
                pathProfileLoading={pathProfileLoading}
                onClosePathProfile={() => {
                  setToolMode('none');
                  setPathProfile(null);
                }}
                onMapClick={handleMapClick}
                onClearMultipoint={async () => {
                  if (!user) return;
                  await fetch('/api/multipoint', { method: 'DELETE', headers: authHeaders() });
                  setMultipointLinks([]);
                }}
                onSelectMeshNode={(node) => setSelectedMeshNodeId(node.id)}
                selectedMeshNodeId={selectedMeshNodeId}
                onDeleteMeshNode={async (id) => {
                  if (!user) {
                    setAuthModalOpen(true);
                    return;
                  }
                  const res = await fetch(`/api/mesh/${id}`, {
                    method: 'DELETE',
                    headers: authHeaders(),
                  });
                  if (res.ok) {
                    setMeshNodes((prev) => prev.filter((m) => m.id !== id));
                  }
                }}
                onExportKmz={() =>
                  activeSimulation && exportSimulationKmzKml(activeSimulation, project.colourSchema)
                }
                onExportPng={() =>
                  activeSimulation && exportSimulationPng(activeSimulation, project.colourSchema)
                }
                onExportPdf={() => handleExportFullPdf()}
                onExportCsv={() => pathProfile && exportPathProfileCsv(pathProfile, project.name)}
                onOpenHelp={() => setHelpModalOpen(true)}
                showObstaclesOnMap={showObstaclesOnMap}
                onMapCenterChange={setMapCenter}
              />
            </div>

            {/* Bottom Map Toolbar matching Screenshots 2-12 */}
            <footer className="h-[36px] shrink-0 bg-[#2b2f34] border-t border-[#181b1e] px-3 flex items-center justify-between text-xs select-none">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2" title="Coverage overlay opacity">
                  <CircleDot className="w-4 h-4 text-slate-400" />
                  <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    value={project.overlayOpacity}
                    onChange={(e) =>
                      handleChangeProject({ overlayOpacity: parseFloat(e.target.value) })
                    }
                    aria-label="Overlay opacity"
                    className="cl-slider w-20 sm:w-24"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleTool('path')}
                  title="Toggle Terrain Path Profile"
                  className={`p-1 rounded hover:bg-white/10 ${
                    toolMode === 'path' ? 'text-cyan-400' : 'text-slate-300'
                  }`}
                  aria-label="Terrain path profile"
                >
                  <Mountain className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={() => setShowObstaclesOnMap((v) => !v)}
                  title="Toggle Placed Clutter Obstacles"
                  className={`p-1 rounded hover:bg-white/10 ${
                    showObstaclesOnMap ? 'text-slate-200' : 'text-slate-500'
                  }`}
                  aria-label="Toggle obstacles"
                >
                  <Box className="w-4 h-4" />
                </button>

                <button
                  type="button"
                  onClick={cycleColourSchema}
                  title={`Cycle Colour Schema (${project.colourSchema})`}
                  className="p-1 rounded hover:bg-white/10 text-slate-200"
                  aria-label="Cycle colour schema"
                >
                  <Palette className="w-4 h-4" />
                </button>
              </div>

              <div className="font-mono text-[12px] text-slate-950 font-semibold bg-transparent px-1">
                <span className="text-slate-200 font-normal">
                  {formatFooterCoord(project.txLat, project.txLng)}
                </span>
              </div>
            </footer>
          </main>
        </div>

        {/* Toast Notification */}
        {toast && (
          <div className="fixed bottom-12 right-5 z-50 px-3.5 py-2 rounded bg-[#181b1e] border border-cyan-500/40 text-xs text-slate-100 shadow-xl">
            {toast}
          </div>
        )}

        {/* Modals */}
        <ClutterManagerModal
          isOpen={clutterModalOpen}
          onClose={() => setClutterModalOpen(false)}
          profiles={clutterProfiles}
          activeProfileId={project.clutterProfileId}
          onSelectProfile={(id) => handleChangeProject({ clutterProfileId: id })}
          onSaveProfile={handleSaveClutterProfile}
          onCreateProfile={handleCreateClutterProfile}
          onDeleteProfile={handleDeleteClutterProfile}
          onDestroyAllObstacles={handleDestroyAllObstacles}
          onStartPlaceObstacle={(obs) => {
            setPendingObstacle(obs);
            setToolMode('place_obstacle');
            showNotice(`Click anywhere on the map to place '${obs.name}'.`);
          }}
          obstacleCount={placedObstacles.length}
        />

        <AuthModal
          isOpen={authModalOpen}
          onClose={() => setAuthModalOpen(false)}
          user={user}
          onAuthSuccess={async (token, u) => {
            setAuthToken(token);
            setUser(u);
            if (pendingNewSite) {
              try {
                await persistNewSite(pendingNewSite, token);
                await loadBootstrap(token, { preserveActiveProject: true });
                return;
              } catch (err) {
                showNotice(err instanceof Error ? err.message : 'Failed to create site');
              }
            }
            await loadBootstrap(token);
            showNotice(`Signed in as ${u.name}`);
          }}
          onLogout={async () => {
            await fetch('/api/auth/logout', {
              method: 'POST',
              headers: authHeaders(),
              credentials: 'same-origin',
            });
            setAuthToken(null);
            setUser(null);
            await loadBootstrap(null);
            showNotice('Signed out.');
          }}
        />

        <NewSiteModal
          isOpen={newSiteModalOpen}
          onClose={() => setNewSiteModalOpen(false)}
          currentProject={project}
          mapCenter={mapCenter}
          isSignedIn={Boolean(user)}
          onCreateSite={(payload) => persistNewSite(payload)}
        />

        <SavedLayersModal
          isOpen={savedModalOpen}
          onClose={() => setSavedModalOpen(false)}
          projects={projects}
          simulations={simulations}
          onLoadProject={(p) => {
            setProject(p);
            appendLog(`Loaded '${p.name}' from PostgreSQL.`);
          }}
          onDeleteProject={async (id) => {
            if (!user) return;
            const res = await fetch(`/api/projects/${id}`, {
              method: 'DELETE',
              headers: authHeaders(),
            });
            if (res.ok) {
              setProjects((prev) => prev.filter((p) => p.id !== id));
            }
          }}
          onSelectSimulation={(s) => {
            setVisibleSimIds({ [s.id]: true });
          }}
          onDeleteSimulation={async (id) => {
            if (!user) return;
            const res = await fetch(`/api/rf/simulations/${id}`, {
              method: 'DELETE',
              headers: authHeaders(),
            });
            if (res.ok) {
              setSimulations((prev) => prev.filter((s) => s.id !== id));
            }
          }}
          onExportSimPdf={(s) => handleExportFullPdf(s)}
          onOpenNewSite={() => setNewSiteModalOpen(true)}
        />

        <HelpDocsModal
          isOpen={helpModalOpen}
          onClose={() => setHelpModalOpen(false)}
          onExportPdf={() => handleExportFullPdf()}
        />
      </div>
  );

  if (!dbReady) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-[#23272b] text-slate-300 text-sm">
        Loading CoverageLab workspace...
      </div>
    );
  }

  return (
    <APIProvider apiKey={mapsApiKey} libraries={['marker']}>
      {mainContent}
    </APIProvider>
  );
}
