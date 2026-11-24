import type {
  AntennaPatternDTO,
  ClutterProfileDTO,
  PathProfileResult,
  PathProfileSample,
  PlacedObstacleDTO,
  SimulationBounds,
  SimulationStats,
} from '../src/types/rf.ts';
import {
  fetchFreeRealElevations,
  prefetchRealClutterForArea,
  prefetchRealClutterForPath,
  sampleRealLandCoverAt,
} from './geoSources.ts';

const EARTH_RADIUS_KM = 6371.0;
const EFFECTIVE_EARTH_RADIUS_M = 8500000; // k = 4/3 standard atmosphere

export function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function toDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function bearingDeg(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const phi1 = toRad(lat1);
  const phi2 = toRad(lat2);
  const dLambda = toRad(lng2 - lng1);
  const y = Math.sin(dLambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(dLambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

export function destinationPoint(
  lat: number,
  lng: number,
  distKm: number,
  bearingDegrees: number
): { lat: number; lng: number } {
  const brng = toRad(bearingDegrees);
  const phi1 = toRad(lat);
  const lambda1 = toRad(lng);
  const delta = distKm / EARTH_RADIUS_KM;

  const phi2 = Math.asin(
    Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(brng)
  );
  const lambda2 =
    lambda1 +
    Math.atan2(
      Math.sin(brng) * Math.sin(delta) * Math.cos(phi1),
      Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2)
    );
  return { lat: toDeg(phi2), lng: toDeg(lambda2) };
}

export function convertPowerToDbm(rfPower: number, unit: string): number {
  if (unit === 'Watts' || unit === 'ERP (W)') {
    const watts = Math.max(0.000001, rfPower);
    const dbm = 10 * Math.log10(watts * 1000);
    return unit === 'ERP (W)' ? dbm + 2.15 : dbm;
  }
  return rfPower;
}

export function interpolatePatternGain(pattern: number[], angleDeg: number): number {
  if (!pattern || pattern.length === 0) return 0;
  const norm = ((angleDeg % 360) + 360) % 360;
  const step = 360 / pattern.length;
  const idx0 = Math.floor(norm / step) % pattern.length;
  const idx1 = (idx0 + 1) % pattern.length;
  const frac = (norm - idx0 * step) / step;
  return pattern[idx0] * (1 - frac) + pattern[idx1] * frac;
}

function knifeEdgeLossDb(v: number): number {
  if (v <= -0.78) return 0;
  const term = Math.sqrt((v - 0.1) ** 2 + 1) + v - 0.1;
  return Math.max(0, 6.9 + 20 * Math.log10(Math.max(0.001, term)));
}

export async function fetchGoogleElevationsForPath(
  points: { lat: number; lng: number }[]
): Promise<{ elevations: number[]; source: string }> {
  return fetchFreeRealElevations(points);
}

function mercatorY(latDeg: number): number {
  const clamped = Math.max(-85, Math.min(85, latDeg));
  return Math.log(Math.tan(Math.PI / 4 + toRad(clamped) / 2));
}

function invMercatorY(y: number): number {
  return toDeg(2 * Math.atan(Math.exp(y)) - Math.PI / 2);
}

function fsplLossDb(frequencyMhz: number, distKm: number): number {
  return 32.44 + 20 * Math.log10(Math.max(1, frequencyMhz)) + 20 * Math.log10(Math.max(0.02, distKm));
}

function clutterFreqFactor(frequencyMhz: number): number {
  return Math.pow(Math.max(100, frequencyMhz) / 900, 0.35);
}

function twoRayBreakpointLossDb(
  distM: number,
  txHeightAglM: number,
  rxHeightAglM: number,
  wavelengthM: number,
  buildingsAtten: number
): number {
  const hTx = Math.max(1.5, txHeightAglM);
  const hRx = Math.max(1.5, rxHeightAglM);
  // First Fresnel ground-reflection breakpoint d_bp = 4 * h_tx * h_rx / lambda
  const dBpM = Math.max(60, (4 * hTx * hRx) / Math.max(0.01, wavelengthM));
  // Excess path-loss exponent transitions from 2.0 (FSPL) toward 2.75..3.65 based on clutter density
  const excessExponent = Math.max(0.55, Math.min(1.65, 0.75 + buildingsAtten * 1.4));
  return 5 * excessExponent * Math.log10(1 + (distM / dBpM) ** 2);
}

function computeFieldStrengthDbuvm(
  eirpDbm: number,
  totalLossDb: number,
  frequencyMhz: number
): number {
  // Electric field E depends on isotropic incident power (EIRP - TotalLoss), independent of Rx antenna gain
  const rxIsotropicDbm = eirpDbm - totalLossDb;
  return rxIsotropicDbm + 77.21 + 20 * Math.log10(Math.max(1, frequencyMhz));
}

function computeNoiseFloorDbm(bandwidthKhz: number): number {
  // Johnson-Nyquist thermal noise (-174 dBm/Hz) + 10*log10(BW_Hz) + 8 dB receiver noise figure
  return Number((-174 + 10 * Math.log10(Math.max(1000, bandwidthKhz * 1000)) + 8).toFixed(1));
}

export interface RfComputeParams {
  txLat: number;
  txLng: number;
  txHeightM: number;
  txHeightMode?: string;
  frequencyMhz: number;
  rfPower: number;
  rfPowerUnit: string;
  bandwidthKhz: number;
  azimuthDeg: number;
  tiltDeg: number;
  txGainDbi: number;
  rxHeightM: number;
  rxGainDbi: number;
  measuredUnit: string;
  rangeKm: number;
  pattern: AntennaPatternDTO;
  clutter: ClutterProfileDTO;
  placedObstacles: PlacedObstacleDTO[];
}

interface RaySample {
  distM: number;
  distKm: number;
  lat: number;
  lng: number;
  terrainM: number;
  surfaceHeightM: number;
  terminalSurfaceHeightM: number;
  buildingM: number;
  treesM: number;
  grasslandM: number;
  bareEarthM: number;
  builtUpM: number;
  obstacleM: number;
  clutterRateDbPerM: number;
}

function evaluateRayToTarget(
  raySamples: RaySample[],
  targetIdx: number,
  txTotalH: number,
  txHeightAgl: number,
  rxHeightAgl: number,
  frequencyMhz: number,
  wavelengthM: number,
  buildingsAtten: number,
  stepM: number
): {
  maxV: number;
  clutterLossDb: number;
  fsplDb: number;
  twoRayDb: number;
  diffractionLossDb: number;
  totalLossDb: number;
} {
  const target = raySamples[targetIdx];
  const totalDistM = Math.max(20, target.distM);
  const distKm = Math.max(0.02, target.distKm);
  const rxTotalH = target.terrainM + rxHeightAgl;
  const fScale = clutterFreqFactor(frequencyMhz);

  let maxV = -5;
  let clutterLossTotal = 0;

  for (let k = 1; k < targetIdx; k++) {
    const s = raySamples[k];
    const d1 = Math.max(1, s.distM);
    const d2 = Math.max(1, totalDistM - d1);
    const bulgeM = (d1 * d2) / (2 * EFFECTIVE_EARTH_RADIUS_M);
    const effSurfaceM = s.surfaceHeightM + bulgeM;
    const losAtK = txTotalH + (rxTotalH - txTotalH) * (d1 / totalDistM);
    const fresnelR = Math.sqrt((wavelengthM * d1 * d2) / totalDistM);

    const clearanceH = effSurfaceM - losAtK;
    const v = clearanceH * Math.sqrt((2 * totalDistM) / Math.max(0.1, wavelengthM * d1 * d2));
    if (v > maxV) maxV = v;

    if (effSurfaceM > losAtK - fresnelR * 0.45) {
      const penetrationRatio = Math.min(
        1.5,
        Math.max(0.15, (effSurfaceM - (losAtK - fresnelR * 0.45)) / Math.max(4, fresnelR))
      );
      clutterLossTotal += s.clutterRateDbPerM * stepM * 0.14 * penetrationRatio * fScale;
    }
  }

  // Moderate indoor/street-canyon terminal loss when Rx sits below local roof/canopy height
  if (targetIdx > 0 && rxTotalH < target.terminalSurfaceHeightM) {
    const deficitM = target.terminalSurfaceHeightM - rxTotalH;
    const baseEntry = target.buildingM > 0 ? 4.5 : 1.5;
    clutterLossTotal += Math.min(10, baseEntry + deficitM * Math.max(0.08, target.clutterRateDbPerM) * 0.45 * fScale);
  }

  const fsplDb = fsplLossDb(frequencyMhz, distKm);
  const twoRayDb = twoRayBreakpointLossDb(
    totalDistM,
    txHeightAgl,
    rxHeightAgl,
    wavelengthM,
    buildingsAtten
  );
  const diffractionLossDb = knifeEdgeLossDb(maxV);
  const clutterLossDb = Math.min(44, clutterLossTotal);
  const totalLossDb = fsplDb + twoRayDb + diffractionLossDb + clutterLossDb;

  return { maxV, clutterLossDb, fsplDb, twoRayDb, diffractionLossDb, totalLossDb };
}

export async function computePathProfile(
  params: RfComputeParams,
  rxLat: number,
  rxLng: number
): Promise<PathProfileResult> {
  const distKm = Math.max(0.02, haversineKm(params.txLat, params.txLng, rxLat, rxLng));
  const brg = bearingDeg(params.txLat, params.txLng, rxLat, rxLng);
  const sampleCount = 64;

  const coords: { lat: number; lng: number }[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const frac = i / (sampleCount - 1);
    coords.push({
      lat: params.txLat + (rxLat - params.txLat) * frac,
      lng: params.txLng + (rxLng - params.txLng) * frac,
    });
  }

  const [{ elevations, source: elevSrc }, clutterMeta] = await Promise.all([
    fetchFreeRealElevations(coords),
    prefetchRealClutterForPath(coords),
  ]);
  const source = `${elevSrc} + ${clutterMeta.source}`;
  const txElev = elevations[0] ?? 10;
  const rxElev = elevations[elevations.length - 1] ?? 10;

  const isAmsl = params.txHeightMode === 'Meters AMSL';
  const txTotalH = isAmsl ? Math.max(txElev + 1, params.txHeightM) : txElev + params.txHeightM;
  const effectiveTxAgl = Math.max(1, txTotalH - txElev);
  const rxTotalH = rxElev + params.rxHeightM;
  const totalDistM = distKm * 1000;
  const downtiltDeg = Number(toDeg(Math.atan2(txTotalH - rxTotalH, totalDistM)).toFixed(2));

  const wavelengthM = 300 / Math.max(1, params.frequencyMhz);
  const txPowerDbm = convertPowerToDbm(params.rfPower, params.rfPowerUnit);
  const relAzimuth = (brg - params.azimuthDeg + 360) % 360;
  const horizOffset = interpolatePatternGain(params.pattern.horizontalPattern, relAzimuth);
  const vertOffset = Math.max(
    -25,
    interpolatePatternGain(params.pattern.verticalPattern, downtiltDeg - params.tiltDeg)
  );
  const effectiveTxGainDbi = params.txGainDbi + horizOffset + vertOffset;
  const eirpDbm = txPowerDbm + effectiveTxGainDbi;
  const erpDbm = eirpDbm - 2.15;
  const eirpW = Math.pow(10, (eirpDbm - 30) / 10);
  const erpW = Math.pow(10, (erpDbm - 30) / 10);

  const stepM = totalDistM / (sampleCount - 1);
  const rawSamples: RaySample[] = [];

  for (let i = 0; i < sampleCount; i++) {
    const prevFrac = i === 0 ? 0 : (i - 1) / (sampleCount - 1);
    const frac = i / (sampleCount - 1);
    const terrainM = elevations[i] ?? txElev;

    let buildingM = 0;
    let treesM = 0;
    let grasslandM = 0;
    let bareEarthM = 0;
    let builtUpM = 0;
    let obstacleM = 0;
    let clutterRateSum = 0;
    let terminalObsH = 0;

    if (i > 0) {
      const subFracs = stepM > 35 ? [0.33, 0.67, 1.0] : [1.0];
      for (const sub of subFracs) {
        const sFrac = prevFrac + (frac - prevFrac) * sub;
        const sDistM = sFrac * totalDistM;
        const sLat = params.txLat + (rxLat - params.txLat) * sFrac;
        const sLng = params.txLng + (rxLng - params.txLng) * sFrac;
        const lc = sampleRealLandCoverAt(sLat, sLng, params.clutter);

        if (sDistM > 45 && i < sampleCount - 1) {
          if (lc.type === 'building') {
            buildingM = Math.max(buildingM, lc.heightM);
            builtUpM = Math.max(builtUpM, lc.heightM * 0.35);
            if (sub === 1.0) terminalObsH = Math.max(terminalObsH, lc.heightM);
          } else if (lc.type === 'trees') {
            treesM = Math.max(treesM, lc.heightM);
            if (sub === 1.0) terminalObsH = Math.max(terminalObsH, lc.heightM);
          } else if (lc.type === 'grassland') {
            grasslandM = Math.max(grasslandM, lc.heightM);
          } else {
            bareEarthM = Math.max(bareEarthM, lc.heightM);
          }
          clutterRateSum += lc.attenDbm;
        } else if (i === sampleCount - 1 && sub === 1.0) {
          // Record Rx terminal roof/canopy height without adding interior path diffraction
          if (lc.type === 'building') {
            buildingM = lc.heightM;
            terminalObsH = lc.heightM;
          } else if (lc.type === 'trees') {
            treesM = lc.heightM;
            terminalObsH = lc.heightM;
          }
          clutterRateSum += lc.attenDbm;
        }
      }
      clutterRateSum /= subFracs.length;

      for (const obs of params.placedObstacles) {
        const dObsKm = haversineKm(coords[i].lat, coords[i].lng, obs.lat, obs.lng);
        if (dObsKm * 1000 <= obs.radiusM) {
          obstacleM = Math.max(obstacleM, obs.heightM);
          terminalObsH = Math.max(terminalObsH, obs.heightM);
          clutterRateSum = Math.max(clutterRateSum, obs.attenDbm);
        }
      }
    }

    rawSamples.push({
      distM: frac * totalDistM,
      distKm: frac * distKm,
      lat: coords[i].lat,
      lng: coords[i].lng,
      terrainM,
      surfaceHeightM: terrainM + Math.max(buildingM, treesM, obstacleM),
      terminalSurfaceHeightM: terrainM + terminalObsH,
      buildingM,
      treesM,
      grasslandM,
      bareEarthM,
      builtUpM,
      obstacleM,
      clutterRateDbPerM: clutterRateSum,
    });
  }

  const samples: PathProfileSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const frac = i / (sampleCount - 1);
    const d1 = Math.max(1, frac * totalDistM);
    const d2 = Math.max(1, (1 - frac) * totalDistM);
    const bulgeM = (d1 * d2) / (2 * EFFECTIVE_EARTH_RADIUS_M);
    const effTerrainM = rawSamples[i].terrainM + bulgeM;
    const losM = txTotalH + (rxTotalH - txTotalH) * frac;
    const fresnelR = Math.sqrt((wavelengthM * d1 * d2) / Math.max(1, d1 + d2));

    const stepEval = evaluateRayToTarget(
      rawSamples,
      i,
      txTotalH,
      effectiveTxAgl,
      params.rxHeightM,
      params.frequencyMhz,
      wavelengthM,
      params.clutter.buildingsAtten,
      stepM
    );

    const stepRxElevAngle = toDeg(
      Math.atan2(txTotalH - (rawSamples[i].terrainM + params.rxHeightM), Math.max(20, rawSamples[i].distM))
    );
    const stepVertOffset = Math.max(
      -25,
      interpolatePatternGain(params.pattern.verticalPattern, stepRxElevAngle - params.tiltDeg)
    );
    const stepEirpDbm = txPowerDbm + params.txGainDbi + horizOffset + stepVertOffset;
    const stepRx = stepEirpDbm + params.rxGainDbi - stepEval.totalLossDb;

    samples.push({
      distanceKm: Number(rawSamples[i].distKm.toFixed(3)),
      lat: rawSamples[i].lat,
      lng: rawSamples[i].lng,
      terrainM: Number(effTerrainM.toFixed(2)),
      buildingM: Number(rawSamples[i].buildingM.toFixed(2)),
      treesM: Number(rawSamples[i].treesM.toFixed(2)),
      grasslandM: Number(rawSamples[i].grasslandM.toFixed(2)),
      bareEarthM: Number(rawSamples[i].bareEarthM.toFixed(2)),
      builtUpM: Number(rawSamples[i].builtUpM.toFixed(2)),
      obstacleM: Number(rawSamples[i].obstacleM.toFixed(2)),
      losM: Number(losM.toFixed(2)),
      fresnelUpperM: Number((losM + fresnelR).toFixed(2)),
      fresnelLowerM: Number((losM - fresnelR).toFixed(2)),
      rxPowerDbm: Number(stepRx.toFixed(1)),
    });
  }

  const finalEval = evaluateRayToTarget(
    rawSamples,
    sampleCount - 1,
    txTotalH,
    effectiveTxAgl,
    params.rxHeightM,
    params.frequencyMhz,
    wavelengthM,
    params.clutter.buildingsAtten,
    stepM
  );

  const totalPathLossDb = Number(finalEval.totalLossDb.toFixed(2));
  const receivedPowerDbm = Number((eirpDbm + params.rxGainDbi - totalPathLossDb).toFixed(1));
  const fieldStrengthDbuvm = Number(
    computeFieldStrengthDbuvm(eirpDbm, totalPathLossDb, params.frequencyMhz).toFixed(1)
  );
  const noiseFloorDbm = computeNoiseFloorDbm(params.bandwidthKhz);
  const snrDb = Number((receivedPowerDbm - noiseFloorDbm).toFixed(1));

  return {
    distanceKm: Number(distKm.toFixed(3)),
    bearingDeg: Number(brg.toFixed(1)),
    downtiltDeg,
    frequencyMhz: params.frequencyMhz,
    modelName: 'ITU-R P.526 Knife-Edge + Two-Ray Clutter',
    pathLossDb: totalPathLossDb,
    fsplDb: Number(finalEval.fsplDb.toFixed(2)),
    diffractionLossDb: Number(finalEval.diffractionLossDb.toFixed(2)),
    clutterLossDb: Number(finalEval.clutterLossDb.toFixed(2)),
    receivedPowerDbm,
    fieldStrengthDbuvm,
    noiseFloorDbm,
    snrDb,
    txGainDbd: Number((params.txGainDbi - 2.15).toFixed(2)),
    txGainDbi: params.txGainDbi,
    erpW: Number(erpW.toFixed(3)),
    erpDbm: Number(erpDbm.toFixed(2)),
    eirpW: Number(eirpW.toFixed(3)),
    eirpDbm: Number(eirpDbm.toFixed(2)),
    rxGainDbd: Number((params.rxGainDbi - 2.15).toFixed(2)),
    rxGainDbi: params.rxGainDbi,
    txElevationM: Number(txElev.toFixed(1)),
    rxElevationM: Number(rxElev.toFixed(1)),
    txHeightAgl: Number(effectiveTxAgl.toFixed(1)),
    rxHeightAgl: params.rxHeightM,
    txLat: params.txLat,
    txLng: params.txLng,
    rxLat,
    rxLng,
    elevationSource: source,
    samples,
  };
}

export async function computeCoverageGrid(params: RfComputeParams): Promise<{
  bounds: SimulationBounds;
  gridCols: number;
  gridRows: number;
  gridValues: number[];
  stats: SimulationStats;
}> {
  const t0 = Date.now();
  const rangeKm = Math.max(0.5, Math.min(100, params.rangeKm));

  // Bounding box around Tx
  const north = destinationPoint(params.txLat, params.txLng, rangeKm, 0).lat;
  const south = destinationPoint(params.txLat, params.txLng, rangeKm, 180).lat;
  const east = destinationPoint(params.txLat, params.txLng, rangeKm, 90).lng;
  const west = destinationPoint(params.txLat, params.txLng, rangeKm, 270).lng;

  // High-resolution polar ray-marching terrain + clutter engine (180 azimuth rays x 96 radial rings, with 3x sub-sampling ~32m)
  const NUM_RAYS = 180;
  const NUM_RINGS = 96;

  // Sample 97 real DEM anchor points (Tx + 24 azimuth rays x 4 radial rings) in ONE free batch request
  // alongside real OpenFreeMap OSM building/landcover vector tiles
  const elevAnchors: { lat: number; lng: number }[] = [{ lat: params.txLat, lng: params.txLng }];
  const ringFracs = [0.2, 0.45, 0.7, 0.95];
  for (let r = 0; r < 24; r++) {
    const brg = r * 15;
    for (const rf of ringFracs) {
      elevAnchors.push(destinationPoint(params.txLat, params.txLng, rangeKm * rf, brg));
    }
  }
  const [{ elevations: anchorElevs, source: elevSrc }, clutterMeta] = await Promise.all([
    fetchFreeRealElevations(elevAnchors),
    prefetchRealClutterForArea(params.txLat, params.txLng, north, south, east, west),
  ]);
  const source = `${elevSrc} + ${clutterMeta.source}`;
  const terrainMs = Date.now() - t0;

  const txElev = anchorElevs[0] ?? 10;
  const isAmsl = params.txHeightMode === 'Meters AMSL';
  const txTotalH = isAmsl ? Math.max(txElev + 1, params.txHeightM) : txElev + params.txHeightM;
  const effectiveTxAgl = Math.max(1, txTotalH - txElev);
  const wavelengthM = 300 / Math.max(1, params.frequencyMhz);
  const txPowerDbm = convertPowerToDbm(params.rfPower, params.rfPowerUnit);
  const noiseFloorDbm = computeNoiseFloorDbm(params.bandwidthKhz);
  const snrThresholdDb = 5;

  const polarVal: number[][] = [];
  const polarRxPower: number[][] = [];
  const stepDistM = (rangeKm * 1000) / NUM_RINGS;

  for (let r = 0; r < NUM_RAYS; r++) {
    const brg = (r / NUM_RAYS) * 360;
    const relAz = (brg - params.azimuthDeg + 360) % 360;
    const hGainOffset = interpolatePatternGain(params.pattern.horizontalPattern, relAz);

    // Interpolate 4-ring real DEM elevation anchors for this ray
    const anchorFloat = (brg / 15) % 24;
    const a0 = Math.floor(anchorFloat) % 24;
    const a1 = (a0 + 1) % 24;
    const aFrac = anchorFloat - Math.floor(anchorFloat);
    const rayElevAnchors = ringFracs.map((_, idx) => {
      const e0 = anchorElevs[1 + a0 * 4 + idx] ?? txElev;
      const e1 = anchorElevs[1 + a1 * 4 + idx] ?? txElev;
      return e0 * (1 - aFrac) + e1 * aFrac;
    });

    const sampleRealTerrainAtFrac = (frac: number): number => {
      if (frac <= ringFracs[0]) {
        return txElev + (rayElevAnchors[0] - txElev) * (frac / ringFracs[0]);
      }
      for (let k = 0; k < ringFracs.length - 1; k++) {
        if (frac <= ringFracs[k + 1]) {
          const t = (frac - ringFracs[k]) / (ringFracs[k + 1] - ringFracs[k]);
          return rayElevAnchors[k] + (rayElevAnchors[k + 1] - rayElevAnchors[k]) * t;
        }
      }
      return rayElevAnchors[rayElevAnchors.length - 1];
    };

    // 1. Pre-sample real DEM terrain, real OSM buildings/trees/water & placed obstacles along this ray (index 0 = Tx)
    const raySamples: RaySample[] = [
      {
        distM: 0,
        distKm: 0,
        lat: params.txLat,
        lng: params.txLng,
        terrainM: txElev,
        surfaceHeightM: txElev,
        terminalSurfaceHeightM: txElev,
        buildingM: 0,
        treesM: 0,
        grasslandM: 0,
        bareEarthM: 0,
        builtUpM: 0,
        obstacleM: 0,
        clutterRateDbPerM: 0,
      },
    ];

    for (let ring = 1; ring <= NUM_RINGS; ring++) {
      const prevFrac = (ring - 1) / NUM_RINGS;
      const frac = ring / NUM_RINGS;
      const distKm = frac * rangeKm;
      const distM = distKm * 1000;
      const pt = destinationPoint(params.txLat, params.txLng, distKm, brg);

      const terrainM = Number(sampleRealTerrainAtFrac(frac).toFixed(2));

      // Sub-sample 3 points across [prevFrac..frac] (~32m resolution) so narrow skyscrapers are caught for diffraction,
      // while averaging clutterRate and preserving exact endpoint height (sub === 1.0) for Rx terminal loss.
      let obsHeight = 0;
      let terminalObsH = 0;
      let clutterRateSum = 0;
      let maxBuildingM = 0;
      let maxTreesM = 0;
      let grassM = 0;
      let bareM = 0;

      for (const sub of [0.33, 0.67, 1.0]) {
        const sFrac = prevFrac + (frac - prevFrac) * sub;
        const sDistM = sFrac * rangeKm * 1000;
        const sPt = sub === 1.0 ? pt : destinationPoint(params.txLat, params.txLng, sFrac * rangeKm, brg);
        const lc = sampleRealLandCoverAt(sPt.lat, sPt.lng, params.clutter);

        // Skip Tx mast rooftop/plaza self-obstruction within first 45m
        if (sDistM > 45) {
          if (lc.type === 'building') {
            maxBuildingM = Math.max(maxBuildingM, lc.heightM);
            obsHeight = Math.max(obsHeight, lc.heightM);
            if (sub === 1.0) terminalObsH = Math.max(terminalObsH, lc.heightM);
          } else if (lc.type === 'trees') {
            maxTreesM = Math.max(maxTreesM, lc.heightM);
            obsHeight = Math.max(obsHeight, lc.heightM);
            if (sub === 1.0) terminalObsH = Math.max(terminalObsH, lc.heightM);
          } else if (lc.type === 'grassland') {
            grassM = Math.max(grassM, lc.heightM);
          } else if (lc.type === 'bare_earth') {
            bareM = Math.max(bareM, lc.heightM);
          }
          clutterRateSum += lc.attenDbm;
        }
      }
      let clutterRate = clutterRateSum / 3;

      // Exact point-in-circle check so obstacles shadow downstream via Fresnel diffraction instead of becoming infinite radial walls
      for (const obs of params.placedObstacles) {
        const dObsKm = haversineKm(pt.lat, pt.lng, obs.lat, obs.lng);
        if (dObsKm * 1000 <= obs.radiusM) {
          obsHeight = Math.max(obsHeight, obs.heightM);
          terminalObsH = Math.max(terminalObsH, obs.heightM);
          clutterRate = Math.max(clutterRate, obs.attenDbm);
        }
      }

      raySamples.push({
        distM,
        distKm,
        lat: pt.lat,
        lng: pt.lng,
        terrainM,
        surfaceHeightM: terrainM + obsHeight,
        terminalSurfaceHeightM: terrainM + terminalObsH,
        buildingM: maxBuildingM,
        treesM: maxTreesM,
        grasslandM: grassM,
        bareEarthM: bareM,
        builtUpM: maxBuildingM * 0.35,
        obstacleM: obsHeight,
        clutterRateDbPerM: clutterRate,
      });
    }

    // 2. Evaluate true cumulative ITU-R P.526 diffraction & two-ray clutter loss at each ring
    const rayVals: number[] = [];
    const rayRxVals: number[] = [];

    for (let ring = 1; ring <= NUM_RINGS; ring++) {
      const target = raySamples[ring];
      const rxTotalH = target.terrainM + params.rxHeightM;
      const elevAngleDeg = toDeg(Math.atan2(txTotalH - rxTotalH, target.distM));
      const vGainOffset = Math.max(
        -25,
        interpolatePatternGain(params.pattern.verticalPattern, elevAngleDeg - params.tiltDeg)
      );

      const evalRes = evaluateRayToTarget(
        raySamples,
        ring,
        txTotalH,
        effectiveTxAgl,
        params.rxHeightM,
        params.frequencyMhz,
        wavelengthM,
        params.clutter.buildingsAtten,
        stepDistM
      );

      const effTxGain = params.txGainDbi + hGainOffset + vGainOffset;
      const eirpDbm = txPowerDbm + effTxGain;
      const rxPowerDbm = eirpDbm + params.rxGainDbi - evalRes.totalLossDb;

      let outVal = rxPowerDbm;
      if (params.measuredUnit === 'Path Loss (dB)') {
        outVal = evalRes.totalLossDb;
      } else if (params.measuredUnit === 'Field Strength (dBuV/m)') {
        outVal = computeFieldStrengthDbuvm(eirpDbm, evalRes.totalLossDb, params.frequencyMhz);
      } else if (params.measuredUnit === 'SNR (dB)') {
        outVal = rxPowerDbm - noiseFloorDbm;
      }

      rayVals.push(Number(outVal.toFixed(1)));
      rayRxVals.push(Number(rxPowerDbm.toFixed(1)));
    }

    polarVal.push(rayVals);
    polarRxPower.push(rayRxVals);
  }

  // Rasterize polar field onto a Web Mercator-exact 200x200 grid matching Google Maps GroundOverlay
  const gridCols = 200;
  const gridRows = 200;
  const gridValues: number[] = new Array(gridCols * gridRows).fill(-999);

  const mercNorth = mercatorY(north);
  const mercSouth = mercatorY(south);

  let minVal = Infinity;
  let maxVal = -Infinity;
  let sumVal = 0;
  let validCount = 0;
  let coveredCount = 0;

  const isPathLoss = params.measuredUnit === 'Path Loss (dB)';
  const isFieldStrength = params.measuredUnit === 'Field Strength (dBuV/m)';
  const isSnr = params.measuredUnit === 'SNR (dB)';

  const isVisibleValue = (v: number): boolean => {
    if (isPathLoss) return v >= 0 && v <= 165;
    if (isFieldStrength) return v >= 15;
    if (isSnr) return v >= -20;
    return v >= -142;
  };

  for (let row = 0; row < gridRows; row++) {
    const lat = invMercatorY(mercNorth - ((row + 0.5) / gridRows) * (mercNorth - mercSouth));
    for (let col = 0; col < gridCols; col++) {
      const lng = west + ((col + 0.5) / gridCols) * (east - west);
      const dKm = haversineKm(params.txLat, params.txLng, lat, lng);
      if (dKm > rangeKm) continue;

      const brg = bearingDeg(params.txLat, params.txLng, lat, lng);
      const rayPos = (brg / 360) * NUM_RAYS;
      const r0 = Math.floor(rayPos) % NUM_RAYS;
      const r1 = (r0 + 1) % NUM_RAYS;
      const rFrac = rayPos - Math.floor(rayPos);

      const ringPos = (dKm / rangeKm) * (NUM_RINGS - 1);
      const g0 = Math.max(0, Math.min(NUM_RINGS - 1, Math.floor(ringPos)));
      const g1 = Math.max(0, Math.min(NUM_RINGS - 1, g0 + 1));
      const gFrac = ringPos - Math.floor(ringPos);

      const v00 = polarVal[r0][g0];
      const v10 = polarVal[r1][g0];
      const v01 = polarVal[r0][g1];
      const v11 = polarVal[r1][g1];
      const vTop = v00 * (1 - rFrac) + v10 * rFrac;
      const vBot = v01 * (1 - rFrac) + v11 * rFrac;
      const val = Number((vTop * (1 - gFrac) + vBot * gFrac).toFixed(1));

      const p00 = polarRxPower[r0][g0];
      const p10 = polarRxPower[r1][g0];
      const p01 = polarRxPower[r0][g1];
      const p11 = polarRxPower[r1][g1];
      const pTop = p00 * (1 - rFrac) + p10 * rFrac;
      const pBot = p01 * (1 - rFrac) + p11 * rFrac;
      const rxDbm = pTop * (1 - gFrac) + pBot * gFrac;

      if (rxDbm - noiseFloorDbm >= snrThresholdDb) coveredCount++;

      if (isVisibleValue(val)) {
        gridValues[row * gridCols + col] = val;
        validCount++;
        sumVal += val;
        if (val < minVal) minVal = val;
        if (val > maxVal) maxVal = val;
      }
    }
  }

  const totalCircleCells = Math.PI * (gridCols / 2) ** 2;
  const apiMs = Date.now() - t0;

  return {
    bounds: { north, south, east, west },
    gridCols,
    gridRows,
    gridValues,
    stats: {
      minVal: validCount > 0 ? minVal : isPathLoss ? 65 : isFieldStrength ? 20 : isSnr ? -15 : -140,
      maxVal: validCount > 0 ? maxVal : isPathLoss ? 165 : isFieldStrength ? 110 : isSnr ? 45 : -50,
      avgVal:
        validCount > 0
          ? Number((sumVal / validCount).toFixed(1))
          : isPathLoss
            ? 120
            : isFieldStrength
              ? 55
              : isSnr
                ? 10
                : -105,
      coveragePct: Number(Math.min(100, (coveredCount / Math.max(1, totalCircleCells)) * 100).toFixed(1)),
      noiseFloorDbm,
      snrThresholdDb,
      terrainMs,
      apiMs,
      resolutionM: Math.max(10, Math.round((rangeKm * 2000) / gridCols)),
      elevationSource: source,
    },
  };
}

