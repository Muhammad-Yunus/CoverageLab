import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer as createViteServer } from 'vite';
import { and, desc, eq, isNull, or } from 'drizzle-orm';
import { db } from './src/db/index.ts';
import {
  antennaPatterns,
  clutterProfiles,
  meshNodes,
  multipointLinks,
  placedObstacles,
  rfProjects,
  sessions,
  simulations,
  users,
} from './src/db/schema.ts';
import { ensureDatabaseSeeded } from './src/db/seed.ts';
import {
  bearingDeg,
  computeCoverageGrid,
  computePathProfile,
  haversineKm,
} from './server/rfEngine.ts';
import type {
  AntennaPatternDTO,
  ClutterProfileDTO,
  PlacedObstacleDTO,
  UserDTO,
} from './src/types/rf.ts';

interface AuthenticatedRequest extends Request {
  user?: UserDTO;
  sessionToken?: string;
}

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}

function verifyPassword(password: string, storedHash: string): boolean {
  const parts = storedHash.split(':');
  if (parts.length !== 2) return false;
  const [salt, originalHex] = parts;
  const derivedBuf = crypto.scryptSync(password, salt, 64);
  const originalBuf = Buffer.from(originalHex, 'hex');
  if (derivedBuf.length !== originalBuf.length) return false;
  return crypto.timingSafeEqual(derivedBuf, originalBuf);
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function getCookieValue(cookieHeader: string | undefined, name: string): string | null {
  if (!cookieHeader) return null;
  const parts = cookieHeader.split(';');
  for (const part of parts) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(idx + 1).trim());
    }
  }
  return null;
}

function setSessionCookie(req: Request, res: Response, token: string) {
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '').includes('https');
  const flags = [
    `covlab_sid=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'Max-Age=604800',
    isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', flags.join('; '));
}

function clearSessionCookie(req: Request, res: Response) {
  const isHttps =
    req.secure ||
    String(req.headers['x-forwarded-proto'] || '').includes('https');
  const flags = [
    'covlab_sid=',
    'Path=/',
    'HttpOnly',
    'Max-Age=0',
    isHttps ? 'SameSite=None; Secure' : 'SameSite=Lax',
  ];
  res.setHeader('Set-Cookie', flags.join('; '));
}

async function resolveAuth(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken =
      authHeader && authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
    const cookieToken = getCookieValue(req.headers.cookie, 'covlab_sid');
    const token = bearerToken || cookieToken;

    if (token) {
      const tokenHash = hashToken(token);
      const rows = await db
        .select({
          userId: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
          expiresAt: sessions.expiresAt,
        })
        .from(sessions)
        .innerJoin(users, eq(sessions.userId, users.id))
        .where(eq(sessions.tokenHash, tokenHash))
        .limit(1);

      const match = rows[0];
      if (match && match.expiresAt.getTime() > Date.now()) {
        req.user = {
          id: match.userId,
          email: match.email,
          name: match.name,
          role: match.role,
        };
        req.sessionToken = token;
      }
    }
  } catch (err) {
    console.error('Auth resolution error:', err);
  }
  next();
}

function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required. Please sign in to save or modify workspace data.' });
    return;
  }
  next();
}

function formatLayerTimestamp(): string {
  const now = new Date();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  const hh = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  const ss = String(now.getSeconds()).padStart(2, '0');
  return `${mm}${dd}${hh}${min}${ss}`;
}

async function startServer() {
  await ensureDatabaseSeeded();

  const app = express();
  app.use(express.json({ limit: '5mb' }));
  app.use(resolveAuth);

  // Health check
  app.get('/api/health', async (_req, res) => {
    try {
      await db.select().from(antennaPatterns).limit(1);
      res.json({ ok: true, database: 'postgresql', engine: 'CoverageLab RF 3.38.0' });
    } catch (err) {
      res.status(500).json({ ok: false, error: err instanceof Error ? err.message : 'DB Error' });
    }
  });

  // Auth routes
  app.post('/api/auth/register', async (req: Request, res: Response) => {
    try {
      const { email, name, password } = req.body ?? {};
      if (typeof email !== 'string' || !email.includes('@')) {
        res.status(400).json({ error: 'Valid email is required.' });
        return;
      }
      if (typeof name !== 'string' || name.trim().length < 2) {
        res.status(400).json({ error: 'Name must be at least 2 characters.' });
        return;
      }
      if (typeof password !== 'string' || password.length < 6) {
        res.status(400).json({ error: 'Password must be at least 6 characters.' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const existing = await db
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (existing.length > 0) {
        res.status(409).json({ error: 'An account with this email already exists.' });
        return;
      }

      const passwordHash = hashPassword(password);
      const [created] = await db
        .insert(users)
        .values({
          email: normalizedEmail,
          name: name.trim(),
          role: 'Operator',
          passwordHash,
        })
        .returning({
          id: users.id,
          email: users.email,
          name: users.name,
          role: users.role,
        });

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(sessions).values({
        userId: created.id,
        tokenHash: hashToken(token),
        expiresAt,
      });

      setSessionCookie(req, res, token);
      res.status(201).json({ token, user: created });
    } catch (err) {
      console.error('Register error:', err);
      res.status(500).json({ error: 'Registration failed.' });
    }
  });

  app.post('/api/auth/login', async (req: Request, res: Response) => {
    try {
      const { email, password } = req.body ?? {};
      if (typeof email !== 'string' || typeof password !== 'string') {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const normalizedEmail = email.trim().toLowerCase();
      const [userRow] = await db
        .select()
        .from(users)
        .where(eq(users.email, normalizedEmail))
        .limit(1);

      if (!userRow || !verifyPassword(password, userRow.passwordHash)) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await db.insert(sessions).values({
        userId: userRow.id,
        tokenHash: hashToken(token),
        expiresAt,
      });

      setSessionCookie(req, res, token);
      res.json({
        token,
        user: {
          id: userRow.id,
          email: userRow.email,
          name: userRow.name,
          role: userRow.role,
        },
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ error: 'Login failed.' });
    }
  });

  app.post('/api/auth/logout', async (req: AuthenticatedRequest, res: Response) => {
    if (req.sessionToken) {
      await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(req.sessionToken)));
    }
    clearSessionCookie(req, res);
    res.json({ ok: true });
  });

  app.get('/api/auth/me', (req: AuthenticatedRequest, res: Response) => {
    if (!req.user) {
      res.status(401).json({ error: 'Not authenticated' });
      return;
    }
    res.json({ user: req.user });
  });

  // Bootstrap endpoint: loads all reference & workspace data from PostgreSQL via Drizzle
  app.get('/api/bootstrap', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const userId = req.user?.id ?? null;

      const patterns = await db.select().from(antennaPatterns).orderBy(antennaPatterns.id);

      const clutters = await db
        .select()
        .from(clutterProfiles)
        .where(
          userId !== null
            ? or(isNull(clutterProfiles.userId), eq(clutterProfiles.userId, userId))
            : isNull(clutterProfiles.userId)
        )
        .orderBy(clutterProfiles.id);

      const projects = await db
        .select()
        .from(rfProjects)
        .where(
          userId !== null
            ? or(isNull(rfProjects.userId), eq(rfProjects.userId, userId))
            : isNull(rfProjects.userId)
        )
        .orderBy(desc(rfProjects.updatedAt));

      const simRows = await db
        .select()
        .from(simulations)
        .where(
          userId !== null
            ? or(isNull(simulations.userId), eq(simulations.userId, userId))
            : isNull(simulations.userId)
        )
        .orderBy(desc(simulations.createdAt))
        .limit(20);

      const obstacleRows = await db
        .select()
        .from(placedObstacles)
        .where(
          userId !== null
            ? or(isNull(placedObstacles.userId), eq(placedObstacles.userId, userId))
            : isNull(placedObstacles.userId)
        )
        .orderBy(placedObstacles.id);

      const linkRows = await db
        .select()
        .from(multipointLinks)
        .where(
          userId !== null
            ? or(isNull(multipointLinks.userId), eq(multipointLinks.userId, userId))
            : isNull(multipointLinks.userId)
        )
        .orderBy(desc(multipointLinks.createdAt))
        .limit(50);

      const nodeRows = await db
        .select()
        .from(meshNodes)
        .where(
          userId !== null
            ? or(isNull(meshNodes.userId), eq(meshNodes.userId, userId))
            : isNull(meshNodes.userId)
        )
        .orderBy(meshNodes.id);

      res.json({
        user: req.user ?? null,
        mapsApiKey: process.env.GOOGLE_MAPS_API_KEY || '',
        antennaPatterns: patterns,
        clutterProfiles: clutters,
        projects,
        simulations: simRows,
        placedObstacles: obstacleRows,
        multipointLinks: linkRows,
        meshNodes: nodeRows,
      });
    } catch (err) {
      console.error('Bootstrap error:', err);
      res.status(500).json({ error: 'Failed to load workspace data from PostgreSQL.' });
    }
  });

  // Projects / Templates CRUD
  app.post('/api/projects', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const b = req.body ?? {};
      const [inserted] = await db
        .insert(rfProjects)
        .values({
          userId: req.user!.id,
          name: String(b.name || 'Untitled Site'),
          network: String(b.network || 'Private RF'),
          isTemplate: Boolean(b.isTemplate ?? true),
          coordFormat: String(b.coordFormat || 'Decimal Degrees'),
          txLat: Number(b.txLat ?? -6.175637),
          txLng: Number(b.txLng ?? 106.826727),
          txHeightM: Number(b.txHeightM ?? 5),
          txHeightMode: String(b.txHeightMode || 'Meters AGL'),
          frequencyMhz: Number(b.frequencyMhz ?? 923),
          rfPower: Number(b.rfPower ?? 27),
          rfPowerUnit: String(b.rfPowerUnit || 'dBm'),
          bandwidthKhz: Number(b.bandwidthKhz ?? 100),
          antennaPatternId: b.antennaPatternId ? Number(b.antennaPatternId) : null,
          azimuthDeg: Number(b.azimuthDeg ?? 0),
          tiltDeg: Number(b.tiltDeg ?? 0),
          txGainDbi: Number(b.txGainDbi ?? 2.15),
          showAzimuth: Boolean(b.showAzimuth ?? false),
          rxLat: Number(b.rxLat ?? -6.166336),
          rxLng: Number(b.rxLng ?? 106.816526),
          rxHeightM: Number(b.rxHeightM ?? 15),
          rxGainDbi: Number(b.rxGainDbi ?? 17),
          measuredUnit: String(b.measuredUnit || 'Received Power (dBm)'),
          clutterProfileId: b.clutterProfileId ? Number(b.clutterProfileId) : null,
          rangeKm: Number(b.rangeKm ?? 9.3),
          showRange: Boolean(b.showRange ?? false),
          colourSchema: String(b.colourSchema || 'LORA'),
          overlayOpacity: Number(b.overlayOpacity ?? 0.65),
        })
        .returning();
      res.status(201).json(inserted);
    } catch (err) {
      console.error('Create project error:', err);
      res.status(500).json({ error: 'Failed to save project.' });
    }
  });

  app.put('/api/projects/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'Invalid project ID.' });
        return;
      }
      const [existing] = await db.select().from(rfProjects).where(eq(rfProjects.id, id)).limit(1);
      if (!existing) {
        res.status(404).json({ error: 'Project not found.' });
        return;
      }
      if (existing.userId !== null && existing.userId !== req.user!.id) {
        res.status(403).json({ error: 'Forbidden.' });
        return;
      }
      // If editing a system template, clone for this user instead of mutating system preset
      const b = req.body ?? {};
      if (existing.userId === null) {
        const [cloned] = await db
          .insert(rfProjects)
          .values({
            userId: req.user!.id,
            name: String(b.name ?? existing.name),
            network: String(b.network ?? existing.network),
            isTemplate: Boolean(b.isTemplate ?? true),
            coordFormat: String(b.coordFormat ?? existing.coordFormat),
            txLat: Number(b.txLat ?? existing.txLat),
            txLng: Number(b.txLng ?? existing.txLng),
            txHeightM: Number(b.txHeightM ?? existing.txHeightM),
            txHeightMode: String(b.txHeightMode ?? existing.txHeightMode),
            frequencyMhz: Number(b.frequencyMhz ?? existing.frequencyMhz),
            rfPower: Number(b.rfPower ?? existing.rfPower),
            rfPowerUnit: String(b.rfPowerUnit ?? existing.rfPowerUnit),
            bandwidthKhz: Number(b.bandwidthKhz ?? existing.bandwidthKhz),
            antennaPatternId: b.antennaPatternId !== undefined ? Number(b.antennaPatternId) : existing.antennaPatternId,
            azimuthDeg: Number(b.azimuthDeg ?? existing.azimuthDeg),
            tiltDeg: Number(b.tiltDeg ?? existing.tiltDeg),
            txGainDbi: Number(b.txGainDbi ?? existing.txGainDbi),
            showAzimuth: Boolean(b.showAzimuth ?? existing.showAzimuth),
            rxLat: Number(b.rxLat ?? existing.rxLat),
            rxLng: Number(b.rxLng ?? existing.rxLng),
            rxHeightM: Number(b.rxHeightM ?? existing.rxHeightM),
            rxGainDbi: Number(b.rxGainDbi ?? existing.rxGainDbi),
            measuredUnit: String(b.measuredUnit ?? existing.measuredUnit),
            clutterProfileId: b.clutterProfileId !== undefined ? Number(b.clutterProfileId) : existing.clutterProfileId,
            rangeKm: Number(b.rangeKm ?? existing.rangeKm),
            showRange: Boolean(b.showRange ?? existing.showRange),
            colourSchema: String(b.colourSchema ?? existing.colourSchema),
            overlayOpacity: Number(b.overlayOpacity ?? existing.overlayOpacity),
          })
          .returning();
        res.json(cloned);
        return;
      }

      const [updated] = await db
        .update(rfProjects)
        .set({
          name: String(b.name ?? existing.name),
          network: String(b.network ?? existing.network),
          isTemplate: Boolean(b.isTemplate ?? existing.isTemplate),
          coordFormat: String(b.coordFormat ?? existing.coordFormat),
          txLat: Number(b.txLat ?? existing.txLat),
          txLng: Number(b.txLng ?? existing.txLng),
          txHeightM: Number(b.txHeightM ?? existing.txHeightM),
          txHeightMode: String(b.txHeightMode ?? existing.txHeightMode),
          frequencyMhz: Number(b.frequencyMhz ?? existing.frequencyMhz),
          rfPower: Number(b.rfPower ?? existing.rfPower),
          rfPowerUnit: String(b.rfPowerUnit ?? existing.rfPowerUnit),
          bandwidthKhz: Number(b.bandwidthKhz ?? existing.bandwidthKhz),
          antennaPatternId: b.antennaPatternId !== undefined ? Number(b.antennaPatternId) : existing.antennaPatternId,
          azimuthDeg: Number(b.azimuthDeg ?? existing.azimuthDeg),
          tiltDeg: Number(b.tiltDeg ?? existing.tiltDeg),
          txGainDbi: Number(b.txGainDbi ?? existing.txGainDbi),
          showAzimuth: Boolean(b.showAzimuth ?? existing.showAzimuth),
          rxLat: Number(b.rxLat ?? existing.rxLat),
          rxLng: Number(b.rxLng ?? existing.rxLng),
          rxHeightM: Number(b.rxHeightM ?? existing.rxHeightM),
          rxGainDbi: Number(b.rxGainDbi ?? existing.rxGainDbi),
          measuredUnit: String(b.measuredUnit ?? existing.measuredUnit),
          clutterProfileId: b.clutterProfileId !== undefined ? Number(b.clutterProfileId) : existing.clutterProfileId,
          rangeKm: Number(b.rangeKm ?? existing.rangeKm),
          showRange: Boolean(b.showRange ?? existing.showRange),
          colourSchema: String(b.colourSchema ?? existing.colourSchema),
          overlayOpacity: Number(b.overlayOpacity ?? existing.overlayOpacity),
          updatedAt: new Date(),
        })
        .where(and(eq(rfProjects.id, id), eq(rfProjects.userId, req.user!.id)))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error('Update project error:', err);
      res.status(500).json({ error: 'Failed to update project.' });
    }
  });

  app.delete('/api/projects/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'Invalid project ID.' });
        return;
      }
      await db
        .delete(rfProjects)
        .where(and(eq(rfProjects.id, id), eq(rfProjects.userId, req.user!.id)));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete project.' });
    }
  });

  // Clutter Profiles CRUD
  app.post('/api/clutter-profiles', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { name, buildingsAtten, landCover, obstacles } = req.body ?? {};
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'Profile name is required.' });
        return;
      }
      const [created] = await db
        .insert(clutterProfiles)
        .values({
          userId: req.user!.id,
          name: name.trim(),
          buildingsAtten: Number(buildingsAtten ?? 0.1),
          landCover,
          obstacles,
          isSystem: false,
        })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      console.error('Create clutter profile error:', err);
      res.status(500).json({ error: 'Failed to create clutter profile.' });
    }
  });

  app.put('/api/clutter-profiles/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'Invalid profile ID.' });
        return;
      }
      const [existing] = await db.select().from(clutterProfiles).where(eq(clutterProfiles.id, id)).limit(1);
      if (!existing) {
        res.status(404).json({ error: 'Clutter profile not found.' });
        return;
      }
      if (existing.userId !== null && existing.userId !== req.user!.id) {
        res.status(403).json({ error: 'Forbidden.' });
        return;
      }

      const { name, buildingsAtten, landCover, obstacles } = req.body ?? {};
      if (existing.isSystem || existing.userId === null) {
        // Save customized copy for user
        const [customCopy] = await db
          .insert(clutterProfiles)
          .values({
            userId: req.user!.id,
            name: String(name || `${existing.name} (Custom)`),
            buildingsAtten: Number(buildingsAtten ?? existing.buildingsAtten),
            landCover: landCover ?? existing.landCover,
            obstacles: obstacles ?? existing.obstacles,
            isSystem: false,
          })
          .returning();
        res.json(customCopy);
        return;
      }

      const [updated] = await db
        .update(clutterProfiles)
        .set({
          name: String(name ?? existing.name),
          buildingsAtten: Number(buildingsAtten ?? existing.buildingsAtten),
          landCover: landCover ?? existing.landCover,
          obstacles: obstacles ?? existing.obstacles,
        })
        .where(and(eq(clutterProfiles.id, id), eq(clutterProfiles.userId, req.user!.id)))
        .returning();
      res.json(updated);
    } catch (err) {
      console.error('Update clutter error:', err);
      res.status(500).json({ error: 'Failed to update clutter profile.' });
    }
  });

  app.delete('/api/clutter-profiles/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      if (!Number.isInteger(id)) {
        res.status(400).json({ error: 'Invalid profile ID.' });
        return;
      }
      const [existing] = await db.select().from(clutterProfiles).where(eq(clutterProfiles.id, id)).limit(1);
      if (!existing || existing.isSystem || existing.userId !== req.user!.id) {
        res.status(403).json({ error: 'Cannot delete system clutter profile or unauthorized profile.' });
        return;
      }
      await db
        .delete(clutterProfiles)
        .where(and(eq(clutterProfiles.id, id), eq(clutterProfiles.userId, req.user!.id)));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete clutter profile.' });
    }
  });

  // Obstacles CRUD
  app.post('/api/obstacles', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const b = req.body ?? {};
      const [inserted] = await db
        .insert(placedObstacles)
        .values({
          userId: req.user!.id,
          projectId: b.projectId ? Number(b.projectId) : null,
          clutterProfileId: b.clutterProfileId ? Number(b.clutterProfileId) : null,
          obstacleClassIndex: Number(b.obstacleClassIndex ?? 1),
          name: String(b.name || 'Obstacle'),
          color: String(b.color || '#f97316'),
          lat: Number(b.lat),
          lng: Number(b.lng),
          radiusM: Number(b.radiusM ?? 140),
          heightM: Number(b.heightM ?? 12),
          attenDbm: Number(b.attenDbm ?? 0.2),
        })
        .returning();
      res.status(201).json(inserted);
    } catch (err) {
      console.error('Create obstacle error:', err);
      res.status(500).json({ error: 'Failed to place obstacle.' });
    }
  });

  app.delete('/api/obstacles/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db
        .delete(placedObstacles)
        .where(and(eq(placedObstacles.id, id), eq(placedObstacles.userId, req.user!.id)));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete obstacle.' });
    }
  });

  app.delete('/api/obstacles', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.delete(placedObstacles).where(eq(placedObstacles.userId, req.user!.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to destroy obstacles.' });
    }
  });

  // Helper to resolve antenna pattern + clutter profile from PostgreSQL
  async function resolveRfRefs(
    antennaPatternId: number | null | undefined,
    clutterProfileId: number | null | undefined,
    userId: number | null
  ): Promise<{
    pattern: AntennaPatternDTO;
    clutter: ClutterProfileDTO;
    obstacles: PlacedObstacleDTO[];
  }> {
    const patterns = await db.select().from(antennaPatterns);
    const patternRow =
      patterns.find((p) => p.id === Number(antennaPatternId)) ?? patterns[0];

    const clutters = await db.select().from(clutterProfiles);
    const clutterRow =
      clutters.find((c) => c.id === Number(clutterProfileId)) ??
      clutters.find((c) => c.name === 'Temperate') ??
      clutters[0];

    const obsRows = await db
      .select()
      .from(placedObstacles)
      .where(
        userId !== null
          ? or(isNull(placedObstacles.userId), eq(placedObstacles.userId, userId))
          : isNull(placedObstacles.userId)
      );

    return {
      pattern: {
        ...patternRow,
        horizontalPattern: patternRow.horizontalPattern,
        verticalPattern: patternRow.verticalPattern,
      },
      clutter: {
        ...clutterRow,
        createdAt: clutterRow.createdAt.toISOString(),
      },
      obstacles: obsRows,
    };
  }

  // Run Coverage Heatmap Simulation (persisted in PostgreSQL when signed in!)
  app.post('/api/rf/simulate', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const b = req.body ?? {};
      const userId = req.user?.id ?? null;
      const { pattern, clutter, obstacles } = await resolveRfRefs(
        b.antennaPatternId,
        b.clutterProfileId,
        userId
      );

      const result = await computeCoverageGrid({
        txLat: Number(b.txLat ?? -6.175637),
        txLng: Number(b.txLng ?? 106.826727),
        txHeightM: Number(b.txHeightM ?? 5),
        txHeightMode: String(b.txHeightMode || 'Meters AGL'),
        frequencyMhz: Number(b.frequencyMhz ?? 923),
        rfPower: Number(b.rfPower ?? 27),
        rfPowerUnit: String(b.rfPowerUnit || 'dBm'),
        bandwidthKhz: Number(b.bandwidthKhz ?? 100),
        azimuthDeg: Number(b.azimuthDeg ?? 0),
        tiltDeg: Number(b.tiltDeg ?? 0),
        txGainDbi: Number(b.txGainDbi ?? pattern.gainDbi),
        rxHeightM: Number(b.rxHeightM ?? 15),
        rxGainDbi: Number(b.rxGainDbi ?? 17),
        measuredUnit: String(b.measuredUnit || 'Received Power (dBm)'),
        rangeKm: Number(b.rangeKm ?? 9.3),
        pattern,
        clutter,
        placedObstacles: obstacles,
      });

      const siteName = String(b.name || 'Jakarta IoT');
      const networkName = String(b.network || 'LoRa Network');
      const safeNet = networkName.replace(/[^a-zA-Z0-9]+/g, '_');
      const safeSite = siteName.replace(/[^a-zA-Z0-9]+/g, '_');
      const layerLabel = `${formatLayerTimestamp()}_${safeNet}_${safeSite}`;

      const simPayload = {
        userId,
        projectId: b.projectId ? Number(b.projectId) : null,
        layerLabel,
        siteName,
        networkName,
        txLat: Number(b.txLat ?? -6.175637),
        txLng: Number(b.txLng ?? 106.826727),
        rangeKm: Number(b.rangeKm ?? 9.3),
        frequencyMhz: Number(b.frequencyMhz ?? 923),
        colourSchema: String(b.colourSchema || 'LORA'),
        measuredUnit: String(b.measuredUnit || 'Received Power (dBm)'),
        bounds: result.bounds,
        gridCols: result.gridCols,
        gridRows: result.gridRows,
        gridValues: result.gridValues,
        stats: result.stats,
        paramsSnapshot: b,
      };

      const [saved] = await db.insert(simulations).values(simPayload).returning();
      res.status(201).json(saved);
    } catch (err) {
      console.error('RF simulation error:', err);
      res.status(500).json({ error: 'RF simulation failed.' });
    }
  });

  app.delete('/api/rf/simulations/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db
        .delete(simulations)
        .where(and(eq(simulations.id, id), eq(simulations.userId, req.user!.id)));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete simulation layer.' });
    }
  });

  // Path Profile & Point-to-Point Link Budget
  app.post('/api/rf/path-profile', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const b = req.body ?? {};
      const userId = req.user?.id ?? null;
      const { pattern, clutter, obstacles } = await resolveRfRefs(
        b.antennaPatternId,
        b.clutterProfileId,
        userId
      );

      const profile = await computePathProfile(
        {
          txLat: Number(b.txLat ?? -6.175637),
          txLng: Number(b.txLng ?? 106.826727),
          txHeightM: Number(b.txHeightM ?? 5),
          txHeightMode: String(b.txHeightMode || 'Meters AGL'),
          frequencyMhz: Number(b.frequencyMhz ?? 923),
          rfPower: Number(b.rfPower ?? 27),
          rfPowerUnit: String(b.rfPowerUnit || 'dBm'),
          bandwidthKhz: Number(b.bandwidthKhz ?? 100),
          azimuthDeg: Number(b.azimuthDeg ?? 0),
          tiltDeg: Number(b.tiltDeg ?? 0),
          txGainDbi: Number(b.txGainDbi ?? pattern.gainDbi),
          rxHeightM: Number(b.rxHeightM ?? 15),
          rxGainDbi: Number(b.rxGainDbi ?? 17),
          measuredUnit: String(b.measuredUnit || 'Received Power (dBm)'),
          rangeKm: Number(b.rangeKm ?? 9.3),
          pattern,
          clutter,
          placedObstacles: obstacles,
        },
        Number(b.rxLat ?? -6.166336),
        Number(b.rxLng ?? 106.816526)
      );

      res.json(profile);
    } catch (err) {
      console.error('Path profile error:', err);
      res.status(500).json({ error: 'Path profile calculation failed.' });
    }
  });

  // Multipoint Analysis Links
  app.post('/api/multipoint', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const b = req.body ?? {};
      const userId = req.user!.id;
      const { pattern, clutter, obstacles } = await resolveRfRefs(
        b.antennaPatternId,
        b.clutterProfileId,
        userId
      );

      const txLat = Number(b.txLat);
      const txLng = Number(b.txLng);
      const rxLat = Number(b.rxLat);
      const rxLng = Number(b.rxLng);

      const profile = await computePathProfile(
        {
          txLat,
          txLng,
          txHeightM: Number(b.txHeightM ?? 5),
          txHeightMode: String(b.txHeightMode || 'Meters AGL'),
          frequencyMhz: Number(b.frequencyMhz ?? 923),
          rfPower: Number(b.rfPower ?? 27),
          rfPowerUnit: String(b.rfPowerUnit || 'dBm'),
          bandwidthKhz: Number(b.bandwidthKhz ?? 100),
          azimuthDeg: Number(b.azimuthDeg ?? 0),
          tiltDeg: Number(b.tiltDeg ?? 0),
          txGainDbi: Number(b.txGainDbi ?? pattern.gainDbi),
          rxHeightM: Number(b.rxHeightM ?? 15),
          rxGainDbi: Number(b.rxGainDbi ?? 17),
          measuredUnit: String(b.measuredUnit || 'Received Power (dBm)'),
          rangeKm: Number(b.rangeKm ?? 9.3),
          pattern,
          clutter,
          placedObstacles: obstacles,
        },
        rxLat,
        rxLng
      );

      const [created] = await db
        .insert(multipointLinks)
        .values({
          userId,
          projectId: b.projectId ? Number(b.projectId) : null,
          txLat,
          txLng,
          txHeightM: Number(b.txHeightM ?? 5),
          rxLat,
          rxLng,
          rxHeightM: Number(b.rxHeightM ?? 15),
          distanceKm: profile.distanceKm,
          bearingDeg: profile.bearingDeg,
          pathLossDb: profile.pathLossDb,
          rxPowerDbm: profile.receivedPowerDbm,
          snrDb: profile.snrDb,
        })
        .returning();

      res.status(201).json(created);
    } catch (err) {
      console.error('Multipoint link error:', err);
      res.status(500).json({ error: 'Failed to create multipoint link.' });
    }
  });

  app.delete('/api/multipoint', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      await db.delete(multipointLinks).where(eq(multipointLinks.userId, req.user!.id));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to clear multipoint links.' });
    }
  });

  // Mesh / MANET Nodes CRUD
  app.post('/api/mesh', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const b = req.body ?? {};
      const freq = Number(b.frequencyMhz ?? 923);
      const [created] = await db
        .insert(meshNodes)
        .values({
          userId: req.user!.id,
          projectId: b.projectId ? Number(b.projectId) : null,
          label: String(b.label || `${freq} MHz - Mesh Node`),
          nodeType: String(b.nodeType || 'MANET'),
          lat: Number(b.lat),
          lng: Number(b.lng),
          heightM: Number(b.heightM ?? 5),
          frequencyMhz: freq,
          rfPowerDbm: Number(b.rfPowerDbm ?? 27),
          bandwidthMhz: Number(b.bandwidthMhz ?? 0.1),
          gainDbi: Number(b.gainDbi ?? 2.15),
          azimuthDeg: Number(b.azimuthDeg ?? 0),
          tiltDeg: Number(b.tiltDeg ?? 0),
          sensitivityDbm: Number(b.sensitivityDbm ?? -109),
          noiseFloorDbm: Number(b.noiseFloorDbm ?? -124),
        })
        .returning();
      res.status(201).json(created);
    } catch (err) {
      console.error('Create mesh node error:', err);
      res.status(500).json({ error: 'Failed to add mesh node.' });
    }
  });

  app.delete('/api/mesh/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
    try {
      const id = Number(req.params.id);
      await db
        .delete(meshNodes)
        .where(and(eq(meshNodes.id, id), eq(meshNodes.userId, req.user!.id)));
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: 'Failed to delete mesh node.' });
    }
  });

  // Server-side Geocoding proxy (Google Geocoding with free OpenStreetMap Nominatim fallback)
  app.get('/api/geocode/search', async (req: Request, res: Response) => {
    try {
      const q = String(req.query.q || '').trim();
      if (!q) {
        res.status(400).json({ error: 'Query q is required.' });
        return;
      }

      const apiKey = process.env.GOOGLE_MAPS_API_KEY;
      if (apiKey) {
        try {
          const url = new URL('https://maps.googleapis.com/maps/api/geocode/json');
          url.searchParams.set('address', q);
          url.searchParams.set('key', apiKey);
          const gRes = await fetch(url.toString(), { signal: AbortSignal.timeout(3500) });
          const data = (await gRes.json()) as {
            status: string;
            results?: {
              formatted_address: string;
              geometry: { location: { lat: number; lng: number } };
            }[];
          };
          if (data.status === 'OK' && data.results?.length) {
            res.json({
              results: data.results.slice(0, 5).map((r) => ({
                address: r.formatted_address,
                lat: r.geometry.location.lat,
                lng: r.geometry.location.lng,
              })),
            });
            return;
          }
        } catch {
          // Fall back to free Nominatim below
        }
      }

      const nomUrl = new URL('https://nominatim.openstreetmap.org/search');
      nomUrl.searchParams.set('format', 'json');
      nomUrl.searchParams.set('limit', '5');
      nomUrl.searchParams.set('q', q);
      const nomRes = await fetch(nomUrl.toString(), {
        headers: { 'User-Agent': 'CoverageLab-RF-Sim/1.0' },
        signal: AbortSignal.timeout(4500),
      });
      if (nomRes.ok) {
        const nomData = (await nomRes.json()) as Array<{
          display_name: string;
          lat: string;
          lon: string;
        }>;
        res.json({
          results: nomData.map((r) => ({
            address: r.display_name,
            lat: Number(r.lat),
            lng: Number(r.lon),
          })),
        });
        return;
      }

      res.json({ results: [] });
    } catch {
      res.status(500).json({ error: 'Geocode search failed.' });
    }
  });

  // Quick utility endpoint for link distance/bearing
  app.get('/api/rf/metrics', (req: Request, res: Response) => {
    const lat1 = Number(req.query.lat1);
    const lng1 = Number(req.query.lng1);
    const lat2 = Number(req.query.lat2);
    const lng2 = Number(req.query.lng2);
    if ([lat1, lng1, lat2, lng2].some(Number.isNaN)) {
      res.status(400).json({ error: 'Invalid coordinates' });
      return;
    }
    res.json({
      distanceKm: haversineKm(lat1, lng1, lat2, lng2),
      bearingDeg: bearingDeg(lat1, lng1, lat2, lng2),
    });
  });

  // Vite middleware in dev, static dist in production
  const isProd = process.env.NODE_ENV === 'production';
  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const PORT = Number(process.env.PORT || 3000);
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`CoverageLab server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
