import { VectorTile } from '@mapbox/vector-tile';
import * as pbfMod from 'pbf';
import type { ClutterProfileDTO } from '../src/types/rf.ts';

type PbfReaderCtor = new (buf: Uint8Array) => unknown;
const PbfReaderClass = (
  pbfMod as unknown as { PbfReader?: PbfReaderCtor; default?: PbfReaderCtor }
).PbfReader ?? (pbfMod as unknown as { default: PbfReaderCtor }).default;

// Land cover class codes stored in 128x128 rasterized vector tiles
export const LC_BARE = 0;
export const LC_WATER = 1;
export const LC_GRASS = 2;
export const LC_CROPS = 3;
export const LC_TREES = 4;
export const LC_BUILDING = 5;

export interface SampledLandCover {
  type: 'building' | 'trees' | 'grassland' | 'bare_earth' | 'water';
  heightM: number;
  attenDbm: number;
  isRealGeo: boolean;
}

interface TileRaster {
  z: number;
  x: number;
  y: number;
  size: number;
  types: Uint8Array;
  heightsDm: Uint16Array; // height in decimeters (0..6553.5 m)
  fetchedAt: number;
}

const ELEV_CACHE_TTL_MS = 30 * 60 * 1000;
const TILE_CACHE_TTL_MS = 30 * 60 * 1000;
const MAX_CACHED_TILES = 180;
const TILE_RASTER_SIZE = 128;

const elevationCache = new Map<string, { elev: number; ts: number }>();
const tileCache = new Map<string, TileRaster>();
const inflightTileFetches = new Map<string, Promise<TileRaster | null>>();

let cachedTileTemplate = 'https://tiles.openfreemap.org/planet/20261122_124456_pt/{z}/{x}/{y}.pbf';
let tileTemplateFetchedAt = 0;

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function fallbackTerrainHeight(lat: number, lng: number): number {
  const n1 = Math.sin(lat * 180) * Math.cos(lng * 180);
  const n2 = Math.sin(lat * 470 + 1.2) * Math.sin(lng * 430 + 0.7);
  const n3 = Math.cos((lat - lng) * 900);
  const base = 7 + n1 * 4.5 + n2 * 2.5 + n3 * 1.4;
  return Math.max(1, Number(base.toFixed(2)));
}

/**
 * Fetches real Digital Elevation Model (DEM) terrain elevations using completely free,
 * keyless public datasets:
 *  1. Open-Meteo Elevation API (Copernicus DEM GLO-90 / ~30-90m global)
 *  2. OpenTopoData NASA SRTM 30m fallback
 */
export async function fetchFreeRealElevations(
  points: { lat: number; lng: number }[]
): Promise<{ elevations: number[]; source: string }> {
  if (points.length === 0) {
    return { elevations: [], source: 'No points' };
  }

  const now = Date.now();
  const results: Array<number | null> = points.map((p) => {
    const key = `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`;
    const hit = elevationCache.get(key);
    if (hit && now - hit.ts < ELEV_CACHE_TTL_MS) return hit.elev;
    return null;
  });

  const missingIndices: number[] = [];
  results.forEach((v, idx) => {
    if (v === null) missingIndices.push(idx);
  });

  if (missingIndices.length === 0) {
    return {
      elevations: results as number[],
      source: 'Copernicus DEM (Open-Meteo, Cached)',
    };
  }

  let usedSource = '';

  // Batch up to 100 coordinates per request to Open-Meteo Elevation API (free, no key)
  const chunkSize = 100;
  let openMeteoOk = true;

  for (let start = 0; start < missingIndices.length; start += chunkSize) {
    const chunk = missingIndices.slice(start, start + chunkSize);
    const lats = chunk.map((idx) => points[idx].lat.toFixed(5)).join(',');
    const lngs = chunk.map((idx) => points[idx].lng.toFixed(5)).join(',');

    try {
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
      const res = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (res.ok) {
        const data = (await res.json()) as { elevation?: number[] };
        if (Array.isArray(data.elevation) && data.elevation.length === chunk.length) {
          chunk.forEach((ptIdx, j) => {
            const raw = Number(data.elevation![j]);
            const elev = Number.isFinite(raw) ? Number(raw.toFixed(2)) : fallbackTerrainHeight(points[ptIdx].lat, points[ptIdx].lng);
            results[ptIdx] = elev;
            const key = `${points[ptIdx].lat.toFixed(4)},${points[ptIdx].lng.toFixed(4)}`;
            elevationCache.set(key, { elev, ts: now });
          });
          usedSource = 'Copernicus DEM (Open-Meteo)';
          continue;
        }
      }
      openMeteoOk = false;
      break;
    } catch {
      openMeteoOk = false;
      break;
    }
  }

  // Secondary free source: OpenTopoData NASA SRTM 30m
  if (!openMeteoOk) {
    const remaining = missingIndices.filter((idx) => results[idx] === null).slice(0, 100);
    if (remaining.length > 0) {
      try {
        const locStr = remaining
          .map((idx) => `${points[idx].lat.toFixed(5)},${points[idx].lng.toFixed(5)}`)
          .join('|');
        const res = await fetch(
          `https://api.opentopodata.org/v1/srtm30m?locations=${locStr}`,
          { signal: AbortSignal.timeout(4500) }
        );
        if (res.ok) {
          const data = (await res.json()) as {
            status: string;
            results?: { elevation: number | null }[];
          };
          if (data.status === 'OK' && Array.isArray(data.results) && data.results.length === remaining.length) {
            remaining.forEach((ptIdx, j) => {
              const raw = data.results![j]?.elevation;
              if (typeof raw === 'number' && Number.isFinite(raw)) {
                const elev = Number(raw.toFixed(2));
                results[ptIdx] = elev;
                const key = `${points[ptIdx].lat.toFixed(4)},${points[ptIdx].lng.toFixed(4)}`;
                elevationCache.set(key, { elev, ts: now });
              }
            });
            usedSource = 'NASA SRTM 30m DEM (OpenTopoData)';
          }
        }
      } catch {
        // Fallback below
      }
    }
  }

  // Fill any remaining null entries cleanly
  let fallbackUsed = false;
  for (let i = 0; i < results.length; i++) {
    if (results[i] === null) {
      results[i] = fallbackTerrainHeight(points[i].lat, points[i].lng);
      fallbackUsed = true;
    }
  }

  if (!usedSource) {
    usedSource = 'Terrain Model (Offline Fallback)';
  } else if (fallbackUsed) {
    usedSource = `${usedSource} + Fallback`;
  }

  return {
    elevations: results as number[],
    source: usedSource,
  };
}

async function getOpenFreeMapTileTemplate(): Promise<string> {
  const now = Date.now();
  if (now - tileTemplateFetchedAt < 6 * 60 * 60 * 1000) {
    return cachedTileTemplate;
  }
  try {
    const res = await fetch('https://tiles.openfreemap.org/planet', {
      signal: AbortSignal.timeout(2500),
    });
    if (res.ok) {
      const json = (await res.json()) as { tiles?: string[] };
      if (Array.isArray(json.tiles) && json.tiles[0]) {
        cachedTileTemplate = json.tiles[0];
        tileTemplateFetchedAt = now;
      }
    }
  } catch {
    // Keep last known valid template
  }
  return cachedTileTemplate;
}

export function latLngToTilePixel(
  lat: number,
  lng: number,
  z: number,
  size = TILE_RASTER_SIZE
): { x: number; y: number; px: number; py: number } {
  const n = 1 << z;
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));
  const latRad = toRad(clampedLat);
  const xf = ((lng + 180) / 360) * n;
  const yf = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n;
  const x = Math.max(0, Math.min(n - 1, Math.floor(xf)));
  const y = Math.max(0, Math.min(n - 1, Math.floor(yf)));
  const px = Math.max(0, Math.min(size - 1, Math.floor((xf - x) * size)));
  const py = Math.max(0, Math.min(size - 1, Math.floor((yf - y) * size)));
  return { x, y, px, py };
}

// Fast even-odd scanline polygon fill onto a size x size tile raster
function fillPolygonRings(
  rings: Array<Array<{ x: number; y: number }>>,
  extent: number,
  size: number,
  types: Uint8Array,
  heightsDm: Uint16Array,
  lcCode: number,
  heightDm: number
) {
  if (!rings || rings.length === 0) return;
  const scale = size / Math.max(1, extent);

  let minY = size - 1;
  let maxY = 0;

  const scaledRings: Array<Array<{ x: number; y: number }>> = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    const pts: Array<{ x: number; y: number }> = [];
    for (const p of ring) {
      const sx = p.x * scale;
      const sy = p.y * scale;
      if (sy < minY) minY = Math.floor(sy);
      if (sy > maxY) maxY = Math.ceil(sy);
      pts.push({ x: sx, y: sy });
    }
    scaledRings.push(pts);
  }

  if (scaledRings.length === 0) return;
  const rStart = Math.max(0, minY);
  const rEnd = Math.min(size - 1, maxY);

  for (let row = rStart; row <= rEnd; row++) {
    const scanY = row + 0.5;
    const xs: number[] = [];

    for (const ring of scaledRings) {
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const yi = ring[i].y;
        const yj = ring[j].y;
        if ((yi > scanY) !== (yj > scanY)) {
          const xi = ring[i].x;
          const xj = ring[j].x;
          const xInt = xi + ((scanY - yi) * (xj - xi)) / (yj - yi);
          xs.push(xInt);
        }
      }
    }

    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);

    for (let k = 0; k + 1 < xs.length; k += 2) {
      const cStart = Math.max(0, Math.floor(xs[k]));
      const cEnd = Math.min(size - 1, Math.floor(xs[k + 1]));
      const rowOffset = row * size;
      for (let col = cStart; col <= cEnd; col++) {
        const idx = rowOffset + col;
        types[idx] = lcCode;
        if (heightDm > heightsDm[idx] || lcCode === LC_WATER) {
          heightsDm[idx] = lcCode === LC_WATER ? 0 : heightDm;
        }
      }
    }
  }
}

async function fetchAndRasterizeTile(z: number, x: number, y: number): Promise<TileRaster | null> {
  const key = `${z}/${x}/${y}`;
  const now = Date.now();
  const cached = tileCache.get(key);
  if (cached && now - cached.fetchedAt < TILE_CACHE_TTL_MS) {
    return cached;
  }

  const existingInflight = inflightTileFetches.get(key);
  if (existingInflight) return existingInflight;

  const task = (async (): Promise<TileRaster | null> => {
    try {
      const tpl = await getOpenFreeMapTileTemplate();
      const url = tpl
        .replace('{z}', String(z))
        .replace('{x}', String(x))
        .replace('{y}', String(y));
      const res = await fetch(url, { signal: AbortSignal.timeout(4000) });
      if (!res.ok) return null;

      const buf = new Uint8Array(await res.arrayBuffer());
      const tile = new VectorTile(new PbfReaderClass(buf) as never);
      const size = TILE_RASTER_SIZE;
      const types = new Uint8Array(size * size);
      const heightsDm = new Uint16Array(size * size);

      // 1. Macro landuse (only paint urban blocks at z12 where individual buildings are absent;
      // at z14 paint forests/parks/farmland and let real building footprints define urban clutter!)
      const landuseLayer = tile.layers.landuse;
      if (landuseLayer) {
        const ext = landuseLayer.extent || 4096;
        for (let i = 0; i < landuseLayer.length; i++) {
          const feat = landuseLayer.feature(i);
          if (feat.type !== 3) continue;
          const cls = String(feat.properties.class || '');
          let code = -1;
          let hDm = 10;

          if (cls === 'forest') {
            code = LC_TREES;
            hDm = 100;
          } else if (
            cls === 'park' ||
            cls === 'cemetery' ||
            cls === 'recreation_ground' ||
            cls === 'village_green' ||
            cls === 'pitch' ||
            cls === 'playground'
          ) {
            code = LC_GRASS;
            hDm = 10;
          } else if (cls === 'farmland' || cls === 'orchard' || cls === 'vineyard') {
            code = LC_CROPS;
            hDm = 15;
          } else if (z <= 12) {
            if (cls === 'commercial' || cls === 'retail' || cls === 'industrial') {
              code = LC_BUILDING;
              hDm = 140;
            } else if (cls === 'residential') {
              code = LC_BUILDING;
              hDm = 80;
            }
          }

          if (code >= 0) {
            fillPolygonRings(feat.loadGeometry(), ext, size, types, heightsDm, code, hDm);
          }
        }
      }

      // 2. Landcover (wood, grass, wetland, farmland, sand)
      const landcoverLayer = tile.layers.landcover;
      if (landcoverLayer) {
        const ext = landcoverLayer.extent || 4096;
        for (let i = 0; i < landcoverLayer.length; i++) {
          const feat = landcoverLayer.feature(i);
          if (feat.type !== 3) continue;
          const cls = String(feat.properties.class || '');
          let code = -1;
          let hDm = 10;
          if (cls === 'wood' || cls === 'forest') {
            code = LC_TREES;
            hDm = 90; // ~9 m tree canopy
          } else if (cls === 'grass' || cls === 'meadow' || cls === 'wetland') {
            code = LC_GRASS;
            hDm = 10;
          } else if (cls === 'farmland' || cls === 'crop') {
            code = LC_CROPS;
            hDm = 15;
          }
          if (code >= 0) {
            fillPolygonRings(feat.loadGeometry(), ext, size, types, heightsDm, code, hDm);
          }
        }
      }

      // 3. Water bodies (rivers, lakes, bay/ocean) -> flat, zero clutter attenuation
      const waterLayer = tile.layers.water;
      if (waterLayer) {
        const ext = waterLayer.extent || 4096;
        for (let i = 0; i < waterLayer.length; i++) {
          const feat = waterLayer.feature(i);
          if (feat.type !== 3) continue;
          fillPolygonRings(feat.loadGeometry(), ext, size, types, heightsDm, LC_WATER, 0);
        }
      }

      // 4. Real OSM Building footprints & heights (z14)
      const buildingLayer = tile.layers.building;
      if (buildingLayer) {
        const ext = buildingLayer.extent || 4096;
        for (let i = 0; i < buildingLayer.length; i++) {
          const feat = buildingLayer.feature(i);
          if (feat.type !== 3) continue;
          const rawH = Number(feat.properties.render_height ?? 8);
          const buildingHeightM = Number.isFinite(rawH) && rawH > 0 ? Math.min(450, rawH) : 8;
          const hDm = Math.round(buildingHeightM * 10);
          fillPolygonRings(feat.loadGeometry(), ext, size, types, heightsDm, LC_BUILDING, hDm);
        }
      }

      const raster: TileRaster = { z, x, y, size, types, heightsDm, fetchedAt: Date.now() };
      if (tileCache.size >= MAX_CACHED_TILES) {
        const oldestKey = tileCache.keys().next().value;
        if (oldestKey) tileCache.delete(oldestKey);
      }
      tileCache.set(key, raster);
      return raster;
    } catch {
      return null;
    } finally {
      inflightTileFetches.delete(key);
    }
  })();

  inflightTileFetches.set(key, task);
  return task;
}

/**
 * Prefetches real OSM z14 vector tiles along a Tx->Rx path so Path Profile
 * uses exact real building footprints/heights, trees, parks, and rivers.
 */
export async function prefetchRealClutterForPath(
  points: { lat: number; lng: number }[]
): Promise<{ tileCount: number; source: string }> {
  const uniqueTiles = new Map<string, { z: number; x: number; y: number }>();
  for (const pt of points) {
    const { x, y } = latLngToTilePixel(pt.lat, pt.lng, 14);
    uniqueTiles.set(`14/${x}/${y}`, { z: 14, x, y });
  }
  const list = Array.from(uniqueTiles.values()).slice(0, 24);
  const fetched = await Promise.all(list.map((t) => fetchAndRasterizeTile(t.z, t.x, t.y)));
  const okCount = fetched.filter(Boolean).length;
  return {
    tileCount: okCount,
    source: okCount > 0 ? 'OSM Vector Tiles (OpenFreeMap)' : 'Fallback Clutter',
  };
}

/**
 * Prefetches real OSM vector tiles for a 2D RF simulation bounding box:
 *  - z14 tiles around Tx (up to 5x5 grid, ~12 km x 12 km) for individual buildings & heights
 *  - z12 tiles over the full simulation bounds for macro forests, water & urban zones
 */
export async function prefetchRealClutterForArea(
  txLat: number,
  txLng: number,
  north: number,
  south: number,
  east: number,
  west: number
): Promise<{ z14Count: number; z12Count: number; source: string }> {
  const tileRequests: Array<{ z: number; x: number; y: number }> = [];
  const seen = new Set<string>();

  // 1. High-detail z14 tiles around Tx (capped to max 7x7 = 49 tiles, ~8.5 km radius) for real building heights
  const nw14 = latLngToTilePixel(north, west, 14);
  const se14 = latLngToTilePixel(south, east, 14);
  const center14 = latLngToTilePixel(txLat, txLng, 14);

  const minX14 = Math.max(nw14.x, center14.x - 3);
  const maxX14 = Math.min(se14.x, center14.x + 3);
  const minY14 = Math.max(nw14.y, center14.y - 3);
  const maxY14 = Math.min(se14.y, center14.y + 3);

  for (let x = minX14; x <= maxX14; x++) {
    for (let y = minY14; y <= maxY14; y++) {
      const k = `14/${x}/${y}`;
      if (!seen.has(k)) {
        seen.add(k);
        tileRequests.push({ z: 14, x, y });
      }
    }
  }

  // 2. z12 macro tiles covering the outer area (capped to 5x5)
  const nw12 = latLngToTilePixel(north, west, 12);
  const se12 = latLngToTilePixel(south, east, 12);
  const c12 = latLngToTilePixel(txLat, txLng, 12);
  const minX12 = Math.max(nw12.x, c12.x - 2);
  const maxX12 = Math.min(se12.x, c12.x + 2);
  const minY12 = Math.max(nw12.y, c12.y - 2);
  const maxY12 = Math.min(se12.y, c12.y + 2);

  for (let x = minX12; x <= maxX12; x++) {
    for (let y = minY12; y <= maxY12; y++) {
      const k = `12/${x}/${y}`;
      if (!seen.has(k)) {
        seen.add(k);
        tileRequests.push({ z: 12, x, y });
      }
    }
  }

  const settled = await Promise.all(tileRequests.map((t) => fetchAndRasterizeTile(t.z, t.x, t.y)));
  let z14Count = 0;
  let z12Count = 0;
  settled.forEach((r) => {
    if (!r) return;
    if (r.z === 14) z14Count++;
    else z12Count++;
  });

  return {
    z14Count,
    z12Count,
    source:
      z14Count + z12Count > 0 ? 'OSM Vector Tiles (OpenFreeMap)' : 'Fallback Clutter',
  };
}

function sampleFallbackClutter(
  lat: number,
  lng: number,
  clutter: ClutterProfileDTO
): SampledLandCover {
  const gx = Math.floor(lat * 1400);
  const gy = Math.floor(lng * 1400);
  const h = Math.abs(Math.sin(gx * 12.9898 + gy * 78.233) * 43758.5453) % 1;
  const landMap = new Map(clutter.landCover.map((c) => [c.key, c]));
  const urban = landMap.get('urban');
  const trees = landMap.get('trees');
  const grass = landMap.get('grassland');
  const bare = landMap.get('bare_earth');

  if (Math.abs(gx % 5) === 0 || Math.abs(gy % 6) === 0) {
    return { type: 'bare_earth', heightM: bare?.heightM ?? 1, attenDbm: bare?.attenDbm ?? 0, isRealGeo: false };
  }
  if (h < 0.34) {
    return { type: 'grassland', heightM: grass?.heightM ?? 1, attenDbm: grass?.attenDbm ?? 0, isRealGeo: false };
  }
  if (h < 0.56) {
    return { type: 'trees', heightM: trees?.heightM ?? 6, attenDbm: trees?.attenDbm ?? 0.04, isRealGeo: false };
  }
  return {
    type: 'building',
    heightM: Number(Math.max(5, (urban?.heightM ?? 8) * 1.4).toFixed(1)),
    attenDbm: clutter.buildingsAtten,
    isRealGeo: false,
  };
}

/**
 * Samples real OpenStreetMap building footprints, heights, trees, parks, and water
 * from cached rasterized OpenFreeMap vector tiles (z14 preferred, then z12).
 */
export function sampleRealLandCoverAt(
  lat: number,
  lng: number,
  clutter: ClutterProfileDTO
): SampledLandCover {
  const landMap = new Map(clutter.landCover.map((c) => [c.key, c]));
  const treesCfg = landMap.get('trees');
  const grassCfg = landMap.get('grassland');
  const cropsCfg = landMap.get('crops');
  const bareCfg = landMap.get('bare_ground') ?? landMap.get('bare_earth');
  const waterCfg = landMap.get('water');
  const urbanCfg = landMap.get('urban');

  const now = Date.now();

  for (const z of [14, 12] as const) {
    const pos = latLngToTilePixel(lat, lng, z);
    const tile = tileCache.get(`${z}/${pos.x}/${pos.y}`);
    if (!tile || now - tile.fetchedAt >= TILE_CACHE_TTL_MS) continue;

    const idx = pos.py * tile.size + pos.px;
    const lc = tile.types[idx];
    const realHeightM = tile.heightsDm[idx] / 10;

    if (lc === LC_BUILDING) {
      // Scale building height by user's urban profile minimum if OSM building lacks explicit height
      const effHeight =
        realHeightM > 0 ? realHeightM : Math.max(6, urbanCfg?.heightM ?? 8);
      return {
        type: 'building',
        heightM: Number(effHeight.toFixed(1)),
        attenDbm: clutter.buildingsAtten,
        isRealGeo: true,
      };
    }
    if (lc === LC_TREES) {
      const treeH = Math.max(realHeightM, treesCfg?.heightM ?? 6);
      return {
        type: 'trees',
        heightM: Number(treeH.toFixed(1)),
        attenDbm: treesCfg?.attenDbm ?? 0.04,
        isRealGeo: true,
      };
    }
    if (lc === LC_WATER) {
      return {
        type: 'water',
        heightM: waterCfg?.heightM ?? 0,
        attenDbm: waterCfg?.attenDbm ?? 0,
        isRealGeo: true,
      };
    }
    if (lc === LC_GRASS || lc === LC_CROPS) {
      const cfg = lc === LC_CROPS ? cropsCfg : grassCfg;
      return {
        type: 'grassland',
        heightM: cfg?.heightM ?? 1,
        attenDbm: cfg?.attenDbm ?? 0.01,
        isRealGeo: true,
      };
    }

    return {
      type: 'bare_earth',
      heightM: bareCfg?.heightM ?? 1,
      attenDbm: bareCfg?.attenDbm ?? 0,
      isRealGeo: true,
    };
  }

  return sampleFallbackClutter(lat, lng, clutter);
}
