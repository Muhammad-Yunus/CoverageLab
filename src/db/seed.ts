import { db } from './index.ts';
import {
  antennaPatterns,
  clutterProfiles,
  rfProjects,
  meshNodes,
} from './schema.ts';
import type { LandCoverItem, ObstacleClassItem } from '../types/rf.ts';
import { count } from 'drizzle-orm';

export const DEFAULT_LAND_COVER: LandCoverItem[] = [
  { key: 'water', label: 'Water', heightM: 1, attenDbm: 0.0 },
  { key: 'trees', label: 'Trees', heightM: 6, attenDbm: 0.04 },
  { key: 'grassland', label: 'Grassland', heightM: 1, attenDbm: 0.0 },
  { key: 'marsh', label: 'Marsh / Swamp', heightM: 1, attenDbm: 0.01 },
  { key: 'crops', label: 'Crops / Farmland', heightM: 1, attenDbm: 0.01 },
  { key: 'light_foliage', label: 'Light Foliage', heightM: 3, attenDbm: 0.02 },
  { key: 'urban', label: 'Developed / Urban', heightM: 1, attenDbm: 0.01 },
  { key: 'bare_ground', label: 'Bare Ground', heightM: 1, attenDbm: 0.0 },
  { key: 'snow_ice', label: 'Snow / Ice', heightM: 1, attenDbm: 0.0 },
];

export const DEFAULT_OBSTACLES: ObstacleClassItem[] = [
  { index: 1, name: 'Obstacle 1', color: '#f97316', heightM: 6, attenDbm: 0.1 },
  { index: 2, name: 'Obstacle 2', color: '#f43f5e', heightM: 8, attenDbm: 0.2 },
  { index: 3, name: 'Obstacle 3', color: '#84cc16', heightM: 3, attenDbm: 0.25 },
  { index: 4, name: 'Obstacle 4', color: '#22d3ee', heightM: 4, attenDbm: 0.3 },
  { index: 5, name: 'Obstacle 5', color: '#14b8a6', heightM: 5, attenDbm: 0.4 },
  { index: 6, name: 'Obstacle 6', color: '#16a34a', heightM: 6, attenDbm: 0.5 },
  { index: 7, name: 'Obstacle 7', color: '#a78bfa', heightM: 7, attenDbm: 0.6 },
  { index: 8, name: 'Obstacle 8', color: '#4f46e5', heightM: 8, attenDbm: 0.7 },
  { index: 9, name: 'Obstacle 9', color: '#0369a1', heightM: 3, attenDbm: 0.8 },
];

function makeDipoleVertical(): number[] {
  // 36 samples every 10 degrees; 0 deg is horizon right, 90 is zenith, 180 is horizon left, 270 is nadir
  const arr: number[] = [];
  for (let i = 0; i < 36; i++) {
    const rad = (i * 10 * Math.PI) / 180;
    const mag = Math.abs(Math.cos(rad));
    const db = mag < 0.05 ? -20 : Math.max(-20, 10 * Math.log10(Math.pow(mag, 1.6)));
    arr.push(Number(db.toFixed(2)));
  }
  return arr;
}

function makeDirectionalHoriz(beamwidthDeg: number, frontToBackDb: number): number[] {
  const arr: number[] = [];
  for (let i = 0; i < 36; i++) {
    const angle = i * 10;
    const diff = angle > 180 ? 360 - angle : angle;
    const norm = diff / (beamwidthDeg / 2);
    const db = Math.max(-frontToBackDb, -3 * Math.pow(norm, 1.8));
    arr.push(Number(db.toFixed(2)));
  }
  return arr;
}

export async function ensureDatabaseSeeded(): Promise<void> {
  const [{ value: patternCount }] = await db
    .select({ value: count() })
    .from(antennaPatterns);

  let defaultPatternId: number | null = null;
  if (patternCount === 0) {
    const insertedPatterns = await db
      .insert(antennaPatterns)
      .values([
        {
          name: 'OEM Half-Wave Dipole',
          gainDbi: 2.15,
          polarisation: 'Vertical',
          horizontalPattern: new Array(36).fill(0),
          verticalPattern: makeDipoleVertical(),
          description: 'Standard omnidirectional half-wave dipole reference antenna (2.15 dBi).',
          isSystem: true,
        },
        {
          name: 'Isotropic Radiator',
          gainDbi: 0.0,
          polarisation: 'Vertical',
          horizontalPattern: new Array(36).fill(0),
          verticalPattern: new Array(36).fill(0),
          description: 'Theoretical 0 dBi uniform spherical radiator.',
          isSystem: true,
        },
        {
          name: 'Collinear Fibreglass Omni 6 dBi',
          gainDbi: 6.0,
          polarisation: 'Vertical',
          horizontalPattern: new Array(36).fill(0),
          verticalPattern: makeDipoleVertical().map((v) => Math.max(-20, v * 1.35)),
          description: 'High-gain LoRaWAN / ISM band base station collinear omni antenna.',
          isSystem: true,
        },
        {
          name: 'Sector 120° Panel 15 dBi',
          gainDbi: 15.0,
          polarisation: 'Vertical',
          horizontalPattern: makeDirectionalHoriz(120, 22),
          verticalPattern: makeDirectionalHoriz(22, 20),
          description: '120-degree cellular / WISP sector antenna with high front-to-back ratio.',
          isSystem: true,
        },
        {
          name: 'Yagi Directional 9 dBi',
          gainDbi: 9.0,
          polarisation: 'Horizontal',
          horizontalPattern: makeDirectionalHoriz(58, 18),
          verticalPattern: makeDirectionalHoriz(48, 18),
          description: 'Directional Yagi-Uda array for point-to-point backhaul or telemetry.',
          isSystem: true,
        },
        {
          name: 'Parabolic Dish 24 dBi',
          gainDbi: 24.0,
          polarisation: 'Dual',
          horizontalPattern: makeDirectionalHoriz(14, 28),
          verticalPattern: makeDirectionalHoriz(14, 28),
          description: 'High-gain narrow-beam parabolic dish for microwave links.',
          isSystem: true,
        },
      ])
      .returning();
    defaultPatternId = insertedPatterns[0]?.id ?? null;
  } else {
    const existing = await db.select().from(antennaPatterns).limit(1);
    defaultPatternId = existing[0]?.id ?? null;
  }

  const [{ value: clutterCount }] = await db
    .select({ value: count() })
    .from(clutterProfiles);

  let temperateId: number | null = null;
  if (clutterCount === 0) {
    const scaleCover = (urbanH: number, urbanAtten: number, treeH: number, treeAtten: number) =>
      DEFAULT_LAND_COVER.map((item) => {
        if (item.key === 'urban') return { ...item, heightM: urbanH, attenDbm: urbanAtten };
        if (item.key === 'trees') return { ...item, heightM: treeH, attenDbm: treeAtten };
        return item;
      });

    const insertedClutter = await db
      .insert(clutterProfiles)
      .values([
        {
          name: 'Minimal',
          buildingsAtten: 0.1,
          landCover: DEFAULT_LAND_COVER,
          obstacles: DEFAULT_OBSTACLES,
          isSystem: true,
        },
        {
          name: 'Desert',
          buildingsAtten: 0.05,
          landCover: scaleCover(4, 0.02, 2, 0.01),
          obstacles: DEFAULT_OBSTACLES,
          isSystem: true,
        },
        {
          name: 'Temperate',
          buildingsAtten: 0.1,
          landCover: scaleCover(8, 0.04, 7, 0.05),
          obstacles: DEFAULT_OBSTACLES,
          isSystem: true,
        },
        {
          name: 'Tropical',
          buildingsAtten: 0.15,
          landCover: scaleCover(10, 0.06, 14, 0.09),
          obstacles: DEFAULT_OBSTACLES,
          isSystem: true,
        },
        {
          name: 'Urban',
          buildingsAtten: 0.35,
          landCover: scaleCover(18, 0.14, 6, 0.04),
          obstacles: DEFAULT_OBSTACLES,
          isSystem: true,
        },
        {
          name: 'Suburban',
          buildingsAtten: 0.2,
          landCover: scaleCover(9, 0.07, 8, 0.05),
          obstacles: DEFAULT_OBSTACLES,
          isSystem: true,
        },
        {
          name: 'Forest',
          buildingsAtten: 0.1,
          landCover: scaleCover(5, 0.02, 18, 0.14),
          obstacles: DEFAULT_OBSTACLES,
          isSystem: true,
        },
        {
          name: 'City',
          buildingsAtten: 0.5,
          landCover: scaleCover(28, 0.22, 6, 0.04),
          obstacles: DEFAULT_OBSTACLES,
          isSystem: true,
        },
        {
          name: 'SATCOM',
          buildingsAtten: 0.05,
          landCover: scaleCover(3, 0.01, 4, 0.01),
          obstacles: DEFAULT_OBSTACLES,
          isSystem: true,
        },
      ])
      .returning();
    temperateId = insertedClutter.find((c) => c.name === 'Temperate')?.id ?? insertedClutter[0]?.id ?? null;
  } else {
    const existing = await db.select().from(clutterProfiles);
    temperateId = existing.find((c) => c.name === 'Temperate')?.id ?? existing[0]?.id ?? null;
  }

  const [{ value: projectCount }] = await db
    .select({ value: count() })
    .from(rfProjects);

  if (projectCount === 0) {
    const [defaultProject] = await db
      .insert(rfProjects)
      .values([
        {
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
          antennaPatternId: defaultPatternId,
          azimuthDeg: 0,
          tiltDeg: 0,
          txGainDbi: 2.15,
          showAzimuth: false,
          rxLat: -6.166336,
          rxLng: 106.816526,
          rxHeightM: 15,
          rxGainDbi: 17,
          measuredUnit: 'Received Power (dBm)',
          clutterProfileId: temperateId,
          rangeKm: 9.3,
          showRange: false,
          colourSchema: 'LORA',
          overlayOpacity: 0.65,
        },
        {
          name: 'Jakarta 5G Macro Sector',
          network: 'Urban 3.5GHz',
          isTemplate: true,
          coordFormat: 'Decimal Degrees',
          txLat: -6.1944,
          txLng: 106.8229,
          txHeightM: 32,
          txHeightMode: 'Meters AGL',
          frequencyMhz: 3500,
          rfPower: 43,
          rfPowerUnit: 'dBm',
          bandwidthKhz: 20000,
          antennaPatternId: defaultPatternId,
          azimuthDeg: 45,
          tiltDeg: 3,
          txGainDbi: 15,
          showAzimuth: true,
          rxLat: -6.1812,
          rxLng: 106.8341,
          rxHeightM: 1.5,
          rxGainDbi: 0,
          measuredUnit: 'Received Power (dBm)',
          clutterProfileId: temperateId,
          rangeKm: 5.0,
          showRange: true,
          colourSchema: 'LTE',
          overlayOpacity: 0.7,
        },
      ])
      .returning();

    if (defaultProject) {
      await db.insert(meshNodes).values([
        {
          projectId: defaultProject.id,
          label: '923 MHz - Mesh Node',
          nodeType: 'MANET',
          lat: -6.1704,
          lng: 106.8321,
          heightM: 5,
          frequencyMhz: 923,
          rfPowerDbm: 27,
          bandwidthMhz: 0.1,
          gainDbi: 2.15,
          azimuthDeg: 0,
          tiltDeg: 0,
          sensitivityDbm: -109,
          noiseFloorDbm: -124,
        },
        {
          projectId: defaultProject.id,
          label: '923 MHz - Mesh Node',
          nodeType: 'MANET',
          lat: -6.1669,
          lng: 106.8172,
          heightM: 5,
          frequencyMhz: 923,
          rfPowerDbm: 27,
          bandwidthMhz: 0.1,
          gainDbi: 2.15,
          azimuthDeg: 0,
          tiltDeg: 0,
          sensitivityDbm: -109,
          noiseFloorDbm: -124,
        },
      ]);
    }
  }
}
