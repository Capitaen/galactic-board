import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import { createServer } from 'node:https';
import { Server as SocketServer } from 'socket.io';
import {
  buyCivilianSectorResource,
  calculateCivilianMineYield,
  createDb,
  createRadioCommandPermission,
  createUser,
  deleteRadioCommandPermission,
  deleteUser,
  findUserByNormalizedUsername,
  getConsumerNextPurchaseAt,
  listEconomySectors,
  listRadioCommandLogs,
  listRadioCommandPermissions,
  listUsers,
  purchaseMarketDemand,
  readCompanyOwnership,
  readCampaignState,
  readEconomySector,
  readEconomySectorHoldings,
  readMarketSnapshot,
  readPortfolio,
  readPortfolioHistory,
  runMarketTick,
  sellMarketShare,
  setSectorEmbargo,
  updateEconomyPolicy,
  updateRadioCommandPermission,
  updateUser,
  writeCampaignState
} from './db.js';
import { getFleetMotionArrivalIso, getFleetMotionByFleetId, getFleetMotionStartedAtIso, getFleetPlanetId, getPlanetNameById, writeAuditLog } from './audit.js';
import { applyEnvFiles } from './env.js';
import { createDiscordRadioListener, getDiscordRadioConfig } from './services/discordRadioListener.js';
import { validateNextCampaignState } from './stateValidation.js';

const projectRoot = process.cwd();
applyEnvFiles(projectRoot);
const db = createDb(projectRoot);
const PLANET_OWNERSHIP_REFERENCE_PATH = path.join(projectRoot, 'server', 'data', 'planetOwnershipReference.json');
const HIDDEN_PLANET_OWNER_FALLBACK_PATH = path.join(projectRoot, 'server', 'data', 'hiddenPlanetOwnerFallback.json');

const app = express();
app.set('trust proxy', 1);
const sslOptions = {
  key: fs.readFileSync('C:/Users/Administrator/galactic-campaign/privkey.pem'),
  cert: fs.readFileSync('C:/Users/Administrator/galactic-campaign/fullchain.pem')
};


const server = createServer(sslOptions, app);
const io = new SocketServer(server, {
  cors: { origin: true, credentials: true }
});
const discordRadioListener = createDiscordRadioListener({
  db,
  getIo: () => io
});

const sessions = new Map();
const COOKIE_NAME = 'gcb_session';
const PORT = Number(process.env.PORT || 443);
const RAW_RESOURCE_KEYS = ['quadraniumErz', 'agrinium', 'tibannaGas', 'baradium', 'kavamSalz'];
const RESOURCE_KEYS = [...RAW_RESOURCE_KEYS, 'credits'];
const INFRASTRUCTURE_PRODUCTION_RESOURCES = {
  quadraniumErz: 'quadraniumErz',
  agrinium: 'agrinium',
  tibannaGas: 'tibannaGas',
  baradium: 'baradium',
  kavamSalz: 'kavamSalz'
};
const CIVILIAN_CREDIT_YIELDS = {
  civilian_quadraniumErz: { resource: 'quadraniumErz', credits: 220 },
  civilian_agrinium: { resource: 'agrinium', credits: 320 },
  civilian_tibannaGas: { resource: 'tibannaGas', credits: 260 },
  civilian_baradium: { resource: 'baradium', credits: 240 },
  civilian_kavamSalz: { resource: 'kavamSalz', credits: 180 }
};
const CIVILIAN_INFRASTRUCTURE_BONUSES = {
  civil_trade_center: { quadraniumErz: 0.03, agrinium: 0.03, tibannaGas: 0.03, baradium: 0.03, kavamSalz: 0.03 },
  civil_industrial_complex: { quadraniumErz: 0.06, baradium: 0.04 },
  civil_logistics_center: { quadraniumErz: 0.03, agrinium: 0.03, tibannaGas: 0.06, baradium: 0.03, kavamSalz: 0.03 },
  civil_research_academy: { agrinium: 0.08 },
  civil_orbital_trade_station: { quadraniumErz: 0.10, agrinium: 0.10, tibannaGas: 0.10, baradium: 0.10, kavamSalz: 0.10 }
};
const INFRASTRUCTURE_KEYS = [
  ...Object.keys(INFRASTRUCTURE_PRODUCTION_RESOURCES),
  ...Object.keys(CIVILIAN_CREDIT_YIELDS),
  ...Object.keys(CIVILIAN_INFRASTRUCTURE_BONUSES)
];
const MAX_CIVILIAN_PRODUCTION_BONUS = 0.30;
const RESOURCE_FACTIONS = ['GAR', 'KUS'];
const RESOURCE_PRODUCTION_TICK_MS = 60 * 60 * 1000;
const RESOURCE_RESET_VERSION = 'resource_reset_2026_05_01';
const OWNER_FRONTLINE_PASS_VERSION = 'excel_owner_visibility_v2';
const LOGIN_ROLE_DEFINITIONS = {
  Admin: { faction: 'system', level: 'global' },
  'Republic Navy Admin': { faction: 'navy', level: 'admin' },
  'Republic Navy / GAR': { faction: 'navy', level: 'member' },
  'Galaktischer Senats Admin': { faction: 'senate', level: 'admin' },
  Senat: { faction: 'senate', level: 'member' },
  'Eventleiter / KUS Admin': { faction: 'event', level: 'admin' },
  'Eventleiter / KUS': { faction: 'event', level: 'member' },
  'Black Sun Syndikat Admin': { faction: 'blackSun', level: 'faction-admin' },
  'Black Sun Syndikat': { faction: 'blackSun', level: 'member' },
  'Pyke-Syndikat Admin': { faction: 'pyke', level: 'faction-admin' },
  'Pyke-Syndikat': { faction: 'pyke', level: 'member' },
  'Huttenkartell Admin': { faction: 'hutts', level: 'faction-admin' },
  Huttenkartell: { faction: 'hutts', level: 'member' },
  Viewer: { faction: 'system', level: 'viewer' }
};
const LOGIN_ROLES = Object.keys(LOGIN_ROLE_DEFINITIONS);
const RADIO_PERMISSION_ROLES = ['fleet_officer', 'admiralty'];
function normalizeOwnershipReferenceName(text) {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\/legends\b/g, '')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/\bhomeworld\b/g, ' ')
    .replace(/\bunknown\b/g, ' ')
    .replace(/\bunidentified\b/g, ' ')
    .replace(/\bprime\b/g, ' prime ')
    .replace(/\biii\b/g, ' 3 ')
    .replace(/\biii\b/g, ' 3 ')
    .replace(/\bii\b/g, ' 2 ')
    .replace(/\biv\b/g, ' 4 ')
    .replace(/\bvi\b/g, ' 6 ')
    .replace(/\bvii\b/g, ' 7 ')
    .replace(/\bviii\b/g, ' 8 ')
    .replace(/\bix\b/g, ' 9 ')
    .replace(/\bx\b/g, ' 10 ')
    .replace(/['â€™`"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildOwnershipReferenceAliases(text) {
  const raw = String(text || '').trim();
  if (!raw) return [];
  const aliases = new Set();
  const pushAlias = (value) => {
    const normalized = normalizeOwnershipReferenceName(value);
    if (normalized) aliases.add(normalized);
  };
  pushAlias(raw);
  pushAlias(raw.replace(/\/.*$/g, ''));
  pushAlias(raw.replace(/\([^)]*\)/g, ' '));
  pushAlias(raw.replace(/\b(homeworld|unidentified|unknown)\b/gi, ' '));
  pushAlias(raw.replace(/\b(iii|iii|ii|iv|vi|vii|viii|ix|x)\b/gi, ' '));
  return [...aliases];
}

function mapReferenceOwner(owner) {
  const normalized = String(owner || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'gar' || normalized === 'republic') return 'GAR';
  if (normalized === 'kus' || normalized === 'cis') return 'KUS';
  if (normalized === 'hutt') return 'HUTT';
  if (normalized === 'neutral') return 'NEUTRAL';
  return null;
}

function loadPlanetOwnershipReference() {
  if (!fs.existsSync(PLANET_OWNERSHIP_REFERENCE_PATH)) return new Map();
  try {
    const rows = JSON.parse(fs.readFileSync(PLANET_OWNERSHIP_REFERENCE_PATH, 'utf8'));
    const reference = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const owner = mapReferenceOwner(row?.owner);
      if (!owner) continue;
      for (const alias of buildOwnershipReferenceAliases(row?.name)) {
        if (!reference.has(alias)) {
          reference.set(alias, { owner, isLegends: /\/legends\b/i.test(String(row?.name || '')) });
          continue;
        }
        const existing = reference.get(alias);
        const candidateIsLegends = /\/legends\b/i.test(String(row?.name || ''));
        if (existing?.isLegends && !candidateIsLegends) {
          reference.set(alias, { owner, isLegends: false });
        }
      }
    }
    return reference;
  } catch (error) {
    console.warn('Failed to load planet ownership reference', error);
    return new Map();
  }
}

const PLANET_OWNERSHIP_REFERENCE = loadPlanetOwnershipReference();

function loadHiddenPlanetOwnerFallback() {
  if (!fs.existsSync(HIDDEN_PLANET_OWNER_FALLBACK_PATH)) return { byId: new Map(), byName: new Map() };
  try {
    const rows = JSON.parse(fs.readFileSync(HIDDEN_PLANET_OWNER_FALLBACK_PATH, 'utf8'));
    const byId = new Map();
    const byName = new Map();
    for (const row of Array.isArray(rows) ? rows : []) {
      const owner = mapReferenceOwner(row?.owner);
      if (!owner) continue;
      const id = String(row?.id || '').trim();
      if (id && !byId.has(id)) byId.set(id, owner);
      for (const alias of buildOwnershipReferenceAliases(row?.name)) {
        if (!byName.has(alias)) byName.set(alias, owner);
      }
    }
    return { byId, byName };
  } catch (error) {
    console.warn('Failed to load hidden planet owner fallback', error);
    return { byId: new Map(), byName: new Map() };
  }
}

const HIDDEN_PLANET_OWNER_FALLBACK = loadHiddenPlanetOwnerFallback();

function getPlanetOwnershipReferenceMatch(planet) {
  if (!planet) return null;
  for (const candidate of [planet.name, String(planet.id || '').replace(/_/g, ' ')]) {
    for (const alias of buildOwnershipReferenceAliases(candidate)) {
      const referenced = PLANET_OWNERSHIP_REFERENCE.get(alias);
      if (referenced?.owner) return referenced;
    }
  }
  return null;
}

function getHiddenPlanetFallbackOwner(planet) {
  if (!planet) return null;
  const byId = HIDDEN_PLANET_OWNER_FALLBACK.byId.get(String(planet.id || '').trim());
  if (byId) return byId;
  for (const candidate of [planet.name, String(planet.id || '').replace(/_/g, ' ')]) {
    for (const alias of buildOwnershipReferenceAliases(candidate)) {
      const byName = HIDDEN_PLANET_OWNER_FALLBACK.byName.get(alias);
      if (byName) return byName;
    }
  }
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

const planetCardCache = new Map();

function decodeHtmlText(text) {
  return String(text || '')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractMetaContent(html, key, attr = 'property') {
  const pattern = new RegExp(`<meta[^>]+${attr}=["']${key}["'][^>]+content=["']([^"']+)["']`, 'i');
  const reversePattern = new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+${attr}=["']${key}["']`, 'i');
  const match = html.match(pattern) || html.match(reversePattern);
  return decodeHtmlText(match?.[1] || '');
}

function extractInfoboxValue(html, labels = []) {
  for (const label of labels) {
    const pattern = new RegExp(`${label}[\\s\\S]{0,420}?pi-data-value[^>]*>([\\s\\S]{1,260}?)<\\/div>`, 'i');
    const match = html.match(pattern);
    if (!match?.[1]) continue;
    const value = decodeHtmlText(match[1].replace(/<[^>]+>/g, ' '));
    if (value) return value;
  }
  return '';
}

async function resolvePlanetCardData(planet) {
  const cacheKey = String(planet?.id || '').trim();
  if (!cacheKey) return {};
  const cached = planetCardCache.get(cacheKey);
  if (cached && (Date.now() - cached.cachedAt) < (12 * 60 * 60 * 1000)) return cached.payload;
  const wikiUrl = String(planet?.wiki || '').trim();
  if (!wikiUrl) {
    const payload = {};
    planetCardCache.set(cacheKey, { cachedAt: Date.now(), payload });
    return payload;
  }
  try {
    const response = await fetch(wikiUrl, {
      headers: {
        'user-agent': 'GalacticCampaignBoard/1.0 (+planet-card-fetch)',
        'accept-language': 'de-DE,de;q=0.9,en;q=0.8'
      }
    });
    if (!response.ok) throw new Error(`Planet wiki request failed: ${response.status}`);
    const html = await response.text();
    const payload = {
      description: extractMetaContent(html, 'og:description') || extractMetaContent(html, 'description', 'name'),
      image: extractMetaContent(html, 'og:image') || extractMetaContent(html, 'twitter:image', 'name'),
      climate: extractInfoboxValue(html, ['Climate', 'Klima']),
      population: extractInfoboxValue(html, ['Population', 'Bevölkerung']),
      strategic: extractInfoboxValue(html, ['Affiliation', 'Zugehörigkeit', 'Government', 'Regierung'])
    };
    planetCardCache.set(cacheKey, { cachedAt: Date.now(), payload });
    return payload;
  } catch (error) {
    console.warn('Planet card fetch failed', { planetId: cacheKey, error: String(error) });
    const payload = {};
    planetCardCache.set(cacheKey, { cachedAt: Date.now(), payload });
    return payload;
  }
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
app.use(express.static(path.join(projectRoot, 'public'), { index: false }));
app.use('/assets', express.static(path.join(projectRoot, 'assets')));
app.use('/public/assets', express.static(path.join(projectRoot, 'public', 'assets')));

app.get('/favicon.ico', (_req, res) => {
  res.status(204).end();
});

function readUsersWithSecrets() {
  return db.prepare(`
    SELECT
      id,
      username,
      password_hash AS passwordHash,
      role,
      can_coordinate_4th_fleet AS canCoordinate4thFleet,
      senate_position AS senatePosition,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM users
    ORDER BY username COLLATE NOCASE
  `).all();
}

function createSession(user) {
  const token = crypto.randomUUID();
  sessions.set(token, {
    id: user.id,
    username: user.username,
    role: user.role,
    canCoordinate4thFleet: Boolean(user.canCoordinate4thFleet),
    senatePosition: user.senatePosition || ''
  });
  return token;
}

function refreshUserSessions(userId, user) {
  sessions.forEach((session, token) => {
    if (session.id !== userId) return;
    sessions.set(token, {
      ...session,
      username: user.username,
      role: user.role,
      canCoordinate4thFleet: Boolean(user.canCoordinate4thFleet),
      senatePosition: user.senatePosition || ''
    });
  });
}

function getSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  return token ? sessions.get(token) || null : null;
}

function canManageLogins(role) {
  return ['global', 'admin', 'faction-admin'].includes(LOGIN_ROLE_DEFINITIONS[role]?.level);
}

function canManageRadioPermissions(role) {
  if (role === 'Admin') return true;
  return role === 'Republic Navy Admin';
}

function listUsersForActor(actor) {
  const users = listUsers(db);
  const actorDefinition = LOGIN_ROLE_DEFINITIONS[actor?.role];
  if (actorDefinition?.level === 'global') return users;
  if (!canManageLogins(actor?.role)) return [];
  return users.filter((user) => LOGIN_ROLE_DEFINITIONS[user.role]?.faction === actorDefinition.faction);
}

function listRadioPermissionsForActor(actor) {
  if (!canManageRadioPermissions(actor?.role)) return [];
  return listRadioCommandPermissions(db);
}

function listRadioAuditForActor(actor, limit = 200) {
  if (!canManageRadioPermissions(actor?.role)) return [];
  return listRadioCommandLogs(db, limit);
}

function buildRadioCommandAdminPayload(actor) {
  const { state } = readCampaignState(db);
  const radioConfig = getDiscordRadioConfig();
  const users = listUsersForActor(actor);
  const fleets = (Array.isArray(state?.fleets) ? state.fleets : [])
    .filter((fleet) => String(fleet?.faction || '').trim().toUpperCase() === 'GAR')
    .map((fleet) => ({
      id: fleet.id,
      name: fleet.name || fleet.id,
      faction: fleet.faction || ''
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
  return {
    permissions: listRadioPermissionsForActor(actor),
    audit: listRadioAuditForActor(actor),
    users,
    fleets,
    radioConfig: {
      enabled: radioConfig.enabled,
      channelId: radioConfig.channelId,
      pollMs: radioConfig.pollMs,
      tokenLoaded: Boolean(radioConfig.botToken)
    }
  };
}

function sanitizeStateForRole(state, actor) {
  return {
    ...state,
    authUsers: listUsersForActor(actor)
  };
}

function createEmptyFactionResources() {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
}

function getPlanetResourceSlotsFromState(state, planetId) {
  const slots = state?.planetResources?.[planetId];
  const normalized = Array.isArray(slots)
    ? slots.slice(0, 10).map((slot) => (INFRASTRUCTURE_KEYS.includes(slot) ? slot : ''))
    : [];
  while (normalized.length < 10) normalized.push('');
  return normalized;
}

function getFactionProductionRateFromState(state, faction = 'GAR') {
  const totals = createEmptyFactionResources();
  for (const planet of Array.isArray(state?.planets) ? state.planets : []) {
    if (planet?.owner !== faction) continue;
    const base = createEmptyFactionResources();
    const bonuses = createEmptyFactionResources();
    const civilianProduction = [];
    for (const slot of getPlanetResourceSlotsFromState(state, planet.id)) {
      if (!slot) continue;
      const productionResource = INFRASTRUCTURE_PRODUCTION_RESOURCES[slot];
      if (productionResource) base[productionResource] += 1;
      if (CIVILIAN_CREDIT_YIELDS[slot]) civilianProduction.push(CIVILIAN_CREDIT_YIELDS[slot]);
      for (const key of RESOURCE_KEYS) {
        bonuses[key] += Number(CIVILIAN_INFRASTRUCTURE_BONUSES[slot]?.[key] || 0);
      }
    }
    for (const key of RAW_RESOURCE_KEYS) {
      totals[key] += base[key] * (1 + Math.min(MAX_CIVILIAN_PRODUCTION_BONUS, bonuses[key]));
    }
    const sectorName = String(planet?.sector || '').trim();
    totals.credits += civilianProduction.reduce((sum, entry) => {
      const boostedAmount = 1 * (1 + Math.min(MAX_CIVILIAN_PRODUCTION_BONUS, bonuses[entry.resource] || 0));
      return sum + calculateCivilianMineYield(db, sectorName, entry.resource, boostedAmount, state, {
        additionalMultiplier: 1
      });
    }, 0);
  }
  for (const key of RESOURCE_KEYS) {
    totals[key] = Math.round(totals[key] * 100) / 100;
  }
  return totals;
}

function applyOneTimeResourceReset(previousState, now = Date.now()) {
  const nextState = JSON.parse(JSON.stringify(previousState || {}));
  nextState.meta = nextState.meta || {};
  nextState.resources = nextState.resources || {};
  if (nextState.meta.resourceResetVersion === RESOURCE_RESET_VERSION) {
    RESOURCE_FACTIONS.forEach((faction) => {
      nextState.resources[faction] = {
        ...createEmptyFactionResources(),
        ...(nextState.resources[faction] || {})
      };
    });
    nextState.lastResourceTickAt = Number(nextState.lastResourceTickAt) || now;
    return { changed: false, state: nextState };
  }
  RESOURCE_FACTIONS.forEach((faction) => {
    nextState.resources[faction] = createEmptyFactionResources();
  });
  nextState.lastResourceTickAt = now;
  nextState.meta.resourceResetVersion = RESOURCE_RESET_VERSION;
  return { changed: true, state: nextState };
}

function applyServerProductionTicks(previousState, now = Date.now()) {
  const nextState = JSON.parse(JSON.stringify(previousState || {}));
  nextState.resources = nextState.resources || {};
  RESOURCE_FACTIONS.forEach((faction) => {
    nextState.resources[faction] = {
      ...createEmptyFactionResources(),
      ...(nextState.resources[faction] || {})
    };
  });
  const lastTick = Number(nextState.lastResourceTickAt) || now;
  const elapsed = Math.max(0, now - lastTick);
  const ticks = Math.floor(elapsed / RESOURCE_PRODUCTION_TICK_MS);
  if (ticks <= 0) {
    nextState.lastResourceTickAt = lastTick;
    return { changed: false, ticks: 0, state: nextState };
  }
  RESOURCE_FACTIONS.forEach((faction) => {
    const rate = getFactionProductionRateFromState(nextState, faction);
    const policy = readMarketSnapshot(db).policy;
    const currentCredits = Number(nextState.resources[faction].credits || 0);
    const inflationRate = faction === 'GAR' ? Math.min(0.25, currentCredits / 2000000) : 0;
    const taxRate = faction === 'GAR' ? Math.min(0.25, Math.max(0, Number(policy.taxRate || 0))) : 1;
    if (faction === 'GAR' && policy.subsidy === 'civilian') rate.credits *= 1.10;
    if (faction === 'GAR' && policy.subsidy === 'logistics') rate.credits *= 1.05;
    if (faction === 'GAR' && policy.subsidy === 'research') rate.agrinium *= 1.10;
    rate.credits = rate.credits * taxRate * (1 - (inflationRate * 0.5));
    for (const key of RESOURCE_KEYS) {
      nextState.resources[faction][key] = Math.round((
        Number(nextState.resources[faction][key] || 0) + (Number(rate[key] || 0) * ticks)
      ) * 100) / 100;
    }
  });
  nextState.lastResourceTickAt = lastTick + (ticks * RESOURCE_PRODUCTION_TICK_MS);
  nextState.meta = nextState.meta || {};
  nextState.meta.economy = {
    inflationRate: Math.min(0.25, Number(nextState.resources.GAR?.credits || 0) / 2000000),
    taxRate: Number(readMarketSnapshot(db).policy.taxRate || 0),
    subsidy: readMarketSnapshot(db).policy.subsidy || 'none',
    updatedAt: new Date(now).toISOString()
  };
  return { changed: true, ticks, state: nextState };
}

function applyOwnerFrontlineImagePass(previousState) {
  const nextState = JSON.parse(JSON.stringify(previousState || {}));
  nextState.meta = nextState.meta || {};
  const planets = Array.isArray(nextState.planets) ? nextState.planets : [];
  let changed = false;
  for (const planet of planets) {
    if (!planet?.id) continue;
    const referenceMatch = getPlanetOwnershipReferenceMatch(planet);
    const isListed = Boolean(referenceMatch?.owner);
    if (Boolean(planet.referenceListed) !== isListed) {
      planet.referenceListed = isListed;
      changed = true;
    }
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

function requireLoginManager(req, res, next) {
  if (!req.user || !canManageLogins(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function requireRadioPermissionManager(req, res, next) {
  if (!req.user || !canManageRadioPermissions(req.user.role)) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  next();
}

function requireSenateEconomyManager(req, res, next) {
  if (!req.user || !['Admin', 'Galaktischer Senats Admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Nur Senats-Admins oder globale Admins dürfen den GAR-Haushalt verwalten.' });
  }
  next();
}

function canBuySectorCivilianResources(user) {
  if (!user?.id) return false;
  return ['Admin', 'Republic Navy Admin', 'Galaktischer Senats Admin', 'Senat'].includes(user.role);
}

function requireSectorCivilianBuyer(req, res, next) {
  if (!canBuySectorCivilianResources(req.user)) {
    return res.status(403).json({ error: 'Nur Navy-Admins und Senatsmitglieder dürfen zivile Ressourcen einkaufen.' });
  }
  next();
}

function requireSectorEmbargoManager(req, res, next) {
  if (!req.user || req.user.role !== 'Admin') {
    return res.status(403).json({ error: 'Nur globale Admins dürfen Sektor-Embargos setzen.' });
  }
  next();
}

function hasPersonalMarketPortfolio(user) {
  const definition = LOGIN_ROLE_DEFINITIONS[user?.role];
  return Boolean(user?.id && definition?.level === 'member' && definition.faction !== 'system');
}

function getMarketConsumerKey(req) {
  const address = String(req.ip || req.socket?.remoteAddress || 'unknown').trim();
  return crypto.createHash('sha256').update(address).digest('hex');
}

function getMarketFactionAccountKey(role) {
  const faction = LOGIN_ROLE_DEFINITIONS[role]?.faction;
  if (faction === 'blackSun') return 'BLACK_SUN';
  if (faction === 'pyke') return 'PYKE';
  if (faction === 'hutts') return 'HUTT';
  if (faction === 'senate' || faction === 'navy') return 'GAR';
  if (faction === 'event') return 'KUS';
  return '';
}

function getAnonymousInvestorId(req, res) {
  const cookieName = 'gcb_market_investor';
  const existing = String(req.cookies?.[cookieName] || '');
  const investorId = /^[0-9a-f-]{36}$/i.test(existing) ? existing : crypto.randomUUID();
  if (investorId !== existing) {
    res.cookie(cookieName, investorId, {
      httpOnly: true,
      sameSite: 'lax',
      secure: req.secure,
      maxAge: 365 * 24 * 60 * 60 * 1000,
      path: '/'
    });
  }
  return investorId;
}

function sanitizeAdminRole(rawRole) {
  const role = String(rawRole || '').trim();
  return LOGIN_ROLES.includes(role) ? role : 'Viewer';
}

function canActorAssignRole(actor, role) {
  const actorDefinition = LOGIN_ROLE_DEFINITIONS[actor?.role];
  const roleDefinition = LOGIN_ROLE_DEFINITIONS[role];
  if (!actorDefinition || !roleDefinition) return false;
  if (actorDefinition.level === 'global') return true;
  if (actorDefinition.faction !== roleDefinition.faction) return false;
  return ['admin', 'faction-admin'].includes(actorDefinition.level)
    && ['admin', 'faction-admin', 'member'].includes(roleDefinition.level);
}

function canActorManageUser(actor, targetUser) {
  return Boolean(targetUser && canActorAssignRole(actor, targetUser.role));
}

function validateAdminUserInput(body) {
  const username = String(body?.username || '').trim();
  const password = String(body?.password || '');
  const role = sanitizeAdminRole(body?.role);
  const roleDefinition = LOGIN_ROLE_DEFINITIONS[role];
  const canCoordinate4thFleet = roleDefinition?.faction === 'navy' && Boolean(body?.canCoordinate4thFleet);
  const allowedSenatePositions = ['Vizekanzler', 'Regierungsdirektor', 'Minister', 'Vizeminister'];
  const requestedSenatePosition = String(body?.senatePosition || '').trim();
  const senatePosition = roleDefinition?.faction === 'senate' && allowedSenatePositions.includes(requestedSenatePosition)
    ? requestedSenatePosition
    : '';

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

  return { username, password, role, canCoordinate4thFleet, senatePosition };
}

function validateRadioPermissionInput(body) {
  const ingameName = String(body?.ingameName || '').trim();
  const linkedUserId = String(body?.linkedUserId || '').trim();
  const fleets = Array.isArray(body?.fleets)
    ? body.fleets.map((fleet) => ({
      fleetId: String(fleet?.fleetId || '').trim(),
      fleetName: String(fleet?.fleetName || '').trim()
    })).filter((fleet) => fleet.fleetId && fleet.fleetName)
    : [];

  if (!ingameName) {
    const error = new Error('Ingame-Name darf nicht leer sein.');
    error.status = 400;
    throw error;
  }

  if (!RADIO_PERMISSION_ROLES.includes(permissionRole)) {
    const error = new Error('UngÃ¼ltige Befehlsrolle.');
    error.status = 400;
    throw error;
  }

  const linkedUser = linkedUserId ? listUsers(db).find((user) => user.id === linkedUserId) : null;
  if (linkedUserId && !linkedUser) {
    const error = new Error('VerknÃ¼pfter Website-Login wurde nicht gefunden.');
    error.status = 400;
    throw error;
  }

  const permissionRole = ['Admin', 'Republic Navy Admin'].includes(linkedUser?.role)
    ? 'admiralty'
    : 'fleet_officer';

  return {
    ingameName,
    linkedUserId: linkedUser?.id || null,
    linkedUsername: linkedUser?.username || null,
    permissionRole,
    fleets
  };
}

function detectChangedCampaignKeys(previousState, nextState) {
  const keys = ['planets', 'fleets', 'ships', 'buildJobs', 'fleetMotions', 'resources', 'planetResources', 'lastResourceTickAt', 'meta'];
  return keys.filter((key) => JSON.stringify(previousState?.[key] ?? null) !== JSON.stringify(nextState?.[key] ?? null));
}

function createFleetAuditPayload({
  fleet,
  state,
  fromPlanetId,
  toPlanetId,
  startedAt,
  arrivesAt,
  routePlanetIds,
  actor
}) {
  return {
    fleetId: fleet.id,
    fleetName: fleet.name || fleet.id,
    faction: fleet.faction || '',
    fromPlanetId: fromPlanetId || null,
    fromPlanetName: getPlanetNameById(state, fromPlanetId),
    toPlanetId: toPlanetId || null,
    toPlanetName: getPlanetNameById(state, toPlanetId),
    startedAt: startedAt || new Date().toISOString(),
    arrivesAt: arrivesAt || null,
    routePlanetIds: Array.isArray(routePlanetIds) ? routePlanetIds : [],
    source: 'website',
    actorUsername: actor?.username || '',
    actorUserId: actor?.id || ''
  };
}
function stampFleetLastMove(fleet, actor, fromPlanetId, toPlanetId, movedAtIso) {
  if (!fleet || !actor) return;
  fleet.lastMovedBy = actor.username || '';
  fleet.lastMovedByUserId = actor.id || '';
  fleet.lastMovedAt = movedAtIso;
  fleet.lastMoveFromPlanetId = fromPlanetId || null;
  fleet.lastMoveToPlanetId = toPlanetId || null;
}

function buildFleetAuditEntries(previousState, nextState, actor) {
  const previousFleets = new Map((Array.isArray(previousState?.fleets) ? previousState.fleets : []).map((fleet) => [fleet.id, fleet]));
  const auditEntries = [];

  for (const nextFleet of Array.isArray(nextState?.fleets) ? nextState.fleets : []) {
    const previousFleet = previousFleets.get(nextFleet.id);
    if (!previousFleet) continue;

    const previousPlanetId = getFleetPlanetId(previousFleet);
    const nextPlanetId = getFleetPlanetId(nextFleet);
    const previousMotion = getFleetMotionByFleetId(previousState, nextFleet.id);
    const nextMotion = getFleetMotionByFleetId(nextState, nextFleet.id);
    const movementRecordedAt = new Date().toISOString();

    const motionChanged = JSON.stringify(previousMotion || null) !== JSON.stringify(nextMotion || null);
    if (nextMotion && motionChanged) {
      const startedAt = getFleetMotionStartedAtIso(nextMotion, movementRecordedAt);
      const fromPlanetId = String(nextMotion.sourcePlanetId || previousPlanetId || '').trim();
      const toPlanetId = String(nextMotion.targetPlanetId || nextPlanetId || '').trim();
      stampFleetLastMove(nextFleet, actor, fromPlanetId, toPlanetId, startedAt);
      auditEntries.push({
        actorUserId: actor.id,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'fleet.jump.started',
        entityType: 'fleet',
        entityId: nextFleet.id,
        payload: createFleetAuditPayload({
          fleet: nextFleet,
          state: nextState,
          fromPlanetId,
          toPlanetId,
          startedAt,
          arrivesAt: getFleetMotionArrivalIso(nextMotion),
          routePlanetIds: Array.isArray(nextMotion.routePlanetIds) ? nextMotion.routePlanetIds : [],
          actor
        })
      });
    }

    if (previousPlanetId !== nextPlanetId) {
      stampFleetLastMove(nextFleet, actor, previousPlanetId, nextPlanetId, movementRecordedAt);
      auditEntries.push({
        actorUserId: actor.id,
        actorUsername: actor.username,
        actorRole: actor.role,
        action: 'fleet.moved',
        entityType: 'fleet',
        entityId: nextFleet.id,
        payload: createFleetAuditPayload({
          fleet: nextFleet,
          state: nextState,
          fromPlanetId: previousPlanetId,
          toPlanetId: nextPlanetId,
          startedAt: movementRecordedAt,
          arrivesAt: null,
          routePlanetIds: [],
          actor
        })
      });
    }
  }

  return auditEntries;
}

function broadcastCampaignChange(payload) {
  io.emit('campaign:state-changed', payload);
}

app.get('/api/bootstrap', (req, res) => {
  const session = getSession(req);
  const me = session || { id: null, username: '', role: 'Viewer' };
  const { state, revision, updatedAt } = readCampaignState(db);
  const resetResult = applyOneTimeResourceReset(state);
  const productionResult = applyServerProductionTicks(resetResult.state);
  const ownerPassResult = applyOwnerFrontlineImagePass(productionResult.state);
  const changedKeys = [];
  let effectiveState = state;
  let effectiveRevision = revision;
  let effectiveUpdatedAt = updatedAt;
  if (resetResult.changed || ownerPassResult.changed || productionResult.changed) {
    effectiveState = ownerPassResult.state;
    if (resetResult.changed) changedKeys.push('resources', 'lastResourceTickAt', 'meta');
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
    campaign: sanitizeStateForRole(effectiveState, me),
    revision: effectiveRevision,
    updatedAt: effectiveUpdatedAt
  });
});

app.get('/api/auth/me', (req, res) => {
  const session = getSession(req);
  res.json({
    user: session || { id: null, username: '', role: 'Viewer', canCoordinate4thFleet: false, senatePosition: '' }
  });
});

app.get('/api/planet-card/:planetId', async (req, res) => {
  try {
    const { state } = readCampaignState(db);
    const planetId = String(req.params.planetId || '').trim();
    const planet = Array.isArray(state?.planets)
      ? state.planets.find((entry) => String(entry?.id || '').trim() === planetId)
      : null;
    if (!planet) {
      return res.status(404).json({ error: 'planet_not_found' });
    }
    const payload = await resolvePlanetCardData(planet);
    return res.json(payload);
  } catch (error) {
    console.error('Planet card endpoint failed', error);
    return res.status(500).json({ error: 'planet_card_failed' });
  }
});

app.get('/api/economy/market', (req, res) => {
  try {
    const session = getSession(req);
    const portfolioEnabled = hasPersonalMarketPortfolio(session);
    const investorId = portfolioEnabled ? `user_${session.id}` : '';
    const consumerKey = session ? '' : getMarketConsumerKey(req);
    const { state } = readCampaignState(db);
    const inflationRate = Math.min(0.25, Number(state.resources?.GAR?.credits || 0) / 2000000);
    try {
      runMarketTick(db, inflationRate, Date.now(), state);
    } catch (tickError) {
      console.error('Economy market tick failed', tickError);
    }
    const snapshot = readMarketSnapshot(db, investorId, session?.id || '');
    const factionAccounts = {
      ...snapshot.factionAccounts,
      GAR: {
        faction: 'GAR',
        credits: Number(state.resources?.GAR?.credits || 0),
        updatedAt: new Date().toISOString()
      },
      KUS: {
        faction: 'KUS',
        credits: Number(state.resources?.KUS?.credits || 0),
        updatedAt: new Date().toISOString()
      }
    };
    res.json({
      ...snapshot,
      factionAccounts,
      portfolioEnabled,
      consumerMode: !session,
      canPurchase: portfolioEnabled || !session,
      factionAccountKey: getMarketFactionAccountKey(session?.role),
      inflationRate,
      nextPurchaseAt: consumerKey ? getConsumerNextPurchaseAt(db, consumerKey) : null
    });
  } catch (error) {
    console.error('Economy market endpoint failed', error);
    res.status(error.status || 500).json({ error: error.message || 'Wirtschaftsdaten konnten nicht geladen werden.' });
  }
});

app.get('/api/economy/sectors', (req, res) => {
  try {
    const { state } = readCampaignState(db);
    const inflationRate = Math.min(0.25, Number(state.resources?.GAR?.credits || 0) / 2000000);
    try {
      runMarketTick(db, inflationRate, Date.now(), state);
    } catch (tickError) {
      console.error('Sector economy tick failed', tickError);
    }
    res.json({
      sectors: listEconomySectors(db, state),
      canBuyResources: canBuySectorCivilianResources(getSession(req)),
      canManageEmbargo: getSession(req)?.role === 'Admin'
    });
  } catch (error) {
    console.error('Sector economy list endpoint failed', error);
    res.status(error.status || 500).json({ error: error.message || 'Sektor-Wirtschaft konnte nicht geladen werden.' });
  }
});

app.get('/api/economy/sectors/:sectorId', (req, res) => {
  try {
    const { state } = readCampaignState(db);
    const inflationRate = Math.min(0.25, Number(state.resources?.GAR?.credits || 0) / 2000000);
    try {
      runMarketTick(db, inflationRate, Date.now(), state);
    } catch (tickError) {
      console.error('Sector economy detail tick failed', tickError);
    }
    res.json({
      sector: readEconomySector(db, state, req.params.sectorId),
      canBuyResources: canBuySectorCivilianResources(getSession(req)),
      canManageEmbargo: getSession(req)?.role === 'Admin'
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Sektor-Wirtschaft konnte nicht geladen werden.' });
  }
});

app.get('/api/economy/sectors/:sectorId/holdings', (req, res) => {
  try {
    const { state } = readCampaignState(db);
    res.json({ holdings: readEconomySectorHoldings(db, state, req.params.sectorId) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Sektor-Holdings konnten nicht geladen werden.' });
  }
});

app.get('/api/economy/portfolio', requireAuth, (req, res) => {
  try {
    if (!hasPersonalMarketPortfolio(req.user)) {
      return res.status(403).json({ error: 'Diese Rolle besitzt kein persönliches Portfolio.' });
    }
    res.json({ portfolio: readPortfolio(db, `user_${req.user.id}`, req.user.id) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Portfolio konnte nicht geladen werden.' });
  }
});

app.get('/api/economy/portfolio/history', requireAuth, (req, res) => {
  try {
    if (!hasPersonalMarketPortfolio(req.user)) {
      return res.status(403).json({ error: 'Diese Rolle besitzt kein persönliches Portfolio.' });
    }
    res.json({ history: readPortfolioHistory(db, `user_${req.user.id}`, String(req.query?.range || 'today')) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Portfolio-Historie konnte nicht geladen werden.' });
  }
});

app.get('/api/economy/companies/:companyId/ownership', (req, res) => {
  try {
    res.json({ ownership: readCompanyOwnership(db, String(req.params.companyId || '')) });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Anteilseigner konnten nicht geladen werden.' });
  }
});

app.post('/api/economy/sectors/:sectorId/buy-resource', requireAuth, requireSectorCivilianBuyer, (req, res) => {
  try {
    const { state, revision } = readCampaignState(db);
    const result = buyCivilianSectorResource(db, state, {
      sectorId: req.params.sectorId,
      resourceType: String(req.body?.resourceType || ''),
      quantity: Number(req.body?.quantity || 0),
      buyerRole: req.user.role,
      buyerName: req.user.senatePosition || req.user.username || req.user.role,
      buyerAccount: 'GAR'
    });
    const updatedAt = writeCampaignState(db, result.state, revision + 1);
    broadcastCampaignChange({
      state: result.state,
      revision: revision + 1,
      updatedAt,
      changedKeys: ['resources']
    });
    res.json({
      ok: true,
      purchase: result.purchase,
      sector: readEconomySector(db, result.state, req.params.sectorId)
    });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Ressourcenkauf fehlgeschlagen.' });
  }
});

app.post('/api/economy/sectors/:sectorId/embargo', requireAuth, requireSectorEmbargoManager, (req, res) => {
  try {
    const { state } = readCampaignState(db);
    const sector = setSectorEmbargo(db, state, {
      sectorId: req.params.sectorId,
      isEmbargoed: Boolean(req.body?.isEmbargoed),
      actor: req.user.username
    });
    res.json({ ok: true, sector });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Embargo konnte nicht aktualisiert werden.' });
  }
});

app.post('/api/economy/market/buy', (req, res) => {
  const session = getSession(req);
  const portfolioEnabled = hasPersonalMarketPortfolio(session);
  if (session && !portfolioEnabled) {
    return res.status(403).json({ error: 'Diese Admin-Rolle besitzt kein persönliches Portfolio.' });
  }
  const investorId = portfolioEnabled ? `user_${session.id}` : '';
  const consumerKey = portfolioEnabled ? '' : getMarketConsumerKey(req);
  try {
    const purchase = purchaseMarketDemand(db, {
      investorId,
      userId: session?.id || '',
      consumerKey,
      companyId: String(req.body?.companyId || ''),
      quantity: portfolioEnabled ? Number(req.body?.quantity || 1) : 1
    });
    res.json({
      ok: true,
      purchase,
      market: readMarketSnapshot(db, investorId, session?.id || '')
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Aktienkauf fehlgeschlagen.',
      nextPurchaseAt: error.nextPurchaseAt || null
    });
  }
});

app.post('/api/economy/companies/:companyId/buy', (req, res) => {
  const session = getSession(req);
  const portfolioEnabled = hasPersonalMarketPortfolio(session);
  if (session && !portfolioEnabled) {
    return res.status(403).json({ error: 'Diese Admin-Rolle besitzt kein persönliches Portfolio.' });
  }
  const investorId = portfolioEnabled ? `user_${session.id}` : '';
  const consumerKey = portfolioEnabled ? '' : getMarketConsumerKey(req);
  try {
    const purchase = purchaseMarketDemand(db, {
      investorId,
      userId: session?.id || '',
      consumerKey,
      companyId: String(req.params.companyId || ''),
      quantity: portfolioEnabled ? Number(req.body?.quantity || 1) : 1
    });
    res.json({
      ok: true,
      purchase,
      market: readMarketSnapshot(db, investorId, session?.id || '')
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Aktienkauf fehlgeschlagen.',
      nextPurchaseAt: error.nextPurchaseAt || null
    });
  }
});

app.post('/api/economy/market/sell', requireAuth, (req, res) => {
  const session = req.user;
  if (!hasPersonalMarketPortfolio(session)) {
    return res.status(403).json({ error: 'Diese Rolle besitzt kein persönliches Portfolio.' });
  }
  const investorId = `user_${session.id}`;
  try {
    const { state, revision } = readCampaignState(db);
    const sale = sellMarketShare(db, {
      investorId,
      companyId: String(req.body?.companyId || ''),
      quantity: Number(req.body?.quantity || 1)
    });
    const nextState = JSON.parse(JSON.stringify(state || {}));
    nextState.resources = nextState.resources || {};
    nextState.resources.GAR = nextState.resources.GAR || {};
    nextState.resources.GAR.credits = Number(nextState.resources.GAR.credits || 0) + Number(sale.taxAmount || 0);
    const updatedAt = writeCampaignState(db, nextState, revision + 1);
    broadcastCampaignChange({
      state: nextState,
      revision: revision + 1,
      updatedAt,
      changedKeys: ['resources']
    });
    const market = readMarketSnapshot(db, investorId, session.id);
    market.factionAccounts = {
      ...market.factionAccounts,
      GAR: {
        faction: 'GAR',
        credits: Number(nextState.resources?.GAR?.credits || 0),
        updatedAt
      }
    };
    res.json({
      ok: true,
      sale,
      market
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Aktienverkauf fehlgeschlagen.'
    });
  }
});

app.post('/api/economy/companies/:companyId/sell', requireAuth, (req, res) => {
  const session = req.user;
  if (!hasPersonalMarketPortfolio(session)) {
    return res.status(403).json({ error: 'Diese Rolle besitzt kein persönliches Portfolio.' });
  }
  const investorId = `user_${session.id}`;
  try {
    const { state, revision } = readCampaignState(db);
    const sale = sellMarketShare(db, {
      investorId,
      companyId: String(req.params.companyId || ''),
      quantity: Number(req.body?.quantity || 1)
    });
    const nextState = JSON.parse(JSON.stringify(state || {}));
    nextState.resources = nextState.resources || {};
    nextState.resources.GAR = nextState.resources.GAR || {};
    nextState.resources.GAR.credits = Number(nextState.resources.GAR.credits || 0) + Number(sale.taxAmount || 0);
    const updatedAt = writeCampaignState(db, nextState, revision + 1);
    broadcastCampaignChange({
      state: nextState,
      revision: revision + 1,
      updatedAt,
      changedKeys: ['resources']
    });
    res.json({
      ok: true,
      sale,
      market: readMarketSnapshot(db, investorId, session.id)
    });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Aktienverkauf fehlgeschlagen.'
    });
  }
});

app.put('/api/economy/policy', requireAuth, requireSenateEconomyManager, (req, res) => {
  const taxRate = Math.min(0.25, Math.max(0, Number(req.body?.taxRate || 0)));
  const allowedSubsidies = ['none', 'civilian', 'shipbuilding', 'logistics', 'research'];
  const subsidy = allowedSubsidies.includes(req.body?.subsidy) ? req.body.subsidy : 'none';
  res.json({ ok: true, policy: updateEconomyPolicy(db, { taxRate, subsidy }) });
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

  writeAuditLog(db, {
    actorUserId: user.id,
    actorUsername: user.username,
    actorRole: user.role,
    action: 'auth.login',
    entityType: 'user',
    entityId: user.id,
    payload: {
      username: user.username,
      role: user.role,
      ip: req.ip,
      userAgent: req.headers['user-agent'] || ''
    }
  });

  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: false,
    path: '/'
  });

  res.json({
    user: {
      id: user.id,
      username: user.username,
      role: user.role,
      canCoordinate4thFleet: Boolean(user.canCoordinate4thFleet),
      senatePosition: user.senatePosition || ''
    }
  });
});

app.post('/api/auth/logout', (req, res) => {
  const token = req.cookies?.[COOKIE_NAME];
  if (token) sessions.delete(token);
  res.clearCookie(COOKIE_NAME, { path: '/' });
  res.json({ ok: true });
});

app.post('/api/admin/users', requireAuth, requireLoginManager, async (req, res) => {
  try {
    const { username, password, role, canCoordinate4thFleet, senatePosition } = validateAdminUserInput(req.body);
    if (!canActorAssignRole(req.user, role)) {
      return res.status(403).json({ error: 'Diese Rolle darfst du nicht vergeben.', users: listUsersForActor(req.user) });
    }
    const existing = findUserByNormalizedUsername(db, username);
    if (existing) {
      return res.status(409).json({ error: 'Dieser Benutzername existiert bereits.', users: listUsersForActor(req.user) });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    createUser(db, { username, passwordHash, role, canCoordinate4thFleet, senatePosition });
    res.json({ ok: true, users: listUsersForActor(req.user) });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Login konnte nicht erstellt werden.',
      users: listUsersForActor(req.user)
    });
  }
});

app.patch('/api/admin/users/:id', requireAuth, requireLoginManager, async (req, res) => {
  const userId = String(req.params.id || '').trim();
  if (!userId) {
    return res.status(400).json({ error: 'UngÃ¼ltige Benutzer-ID.', users: listUsersForActor(req.user) });
  }

  try {
    const { username, password, role, canCoordinate4thFleet, senatePosition } = validateAdminUserInput(req.body);
    const targetUser = listUsers(db).find((user) => user.id === userId);
    if (!canActorManageUser(req.user, targetUser) || !canActorAssignRole(req.user, role)) {
      return res.status(403).json({ error: 'Diesen Login darfst du nicht bearbeiten.', users: listUsersForActor(req.user) });
    }
    const existing = findUserByNormalizedUsername(db, username);
    if (existing && existing.id !== userId) {
      return res.status(409).json({ error: 'Dieser Benutzername existiert bereits.', users: listUsersForActor(req.user) });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    updateUser(db, userId, { username, passwordHash, role, canCoordinate4thFleet, senatePosition });
    refreshUserSessions(userId, { username, role, canCoordinate4thFleet, senatePosition });
    res.json({ ok: true, users: listUsersForActor(req.user) });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Login konnte nicht gespeichert werden.',
      users: listUsersForActor(req.user)
    });
  }
});

app.delete('/api/admin/users/:id', requireAuth, requireLoginManager, (req, res) => {
  const userId = String(req.params.id || '').trim();
  if (!userId) {
    return res.status(400).json({ error: 'UngÃ¼ltige Benutzer-ID.', users: listUsersForActor(req.user) });
  }

  const existingUsers = listUsers(db);
  const targetUser = existingUsers.find((entry) => entry.id === userId);
  if (!targetUser) {
    return res.status(404).json({ error: 'Login nicht gefunden.', users: listUsersForActor(req.user) });
  }

  if (!canActorManageUser(req.user, targetUser)) {
    return res.status(403).json({ error: 'Diesen Login darfst du nicht lÃ¶schen.', users: listUsersForActor(req.user) });
  }

  if (String(targetUser.username || '').trim().toLowerCase() === 'admin') {
    return res.status(403).json({ error: 'Der Standard-Admin darf nicht gelÃ¶scht werden.', users: existingUsers });
  }

  deleteUser(db, userId);
  res.json({ ok: true, users: listUsersForActor(req.user) });
});

app.get('/api/admin/radio-command-center', requireAuth, requireRadioPermissionManager, (req, res) => {
  res.json({
    ok: true,
    ...buildRadioCommandAdminPayload(req.user)
  });
});

app.post('/api/admin/radio-command-permissions', requireAuth, requireRadioPermissionManager, (req, res) => {
  try {
    const input = validateRadioPermissionInput(req.body);
    createRadioCommandPermission(db, input);
    res.json({ ok: true, ...buildRadioCommandAdminPayload(req.user) });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Befehlsberechtigung konnte nicht erstellt werden.',
      ...buildRadioCommandAdminPayload(req.user)
    });
  }
});

app.patch('/api/admin/radio-command-permissions/:id', requireAuth, requireRadioPermissionManager, (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'UngÃ¼ltige Berechtigungs-ID.', ...buildRadioCommandAdminPayload(req.user) });
  }
  try {
    const input = validateRadioPermissionInput(req.body);
    updateRadioCommandPermission(db, id, input);
    res.json({ ok: true, ...buildRadioCommandAdminPayload(req.user) });
  } catch (error) {
    res.status(error.status || 500).json({
      error: error.message || 'Befehlsberechtigung konnte nicht gespeichert werden.',
      ...buildRadioCommandAdminPayload(req.user)
    });
  }
});

app.delete('/api/admin/radio-command-permissions/:id', requireAuth, requireRadioPermissionManager, (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) {
    return res.status(400).json({ error: 'UngÃ¼ltige Berechtigungs-ID.', ...buildRadioCommandAdminPayload(req.user) });
  }
  deleteRadioCommandPermission(db, id);
  res.json({ ok: true, ...buildRadioCommandAdminPayload(req.user) });
});

app.post('/api/admin/radio-command-center/poll', requireAuth, requireRadioPermissionManager, async (req, res) => {
  try {
    const result = await discordRadioListener.pollOnce();
    res.json({ ok: true, result, ...buildRadioCommandAdminPayload(req.user) });
  } catch (error) {
    res.status(500).json({
      error: error.message || 'Discord-Funk konnte nicht ausgewertet werden.',
      ...buildRadioCommandAdminPayload(req.user)
    });
  }
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
    validateNextCampaignState(req.user, previousState, nextState);

    const mergedState = {
      ...previousState,
      ...nextState,
      lastResourceTickAt: Number(nextState.lastResourceTickAt) || Number(previousState.lastResourceTickAt) || Date.now(),
      authUsers: previousState.authUsers || []
    };
    const resetResult = applyOneTimeResourceReset(mergedState);
    const effectiveMergedState = resetResult.state;
    const auditEntries = buildFleetAuditEntries(previousState, effectiveMergedState, req.user);
    const changedKeys = detectChangedCampaignKeys(previousState, effectiveMergedState);

    const nextRevision = revision + 1;
    const updatedAt = db.transaction(() => {
      const persistedAt = writeCampaignState(db, effectiveMergedState, nextRevision);
      auditEntries.forEach((entry) => writeAuditLog(db, entry));
      return persistedAt;
    })();

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

app.use('/api', (req, res) => {
  res.status(404).json({ error: `API-Route nicht gefunden: ${req.method} ${req.originalUrl}` });
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

function runServerCampaignMaintenance() {
  const { state, revision } = readCampaignState(db);
  const inflationRate = Math.min(0.25, Number(state.resources?.GAR?.credits || 0) / 2000000);
  try {
    runMarketTick(db, inflationRate, Date.now(), state);
  } catch (error) {
    console.warn('Economy maintenance tick failed', error);
  }
  const resetResult = applyOneTimeResourceReset(state);
  const productionResult = applyServerProductionTicks(resetResult.state);
  if (!resetResult.changed && !productionResult.changed) return;
  const nextRevision = revision + 1;
  const nextUpdatedAt = writeCampaignState(db, productionResult.state, nextRevision);
  broadcastCampaignChange({
    revision: nextRevision,
    updatedAt: nextUpdatedAt,
    changedKeys: resetResult.changed ? ['resources', 'lastResourceTickAt', 'meta'] : ['resources', 'lastResourceTickAt'],
    actor: {
      id: 'server',
      username: 'server',
      role: 'System'
    }
  });
}

setInterval(() => {
  try {
    runServerCampaignMaintenance();
  } catch (error) {
    console.warn('Server maintenance tick failed', error);
  }
}, 15000);

process.on('SIGINT', () => discordRadioListener.stop());
process.on('SIGTERM', () => discordRadioListener.stop());

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Galactic Campaign Board server listening on http://0.0.0.0:${PORT}`);
  console.log('Default admin login: admin / admin');
  discordRadioListener.start();
});

