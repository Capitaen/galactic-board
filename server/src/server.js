import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { createServer } from 'node:http';
import { Server as SocketServer } from 'socket.io';
import { createDb, createUser, deleteUser, findUserByNormalizedUsername, listUsers, readCampaignState, updateUser, writeCampaignState } from './db.js';
import { validateNextCampaignState } from './stateValidation.js';

const projectRoot = process.cwd();
const db = createDb(projectRoot);

const app = express();
const server = createServer(app);
const io = new SocketServer(server, {
  cors: { origin: true, credentials: true }
});

const sessions = new Map();
const COOKIE_NAME = 'gcb_session';
const PORT = Number(process.env.PORT || 3000);
const RESOURCE_KEYS = ['metal', 'technology', 'fuel', 'chemicals', 'supplies'];
const RESOURCE_PRODUCTION_TICK_MS = 60 * 60 * 1000;
const OWNER_FRONTLINE_PASS_VERSION = 'cw_image_v4';
const OWNER_FRONTLINE_OVERRIDES = {
  abregado_rae: 'GAR',
  alderaan: 'GAR',
  balmorra: 'GAR',
  bothawui: 'GAR',
  cato_neimoidia: 'GAR',
  coruscant: 'GAR',
  corellia: 'GAR',
  dantooine: 'GAR',
  duxn: 'GAR',
  kashyyyk: 'GAR',
  kuat: 'GAR',
  mandalore: 'GAR',
  mon_calamari: 'GAR',
  naboo: 'GAR',
  onderon: 'GAR',
  rendili: 'GAR',
  tython: 'GAR',
  yaga_minor: 'GAR',
  ahldani: 'KUS',
  auraterra: 'KUS',
  christophsis: 'KUS',
  dathomir: 'KUS',
  felucia: 'KUS',
  mimban: 'KUS',
  murkhana: 'KUS',
  ossus: 'KUS',
  qiilura: 'KUS',
  raxus: 'KUS',
  scarif: 'KUS',
  sullust: 'KUS',
  utapau: 'KUS',
  wobani: 'KUS',
  yavin: 'KUS',
  affavan: 'HUTT',
  alee: 'HUTT',
  eadu: 'HUTT',
  geonosis: 'HUTT',
  hypori: 'HUTT',
  kessel: 'HUTT',
  nal_hutta: 'HUTT',
  nar_shaddaa: 'HUTT',
  ryloth: 'HUTT',
  saleucami: 'HUTT',
  sleheyron: 'HUTT',
  tatooine: 'HUTT',
  teth: 'HUTT',
  toydaria: 'HUTT',
  xolu: 'HUTT',
  ylesia: 'HUTT',
  zisia: 'HUTT',
  ziugen: 'HUTT'
};

function pointInEllipse(x, y, cx, cy, rx, ry) {
  if (![x, y, cx, cy, rx, ry].every(Number.isFinite)) return false;
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return (dx * dx) + (dy * dy) <= 1;
}

function classifyOwnerFromReferenceMap(planet) {
  if (!planet) return null;
  const explicitOwner = OWNER_FRONTLINE_OVERRIDES[planet.id];
  if (explicitOwner) return explicitOwner;
  const region = String(planet.region || '').trim();
  const x = Number(planet.x);
  const y = Number(planet.y);

  if (region === 'Hutt Space') return 'HUTT';
  if (region === 'Unknown Regions' || region === 'Wild Space') return 'NEUTRAL';

  const inGarCoreNorth = pointInEllipse(x, y, 1060, 1060, 300, 270);
  const inGarCoreSouth = pointInEllipse(x, y, 1080, 1435, 285, 335);
  const inGarWest = pointInEllipse(x, y, 900, 1420, 220, 260);
  const inHuttSlice = pointInEllipse(x, y, 1510, 1120, 235, 265);
  const inHuttSouth = pointInEllipse(x, y, 1500, 1475, 255, 220);
  const inKusNorth = pointInEllipse(x, y, 1275, 655, 425, 285);
  const inKusNorthEast = pointInEllipse(x, y, 1510, 730, 260, 270);
  const inKusSouth = pointInEllipse(x, y, 1160, 1675, 285, 195);

  if (inHuttSlice || inHuttSouth) return 'HUTT';
  if (inGarCoreNorth || inGarCoreSouth || inGarWest) return 'GAR';
  if (inKusNorth || inKusNorthEast || inKusSouth) return 'KUS';

  if (region === 'Core' || region === 'Colonies' || region === 'Inner Rim') return 'GAR';
  if (region === 'Expansion Region' && x < 1280 && y > 760) return 'GAR';
  if (region === 'Mid Rim' && x < 1080 && y > 820 && y < 1700) return 'GAR';
  if (region === 'Outer Rim' && x < 820) return 'NEUTRAL';
  if (region === 'Outer Rim' && x > 1420 && y > 930 && y < 1600) return 'HUTT';
  if (region === 'Outer Rim' && y < 830 && x > 1080) return 'KUS';
  if (region === 'Outer Rim' && y > 1480 && x > 900 && x < 1420) return 'KUS';

  return null;
}

function findIndexHtml() {
  const candidates = [
    path.join(projectRoot, 'public', 'index.html'),
    path.join(projectRoot, 'index.html')
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) return filePath;
  }

  throw new Error('index.html not found in public/index.html or project root');
}

app.use(express.json({ limit: '50mb' }));
app.use(cookieParser());
app.use((req, res, next) => {
  if (req.path === '/' || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(path.join(projectRoot, 'public')));
app.use('/assets', express.static(path.join(projectRoot, 'assets')));
app.use('/public/assets', express.static(path.join(projectRoot, 'public', 'assets')));

app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

function readUsersWithSecrets() {
  return db.prepare(`
    SELECT id, username, password_hash AS passwordHash, role, created_at AS createdAt, updated_at AS updatedAt
    FROM users
    ORDER BY username COLLATE NOCASE
  `).all();
}

function createSession(user) {
  const token = crypto.randomUUID();
  sessions.set(token, {
    id: user.id,
    username: user.username,
    role: user.role
  });
  return token;
}

function getSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  return token ? sessions.get(token) || null : null;
}

function sanitizeStateForRole(state, role) {
  return {
    ...state,
    authUsers: role === 'Admin' ? listUsers(db) : []
  };
}

function createEmptyFactionResources() {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
}

function getPlanetResourceSlotsFromState(state, planetId) {
  const slots = state?.planetResources?.[planetId];
  const normalized = Array.isArray(slots)
    ? slots.filter((slot) => RESOURCE_KEYS.includes(slot)).slice(0, 10)
    : [];
  while (normalized.length < 10) normalized.push('');
  return normalized;
}

function getFactionProductionRateFromState(state, faction = 'GAR') {
  const totals = createEmptyFactionResources();
  for (const planet of Array.isArray(state?.planets) ? state.planets : []) {
    if (planet?.owner !== faction) continue;
    for (const slot of getPlanetResourceSlotsFromState(state, planet.id)) {
      if (!slot) continue;
      totals[slot] += 1;
    }
  }
  return totals;
}

function applyServerProductionTicks(previousState, now = Date.now()) {
  const nextState = JSON.parse(JSON.stringify(previousState || {}));
  nextState.resources = nextState.resources || {};
  nextState.resources.GAR = {
    ...createEmptyFactionResources(),
    ...(nextState.resources.GAR || {})
  };
  const lastTick = Number(nextState.lastResourceTickAt) || now;
  const elapsed = Math.max(0, now - lastTick);
  const ticks = Math.floor(elapsed / RESOURCE_PRODUCTION_TICK_MS);
  if (ticks <= 0) {
    nextState.lastResourceTickAt = lastTick;
    return { changed: false, ticks: 0, state: nextState };
  }
  const rate = getFactionProductionRateFromState(nextState, 'GAR');
  for (const key of RESOURCE_KEYS) {
    nextState.resources.GAR[key] = Number(nextState.resources.GAR[key] || 0) + (Number(rate[key] || 0) * ticks);
  }
  nextState.lastResourceTickAt = lastTick + (ticks * RESOURCE_PRODUCTION_TICK_MS);
  return { changed: true, ticks, state: nextState };
}

function applyOwnerFrontlineImagePass(previousState) {
  const nextState = JSON.parse(JSON.stringify(previousState || {}));
  nextState.meta = nextState.meta || {};
  if (nextState.meta.ownerMapPassVersion === OWNER_FRONTLINE_PASS_VERSION) {
    return { changed: false, state: nextState };
  }
  const planets = Array.isArray(nextState.planets) ? nextState.planets : [];
  let changed = false;
  for (const planet of planets) {
    if (!planet?.id) continue;
    const nextOwner = classifyOwnerFromReferenceMap(planet);
    if (!nextOwner || planet.owner === nextOwner) continue;
    planet.owner = nextOwner;
    changed = true;
  }
  nextState.meta.ownerMapPassVersion = OWNER_FRONTLINE_PASS_VERSION;
  if (!changed && previousState?.meta?.ownerMapPassVersion === OWNER_FRONTLINE_PASS_VERSION) {
    return { changed: false, state: nextState };
  }
  return { changed: changed || previousState?.meta?.ownerMapPassVersion !== OWNER_FRONTLINE_PASS_VERSION, state: nextState };
}

function sanitizeIncomingCampaignPayload(nextState) {
  const meta = nextState?.meta && typeof nextState.meta === 'object' ? nextState.meta : {};
  const blockedMetaKeys = new Set([
    'arcgisCompact',
    'arcgisRaw',
    'hyperlanes',
    'grid',
    'regions',
    'sectors',
    'mapAnalysis',
    'routeCache',
    'tacticalRouteCache',
    'searchState',
    'layerState',
    'viewState',
    'zoom',
    'panX',
    'panY',
    'viewMode',
    'ui',
    'animationState',
    'renderCache',
    'indexCache',
    'domCache'
  ]);
  return {
    planets: Array.isArray(nextState?.planets) ? nextState.planets : [],
    fleets: Array.isArray(nextState?.fleets) ? nextState.fleets : [],
    ships: Array.isArray(nextState?.ships) ? nextState.ships : [],
    buildJobs: Array.isArray(nextState?.buildJobs) ? nextState.buildJobs : [],
    fleetMotions: Array.isArray(nextState?.fleetMotions) ? nextState.fleetMotions : [],
    resources: nextState?.resources && typeof nextState.resources === 'object' ? nextState.resources : {},
    planetResources: nextState?.planetResources && typeof nextState.planetResources === 'object' ? nextState.planetResources : {},
    lastResourceTickAt: Number(nextState?.lastResourceTickAt) || 0,
    importWarnings: Array.isArray(nextState?.importWarnings) ? nextState.importWarnings : [],
    meta: Object.fromEntries(Object.entries(meta).filter(([key]) => !blockedMetaKeys.has(key)))
  };
}

function parseCookieHeader(rawCookieHeader) {
  return String(rawCookieHeader || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, entry) => {
      const separatorIndex = entry.indexOf('=');
      if (separatorIndex <= 0) return acc;
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      acc[key] = decodeURIComponent(value);
      return acc;
    }, {});
}

function getSessionForSocket(socket) {
  const cookies = parseCookieHeader(socket.handshake.headers?.cookie || '');
  const token = cookies[COOKIE_NAME];
  return token ? sessions.get(token) || null : null;
}

function syncSocketSession(socket) {
  const session = getSessionForSocket(socket);
  socket.data.session = session || { id: null, username: '', role: 'Viewer' };
  return socket.data.session;
}

function requireAuth(req, res, next) {
  const session = getSession(req);
  if (!session) return res.status(401).json({ error: 'Unauthorized' });
  req.user = session;
  next();
}

function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function sanitizeAdminRole(rawRole) {
  const role = String(rawRole || '').trim();
  return ['Admin', 'Eventleiter / KUS', 'Republic Navy / GAR', 'Viewer'].includes(role) ? role : 'Viewer';
}

function validateAdminUserInput(body) {
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  const role = sanitizeAdminRole(body?.role);

  if (!username) {
    const error = new Error('Benutzername darf nicht leer sein.');
    error.status = 400;
    throw error;
  }

  if (!password) {
    const error = new Error('Passwort darf nicht leer sein.');
    error.status = 400;
    throw error;
  }

  return { username, password, role };
}

function detectChangedCampaignKeys(previousState, nextState) {
  const keys = ['planets', 'fleets', 'ships', 'buildJobs', 'fleetMotions', 'resources', 'planetResources', 'lastResourceTickAt', 'meta'];
  return keys.filter((key) => JSON.stringify(previousState?.[key] ?? null) !== JSON.stringify(nextState?.[key] ?? null));
}

function broadcastCampaignChange(payload) {
  io.emit('campaign:state-changed', payload);
}

app.get('/api/bootstrap', (req, res) => {
  const session = getSession(req);
  const me = session || { id: null, username: '', role: 'Viewer' };
  const { state, revision, updatedAt } = readCampaignState(db);
  const productionResult = applyServerProductionTicks(state);
  const ownerPassResult = applyOwnerFrontlineImagePass(productionResult.state);
  const changedKeys = [];
  let effectiveState = state;
  let effectiveRevision = revision;
  let effectiveUpdatedAt = updatedAt;
  if (ownerPassResult.changed || productionResult.changed) {
    effectiveState = ownerPassResult.state;
    if (ownerPassResult.changed) changedKeys.push('planets', 'meta');
    if (productionResult.changed) changedKeys.push('resources', 'lastResourceTickAt');
    effectiveRevision = revision + 1;
    effectiveUpdatedAt = writeCampaignState(db, effectiveState, effectiveRevision);
    broadcastCampaignChange({
      revision: effectiveRevision,
      updatedAt: effectiveUpdatedAt,
      changedKeys: [...new Set(changedKeys)],
      actor: {
        id: 'server',
        username: 'server',
        role: 'System'
      }
    });
  }
  res.json({
    me,
    campaign: sanitizeStateForRole(effectiveState, me.role),
    revision: effectiveRevision,
    updatedAt: effectiveUpdatedAt
  });
});

app.get('/api/auth/me', (req, res) => {
  const session = getSession(req);
  res.json({
    user: session || { id: null, username: '', role: 'Viewer' }
  });
});

app.post('/api/auth/login', async (req, res) => {
  const username = String(req.body?.username || '').trim().toLowerCase();
  const password = String(req.body?.password || '');
  const users = readUsersWithSecrets();
  const user = users.find((entry) => entry.username.trim().toLowerCase() === username);

  if (!user || !await bcrypt.compare(password, user.passwordHash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = createSession(user);

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/'
  });

  res.json({
    user: { id: user.id, username: user.username, role: user.role }
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) sessions.delete(token);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.post('/api/admin/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { username, password, role } = validateAdminUserInput(req.body);
    const existing = findUserByNormalizedUsername(db, username);
    if (existing) {
      return res.status(409).json({ error: 'Dieser Benutzername existiert bereits.', users: listUsers(db) });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    createUser(db, { username, passwordHash, role });
    res.json({ ok: true, users: listUsers(db) });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Login konnte nicht erstellt werden.',
      users: listUsers(db)
    });
  }
});

app.patch('/api/admin/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const userId = String(req.params.id || '').trim();
  if (!userId) {
    return res.status(400).json({ error: 'Ungültige Benutzer-ID.', users: listUsers(db) });
  }

  try {
    const { username, password, role } = validateAdminUserInput(req.body);
    const existing = findUserByNormalizedUsername(db, username);
    if (existing && existing.id !== userId) {
      return res.status(409).json({ error: 'Dieser Benutzername existiert bereits.', users: listUsers(db) });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    updateUser(db, userId, { username, passwordHash, role });
    res.json({ ok: true, users: listUsers(db) });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Login konnte nicht gespeichert werden.',
      users: listUsers(db)
    });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireAdmin, (req, res) => {
  const userId = String(req.params.id || '').trim();
  if (!userId) {
    return res.status(400).json({ error: 'Ungültige Benutzer-ID.', users: listUsers(db) });
  }

  const existingUsers = listUsers(db);
  const targetUser = existingUsers.find((entry) => entry.id === userId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Login nicht gefunden.', users: existingUsers });
  }

  if (String(targetUser.username || '').trim().toLowerCase() === 'admin') {
    return res.status(403).json({ error: 'Der Standard-Admin darf nicht gelöscht werden.', users: existingUsers });
  }

  deleteUser(db, userId);
  res.json({ ok: true, users: listUsers(db) });
});

app.put('/api/campaign/state', requireAuth, (req, res) => {
  const nextState = sanitizeIncomingCampaignPayload(req.body?.campaign);
  const expectedRevision = Number(req.body?.expectedRevision || 0);

  if (!req.body?.campaign || typeof req.body.campaign !== 'object') {
    return res.status(400).json({ error: 'campaign payload missing' });
  }

  const { state: previousState, revision } = readCampaignState(db);

  if (expectedRevision && expectedRevision !== revision) {
    return res.status(409).json({ error: 'Revision mismatch', revision });
  }

  try {
    validateNextCampaignState(req.user.role, previousState, nextState);

    const mergedState = {
      ...previousState,
      ...nextState,
      lastResourceTickAt: Number(nextState.lastResourceTickAt) || Number(previousState.lastResourceTickAt) || Date.now(),
      authUsers: previousState.authUsers || []
    };
    const changedKeys = detectChangedCampaignKeys(previousState, mergedState);

    const nextRevision = revision + 1;
    const updatedAt = writeCampaignState(db, mergedState, nextRevision);

    broadcastCampaignChange({
      revision: nextRevision,
      updatedAt,
      changedKeys,
      actor: {
        id: req.user.id,
        username: req.user.username,
        role: req.user.role
      }
    });

    res.json({
      ok: true,
      revision: nextRevision,
      updatedAt
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'State validation failed'
    });
  }
});

app.get('/', (_req, res) => {
  const indexPath = findIndexHtml();
  res.type('html').send(fs.readFileSync(indexPath, 'utf8'));
});

io.on('connection', (socket) => {
  const session = syncSocketSession(socket);
  const { revision, updatedAt } = readCampaignState(db);

  socket.emit('socket:ready', { ok: true, me: session, revision, updatedAt });

  socket.on('fx:fleet-jump-start', (payload) => {
    const activeSession = syncSocketSession(socket);
    if (!activeSession?.id || activeSession.role === 'Viewer' || !payload?.motion) return;
    socket.broadcast.emit('fx:fleet-jump-start', {
      motion: payload.motion,
      actor: {
        id: activeSession.id,
        username: activeSession.username,
        role: activeSession.role
      }
    });
  });

  socket.on('fx:fleet-jump-finish', (payload) => {
    const activeSession = syncSocketSession(socket);
    if (!activeSession?.id || activeSession.role === 'Viewer' || !payload?.fleetId) return;
    socket.broadcast.emit('fx:fleet-jump-finish', {
      fleetId: payload.fleetId,
      targetPlanetId: payload.targetPlanetId || null,
      targetPlanetName: payload.targetPlanetName || '',
      actor: {
        id: activeSession.id,
        username: activeSession.username,
        role: activeSession.role
      }
    });
  });

  socket.on('fx:fleet-delete', (payload) => {
    const activeSession = syncSocketSession(socket);
    if (!activeSession?.id || activeSession.role === 'Viewer' || !payload?.fleetId) return;
    socket.broadcast.emit('fx:fleet-delete', {
      fleetId: payload.fleetId,
      actor: {
        id: activeSession.id,
        username: activeSession.username,
        role: activeSession.role
      }
    });
  });

  socket.on('fx:ship-redeploy', (payload) => {
    const activeSession = syncSocketSession(socket);
    if (!activeSession?.id || activeSession.role === 'Viewer' || !payload?.shipId || !payload?.sourceFleetId || !payload?.targetFleetId) return;
    socket.broadcast.emit('fx:ship-redeploy', {
      shipId: payload.shipId,
      sourceFleetId: payload.sourceFleetId,
      targetFleetId: payload.targetFleetId,
      actor: {
        id: activeSession.id,
        username: activeSession.username,
        role: activeSession.role
      }
    });
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Galactic Campaign Board server listening on http://0.0.0.0:${PORT}`);
  console.log('Default admin login: admin / admin');
});
