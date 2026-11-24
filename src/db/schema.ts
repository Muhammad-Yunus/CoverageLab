import {
  pgTable,
  serial,
  text,
  integer,
  doublePrecision,
  boolean,
  timestamp,
  jsonb,
} from 'drizzle-orm/pg-core';
import type {
  LandCoverItem,
  ObstacleClassItem,
  SimulationBounds,
  SimulationStats,
} from '../types/rf.ts';

export const users = pgTable('users', {
  id: serial('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  role: text('role').notNull().default('Operator'),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const sessions = pgTable('sessions', {
  id: serial('id').primaryKey(),
  userId: integer('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const antennaPatterns = pgTable('antenna_patterns', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  gainDbi: doublePrecision('gain_dbi').notNull(),
  polarisation: text('polarisation').notNull().default('Vertical'),
  horizontalPattern: jsonb('horizontal_pattern').$type<number[]>().notNull(),
  verticalPattern: jsonb('vertical_pattern').$type<number[]>().notNull(),
  description: text('description').notNull().default(''),
  isSystem: boolean('is_system').notNull().default(true),
});

export const clutterProfiles = pgTable('clutter_profiles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  buildingsAtten: doublePrecision('buildings_atten').notNull().default(0.1),
  landCover: jsonb('land_cover').$type<LandCoverItem[]>().notNull(),
  obstacles: jsonb('obstacles').$type<ObstacleClassItem[]>().notNull(),
  isSystem: boolean('is_system').notNull().default(false),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const rfProjects = pgTable('rf_projects', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  name: text('name').notNull(),
  network: text('network').notNull(),
  isTemplate: boolean('is_template').notNull().default(false),
  coordFormat: text('coord_format').notNull().default('Decimal Degrees'),
  txLat: doublePrecision('tx_lat').notNull(),
  txLng: doublePrecision('tx_lng').notNull(),
  txHeightM: doublePrecision('tx_height_m').notNull().default(5),
  txHeightMode: text('tx_height_mode').notNull().default('Meters AGL'),
  frequencyMhz: doublePrecision('frequency_mhz').notNull().default(923),
  rfPower: doublePrecision('rf_power').notNull().default(27),
  rfPowerUnit: text('rf_power_unit').notNull().default('dBm'),
  bandwidthKhz: doublePrecision('bandwidth_khz').notNull().default(100),
  antennaPatternId: integer('antenna_pattern_id').references(() => antennaPatterns.id),
  azimuthDeg: doublePrecision('azimuth_deg').notNull().default(0),
  tiltDeg: doublePrecision('tilt_deg').notNull().default(0),
  txGainDbi: doublePrecision('tx_gain_dbi').notNull().default(2.15),
  showAzimuth: boolean('show_azimuth').notNull().default(false),
  rxLat: doublePrecision('rx_lat').notNull().default(-6.166336),
  rxLng: doublePrecision('rx_lng').notNull().default(106.816526),
  rxHeightM: doublePrecision('rx_height_m').notNull().default(15),
  rxGainDbi: doublePrecision('rx_gain_dbi').notNull().default(17),
  measuredUnit: text('measured_unit').notNull().default('Received Power (dBm)'),
  clutterProfileId: integer('clutter_profile_id').references(() => clutterProfiles.id),
  rangeKm: doublePrecision('range_km').notNull().default(9.3),
  showRange: boolean('show_range').notNull().default(false),
  colourSchema: text('colour_schema').notNull().default('LORA'),
  overlayOpacity: doublePrecision('overlay_opacity').notNull().default(0.65),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const placedObstacles = pgTable('placed_obstacles', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => rfProjects.id, { onDelete: 'cascade' }),
  clutterProfileId: integer('clutter_profile_id').references(() => clutterProfiles.id),
  obstacleClassIndex: integer('obstacle_class_index').notNull(),
  name: text('name').notNull(),
  color: text('color').notNull(),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  radiusM: doublePrecision('radius_m').notNull().default(120),
  heightM: doublePrecision('height_m').notNull(),
  attenDbm: doublePrecision('atten_dbm').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const simulations = pgTable('simulations', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => rfProjects.id, { onDelete: 'set null' }),
  layerLabel: text('layer_label').notNull(),
  siteName: text('site_name').notNull(),
  networkName: text('network_name').notNull(),
  txLat: doublePrecision('tx_lat').notNull(),
  txLng: doublePrecision('tx_lng').notNull(),
  rangeKm: doublePrecision('range_km').notNull(),
  frequencyMhz: doublePrecision('frequency_mhz').notNull(),
  colourSchema: text('colour_schema').notNull(),
  measuredUnit: text('measured_unit').notNull(),
  bounds: jsonb('bounds').$type<SimulationBounds>().notNull(),
  gridCols: integer('grid_cols').notNull(),
  gridRows: integer('grid_rows').notNull(),
  gridValues: jsonb('grid_values').$type<number[]>().notNull(),
  stats: jsonb('stats').$type<SimulationStats>().notNull(),
  paramsSnapshot: jsonb('params_snapshot').$type<Record<string, unknown>>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const multipointLinks = pgTable('multipoint_links', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => rfProjects.id, { onDelete: 'cascade' }),
  txLat: doublePrecision('tx_lat').notNull(),
  txLng: doublePrecision('tx_lng').notNull(),
  txHeightM: doublePrecision('tx_height_m').notNull(),
  rxLat: doublePrecision('rx_lat').notNull(),
  rxLng: doublePrecision('rx_lng').notNull(),
  rxHeightM: doublePrecision('rx_height_m').notNull(),
  distanceKm: doublePrecision('distance_km').notNull(),
  bearingDeg: doublePrecision('bearing_deg').notNull(),
  pathLossDb: doublePrecision('path_loss_db').notNull(),
  rxPowerDbm: doublePrecision('rx_power_db').notNull(),
  snrDb: doublePrecision('snr_db').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export const meshNodes = pgTable('mesh_nodes', {
  id: serial('id').primaryKey(),
  userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
  projectId: integer('project_id').references(() => rfProjects.id, { onDelete: 'cascade' }),
  label: text('label').notNull(),
  nodeType: text('node_type').notNull().default('MANET'),
  lat: doublePrecision('lat').notNull(),
  lng: doublePrecision('lng').notNull(),
  heightM: doublePrecision('height_m').notNull().default(5),
  frequencyMhz: doublePrecision('frequency_mhz').notNull().default(923),
  rfPowerDbm: doublePrecision('rf_power_dbm').notNull().default(27),
  bandwidthMhz: doublePrecision('bandwidth_mhz').notNull().default(0.1),
  gainDbi: doublePrecision('gain_dbi').notNull().default(2.15),
  azimuthDeg: doublePrecision('azimuth_deg').notNull().default(0),
  tiltDeg: doublePrecision('tilt_deg').notNull().default(0),
  sensitivityDbm: doublePrecision('sensitivity_dbm').notNull().default(-109),
  noiseFloorDbm: doublePrecision('noise_floor_dbm').notNull().default(-124),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
