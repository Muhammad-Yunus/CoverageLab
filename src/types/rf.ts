export interface LandCoverItem {
  key: string;
  label: string;
  heightM: number;
  attenDbm: number;
}

export interface ObstacleClassItem {
  index: number;
  name: string;
  color: string;
  heightM: number;
  attenDbm: number;
}

export interface ClutterProfileDTO {
  id: number;
  userId: number | null;
  name: string;
  buildingsAtten: number;
  landCover: LandCoverItem[];
  obstacles: ObstacleClassItem[];
  isSystem: boolean;
  createdAt?: string;
}

export interface AntennaPatternDTO {
  id: number;
  name: string;
  gainDbi: number;
  polarisation: string;
  horizontalPattern: number[]; // 36 values (0..350 deg) in dB relative to peak (0 to -30)
  verticalPattern: number[];   // 36 values (0..350 deg) in dB relative to peak
  description: string;
  isSystem: boolean;
}

export interface PlacedObstacleDTO {
  id: number;
  userId: number | null;
  projectId: number | null;
  clutterProfileId: number | null;
  obstacleClassIndex: number;
  name: string;
  color: string;
  lat: number;
  lng: number;
  radiusM: number;
  heightM: number;
  attenDbm: number;
}

export interface RfProjectDTO {
  id: number;
  userId: number | null;
  name: string;
  network: string;
  isTemplate: boolean;
  coordFormat: string;
  txLat: number;
  txLng: number;
  txHeightM: number;
  txHeightMode: string;
  frequencyMhz: number;
  rfPower: number;
  rfPowerUnit: string;
  bandwidthKhz: number;
  antennaPatternId: number | null;
  azimuthDeg: number;
  tiltDeg: number;
  txGainDbi: number;
  showAzimuth: boolean;
  rxLat: number;
  rxLng: number;
  rxHeightM: number;
  rxGainDbi: number;
  measuredUnit: string;
  clutterProfileId: number | null;
  rangeKm: number;
  showRange: boolean;
  colourSchema: string;
  overlayOpacity: number;
  updatedAt?: string;
}

export interface SimulationBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

export interface SimulationStats {
  minVal: number;
  maxVal: number;
  avgVal: number;
  coveragePct: number;
  noiseFloorDbm: number;
  snrThresholdDb: number;
  terrainMs: number;
  apiMs: number;
  resolutionM: number;
  elevationSource: string;
}

export interface SimulationDTO {
  id: number;
  userId: number | null;
  projectId: number | null;
  layerLabel: string;
  siteName: string;
  networkName: string;
  txLat: number;
  txLng: number;
  rangeKm: number;
  frequencyMhz: number;
  colourSchema: string;
  measuredUnit: string;
  bounds: SimulationBounds;
  gridCols: number;
  gridRows: number;
  gridValues: number[]; // flat array [row * cols + col], NaN/null represented as -999
  stats: SimulationStats;
  paramsSnapshot: Record<string, unknown>;
  createdAt: string;
}

export interface PathProfileSample {
  distanceKm: number;
  lat: number;
  lng: number;
  terrainM: number;
  buildingM: number;
  treesM: number;
  grasslandM: number;
  bareEarthM: number;
  builtUpM: number;
  obstacleM: number;
  losM: number;
  fresnelUpperM: number;
  fresnelLowerM: number;
  rxPowerDbm: number;
}

export interface PathProfileResult {
  distanceKm: number;
  bearingDeg: number;
  downtiltDeg: number;
  frequencyMhz: number;
  modelName: string;
  pathLossDb: number;
  fsplDb: number;
  diffractionLossDb: number;
  clutterLossDb: number;
  receivedPowerDbm: number;
  fieldStrengthDbuvm: number;
  noiseFloorDbm: number;
  snrDb: number;
  txGainDbd: number;
  txGainDbi: number;
  erpW: number;
  erpDbm: number;
  eirpW: number;
  eirpDbm: number;
  rxGainDbd: number;
  rxGainDbi: number;
  txElevationM: number;
  rxElevationM: number;
  txHeightAgl: number;
  rxHeightAgl: number;
  txLat: number;
  txLng: number;
  rxLat: number;
  rxLng: number;
  elevationSource: string;
  samples: PathProfileSample[];
}

export interface MultipointLinkDTO {
  id: number;
  userId: number | null;
  projectId: number | null;
  txLat: number;
  txLng: number;
  txHeightM: number;
  rxLat: number;
  rxLng: number;
  rxHeightM: number;
  distanceKm: number;
  bearingDeg: number;
  pathLossDb: number;
  rxPowerDbm: number;
  snrDb: number;
  createdAt?: string;
}

export interface MeshNodeDTO {
  id: number;
  userId: number | null;
  projectId: number | null;
  label: string;
  nodeType: string;
  lat: number;
  lng: number;
  heightM: number;
  frequencyMhz: number;
  rfPowerDbm: number;
  bandwidthMhz: number;
  gainDbi: number;
  azimuthDeg: number;
  tiltDeg: number;
  sensitivityDbm: number;
  noiseFloorDbm: number;
}

export interface UserDTO {
  id: number;
  email: string;
  name: string;
  role: string;
}
