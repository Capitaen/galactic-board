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
  const keys = ['planets', 'fleets', 'ships', 'buildJobs', 'fleetMotions', 'resources', 'planetResources', 'meta'];
  return keys.filter((key) => JSON.stringify(previousState?.[key] ?? null) !== JSON.stringify(nextState?.[key] ?? null));
}

function broadcastCampaignChange(payload) {
  io.emit('campaign:state-changed', payload);
}

app.get('/api/bootstrap', (req, res) => {
  const session = getSession(req);
  const me = session || { id: null, username: '', role: 'Viewer' };
  const { state, revision, updatedAt } = readCampaignState(db);
  res.json({
    me,
    campaign: sanitizeStateForRole(state, me.role),
    revision,
    updatedAt
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
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Galactic Campaign Board server listening on http://0.0.0.0:${PORT}`);
  console.log('Default admin login: admin / admin');
});
