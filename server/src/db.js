import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { extractDefaultData } from './extractDefaultData.js';

const RESOURCE_MARKET_CONFIG = {
  quadraniumErz: { label: 'Metalle', holdingLabel: 'Metall-Holding', basePrice: 420 },
  agrinium: { label: 'Technologien', holdingLabel: 'Technologie-Holding', basePrice: 560 },
  tibannaGas: { label: 'Treibstoffe', holdingLabel: 'Treibstoff-Holding', basePrice: 480 },
  baradium: { label: 'Chemikalien', holdingLabel: 'Chemikalien-Holding', basePrice: 450 },
  kavamSalz: { label: 'Versorgungsgueter', holdingLabel: 'Versorgungsgueter-Holding', basePrice: 360 }
};

const RESOURCE_KEYS = Object.keys(RESOURCE_MARKET_CONFIG);
const DEMAND_TICK_MS = 5 * 60 * 1000;
const INSTITUTIONAL_TICK_MS = 10 * 60 * 1000;
const ACP_HISTORY_WINDOW_MS = 183 * 24 * 60 * 60 * 1000;
const MAX_INTELLIGENCE_REPORTS = 80;
const MAX_TRADE_HISTORY_ROWS = 6000;

const MANUAL_SECTOR_NAME_MAP = {
  sector_d4anle0m: 'Kernwelten',
  sector_pm6k5bhy: 'Jaso',
  sector_ocnjl43q: 'Kailion',
  sector_r4pmaqh9: 'Moddell',
  sector_uuorxxi1: 'Immalia',
  sector_si2w2rop: 'Koradin',
  sector_pa6rxm0p: 'Fakir',
  sector_3f5j6jen: 'Bakura',
  sector_fs1aguyw: 'Ghost Nebula',
  sector_65xlnot1: 'Chiss Ascendancy',
  sector_zr2pt8ow: 'Chiss Ascendancy Ost',
  sector_kg7o3bhc: 'Senex',
  sector_oqzgmnla: 'Adari',
  sector_nnznyf1u: 'Juvex',
  sector_2xupaugv: 'Lambda',
  sector_tx4u8yni: 'Sujimis',
  sector_42tlt9nw: 'Arkanis',
  sector_rzufj9mc: 'Orus',
  sector_2u4p5w3r: 'Circarpous',
  sector_5gdyarqw: 'Fellwe',
  sector_fh4ssgam: 'Outer Jalor',
  sector_iarp8he6: 'Mytaranor',
  sector_jn7s8b8r: 'Venzeiia',
  sector_g17tba4m: 'Belasco',
  sector_y5b2uqvy: 'Harron',
  sector_58z5iob4: 'Hutt Space',
  sector_vzhu4kdl: 'Baxel',
  sector_9beoa19b: 'Bright Jewel',
  sector_q2phgqu7: 'Jalor',
  sector_z6b43usd: 'Hapes Cluster',
  sector_6paoww17: 'Japrael',
  sector_3i9vxzmr: 'Irishi',
  sector_4p3wlmxg: 'Calaron',
  sector_pcvpcp72: 'Centrality',
  sector_kosk9wdd: 'Vardoss',
  sector_yq5od42w: 'Atrivis',
  sector_pl8wxcgz: 'Rago',
  sector_n26qkyn3: 'Lahara',
  sector_5ckya7l3: 'Chubara',
  sector_h7up5ihg: 'Velcar',
  sector_rk5unz12: 'Relgim',
  sector_m1dumi12: 'Calamari',
  sector_tcj013m2: 'Maldrood',
  sector_dv1xk1xi: 'Kanz',
  sector_padd3m7f: 'Taldot',
  sector_0si6qh47: 'Romintine',
  sector_8ldu422a: 'Ash Worlds',
  sector_00xuih4q: 'Veragi',
  sector_3ktg9il3: 'Locris',
  sector_ew9cfwg8: 'Mandalore',
  sector_51m4fawy: 'Quelii',
  sector_ql2zewr1: 'Gordian Reach',
  sector_0032zetf: 'Corporate Sector',
  sector_5z29dqsz: 'Corva',
  sector_fyakxcbe: 'Kalamith',
  sector_l8gje809: 'Tynquay',
  sector_t549gd3d: 'Cronese Mandate',
  sector_76edpmoc: 'Pakuuni',
  sector_f4s8vacj: 'Bothan Space',
  sector_vj1yfx9d: 'Abrion'
};

const ECONOMY_EXCLUDED_SECTOR_NAMES = [
  'Velcar',
  'Rago',
  'Chiss Ascendancy Ost',
  'Chss Ascendancy',
  'Chiss Ascendancy',
  'Vardoss',
  'Ghost Nebula',
  'Bakura',
  'Corva'
];

const LEGACY_SECTOR_NAME_ALIASES = {
  Chubara: ['Ariarch', 'Sektor 61', 'Sector 61'],
  Tynquay: ['Sith Worlds']
};

function normalizeEconomySectorName(value) {
  return String(value || '')
    .trim()
    .toLocaleLowerCase('de')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

const ECONOMY_EXCLUDED_SECTOR_KEYS = new Set(ECONOMY_EXCLUDED_SECTOR_NAMES.map(normalizeEconomySectorName));

function isEconomyExcludedSector(sectorName) {
  return ECONOMY_EXCLUDED_SECTOR_KEYS.has(normalizeEconomySectorName(sectorName));
}

function getLegacySectorNames(sectorName, previousSectorName = '') {
  return [
    sectorName,
    previousSectorName,
    ...(LEGACY_SECTOR_NAME_ALIASES[sectorName] || [])
  ].map((name) => String(name || '').trim()).filter(Boolean);
}

const INSTITUTIONAL_INVESTOR_SEEDS = [
  { id: 'inst_igbc', name: 'InterGalactic Banking Clan', strategy: 'liquidity_trap', riskTolerance: 0.82, corruptionAffinity: 0.82, creditBalance: 880000 },
  { id: 'inst_commerce_guild', name: 'Commerce Guild', strategy: 'sector_monopoly_building', riskTolerance: 0.71, corruptionAffinity: 0.72, creditBalance: 640000 },
  { id: 'inst_techno_union', name: 'Techno Union', strategy: 'front_run_policy', riskTolerance: 0.76, corruptionAffinity: 0.76, creditBalance: 720000 },
  { id: 'inst_trade_federation', name: 'Trade Federation', strategy: 'embargo_profiteering', riskTolerance: 0.78, corruptionAffinity: 0.84, creditBalance: 790000 },
  { id: 'inst_corporate_alliance', name: 'Corporate Alliance', strategy: 'hostile_takeover', riskTolerance: 0.86, corruptionAffinity: 0.78, creditBalance: 830000 },
  { id: 'inst_republic_infra_fund', name: 'Republic Infrastructure Fund', strategy: 'infrastructure', riskTolerance: 0.62, corruptionAffinity: 0.7, creditBalance: 420000 },
  { id: 'inst_core_pension', name: 'Core Worlds Pension Trust', strategy: 'stability', riskTolerance: 0.35, corruptionAffinity: 0.2, creditBalance: 355000 },
  { id: 'inst_banking_consortium', name: 'Galactic Banking Consortium', strategy: 'speculation', riskTolerance: 0.74, corruptionAffinity: 0.55, creditBalance: 520000 },
  { id: 'inst_sector_authority', name: 'Sector Development Authority', strategy: 'regional', riskTolerance: 0.48, corruptionAffinity: 0.4, creditBalance: 280000 },
  { id: 'inst_reconstruction', name: 'War Reconstruction Fund', strategy: 'recovery', riskTolerance: 0.58, corruptionAffinity: 0.65, creditBalance: 300000 },
  { id: 'inst_logistics_cartel', name: 'Private Logistics Cartel', strategy: 'logistics', riskTolerance: 0.69, corruptionAffinity: 0.8, creditBalance: 390000 }
];

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round2(value) {
  return Math.round(Number(value || 0) * 100) / 100;
}

function average(values) {
  if (!Array.isArray(values) || !values.length) return 0;
  return values.reduce((sum, value) => sum + Number(value || 0), 0) / values.length;
}

function stableNoise(seed, amplitude = 0.05) {
  const digest = crypto.createHash('sha1').update(String(seed || '')).digest('hex');
  const value = parseInt(digest.slice(0, 8), 16) / 0xffffffff;
  return (value - 0.5) * amplitude * 2;
}

function centroidOfPoints(points) {
  if (!Array.isArray(points) || !points.length) return { x: 0, y: 0 };
  const total = points.reduce((accumulator, point) => ({
    x: accumulator.x + Number(point?.x || 0),
    y: accumulator.y + Number(point?.y || 0)
  }), { x: 0, y: 0 });
  return {
    x: total.x / points.length,
    y: total.y / points.length
  };
}

function distanceBetween(left, right) {
  return Math.hypot(Number(left?.x || 0) - Number(right?.x || 0), Number(left?.y || 0) - Number(right?.y || 0));
}

function getMarketResourceConfig(resourceKey) {
  return RESOURCE_MARKET_CONFIG[resourceKey] || null;
}

function mapSectorControlStatus(sector) {
  const ownerCounts = sector?.ownerCounts instanceof Map ? sector.ownerCounts : new Map();
  const total = [...ownerCounts.values()].reduce((sum, value) => sum + Number(value || 0), 0);
  const gar = Number(ownerCounts.get('GAR') || 0);
  const kus = Number(ownerCounts.get('KUS') || 0);
  if (total <= 0) return 'Neutral';
  if (gar > 0 && kus > 0) return 'Umkämpft';
  if (gar > 0 && gar >= total * 0.6) return 'BLUFOR';
  if (kus > 0 && kus >= total * 0.6) return 'OPFOR';
  if ((sector?.dominantOwner || '') === 'GAR') return 'BLUFOR';
  if ((sector?.dominantOwner || '') === 'KUS') return 'OPFOR';
  return 'Neutral';
}

function mapEconomyStateFromMultiplier(multiplier) {
  const value = Number(multiplier || 1);
  if (value >= 1.18) return 'Boom';
  if (value >= 1.06) return 'Wachstum';
  if (value <= 0.82) return 'Rezession';
  if (value <= 0.94) return 'Abschwung';
  return 'Normal';
}

function parseResourceRefs(company) {
  const parsed = safeJsonParse(company?.resourceRefsJson || company?.resource_refs_json, []);
  const refs = Array.isArray(parsed) ? parsed.filter((key) => RESOURCE_KEYS.includes(key)) : [];
  if (refs.length) return [...new Set(refs)];
  return RESOURCE_KEYS.includes(company?.resourceKey || company?.resource_key) ? [company.resourceKey || company.resource_key] : [];
}

function normalizeMarketStatus(status) {
  const allowed = new Set(['tradeable', 'embargo', 'suspended', 'takeover', 'insolvent']);
  return allowed.has(status) ? status : 'tradeable';
}

function displayMarketStatus(status) {
  return ({
    tradeable: 'Handelbar',
    embargo: 'Embargo',
    suspended: 'Ausgesetzt',
    takeover: 'Übernahme läuft',
    insolvent: 'Insolvent'
  })[normalizeMarketStatus(status)] || 'Handelbar';
}

function getHoldingCompanyId(sectorName, resourceKey) {
  const digest = crypto.createHash('sha1').update(`${sectorName}:${resourceKey}`).digest('hex');
  return `sector_holding_${digest.slice(0, 16)}`;
}

function getHoldingSymbol(sectorName, resourceKey) {
  const digest = crypto.createHash('sha1').update(`${sectorName}:${resourceKey}`).digest('hex');
  return `S${digest.slice(0, 7).toUpperCase()}`;
}

function buildCanonicalManualSectors(campaignState) {
  return (campaignState?.meta?.manualSectors || []).map((sector) => ({
    ...sector,
    name: String(MANUAL_SECTOR_NAME_MAP[sector?.id] || sector?.name || '').trim()
  })).filter((sector) => sector.name);
}

function summarizeSectorSlots(state, planetIds) {
  const summary = {
    civilianSlots: 0,
    militarySlots: 0,
    developmentSlots: 0,
    activeMineProjects: 0,
    activeShipProjects: 0,
    fleetPresence: 0,
    production: Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]))
  };
  const slotMap = state?.planetResources || {};
  planetIds.forEach((planetId) => {
    const slots = Array.isArray(slotMap?.[planetId]) ? slotMap[planetId] : [];
    slots.forEach((slot) => {
      if (!slot) return;
      if (RESOURCE_KEYS.includes(slot)) {
        summary.militarySlots += 1;
        summary.production[slot] += 1;
        return;
      }
      if (slot.startsWith('civilian_')) {
        summary.civilianSlots += 1;
        const resourceKey = slot.replace('civilian_', '');
        if (RESOURCE_KEYS.includes(resourceKey)) summary.production[resourceKey] += 1;
        return;
      }
      summary.developmentSlots += 1;
    });
  });
  const jobs = Array.isArray(state?.buildJobs) ? state.buildJobs : [];
  jobs.forEach((job) => {
    const locationId = job?.buildLocationPlanetId || job?.locationId;
    if (!planetIds.has(locationId)) return;
    if (job?.status !== 'building') return;
    if (job?.jobType === 'mine') summary.activeMineProjects += 1;
    else summary.activeShipProjects += 1;
  });
  const fleets = Array.isArray(state?.fleets) ? state.fleets : [];
  fleets.forEach((fleet) => {
    if (planetIds.has(fleet?.locationId || fleet?.planetId)) summary.fleetPresence += 1;
  });
  return summary;
}

function buildSectorMembership(state, manualSectors) {
  const planets = Array.isArray(state?.planets) ? state.planets : [];
  return manualSectors.map((sector) => {
    const points = Array.isArray(sector?.points) ? sector.points : [];
    const sectorPlanets = planets.filter((planet) => pointInPolygon({ x: Number(planet?.x), y: Number(planet?.y) }, points));
    const planetIds = new Set(sectorPlanets.map((planet) => planet.id));
    const ownerCounts = new Map();
    sectorPlanets.forEach((planet) => {
      const owner = String(planet?.owner || 'NEUTRAL').trim() || 'NEUTRAL';
      ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1);
    });
    const dominantOwner = [...ownerCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || 'NEUTRAL';
    return {
      id: String(sector.id || sector.name),
      name: sector.name,
      points,
      centroid: centroidOfPoints(points),
      planets: sectorPlanets,
      planetIds,
      ownerCounts,
      dominantOwner,
      slotSummary: summarizeSectorSlots(state, planetIds)
    };
  });
}

function buildNeighborMap(sectors, limit = 4) {
  const map = new Map();
  sectors.forEach((sector) => {
    const neighbors = sectors
      .filter((candidate) => candidate.id !== sector.id)
      .map((candidate) => ({ id: candidate.id, distance: distanceBetween(sector.centroid, candidate.centroid) }))
      .sort((left, right) => left.distance - right.distance)
      .slice(0, limit)
      .map((entry) => entry.id);
    map.set(sector.id, neighbors);
  });
  return map;
}

function buildAcpSnapshot(companies, historyRows) {
  const currentByResource = {};
  RESOURCE_KEYS.forEach((resourceKey) => {
    const resourceCompanies = companies.filter((company) => company.resourceKey === resourceKey);
    currentByResource[resourceKey] = {
      resourceKey,
      label: RESOURCE_MARKET_CONFIG[resourceKey].label,
      averagePrice: round2(average(resourceCompanies.map((company) => Number(company.currentPrice || 0)))),
      averageBasePrice: round2(average(resourceCompanies.map((company) => Number(company.basePrice || 0)))),
      companyCount: resourceCompanies.length
    };
  });
  const groupedHistory = {};
  historyRows.forEach((row) => {
    const resourceKey = row.resourceKey;
    if (!RESOURCE_KEYS.includes(resourceKey)) return;
    const bucketDate = new Date(row.recordedAt);
    bucketDate.setUTCMinutes(0, 0, 0);
    const bucketKey = bucketDate.toISOString();
    if (!groupedHistory[resourceKey]) groupedHistory[resourceKey] = new Map();
    if (!groupedHistory[resourceKey].has(bucketKey)) groupedHistory[resourceKey].set(bucketKey, []);
    groupedHistory[resourceKey].get(bucketKey).push(Number(row.price || 0));
  });
  const history = {};
  RESOURCE_KEYS.forEach((resourceKey) => {
    history[resourceKey] = [...(groupedHistory[resourceKey]?.entries() || [])]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([recordedAt, values]) => ({ recordedAt, price: round2(average(values)) }));
  });
  return {
    current: Object.values(currentByResource),
    history
  };
}
function pointInPolygon(point, polygon) {
  if (!point || !Array.isArray(polygon) || polygon.length < 3) return false;
  let inside = false;
  for (let index = 0, previous = polygon.length - 1; index < polygon.length; previous = index, index += 1) {
    const currentPoint = polygon[index];
    const previousPoint = polygon[previous];
    if (!currentPoint || !previousPoint) continue;
    const intersects = ((currentPoint.y > point.y) !== (previousPoint.y > point.y))
      && (point.x < ((previousPoint.x - currentPoint.x) * (point.y - currentPoint.y)) / ((previousPoint.y - currentPoint.y) || Number.EPSILON) + currentPoint.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function resolveManualSectorName(planet, manualSectors) {
  if (!planet || !Array.isArray(manualSectors) || !manualSectors.length) return '';
  const point = {
    x: Number(planet.x),
    y: Number(planet.y)
  };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return '';
  for (const sector of manualSectors) {
    const name = String(sector?.name || '').trim();
    const polygon = Array.isArray(sector?.points) ? sector.points : [];
    if (!name || polygon.length < 3) continue;
    if (pointInPolygon(point, polygon)) return name;
  }
  return '';
}

export function createDb(projectRoot) {
  // 🔥 FIX: benutze process.cwd() statt projectRoot
  const dbPath = path.join(process.cwd(), 'server', 'data.sqlite');

  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS app_state (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      revision INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL,
      can_coordinate_4th_fleet INTEGER NOT NULL DEFAULT 0,
      senate_position TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      actor_user_id TEXT,
      actor_username TEXT,
      actor_role TEXT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id TEXT,
      payload_json TEXT,
      created_at TEXT NOT NULL,
      dispatched_at TEXT
    );

    CREATE TABLE IF NOT EXISTS radio_command_permissions (
      id TEXT PRIMARY KEY,
      ingame_name TEXT NOT NULL,
      normalized_ingame_name TEXT NOT NULL UNIQUE,
      linked_user_id TEXT,
      linked_username TEXT,
      permission_role TEXT NOT NULL,
      fleets_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS radio_command_log (
      id TEXT PRIMARY KEY,
      discord_message_id TEXT NOT NULL,
      actor_ingame_name TEXT,
      matched_user_id TEXT,
      matched_username TEXT,
      target_fleet_id TEXT,
      target_fleet_name TEXT,
      target_planet_id TEXT,
      target_planet_name TEXT,
      command_type TEXT,
      status TEXT NOT NULL,
      reason TEXT,
      original_message TEXT NOT NULL,
      payload_json TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_companies (
      id TEXT PRIMARY KEY,
      symbol TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      faction TEXT NOT NULL,
      sector TEXT NOT NULL DEFAULT '',
      resource_key TEXT NOT NULL DEFAULT '',
      base_price REAL NOT NULL,
      current_price REAL NOT NULL,
      previous_price REAL NOT NULL,
      total_shares INTEGER,
      free_float_shares INTEGER,
      locked_institutional_shares INTEGER,
      market_cap REAL,
      major_shareholders_json TEXT,
      controlling_shareholder TEXT,
      ownership_updated_at INTEGER,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_investors (
      id TEXT PRIMARY KEY,
      alias TEXT NOT NULL,
      user_id TEXT,
      balance REAL NOT NULL DEFAULT 5000,
      portfolio_enabled INTEGER NOT NULL DEFAULT 1,
      last_purchase_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_holdings (
      investor_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      shares INTEGER NOT NULL DEFAULT 0,
      PRIMARY KEY (investor_id, company_id)
    );

    CREATE TABLE IF NOT EXISTS market_orders (
      id TEXT PRIMARY KEY,
      investor_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      total_value REAL NOT NULL,
      remaining_quantity INTEGER,
      realized_profit REAL NOT NULL DEFAULT 0,
      closed_at TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_taxes (
      id TEXT PRIMARY KEY,
      investor_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      gross_proceeds REAL NOT NULL,
      tax_amount REAL NOT NULL,
      net_proceeds REAL NOT NULL,
      tax_rate REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_history (
      id TEXT PRIMARY KEY,
      investor_id TEXT NOT NULL,
      total_value REAL NOT NULL,
      cash_balance REAL NOT NULL,
      holdings_value REAL NOT NULL,
      realized_profit REAL NOT NULL,
      unrealized_profit REAL NOT NULL,
      taxes_paid REAL NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_history (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      price REAL NOT NULL,
      recorded_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_events (
      id TEXT PRIMARY KEY,
      event_type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      impact REAL NOT NULL,
      started_at TEXT NOT NULL,
      ends_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_consumer_activity (
      consumer_key TEXT PRIMARY KEY,
      last_purchase_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS faction_accounts (
      faction TEXT PRIMARY KEY,
      credits REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS economy_policy (
      faction TEXT PRIMARY KEY,
      tax_rate REAL NOT NULL DEFAULT 0.05,
      subsidy TEXT NOT NULL DEFAULT 'none',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sector_economy_state (
      sector_id TEXT PRIMARY KEY,
      sector_name TEXT NOT NULL,
      control_status TEXT NOT NULL DEFAULT 'Neutral',
      is_embargoed INTEGER NOT NULL DEFAULT 0,
      economy_state TEXT NOT NULL DEFAULT 'Normal',
      population_index REAL NOT NULL DEFAULT 1,
      industrial_index REAL NOT NULL DEFAULT 1,
      logistics_index REAL NOT NULL DEFAULT 1,
      war_pressure REAL NOT NULL DEFAULT 0,
      consumer_confidence REAL NOT NULL DEFAULT 1,
      infrastructure_demand REAL NOT NULL DEFAULT 1,
      black_market_pressure REAL NOT NULL DEFAULT 0,
      import_dependency_json TEXT NOT NULL DEFAULT '{}',
      export_strength_json TEXT NOT NULL DEFAULT '{}',
      last_demand_tick TEXT,
      last_updated TEXT
    );

    CREATE TABLE IF NOT EXISTS sector_resource_demand (
      sector_id TEXT NOT NULL,
      sector_name TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      demand_score REAL NOT NULL DEFAULT 1,
      supply_score REAL NOT NULL DEFAULT 1,
      import_dependency REAL NOT NULL DEFAULT 0,
      export_strength REAL NOT NULL DEFAULT 0,
      market_multiplier REAL NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (sector_id, resource_type)
    );

    CREATE TABLE IF NOT EXISTS sector_resource_prices (
      sector_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      base_price REAL NOT NULL,
      current_price REAL NOT NULL,
      previous_price REAL NOT NULL,
      demand_score REAL NOT NULL DEFAULT 1,
      supply_score REAL NOT NULL DEFAULT 1,
      speculation_score REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (sector_id, resource_type)
    );

    CREATE TABLE IF NOT EXISTS civilian_resource_purchases (
      id TEXT PRIMARY KEY,
      sector_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      quantity REAL NOT NULL,
      unit_price REAL NOT NULL,
      total_price REAL NOT NULL,
      buyer_role TEXT NOT NULL,
      buyer_name TEXT NOT NULL,
      buyer_account TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS holding_mergers (
      id TEXT PRIMARY KEY,
      acquiring_company_id TEXT NOT NULL,
      acquired_company_id TEXT NOT NULL,
      sector_id TEXT NOT NULL,
      old_name TEXT NOT NULL,
      new_name TEXT NOT NULL,
      acquired_resources_json TEXT NOT NULL,
      reason TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS institutional_investors (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      strategy TEXT NOT NULL,
      risk_tolerance REAL NOT NULL DEFAULT 0.5,
      corruption_affinity REAL NOT NULL DEFAULT 0.5,
      credit_balance REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS institutional_holdings (
      investor_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      shares INTEGER NOT NULL DEFAULT 0,
      average_cost REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (investor_id, company_id)
    );

    CREATE TABLE IF NOT EXISTS institutional_trades (
      id TEXT PRIMARY KEY,
      investor_id TEXT NOT NULL,
      company_id TEXT NOT NULL,
      sector_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      action TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      price REAL NOT NULL,
      reason TEXT NOT NULL,
      corruption_opportunity_score REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS market_intelligence_reports (
      id TEXT PRIMARY KEY,
      severity TEXT NOT NULL,
      sector_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS corruption_watch_log (
      id TEXT PRIMARY KEY,
      timestamp TEXT NOT NULL,
      policy_change_id TEXT,
      project_id TEXT,
      affected_sector TEXT NOT NULL,
      affected_resource TEXT NOT NULL,
      affected_holding TEXT NOT NULL,
      institutional_investor TEXT NOT NULL,
      trade_action TEXT NOT NULL,
      corruption_opportunity_score REAL NOT NULL,
      estimated_benefit REAL NOT NULL
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_radio_command_log_unique_target
      ON radio_command_log (discord_message_id, target_fleet_id, target_planet_id, status);

    CREATE INDEX IF NOT EXISTS idx_radio_command_log_created_at
      ON radio_command_log (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sector_resource_demand_updated_at
      ON sector_resource_demand (updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_institutional_trades_created_at
      ON institutional_trades (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_market_taxes_investor_created_at
      ON market_taxes (investor_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_portfolio_history_investor_created_at
      ON portfolio_history (investor_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_market_intelligence_reports_created_at
      ON market_intelligence_reports (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sector_resource_prices_updated_at
      ON sector_resource_prices (updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_civilian_resource_purchases_created_at
      ON civilian_resource_purchases (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_holding_mergers_created_at
      ON holding_mergers (created_at DESC);
  `);

  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map((column) => column.name));
  if (!userColumns.has('can_coordinate_4th_fleet')) {
    db.exec('ALTER TABLE users ADD COLUMN can_coordinate_4th_fleet INTEGER NOT NULL DEFAULT 0');
  }
  if (!userColumns.has('senate_position')) {
    db.exec("ALTER TABLE users ADD COLUMN senate_position TEXT NOT NULL DEFAULT ''");
  }
  const marketCompanyColumns = new Set(db.prepare('PRAGMA table_info(market_companies)').all().map((column) => column.name));
  if (!marketCompanyColumns.has('sector')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN sector TEXT NOT NULL DEFAULT ''");
  }
  if (!marketCompanyColumns.has('resource_key')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN resource_key TEXT NOT NULL DEFAULT ''");
  }
  if (!marketCompanyColumns.has('sector_id')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN sector_id TEXT NOT NULL DEFAULT ''");
  }
  if (!marketCompanyColumns.has('resource_refs_json')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN resource_refs_json TEXT NOT NULL DEFAULT '[]'");
  }
  if (!marketCompanyColumns.has('market_status')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN market_status TEXT NOT NULL DEFAULT 'tradeable'");
  }
  if (!marketCompanyColumns.has('bankruptcy_risk')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN bankruptcy_risk REAL NOT NULL DEFAULT 0");
  }
  if (!marketCompanyColumns.has('debt_index')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN debt_index REAL NOT NULL DEFAULT 0");
  }
  if (!marketCompanyColumns.has('confidence_index')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN confidence_index REAL NOT NULL DEFAULT 1");
  }
  if (!marketCompanyColumns.has('is_embargoed')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN is_embargoed INTEGER NOT NULL DEFAULT 0");
  }
  if (!marketCompanyColumns.has('acquired_by_company_id')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN acquired_by_company_id TEXT');
  }
  if (!marketCompanyColumns.has('merged_name')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN merged_name TEXT');
  }
  if (!marketCompanyColumns.has('total_shares')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN total_shares INTEGER');
  }
  if (!marketCompanyColumns.has('free_float_shares')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN free_float_shares INTEGER');
  }
  if (!marketCompanyColumns.has('locked_institutional_shares')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN locked_institutional_shares INTEGER');
  }
  if (!marketCompanyColumns.has('market_cap')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN market_cap REAL');
  }
  if (!marketCompanyColumns.has('major_shareholders_json')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN major_shareholders_json TEXT');
  }
  if (!marketCompanyColumns.has('controlling_shareholder')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN controlling_shareholder TEXT');
  }
  if (!marketCompanyColumns.has('ownership_updated_at')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN ownership_updated_at INTEGER');
  }
  const marketOrderColumns = new Set(db.prepare('PRAGMA table_info(market_orders)').all().map((column) => column.name));
  if (!marketOrderColumns.has('remaining_quantity')) {
    db.exec('ALTER TABLE market_orders ADD COLUMN remaining_quantity INTEGER');
  }
  if (!marketOrderColumns.has('realized_profit')) {
    db.exec('ALTER TABLE market_orders ADD COLUMN realized_profit REAL NOT NULL DEFAULT 0');
  }
  if (!marketOrderColumns.has('closed_at')) {
    db.exec('ALTER TABLE market_orders ADD COLUMN closed_at TEXT');
  }
  db.prepare(`
    UPDATE market_orders
    SET remaining_quantity = quantity
    WHERE remaining_quantity IS NULL
  `).run();
  const sectorEconomyColumns = new Set(db.prepare('PRAGMA table_info(sector_economy_state)').all().map((column) => column.name));
  if (!sectorEconomyColumns.has('control_status')) {
    db.exec("ALTER TABLE sector_economy_state ADD COLUMN control_status TEXT NOT NULL DEFAULT 'Neutral'");
  }
  if (!sectorEconomyColumns.has('is_embargoed')) {
    db.exec('ALTER TABLE sector_economy_state ADD COLUMN is_embargoed INTEGER NOT NULL DEFAULT 0');
  }
  if (!sectorEconomyColumns.has('economy_state')) {
    db.exec("ALTER TABLE sector_economy_state ADD COLUMN economy_state TEXT NOT NULL DEFAULT 'Normal'");
  }
  if (!sectorEconomyColumns.has('last_updated')) {
    db.exec('ALTER TABLE sector_economy_state ADD COLUMN last_updated TEXT');
  }
  const marketInvestorColumns = new Set(db.prepare('PRAGMA table_info(market_investors)').all().map((column) => column.name));
  if (!marketInvestorColumns.has('user_id')) {
    db.exec('ALTER TABLE market_investors ADD COLUMN user_id TEXT');
  }
  if (!marketInvestorColumns.has('balance')) {
    db.exec('ALTER TABLE market_investors ADD COLUMN balance REAL NOT NULL DEFAULT 5000');
  }
  if (!marketInvestorColumns.has('portfolio_enabled')) {
    db.exec('ALTER TABLE market_investors ADD COLUMN portfolio_enabled INTEGER NOT NULL DEFAULT 1');
  }
  db.prepare(`
    UPDATE market_investors
    SET portfolio_enabled = 0
    WHERE user_id IS NULL OR trim(user_id) = ''
  `).run();

  const legacyFactionAdminRoles = [
    ['Republic Navy Main-Admin', 'Republic Navy Admin'],
    ['Galaktischer Senat Main-Admin', 'Galaktischer Senats Admin'],
    ['Eventleiter / KUS Main-Admin', 'Eventleiter / KUS Admin']
  ];
  const migrateFactionAdminRole = db.prepare('UPDATE users SET role = ?, updated_at = ? WHERE role = ?');
  const migrationTime = new Date().toISOString();
  legacyFactionAdminRoles.forEach(([legacyRole, nextRole]) => {
    migrateFactionAdminRole.run(nextRole, migrationTime, legacyRole);
  });

  const marketCompanies = [
    ['kuat', 'KDY', 'Kuat-Triebwerkswerften', 'GAR', 1250],
    ['rothana', 'RHE', 'Rothana Heavy Engineering', 'GAR', 980],
    ['trade_guild', 'HGL', 'Galaktische Handelsgilde', 'NEUTRAL', 620],
    ['banking_clan', 'IGBC', 'InterGalactic Banking Clan', 'KUS', 840],
    ['pyke_logistics', 'PYKE', 'Pyke Spice Logistics', 'PYKE', 510],
    ['black_sun', 'BSH', 'Black Sun Holdings', 'BLACK_SUN', 460],
    ['hutt_trading', 'HUTT', 'Hutt Space Trading Company', 'HUTT', 700]
  ];
  const insertMarketCompany = db.prepare(`
    INSERT OR IGNORE INTO market_companies (
      id, symbol, name, faction, sector, resource_key,
      base_price, current_price, previous_price, updated_at
    ) VALUES (?, ?, ?, ?, '', '', ?, ?, ?, ?)
  `);
  marketCompanies.forEach(([id, symbol, name, faction, price]) => {
    insertMarketCompany.run(id, symbol, name, faction, price, price, price, migrationTime);
  });
  db.prepare(`
    INSERT OR IGNORE INTO economy_policy (faction, tax_rate, subsidy, updated_at)
    VALUES ('GAR', 0.05, 'none', ?)
  `).run(migrationTime);
  const insertFactionAccount = db.prepare(`
    INSERT OR IGNORE INTO faction_accounts (faction, credits, updated_at)
    VALUES (?, 0, ?)
  `);
  ['BLACK_SUN', 'PYKE', 'HUTT'].forEach((faction) => insertFactionAccount.run(faction, migrationTime));

  const stateRow = db.prepare('SELECT id FROM app_state WHERE id = ?').get('main');

  if (!stateRow) {
    const seedState = extractDefaultData(process.cwd());

    seedState.authUsers = [];
    seedState.meta = seedState.meta || {};
    seedState.meta.serverSeededAt = new Date().toISOString();

    db.prepare(`
      INSERT INTO app_state (id, state_json, revision, updated_at)
      VALUES (?, ?, ?, ?)
    `).run(
      'main',
      JSON.stringify(seedState),
      1,
      new Date().toISOString()
    );
  }

  const campaignStateRow = db.prepare("SELECT state_json FROM app_state WHERE id = 'main'").get();
  const campaignState = JSON.parse(campaignStateRow?.state_json || '{}');
  const previousSectorNamesById = new Map((campaignState.meta?.manualSectors || [])
    .map((sector) => [String(sector?.id || ''), String(sector?.name || '').trim()]));
  const manualSectors = buildCanonicalManualSectors(campaignState);
  campaignState.meta = campaignState.meta || {};
  campaignState.meta.manualSectors = manualSectors;
  const sectorOwners = new Map();
  const sectorNames = new Set();
  let campaignStateChanged = false;
  for (const planet of campaignState.planets || []) {
    const sector = manualSectors.length
      ? resolveManualSectorName(planet, manualSectors)
      : String(planet?.sector || '').trim();
    if (String(planet?.sector || '').trim() !== sector) {
      planet.sector = sector;
      campaignStateChanged = true;
    }
    if (!sector) continue;
    sectorNames.add(sector);
    const owner = String(planet?.owner || 'NEUTRAL').trim() || 'NEUTRAL';
    if (!sectorOwners.has(sector)) sectorOwners.set(sector, new Map());
    const ownerCounts = sectorOwners.get(sector);
    ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1);
  }
  for (const manualSector of manualSectors) {
    sectorNames.add(manualSector.name);
  }

  if (campaignStateChanged) {
    db.prepare(`
      UPDATE app_state
      SET state_json = ?, updated_at = ?
      WHERE id = 'main'
    `).run(
      JSON.stringify(campaignState),
      new Date().toISOString()
    );
  }

  const sectorHoldingResources = [
    ['quadraniumErz', RESOURCE_MARKET_CONFIG.quadraniumErz.holdingLabel, RESOURCE_MARKET_CONFIG.quadraniumErz.basePrice],
    ['agrinium', RESOURCE_MARKET_CONFIG.agrinium.holdingLabel, RESOURCE_MARKET_CONFIG.agrinium.basePrice],
    ['tibannaGas', RESOURCE_MARKET_CONFIG.tibannaGas.holdingLabel, RESOURCE_MARKET_CONFIG.tibannaGas.basePrice],
    ['baradium', RESOURCE_MARKET_CONFIG.baradium.holdingLabel, RESOURCE_MARKET_CONFIG.baradium.basePrice],
    ['kavamSalz', RESOURCE_MARKET_CONFIG.kavamSalz.holdingLabel, RESOURCE_MARKET_CONFIG.kavamSalz.basePrice]
  ];
  const insertSectorHolding = db.prepare(`
    INSERT INTO market_companies (
      id, symbol, name, faction, sector, resource_key, sector_id, resource_refs_json,
      market_status, bankruptcy_risk, debt_index, confidence_index, is_embargoed,
      base_price, current_price, previous_price, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateSectorHolding = db.prepare(`
    UPDATE market_companies
    SET symbol = ?, name = ?, faction = ?, sector = ?, resource_key = ?, sector_id = ?,
      resource_refs_json = CASE
        WHEN resource_refs_json IS NULL OR resource_refs_json = '' OR resource_refs_json = '[]' THEN ?
        ELSE resource_refs_json
      END,
      base_price = ?, updated_at = ?
    WHERE id = ?
  `);
  const initialHistory = db.prepare(`
    INSERT OR IGNORE INTO market_history (id, company_id, price, recorded_at)
    VALUES (?, ?, ?, ?)
  `);
  const existingHistory = db.prepare('SELECT 1 FROM market_history WHERE company_id = ? LIMIT 1');
  const deleteCompanyHistory = db.prepare('DELETE FROM market_history WHERE company_id = ?');
  const deleteCompanyHoldings = db.prepare('DELETE FROM market_holdings WHERE company_id = ?');
  const deleteCompanyOrders = db.prepare('DELETE FROM market_orders WHERE company_id = ?');
  const deleteCompany = db.prepare('DELETE FROM market_companies WHERE id = ?');
  const existingSectorCompanies = db.prepare(`
    SELECT id, sector, resource_key AS resourceKey FROM market_companies
    WHERE id LIKE 'sector_holding_%'
  `);
  const existingSectorCompaniesBySector = db.prepare(`
    SELECT id, sector, resource_key AS resourceKey, current_price AS currentPrice, previous_price AS previousPrice
    FROM market_companies
    WHERE id LIKE 'sector_holding_%'
  `).all();
  const existingCompanyLookup = new Map(existingSectorCompaniesBySector.map((company) => [`${company.sector}::${company.resourceKey}`, company]));

  db.transaction(() => {
    const deleteEconomyStateByName = db.prepare('DELETE FROM sector_economy_state WHERE sector_name = ?');
    const deleteResourceDemandByName = db.prepare('DELETE FROM sector_resource_demand WHERE sector_name = ?');
    const deleteResourcePricesByName = db.prepare(`
      DELETE FROM sector_resource_prices
      WHERE sector_id IN (SELECT sector_id FROM sector_economy_state WHERE sector_name = ?)
    `);
    const deletePurchasesByName = db.prepare(`
      DELETE FROM civilian_resource_purchases
      WHERE sector_id IN (SELECT sector_id FROM sector_economy_state WHERE sector_name = ?)
    `);
    const deleteMergersByName = db.prepare(`
      DELETE FROM holding_mergers
      WHERE sector_id IN (SELECT sector_id FROM sector_economy_state WHERE sector_name = ?)
    `);
    const deleteReportsBySectorName = db.prepare(`
      DELETE FROM market_intelligence_reports
      WHERE sector_id IN (SELECT sector_id FROM sector_economy_state WHERE sector_name = ?)
    `);
    const deleteTradesBySectorName = db.prepare(`
      DELETE FROM institutional_trades
      WHERE sector_id IN (SELECT sector_id FROM sector_economy_state WHERE sector_name = ?)
    `);
    ECONOMY_EXCLUDED_SECTOR_NAMES.forEach((sectorName) => {
      deleteMergersByName.run(sectorName);
      deletePurchasesByName.run(sectorName);
      deleteResourcePricesByName.run(sectorName);
      deleteTradesBySectorName.run(sectorName);
      deleteReportsBySectorName.run(sectorName);
      deleteResourceDemandByName.run(sectorName);
      deleteEconomyStateByName.run(sectorName);
    });

    const canonicalSectorNames = [...sectorNames]
      .filter((sectorName) => !isEconomyExcludedSector(sectorName))
      .sort((a, b) => a.localeCompare(b, 'de', { numeric: true }));
    const validCompanyIds = new Set();
    canonicalSectorNames.forEach((sector) => {
      const ownerCounts = sectorOwners.get(sector) || new Map();
      const faction = [...ownerCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || 'NEUTRAL';
      const manualSector = manualSectors.find((entry) => entry.name === sector);
      const sectorId = String(manualSector?.id || sector);
      const previousSectorName = previousSectorNamesById.get(String(manualSector?.id || '')) || sector;
      sectorHoldingResources.forEach(([resourceKey, holdingLabel, price]) => {
        const existingCompany = getLegacySectorNames(sector, previousSectorName)
          .map((sectorName) => existingCompanyLookup.get(`${sectorName}::${resourceKey}`))
          .find(Boolean);
        const companyId = existingCompany?.id || getHoldingCompanyId(sector, resourceKey);
        validCompanyIds.add(companyId);
        const symbol = getHoldingSymbol(sector, resourceKey);
        if (existingCompany) {
          updateSectorHolding.run(
            symbol,
            `${sector} ${holdingLabel}`,
            faction,
            sector,
            resourceKey,
            sectorId,
            JSON.stringify([resourceKey]),
            price,
            migrationTime,
            companyId
          );
        } else {
          insertSectorHolding.run(
            companyId,
            symbol,
            `${sector} ${holdingLabel}`,
            faction,
            sector,
            resourceKey,
            sectorId,
            JSON.stringify([resourceKey]),
            'tradeable',
            0,
            0.1,
            1,
            0,
            price,
            price,
            price,
            migrationTime
          );
        }
        if (!existingHistory.get(companyId)) {
          initialHistory.run(`seed_${companyId}`, companyId, price, migrationTime);
        }
      });
    });
    existingSectorCompanies.all().forEach(({ id }) => {
      if (validCompanyIds.has(id)) return;
      deleteCompanyHistory.run(id);
      deleteCompanyHoldings.run(id);
      deleteCompanyOrders.run(id);
      deleteCompany.run(id);
    });
  })();

  const seedInstitutionalInvestor = db.prepare(`
    INSERT INTO institutional_investors (
      id, name, strategy, risk_tolerance, corruption_affinity, credit_balance, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      strategy = excluded.strategy,
      risk_tolerance = excluded.risk_tolerance,
      corruption_affinity = excluded.corruption_affinity
  `);
  INSTITUTIONAL_INVESTOR_SEEDS.forEach((investor) => {
    seedInstitutionalInvestor.run(
      investor.id,
      investor.name,
      investor.strategy,
      investor.riskTolerance,
      investor.corruptionAffinity,
      investor.creditBalance,
      migrationTime
    );
  });
  initializeMarketOwnership(db, campaignState, migrationTime);

  const now = new Date().toISOString();
  const defaultAdmin = db.prepare('SELECT id FROM users WHERE lower(username) = lower(?)').get('admin');

  if (!defaultAdmin) {
    db.prepare(`
      INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      'admin',
      bcrypt.hashSync('admin', 10),
      'Admin',
      now,
      now
    );
  } else {
    db.prepare(`
      UPDATE users
      SET password_hash = ?, role = ?, updated_at = ?
      WHERE id = ?
    `).run(
      bcrypt.hashSync('admin', 10),
      'Admin',
      now,
      defaultAdmin.id
    );
  }

  return db;
}

function normalizeIngameName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function safeJsonParse(rawJson, fallback) {
  try {
    return JSON.parse(rawJson || JSON.stringify(fallback));
  } catch {
    return fallback;
  }
}

function roundShares(value) {
  return Math.max(0, Math.round(Number(value || 0)));
}

function buildCompanyScaleContext(state) {
  const context = new Map();
  try {
    const sectors = buildSectorMembership(state, buildCanonicalManualSectors(state));
    sectors.forEach((sector) => {
      const production = Object.values(sector.slotSummary?.production || {})
        .reduce((sum, value) => sum + Number(value || 0), 0);
      const infrastructure = Number(sector.slotSummary?.civilianSlots || 0)
        + Number(sector.slotSummary?.militarySlots || 0)
        + Number(sector.slotSummary?.developmentSlots || 0)
        + Number(sector.slotSummary?.activeMineProjects || 0)
        + Number(sector.slotSummary?.activeShipProjects || 0);
      const regionCounts = new Map();
      (sector.planets || []).forEach((planet) => {
        const region = String(planet?.region || '').trim() || 'Unknown';
        regionCounts.set(region, (regionCounts.get(region) || 0) + 1);
      });
      const dominantRegion = [...regionCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || '';
      const metric = {
        planetCount: (sector.planets || []).length,
        production,
        infrastructure,
        dominantRegion
      };
      context.set(String(sector.id || ''), metric);
      context.set(String(sector.name || ''), metric);
    });
  } catch {
    return context;
  }
  return context;
}

function estimateCompanyTotalShares(company, scaleContext = new Map()) {
  const currentPrice = Math.max(1, Number(company.current_price || company.currentPrice || company.base_price || company.basePrice || 100));
  if (!String(company.id || '').startsWith('sector_holding_')) {
    const mega = ['kuat', 'rothana', 'banking_clan'].includes(company.id) || currentPrice >= 800;
    const base = mega ? 1000000 : 420000;
    const noise = 1 + stableNoise(`shares:${company.id}`, 0.28);
    return Math.round((base * noise) / 1000) * 1000;
  }
  const metric = scaleContext.get(String(company.sector_id || company.sectorId || ''))
    || scaleContext.get(String(company.sector || ''))
    || {};
  const region = String(metric.dominantRegion || '').toLowerCase();
  const production = Number(metric.production || 0);
  const infrastructure = Number(metric.infrastructure || 0);
  const planetCount = Number(metric.planetCount || 0);
  const score = planetCount + (production * 2.4) + (infrastructure * 3.2) + (currentPrice / 55);
  let min = 75000;
  let max = 150000;
  if (region.includes('core') || region.includes('colonies') || score >= 95) {
    min = score >= 160 ? 1000000 : 300000;
    max = score >= 160 ? 1600000 : 750000;
  } else if (region.includes('outer') || region.includes('wild') || score < 45) {
    min = 15000;
    max = 40000;
  }
  const position = clamp(0.42 + stableNoise(`shares:${company.id}:${company.sector}:${company.resource_key}`, 0.36), 0.05, 0.95);
  return Math.round((min + ((max - min) * position)) / 100) * 100;
}

function chooseInstitutionalShareholders(company, totalShares, investors) {
  const resourceKey = String(company.resource_key || company.resourceKey || '');
  const preferredByResource = {
    quadraniumErz: ['inst_corporate_alliance', 'inst_commerce_guild', 'inst_igbc', 'inst_republic_infra_fund'],
    agrinium: ['inst_techno_union', 'inst_corporate_alliance', 'inst_igbc', 'inst_banking_consortium'],
    tibannaGas: ['inst_trade_federation', 'inst_logistics_cartel', 'inst_commerce_guild', 'inst_igbc'],
    baradium: ['inst_techno_union', 'inst_trade_federation', 'inst_corporate_alliance', 'inst_reconstruction'],
    kavamSalz: ['inst_trade_federation', 'inst_commerce_guild', 'inst_core_pension', 'inst_sector_authority']
  };
  const investorMap = new Map(investors.map((investor) => [investor.id, investor]));
  const preferred = (preferredByResource[resourceKey] || [])
    .map((id) => investorMap.get(id))
    .filter(Boolean);
  const fallback = investors.filter((investor) => !preferred.some((entry) => entry.id === investor.id));
  const selected = [...preferred, ...fallback].slice(0, 5);
  const lockedPercent = clamp(0.44 + stableNoise(`locked:${company.id}`, 0.18), 0.32, 0.72);
  let remaining = Math.floor(totalShares * lockedPercent);
  return selected.map((investor, index) => {
    const weight = clamp(0.34 - (index * 0.055) + stableNoise(`${company.id}:${investor.id}:weight`, 0.04), 0.08, 0.36);
    const shares = index === selected.length - 1
      ? remaining
      : Math.min(remaining, Math.floor(totalShares * weight));
    remaining -= shares;
    return { investor, shares: Math.max(0, shares) };
  }).filter((entry) => entry.shares > 0);
}

function initializeMarketOwnership(db, state, recordedAt = new Date().toISOString()) {
  const scaleContext = buildCompanyScaleContext(state || {});
  const investors = db.prepare('SELECT id, name FROM institutional_investors ORDER BY id').all();
  const companies = db.prepare('SELECT * FROM market_companies').all();
  const playerSharesStatement = db.prepare('SELECT COALESCE(SUM(shares), 0) AS shares FROM market_holdings WHERE company_id = ?');
  const instSharesStatement = db.prepare('SELECT COALESCE(SUM(shares), 0) AS shares FROM institutional_holdings WHERE company_id = ?');
  const insertInstHolding = db.prepare(`
    INSERT INTO institutional_holdings (investor_id, company_id, shares, average_cost, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(investor_id, company_id) DO UPDATE SET
      shares = institutional_holdings.shares + excluded.shares,
      average_cost = CASE
        WHEN institutional_holdings.shares + excluded.shares <= 0 THEN excluded.average_cost
        ELSE ((institutional_holdings.average_cost * institutional_holdings.shares) + (excluded.average_cost * excluded.shares))
          / (institutional_holdings.shares + excluded.shares)
      END,
      updated_at = excluded.updated_at
  `);
  db.transaction(() => {
    companies.forEach((company) => {
      const playerShares = roundShares(playerSharesStatement.get(company.id)?.shares);
      const existingInstShares = roundShares(instSharesStatement.get(company.id)?.shares);
      const estimatedShares = estimateCompanyTotalShares(company, scaleContext);
      const totalShares = Math.max(
        roundShares(company.total_shares),
        estimatedShares,
        playerShares + existingInstShares + 1000
      );
      db.prepare(`
        UPDATE market_companies
        SET total_shares = COALESCE(total_shares, ?),
          free_float_shares = COALESCE(free_float_shares, ?),
          locked_institutional_shares = COALESCE(locked_institutional_shares, ?),
          market_cap = COALESCE(market_cap, ?),
          ownership_updated_at = COALESCE(ownership_updated_at, ?)
        WHERE id = ?
      `).run(
        totalShares,
        Math.max(0, totalShares - playerShares - existingInstShares),
        existingInstShares,
        round2(totalShares * Number(company.current_price || company.base_price || 0)),
        Date.parse(recordedAt) || Date.now(),
        company.id
      );
      if (existingInstShares <= 0 && investors.length) {
        chooseInstitutionalShareholders(company, totalShares, investors).forEach(({ investor, shares }) => {
          insertInstHolding.run(investor.id, company.id, shares, Number(company.current_price || company.base_price || 1), recordedAt);
        });
      }
      updateOwnershipStructure(db, company.id, Date.parse(recordedAt) || Date.now());
    });
  })();
}

function getCompanyOwnershipRows(db, companyId) {
  const company = db.prepare('SELECT * FROM market_companies WHERE id = ?').get(companyId);
  if (!company) return null;
  const institutions = db.prepare(`
    SELECT i.name, h.shares
    FROM institutional_holdings h
    JOIN institutional_investors i ON i.id = h.investor_id
    WHERE h.company_id = ? AND h.shares > 0
    ORDER BY h.shares DESC, i.name COLLATE NOCASE
  `).all(companyId);
  const playerShares = roundShares(db.prepare(`
    SELECT COALESCE(SUM(shares), 0) AS shares
    FROM market_holdings
    WHERE company_id = ?
  `).get(companyId)?.shares);
  const institutionalShares = roundShares(institutions.reduce((sum, entry) => sum + Number(entry.shares || 0), 0));
  const totalShares = Math.max(roundShares(company.total_shares), institutionalShares + playerShares + roundShares(company.free_float_shares));
  const freeFloatShares = Math.max(0, totalShares - institutionalShares - playerShares);
  const rows = institutions.map((entry) => ({
    name: entry.name,
    type: 'institution',
    shares: roundShares(entry.shares),
    percent: totalShares > 0 ? round2((Number(entry.shares || 0) / totalShares) * 100) : 0
  }));
  if (playerShares > 0) {
    rows.push({
      name: 'Players',
      type: 'players',
      shares: playerShares,
      percent: totalShares > 0 ? round2((playerShares / totalShares) * 100) : 0
    });
  }
  rows.push({
    name: 'Free Float',
    type: 'free_float',
    shares: freeFloatShares,
    percent: totalShares > 0 ? round2((freeFloatShares / totalShares) * 100) : 0
  });
  rows.sort((left, right) => right.shares - left.shares || left.name.localeCompare(right.name));
  const controlling = rows
    .filter((row) => row.type !== 'free_float')
    .sort((left, right) => right.shares - left.shares)[0];
  return {
    company,
    rows,
    totalShares,
    freeFloatShares,
    institutionalShares,
    playerShares,
    controllingShareholder: controlling?.percent >= 25 ? controlling.name : ''
  };
}

function updateOwnershipStructure(db, companyId, now = Date.now()) {
  const ownership = getCompanyOwnershipRows(db, companyId);
  if (!ownership) return null;
  const marketCap = round2(ownership.totalShares * Number(ownership.company.current_price || 0));
  db.prepare(`
    UPDATE market_companies
    SET total_shares = ?, free_float_shares = ?, locked_institutional_shares = ?,
      market_cap = ?, major_shareholders_json = ?, controlling_shareholder = ?,
      ownership_updated_at = ?
    WHERE id = ?
  `).run(
    ownership.totalShares,
    ownership.freeFloatShares,
    ownership.institutionalShares,
    marketCap,
    JSON.stringify(ownership.rows),
    ownership.controllingShareholder || null,
    now,
    companyId
  );
  return { ...ownership, marketCap };
}

function getAvailableFreeFloatShares(db, companyId) {
  updateOwnershipStructure(db, companyId);
  const row = db.prepare(`
    SELECT free_float_shares AS freeFloatShares
    FROM market_companies
    WHERE id = ?
  `).get(companyId);
  return Math.max(0, roundShares(row?.freeFloatShares));
}

function getPortfolioMetrics(db, investorId) {
  const investor = getOrCreateMarketInvestor(db, investorId);
  const positions = db.prepare(`
    SELECT h.company_id AS companyId, h.shares,
      c.name, c.symbol, c.sector, c.resource_key AS resourceKey, c.resource_refs_json AS resourceRefsJson,
      c.current_price AS currentPrice, c.market_status AS marketStatus
    FROM market_holdings h
    JOIN market_companies c ON c.id = h.company_id
    WHERE h.investor_id = ? AND h.shares > 0
    ORDER BY c.name COLLATE NOCASE
  `).all(investorId);
  const orders = db.prepare(`
    SELECT id, company_id AS companyId, quantity, remaining_quantity AS remainingQuantity,
      unit_price AS unitPrice, total_value AS totalValue, realized_profit AS realizedProfit,
      closed_at AS closedAt, created_at AS createdAt
    FROM market_orders
    WHERE investor_id = ?
    ORDER BY created_at ASC
  `).all(investorId);
  const orderGroups = new Map();
  orders.forEach((order) => {
    if (!orderGroups.has(order.companyId)) orderGroups.set(order.companyId, []);
    orderGroups.get(order.companyId).push(order);
  });
  let holdingsValue = 0;
  let openCostBasis = 0;
  const rows = positions.map((position) => {
    const currentPrice = Number(position.currentPrice || 0);
    const quantity = roundShares(position.shares);
    const currentValue = round2(quantity * currentPrice);
    const openOrders = (orderGroups.get(position.companyId) || []).filter((order) => Number(order.remainingQuantity || 0) > 0);
    const costBasis = round2(openOrders.reduce((sum, order) => (
      sum + (Number(order.remainingQuantity || 0) * Number(order.unitPrice || 0))
    ), 0));
    const effectiveCostBasis = costBasis > 0 ? costBasis : round2(quantity * currentPrice);
    const avgCost = quantity > 0 ? round2(effectiveCostBasis / quantity) : 0;
    const gainCredits = round2(currentValue - effectiveCostBasis);
    holdingsValue += currentValue;
    openCostBasis += effectiveCostBasis;
    return {
      companyId: position.companyId,
      name: position.name,
      symbol: position.symbol,
      sector: position.sector,
      resourceKey: position.resourceKey,
      resourceRefs: parseResourceRefs(position),
      quantity,
      averageCost: avgCost,
      currentPrice: round2(currentPrice),
      currentValue,
      costBasis: effectiveCostBasis,
      gainCredits,
      gainPercent: effectiveCostBasis > 0 ? round2((gainCredits / effectiveCostBasis) * 100) : 0,
      marketStatus: normalizeMarketStatus(position.marketStatus),
      marketStatusLabel: displayMarketStatus(position.marketStatus),
      orders: (orderGroups.get(position.companyId) || []).map((order) => {
        const orderQuantity = Number(order.remainingQuantity ?? order.quantity ?? 0);
        const orderCost = round2(orderQuantity * Number(order.unitPrice || 0));
        const orderValue = round2(orderQuantity * currentPrice);
        return {
          ...order,
          openQuantity: orderQuantity,
          currentValue: orderValue,
          changeCredits: round2(orderValue - orderCost),
          changePercent: orderCost > 0 ? round2(((orderValue - orderCost) / orderCost) * 100) : 0
        };
      })
    };
  });
  const realizedProfit = round2(orders.reduce((sum, order) => sum + Number(order.realizedProfit || 0), 0));
  const taxesPaid = round2(db.prepare(`
    SELECT COALESCE(SUM(tax_amount), 0) AS taxes
    FROM market_taxes
    WHERE investor_id = ?
  `).get(investorId)?.taxes);
  const investedTotal = round2(orders.reduce((sum, order) => sum + Number(order.totalValue || 0), 0));
  const cashBalance = round2(Number(investor.balance || 0));
  holdingsValue = round2(holdingsValue);
  const totalValue = round2(cashBalance + holdingsValue);
  const unrealizedProfit = round2(holdingsValue - openCostBasis);
  const leaderboard = db.prepare(`
    SELECT i.id,
      ROUND(i.balance + COALESCE(SUM(h.shares * c.current_price), 0), 2) AS portfolioValue
    FROM market_investors i
    LEFT JOIN market_holdings h ON h.investor_id = i.id
    LEFT JOIN market_companies c ON c.id = h.company_id
    WHERE i.portfolio_enabled = 1
    GROUP BY i.id
    ORDER BY portfolioValue DESC
  `).all();
  const rank = leaderboard.findIndex((entry) => entry.id === investorId) + 1;
  return {
    investor: {
      id: investor.id,
      alias: investor.alias,
      balance: cashBalance,
      portfolioEnabled: Boolean(investor.portfolio_enabled)
    },
    cashBalance,
    holdingsValue,
    totalValue,
    investedTotal,
    unrealizedProfit,
    realizedProfit,
    taxesPaid,
    holdingCount: rows.length,
    rank: rank || null,
    positions: rows
  };
}

function writePortfolioSnapshot(db, investorId, createdAt = new Date().toISOString()) {
  if (!investorId) return null;
  const metrics = getPortfolioMetrics(db, investorId);
  db.prepare(`
    INSERT INTO portfolio_history (
      id, investor_id, total_value, cash_balance, holdings_value,
      realized_profit, unrealized_profit, taxes_paid, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    investorId,
    metrics.totalValue,
    metrics.cashBalance,
    metrics.holdingsValue,
    metrics.realizedProfit,
    metrics.unrealizedProfit,
    metrics.taxesPaid,
    createdAt
  );
  return metrics;
}

function ensureRecentPortfolioSnapshot(db, investorId, maxAgeMs = 10 * 60 * 1000) {
  if (!investorId) return null;
  const latest = db.prepare(`
    SELECT created_at AS createdAt
    FROM portfolio_history
    WHERE investor_id = ?
    ORDER BY created_at DESC
    LIMIT 1
  `).get(investorId);
  if (!latest || Date.now() - Date.parse(latest.createdAt) > maxAgeMs) {
    return writePortfolioSnapshot(db, investorId);
  }
  return getPortfolioMetrics(db, investorId);
}

export function readPortfolio(db, investorId, userId = '') {
  getOrCreateMarketInvestor(db, investorId, userId);
  return ensureRecentPortfolioSnapshot(db, investorId);
}

export function readPortfolioHistory(db, investorId, range = 'today') {
  ensureRecentPortfolioSnapshot(db, investorId);
  const rangeMs = ({
    today: 24 * 60 * 60 * 1000,
    week: 7 * 24 * 60 * 60 * 1000,
    month: 31 * 24 * 60 * 60 * 1000,
    sixMonths: 183 * 24 * 60 * 60 * 1000
  })[range] || (24 * 60 * 60 * 1000);
  const cutoff = new Date(Date.now() - rangeMs).toISOString();
  return db.prepare(`
    SELECT total_value AS totalValue, cash_balance AS cashBalance,
      holdings_value AS holdingsValue, realized_profit AS realizedProfit,
      unrealized_profit AS unrealizedProfit, taxes_paid AS taxesPaid,
      created_at AS createdAt
    FROM portfolio_history
    WHERE investor_id = ? AND created_at >= ?
    ORDER BY created_at ASC
  `).all(investorId, cutoff);
}

export function readCompanyOwnership(db, companyId) {
  const ownership = updateOwnershipStructure(db, companyId);
  if (!ownership) {
    const error = new Error('Unternehmen nicht gefunden.');
    error.status = 404;
    throw error;
  }
  return {
    companyId,
    totalShares: ownership.totalShares,
    freeFloatShares: ownership.freeFloatShares,
    lockedInstitutionalShares: ownership.institutionalShares,
    playerShares: ownership.playerShares,
    marketCap: ownership.marketCap,
    controllingShareholder: ownership.controllingShareholder || '',
    shareholders: ownership.rows
  };
}
export function readCampaignState(db) {
  const row = db.prepare(
    'SELECT state_json, revision, updated_at FROM app_state WHERE id = ?'
  ).get('main');

  return {
    state: JSON.parse(row.state_json),
    revision: row.revision,
    updatedAt: row.updated_at
  };
}

export function writeCampaignState(db, nextState, nextRevision) {
  const updatedAt = new Date().toISOString();

  db.prepare(`
    UPDATE app_state
    SET state_json = ?, revision = ?, updated_at = ?
    WHERE id = ?
  `).run(
    JSON.stringify(nextState),
    nextRevision,
    updatedAt,
    'main'
  );

  return updatedAt;
}

export function listUsers(db) {
  return db.prepare(`
    SELECT
      id,
      username,
      role,
      can_coordinate_4th_fleet AS canCoordinate4thFleet,
      senate_position AS senatePosition,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM users
    ORDER BY username COLLATE NOCASE
  `).all();
}

export function findUserByNormalizedUsername(db, username) {
  return db.prepare(`
    SELECT
      id,
      username,
      role,
      can_coordinate_4th_fleet AS canCoordinate4thFleet,
      senate_position AS senatePosition,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM users
    WHERE lower(username) = lower(?)
    LIMIT 1
  `).get(username);
}

export function createUser(db, { username, passwordHash, role, canCoordinate4thFleet = false, senatePosition = '' }) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (
      id, username, password_hash, role, can_coordinate_4th_fleet, senate_position, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, username, passwordHash, role, canCoordinate4thFleet ? 1 : 0, senatePosition, now, now);
  return id;
}

export function updateUser(db, id, { username, passwordHash, role, canCoordinate4thFleet = false, senatePosition = '' }) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET username = ?, password_hash = ?, role = ?, can_coordinate_4th_fleet = ?, senate_position = ?, updated_at = ?
    WHERE id = ?
  `).run(username, passwordHash, role, canCoordinate4thFleet ? 1 : 0, senatePosition, now, id);
}

export function deleteUser(db, id) {
  db.prepare(`
    DELETE FROM users
    WHERE id = ?
  `).run(id);
}

export function listRadioCommandPermissions(db) {
  return db.prepare(`
    SELECT
      id,
      ingame_name AS ingameName,
      normalized_ingame_name AS normalizedIngameName,
      linked_user_id AS linkedUserId,
      linked_username AS linkedUsername,
      permission_role AS permissionRole,
      fleets_json AS fleetsJson,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM radio_command_permissions
    ORDER BY ingame_name COLLATE NOCASE
  `).all().map((row) => ({
    ...row,
    fleets: safeJsonParse(row.fleetsJson, [])
  }));
}

export function findRadioCommandPermissionByNormalizedName(db, ingameName) {
  const row = db.prepare(`
    SELECT
      id,
      ingame_name AS ingameName,
      normalized_ingame_name AS normalizedIngameName,
      linked_user_id AS linkedUserId,
      linked_username AS linkedUsername,
      permission_role AS permissionRole,
      fleets_json AS fleetsJson,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM radio_command_permissions
    WHERE normalized_ingame_name = ?
    LIMIT 1
  `).get(normalizeIngameName(ingameName));
  return row ? { ...row, fleets: safeJsonParse(row.fleetsJson, []) } : null;
}

export function createRadioCommandPermission(db, input) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO radio_command_permissions (
      id,
      ingame_name,
      normalized_ingame_name,
      linked_user_id,
      linked_username,
      permission_role,
      fleets_json,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.ingameName,
    normalizeIngameName(input.ingameName),
    input.linkedUserId || null,
    input.linkedUsername || null,
    input.permissionRole,
    JSON.stringify(Array.isArray(input.fleets) ? input.fleets : []),
    now,
    now
  );
  return id;
}

export function updateRadioCommandPermission(db, id, input) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE radio_command_permissions
    SET
      ingame_name = ?,
      normalized_ingame_name = ?,
      linked_user_id = ?,
      linked_username = ?,
      permission_role = ?,
      fleets_json = ?,
      updated_at = ?
    WHERE id = ?
  `).run(
    input.ingameName,
    normalizeIngameName(input.ingameName),
    input.linkedUserId || null,
    input.linkedUsername || null,
    input.permissionRole,
    JSON.stringify(Array.isArray(input.fleets) ? input.fleets : []),
    now,
    id
  );
}

export function deleteRadioCommandPermission(db, id) {
  db.prepare(`
    DELETE FROM radio_command_permissions
    WHERE id = ?
  `).run(id);
}

export function listRadioCommandLogs(db, limit = 200) {
  return db.prepare(`
    SELECT
      id,
      discord_message_id AS discordMessageId,
      actor_ingame_name AS actorIngameName,
      matched_user_id AS matchedUserId,
      matched_username AS matchedUsername,
      target_fleet_id AS targetFleetId,
      target_fleet_name AS targetFleetName,
      target_planet_id AS targetPlanetId,
      target_planet_name AS targetPlanetName,
      command_type AS commandType,
      status,
      reason,
      original_message AS originalMessage,
      payload_json AS payloadJson,
      created_at AS createdAt
    FROM radio_command_log
    ORDER BY created_at DESC
    LIMIT ?
  `).all(Math.max(1, Number(limit) || 200)).map((row) => ({
    ...row,
    payload: safeJsonParse(row.payloadJson, {})
  }));
}

export function hasRadioCommandLogEntry(db, discordMessageId, fleetId, planetId, status) {
  const row = db.prepare(`
    SELECT id
    FROM radio_command_log
    WHERE discord_message_id = ?
      AND ifnull(target_fleet_id, '') = ifnull(?, '')
      AND ifnull(target_planet_id, '') = ifnull(?, '')
      AND status = ?
    LIMIT 1
  `).get(discordMessageId, fleetId || null, planetId || null, status);
  return Boolean(row?.id);
}

export function insertRadioCommandLog(db, input) {
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO radio_command_log (
      id,
      discord_message_id,
      actor_ingame_name,
      matched_user_id,
      matched_username,
      target_fleet_id,
      target_fleet_name,
      target_planet_id,
      target_planet_name,
      command_type,
      status,
      reason,
      original_message,
      payload_json,
      created_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    input.discordMessageId,
    input.actorIngameName || null,
    input.matchedUserId || null,
    input.matchedUsername || null,
    input.targetFleetId || null,
    input.targetFleetName || null,
    input.targetPlanetId || null,
    input.targetPlanetName || null,
    input.commandType || null,
    input.status,
    input.reason || null,
    input.originalMessage || '',
    JSON.stringify(input.payload || {}),
    createdAt
  );
  return { id, createdAt };
}

export function getOrCreateMarketInvestor(db, investorId, userId = '') {
  const existing = db.prepare('SELECT * FROM market_investors WHERE id = ?').get(investorId);
  if (existing) return existing;
  const suffix = investorId.replace(/-/g, '').slice(0, 6).toUpperCase();
  const createdAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO market_investors (id, alias, user_id, balance, portfolio_enabled, created_at)
    VALUES (?, ?, ?, 5000, 1, ?)
  `).run(investorId, `Portfolio-${suffix}`, userId || null, createdAt);
  return db.prepare('SELECT * FROM market_investors WHERE id = ?').get(investorId);
}

function getPolicyForEconomy(db) {
  return db.prepare(`
    SELECT faction, tax_rate AS taxRate, subsidy, updated_at AS updatedAt
    FROM economy_policy WHERE faction = 'GAR'
  `).get() || { faction: 'GAR', taxRate: 0.05, subsidy: 'none' };
}

function getActiveEventImpact(db, nowIso) {
  const events = db.prepare(`
    SELECT * FROM market_events
    WHERE ends_at > ?
    ORDER BY started_at DESC
  `).all(nowIso);
  return {
    events,
    totalImpact: events.reduce((sum, event) => sum + Number(event.impact || 0), 0)
  };
}

function buildDemandComputationContext(db, state, now = Date.now()) {
  const manualSectors = buildCanonicalManualSectors(state);
  const sectors = buildSectorMembership(state, manualSectors)
    .filter((sector) => !isEconomyExcludedSector(sector.name));
  const neighbors = buildNeighborMap(sectors, 4);
  const inflationRate = Math.min(0.25, Number(state?.resources?.GAR?.credits || 0) / 2000000);
  const policy = getPolicyForEconomy(db);
  const activeEvents = getActiveEventImpact(db, new Date(now).toISOString());
  const previousDemandRows = db.prepare(`
    SELECT sector_id AS sectorId, sector_name AS sectorName, resource_type AS resourceType,
      demand_score AS demandScore, supply_score AS supplyScore,
      import_dependency AS importDependency, export_strength AS exportStrength,
      market_multiplier AS marketMultiplier, updated_at AS updatedAt
    FROM sector_resource_demand
  `).all();
  const previousDemandMap = new Map(previousDemandRows.map((row) => [`${row.sectorId}::${row.resourceType}`, row]));
  return {
    now,
    state,
    sectors,
    neighbors,
    inflationRate,
    policy,
    activeEvents,
    previousDemandMap
  };
}

export function getNeighborSectorDemand(sectorId, resourceType, state, options = {}) {
  const sectors = options.sectors || [];
  const neighbors = options.neighbors || new Map();
  const targetIds = neighbors.get(sectorId) || [];
  if (!targetIds.length) return { averageNeed: 0, strongestNeed: 0 };
  const sectorMap = new Map(sectors.map((sector) => [sector.id, sector]));
  const scores = targetIds.map((neighborId) => {
    const neighbor = sectorMap.get(neighborId);
    if (!neighbor) return 0;
    const production = Number(neighbor.slotSummary?.production?.[resourceType] || 0);
    const pressure = (
      Number(neighbor.slotSummary?.civilianSlots || 0) * (resourceType === 'kavamSalz' ? 0.09 : 0.03)
      + Number(neighbor.slotSummary?.militarySlots || 0) * (resourceType === 'quadraniumErz' ? 0.06 : 0.025)
      + Number(neighbor.slotSummary?.activeShipProjects || 0) * (resourceType === 'tibannaGas' ? 0.12 : 0.07)
    );
    return Math.max(0, pressure - (production * 0.04));
  });
  return {
    averageNeed: average(scores),
    strongestNeed: Math.max(0, ...scores)
  };
}

export function calculateSectorImportExport(sectorId, resourceType, state, options = {}) {
  const sector = (options.sectors || []).find((entry) => entry.id === sectorId);
  if (!sector) return { importDependency: 0.35, exportStrength: 0.1 };
  const production = Number(sector.slotSummary?.production?.[resourceType] || 0);
  const neighborDemand = getNeighborSectorDemand(sectorId, resourceType, state, options);
  const localDemandProxy = (
    Number(sector.slotSummary?.civilianSlots || 0) * (resourceType === 'kavamSalz' ? 0.12 : 0.04)
    + Number(sector.slotSummary?.militarySlots || 0) * (resourceType === 'quadraniumErz' ? 0.08 : 0.05)
    + Number(sector.slotSummary?.activeMineProjects || 0) * (resourceType === 'quadraniumErz' ? 0.15 : 0.08)
    + Number(sector.slotSummary?.activeShipProjects || 0) * (resourceType === 'tibannaGas' ? 0.16 : 0.1)
  );
  const surplus = production - localDemandProxy;
  return {
    importDependency: clamp(0.18 + Math.max(0, -surplus) * 0.09 + neighborDemand.averageNeed * 0.12, 0.05, 1.6),
    exportStrength: clamp(Math.max(0, surplus) * 0.08 + neighborDemand.strongestNeed * 0.14, 0, 1.8)
  };
}

export function calculateResourceDemand(sectorId, resourceType, state, options = {}) {
  const sector = (options.sectors || []).find((entry) => entry.id === sectorId);
  if (!sector) {
    return {
      demandScore: 1,
      supplyScore: 1,
      importDependency: 0.35,
      exportStrength: 0.1,
      marketMultiplier: 1
    };
  }
  const production = Number(sector.slotSummary?.production?.[resourceType] || 0);
  const planets = sector.planets.length;
  const civilians = Number(sector.slotSummary?.civilianSlots || 0);
  const military = Number(sector.slotSummary?.militarySlots || 0);
  const development = Number(sector.slotSummary?.developmentSlots || 0);
  const mineProjects = Number(sector.slotSummary?.activeMineProjects || 0);
  const shipProjects = Number(sector.slotSummary?.activeShipProjects || 0);
  const fleets = Number(sector.slotSummary?.fleetPresence || 0);
  const ownerCount = sector.ownerCounts.size;
  const warPressure = clamp((military * 0.03) + (shipProjects * 0.12) + (fleets * 0.025) + Math.max(0, ownerCount - 1) * 0.14, 0, 2.4);
  const populationIndex = clamp(0.45 + (planets * 0.055) + (civilians * 0.035) + (development * 0.03), 0.4, 3.2);
  const industrialIndex = clamp(0.4 + (military * 0.05) + (development * 0.045) + (shipProjects * 0.1), 0.3, 3.2);
  const logisticsIndex = clamp(0.45 + (civilians * 0.03) + (fleets * 0.04) + (planets * 0.02), 0.3, 2.8);
  const consumerConfidence = clamp(1.08 - options.inflationRate * 0.85 - (warPressure * 0.12) + (options.policy?.subsidy === 'civilian' ? 0.08 : 0), 0.55, 1.35);
  const infrastructureDemand = clamp(0.55 + (mineProjects * 0.16) + (development * 0.035) + (shipProjects * 0.06), 0.4, 2.6);
  const blackMarketPressure = clamp((warPressure * 0.18) + (options.inflationRate * 0.6) + (sector.dominantOwner === 'HUTT' ? 0.22 : 0), 0, 1.8);
  const { importDependency, exportStrength } = calculateSectorImportExport(sectorId, resourceType, state, options);
  const neighborDemand = getNeighborSectorDemand(sectorId, resourceType, state, options);
  const baseDemand = {
    quadraniumErz: 0.7 + infrastructureDemand * 0.65 + mineProjects * 0.16 + shipProjects * 0.08 + industrialIndex * 0.25,
    agrinium: 0.62 + industrialIndex * 0.4 + development * 0.06 + shipProjects * 0.08 + (options.policy?.subsidy === 'research' ? 0.12 : 0),
    tibannaGas: 0.7 + logisticsIndex * 0.4 + fleets * 0.07 + warPressure * 0.24 + importDependency * 0.1,
    baradium: 0.55 + industrialIndex * 0.3 + warPressure * 0.28 + shipProjects * 0.06,
    kavamSalz: 0.9 + populationIndex * 0.55 + warPressure * 0.18 + options.inflationRate * 0.2
  }[resourceType] || 1;
  const supplyScore = clamp(0.35 + (production * 0.34) + exportStrength * 0.08, 0.15, 5.2);
  const randomNoise = stableNoise(`${sectorId}:${resourceType}:${Math.floor(options.now / DEMAND_TICK_MS)}`, 0.035);
  const speculationFactor = stableNoise(`spec:${sectorId}:${resourceType}:${Math.floor(options.now / (DEMAND_TICK_MS * 2))}`, 0.05);
  const tradeRouteDisruption = warPressure * 0.04 + blackMarketPressure * 0.03;
  const corruptionMultiplier = 1 + (blackMarketPressure * 0.03);
  const previous = options.previousDemandMap?.get(`${sectorId}::${resourceType}`);
  const rawDemand = clamp(baseDemand + neighborDemand.averageNeed * 0.35 + randomNoise + speculationFactor, 0.25, 5.6);
  const delayedDemandEffect = previous ? (Number(previous.demandScore || rawDemand) * 0.7) + (rawDemand * 0.3) : rawDemand;
  const marketMultiplier = clamp(
    1
      + ((delayedDemandEffect - supplyScore) * 0.07)
      + (importDependency * 0.06)
      + (exportStrength * 0.045)
      + ((consumerConfidence - 1) * 0.08)
      + options.activeEvents.totalImpact * 0.5
      - tradeRouteDisruption
      + (options.inflationRate * 0.04),
    0.72,
    1.45
  ) * corruptionMultiplier;
  return {
    demandScore: round2(delayedDemandEffect),
    supplyScore: round2(supplyScore),
    importDependency: round2(importDependency),
    exportStrength: round2(exportStrength),
    marketMultiplier: round2(clamp(marketMultiplier, 0.72, 1.45)),
    sectorState: {
      populationIndex: round2(populationIndex),
      industrialIndex: round2(industrialIndex),
      logisticsIndex: round2(logisticsIndex),
      warPressure: round2(warPressure),
      consumerConfidence: round2(consumerConfidence),
      infrastructureDemand: round2(infrastructureDemand),
      blackMarketPressure: round2(blackMarketPressure)
    }
  };
}

export function calculateSectorDemand(sectorId, state, options = {}) {
  const demandByResource = {};
  RESOURCE_KEYS.forEach((resourceKey) => {
    demandByResource[resourceKey] = calculateResourceDemand(sectorId, resourceKey, state, options);
  });
  return demandByResource;
}

export function calculateCorruptionOpportunity(projectOrPolicy, affectedSector, affectedResource) {
  const text = JSON.stringify(projectOrPolicy || {});
  const projectWeight = /ship|venator|werft|bau/i.test(text) ? 0.26 : 0.12;
  const policyWeight = /civilian|research|logistics|subsidy|tax/i.test(text) ? 0.2 : 0.08;
  const resourceWeight = {
    quadraniumErz: 0.24,
    agrinium: 0.21,
    tibannaGas: 0.18,
    baradium: 0.16,
    kavamSalz: 0.14
  }[affectedResource] || 0.1;
  const sectorWeight = stableNoise(`${affectedSector}:${affectedResource}:${text}`, 0.08) + 0.12;
  return round2(clamp(projectWeight + policyWeight + resourceWeight + sectorWeight, 0, 1.25));
}

export function createMarketIntelligenceReport(demandData, options = {}) {
  const { sectorName = '', resourceKey = '', marketMultiplier = 1, warPressure = 0, exportStrength = 0, importDependency = 0 } = demandData || {};
  const label = RESOURCE_MARKET_CONFIG[resourceKey]?.label || resourceKey;
  if (marketMultiplier >= 1.18) return { severity: 'positive', message: `${label}-Nachfrage im Sektor ${sectorName} zieht an.` };
  if (marketMultiplier <= 0.84) return { severity: 'warning', message: `${label}-Preise im Sektor ${sectorName} stehen unter Druck.` };
  if (warPressure >= 1.1 && ['tibannaGas', 'baradium', 'kavamSalz'].includes(resourceKey)) {
    return { severity: 'neutral', message: `Flottenbewegungen im Sektor ${sectorName} treiben die ${label}-Nachfrage.` };
  }
  if (exportStrength >= 0.9) return { severity: 'positive', message: `${sectorName} profitiert aktuell von starkem ${label}-Export.` };
  if (importDependency >= 1.1) return { severity: 'warning', message: `${sectorName} ist bei ${label} spürbar importabhängig.` };
  return options.fallback ? { severity: 'neutral', message: `${label}-Märkte im Sektor ${sectorName} bleiben uneinheitlich.` } : null;
}

export function runCivilianDemandTick(state, options = {}) {
  const db = options.db;
  if (!db) return { ran: false, reason: 'no-db' };
  const now = Number(options.now || Date.now());
  const latestTick = db.prepare('SELECT MAX(last_demand_tick) AS lastTick FROM sector_economy_state').get()?.lastTick;
  if (latestTick && (now - Date.parse(latestTick)) < DEMAND_TICK_MS) {
    return { ran: false, reason: 'cooldown', nextTickAt: new Date(Date.parse(latestTick) + DEMAND_TICK_MS).toISOString() };
  }
  const context = buildDemandComputationContext(db, state, now);
  const recordedAt = new Date(now).toISOString();
  const upsertSectorEconomy = db.prepare(`
    INSERT INTO sector_economy_state (
      sector_id, sector_name, control_status, is_embargoed, economy_state,
      population_index, industrial_index, logistics_index,
      war_pressure, consumer_confidence, infrastructure_demand, black_market_pressure,
      import_dependency_json, export_strength_json, last_demand_tick, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sector_id) DO UPDATE SET
      sector_name = excluded.sector_name,
      control_status = excluded.control_status,
      is_embargoed = CASE
        WHEN sector_economy_state.is_embargoed = 1 THEN 1
        ELSE excluded.is_embargoed
      END,
      economy_state = excluded.economy_state,
      population_index = excluded.population_index,
      industrial_index = excluded.industrial_index,
      logistics_index = excluded.logistics_index,
      war_pressure = excluded.war_pressure,
      consumer_confidence = excluded.consumer_confidence,
      infrastructure_demand = excluded.infrastructure_demand,
      black_market_pressure = excluded.black_market_pressure,
      import_dependency_json = excluded.import_dependency_json,
      export_strength_json = excluded.export_strength_json,
      last_demand_tick = excluded.last_demand_tick,
      last_updated = excluded.last_updated
  `);
  const upsertResourceDemand = db.prepare(`
    INSERT INTO sector_resource_demand (
      sector_id, sector_name, resource_type, demand_score, supply_score,
      import_dependency, export_strength, market_multiplier, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sector_id, resource_type) DO UPDATE SET
      sector_name = excluded.sector_name,
      demand_score = excluded.demand_score,
      supply_score = excluded.supply_score,
      import_dependency = excluded.import_dependency,
      export_strength = excluded.export_strength,
      market_multiplier = excluded.market_multiplier,
      updated_at = excluded.updated_at
  `);
  const insertReport = db.prepare(`
    INSERT INTO market_intelligence_reports (id, severity, sector_id, resource_type, message, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const upsertResourcePrice = db.prepare(`
    INSERT INTO sector_resource_prices (
      sector_id, resource_type, base_price, current_price, previous_price,
      demand_score, supply_score, speculation_score, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sector_id, resource_type) DO UPDATE SET
      previous_price = sector_resource_prices.current_price,
      current_price = excluded.current_price,
      demand_score = excluded.demand_score,
      supply_score = excluded.supply_score,
      speculation_score = excluded.speculation_score,
      updated_at = excluded.updated_at
  `);
  const existingPrice = db.prepare(`
    SELECT current_price AS currentPrice, speculation_score AS speculationScore
    FROM sector_resource_prices
    WHERE sector_id = ? AND resource_type = ?
  `);
  db.transaction(() => {
    context.sectors.forEach((sector) => {
      const demandByResource = calculateSectorDemand(sector.id, state, context);
      const importDependencyJson = {};
      const exportStrengthJson = {};
      let referenceSectorState = null;
      let multiplierTotal = 0;
      RESOURCE_KEYS.forEach((resourceKey) => {
        const demandRow = demandByResource[resourceKey];
        referenceSectorState = referenceSectorState || demandRow.sectorState;
        multiplierTotal += Number(demandRow.marketMultiplier || 1);
        importDependencyJson[resourceKey] = demandRow.importDependency;
        exportStrengthJson[resourceKey] = demandRow.exportStrength;
        upsertResourceDemand.run(
          sector.id,
          sector.name,
          resourceKey,
          demandRow.demandScore,
          demandRow.supplyScore,
          demandRow.importDependency,
          demandRow.exportStrength,
          demandRow.marketMultiplier,
          recordedAt
        );
        const basePrice = Number(RESOURCE_MARKET_CONFIG[resourceKey]?.basePrice || 100);
        const previous = existingPrice.get(sector.id, resourceKey);
        const rawPrice = basePrice
          * clamp(Number(demandRow.marketMultiplier || 1), 0.55, 1.95)
          * (1 + (Number(previous?.speculationScore || 0) * 0.08));
        const currentPrice = round2(
          previous?.currentPrice
            ? (Number(previous.currentPrice) * 0.88) + (rawPrice * 0.12)
            : rawPrice
        );
        upsertResourcePrice.run(
          sector.id,
          resourceKey,
          basePrice,
          Math.max(1, currentPrice),
          Math.max(1, Number(previous?.currentPrice || basePrice)),
          demandRow.demandScore,
          demandRow.supplyScore,
          round2(Number(previous?.speculationScore || 0) * 0.82),
          recordedAt
        );
        const report = createMarketIntelligenceReport({
          sectorName: sector.name,
          resourceKey,
          marketMultiplier: demandRow.marketMultiplier,
          warPressure: demandRow.sectorState.warPressure,
          exportStrength: demandRow.exportStrength,
          importDependency: demandRow.importDependency
        });
        if (report) insertReport.run(crypto.randomUUID(), report.severity, sector.id, resourceKey, report.message, recordedAt);
      });
      const controlStatus = mapSectorControlStatus(sector);
      const economyState = mapEconomyStateFromMultiplier(multiplierTotal / Math.max(1, RESOURCE_KEYS.length));
      upsertSectorEconomy.run(
        sector.id,
        sector.name,
        controlStatus,
        controlStatus === 'OPFOR' ? 1 : 0,
        economyState,
        referenceSectorState?.populationIndex || 1,
        referenceSectorState?.industrialIndex || 1,
        referenceSectorState?.logisticsIndex || 1,
        referenceSectorState?.warPressure || 0,
        referenceSectorState?.consumerConfidence || 1,
        referenceSectorState?.infrastructureDemand || 1,
        referenceSectorState?.blackMarketPressure || 0,
        JSON.stringify(importDependencyJson),
        JSON.stringify(exportStrengthJson),
        recordedAt,
        recordedAt
      );
    });
    db.prepare(`
      DELETE FROM market_intelligence_reports
      WHERE id NOT IN (
        SELECT id FROM market_intelligence_reports
        ORDER BY created_at DESC
        LIMIT ${MAX_INTELLIGENCE_REPORTS}
      )
    `).run();
  })();
  refreshHoldingSolvency(db, now);
  return { ran: true, recordedAt };
}

export function calculateCivilianMineYield(db, sectorName, resourceType, amount, state, options = {}) {
  const baseConfig = getMarketResourceConfig(resourceType);
  if (!baseConfig) return 0;
  const normalizedSector = String(sectorName || '').trim();
  if (isEconomyExcludedSector(normalizedSector)) return 0;
  const sectorState = db.prepare(`
    SELECT is_embargoed AS isEmbargoed, control_status AS controlStatus
    FROM sector_economy_state
    WHERE sector_name = ?
    LIMIT 1
  `).get(normalizedSector);
  if (Number(sectorState?.isEmbargoed || 0) || sectorState?.controlStatus === 'OPFOR') return 0;
  const producedAmount = Math.max(0, Number(amount || 0));
  const demandRow = db.prepare(`
    SELECT market_multiplier AS marketMultiplier, import_dependency AS importDependency
    FROM sector_resource_demand
    WHERE sector_name = ? AND resource_type = ?
  `).get(normalizedSector, resourceType);
  const company = db.prepare(`
    SELECT current_price AS currentPrice, base_price AS basePrice
    FROM market_companies
    WHERE sector = ? AND resource_key = ?
    LIMIT 1
  `).get(normalizedSector, resourceType);
  const marketConditionMultiplier = company?.basePrice
    ? clamp(Number(company.currentPrice || company.basePrice) / Number(company.basePrice || 1), 0.85, 1.25)
    : 1;
  const sectorDemandMultiplier = clamp(0.82 + Number(demandRow?.marketMultiplier || 1) * 0.22 + Number(demandRow?.importDependency || 0) * 0.05, 0.7, 1.45);
  const randomCivilianTradeFactor = clamp(1 + stableNoise(`civil:${normalizedSector}:${resourceType}:${Math.floor(Date.now() / (60 * 60 * 1000))}`, 0.035), 0.92, 1.08);
  return round2(
    producedAmount
      * baseConfig.basePrice
      * sectorDemandMultiplier
      * marketConditionMultiplier
      * randomCivilianTradeFactor
      * clamp(Number(options.additionalMultiplier || 1), 0.5, 2)
  );
}

export function applyDemandToMiningHolding(db, sectorName, resourceType, demandData, options = {}) {
  const company = db.prepare(`
    SELECT id, current_price AS currentPrice, base_price AS basePrice
    FROM market_companies
    WHERE sector = ? AND resource_key = ?
    LIMIT 1
  `).get(sectorName, resourceType);
  if (!company) return null;
  const recordedAt = options.recordedAt || new Date().toISOString();
  const demandPressure = (Number(demandData?.demandScore || 1) - Number(demandData?.supplyScore || 1)) * 0.012;
  const multiplierPressure = (Number(demandData?.marketMultiplier || 1) - 1) * 0.09;
  const inflationPressure = Math.min(0.08, Math.max(0, Number(options.inflationRate || 0))) * 0.04;
  const noise = stableNoise(`price:${sectorName}:${resourceType}:${Math.floor(Date.parse(recordedAt) / DEMAND_TICK_MS)}`, 0.018);
  const nextPrice = Math.max(
    25,
    round2(Number(company.currentPrice || company.basePrice || 0) * (1 + demandPressure + multiplierPressure + inflationPressure + noise))
  );
  db.prepare(`
    UPDATE market_companies
    SET previous_price = current_price, current_price = ?, updated_at = ?
    WHERE id = ?
  `).run(nextPrice, recordedAt, company.id);
  db.prepare(`
    INSERT INTO market_history (id, company_id, price, recorded_at)
    VALUES (?, ?, ?, ?)
  `).run(crypto.randomUUID(), company.id, nextPrice, recordedAt);
  updateOwnershipStructure(db, company.id, Date.parse(recordedAt) || Date.now());
  return { companyId: company.id, nextPrice };
}

export function runInstitutionalInvestorTick(state, options = {}) {
  const db = options.db;
  if (!db) return { ran: false, reason: 'no-db' };
  const now = Number(options.now || Date.now());
  const latestTrade = db.prepare('SELECT MAX(created_at) AS createdAt FROM institutional_trades').get()?.createdAt;
  if (latestTrade && (now - Date.parse(latestTrade)) < INSTITUTIONAL_TICK_MS) {
    return { ran: false, reason: 'cooldown' };
  }
  const recordedAt = new Date(now).toISOString();
  const demandRows = db.prepare(`
    SELECT sector_id AS sectorId, sector_name AS sectorName, resource_type AS resourceType,
      demand_score AS demandScore, supply_score AS supplyScore,
      import_dependency AS importDependency, export_strength AS exportStrength,
      market_multiplier AS marketMultiplier
    FROM sector_resource_demand d
    LEFT JOIN sector_economy_state s ON s.sector_id = d.sector_id
    WHERE COALESCE(s.is_embargoed, 0) = 0
      AND COALESCE(s.control_status, 'Neutral') <> 'OPFOR'
  `).all();
  if (!demandRows.length) return { ran: false, reason: 'no-demand' };
  const companies = db.prepare(`
    SELECT id, name, sector, resource_key AS resourceKey,
      current_price AS currentPrice, base_price AS basePrice,
      bankruptcy_risk AS bankruptcyRisk, market_status AS marketStatus
    FROM market_companies
    WHERE id LIKE 'sector_holding_%'
      AND COALESCE(is_embargoed, 0) = 0
      AND COALESCE(market_status, 'tradeable') = 'tradeable'
      AND acquired_by_company_id IS NULL
  `).all();
  const companyMap = new Map(companies.map((company) => [`${company.sector}::${company.resourceKey}`, company]));
  const recentPlayerDemand = new Map(db.prepare(`
    SELECT company_id AS companyId, COALESCE(SUM(quantity), 0) AS quantity
    FROM market_orders
    WHERE created_at >= ?
    GROUP BY company_id
  `).all(new Date(now - (2 * 60 * 60 * 1000)).toISOString()).map((row) => [row.companyId, Number(row.quantity || 0)]));
  const investors = db.prepare(`
    SELECT id, name, strategy, risk_tolerance AS riskTolerance,
      corruption_affinity AS corruptionAffinity, credit_balance AS creditBalance
    FROM institutional_investors
  `).all();
  const getInstHolding = db.prepare(`
    SELECT shares, average_cost AS averageCost
    FROM institutional_holdings
    WHERE investor_id = ? AND company_id = ?
  `);
  const addInstHolding = db.prepare(`
    INSERT INTO institutional_holdings (investor_id, company_id, shares, average_cost, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(investor_id, company_id) DO UPDATE SET
      average_cost = CASE
        WHEN institutional_holdings.shares + excluded.shares <= 0 THEN excluded.average_cost
        ELSE ((institutional_holdings.average_cost * institutional_holdings.shares) + (excluded.average_cost * excluded.shares))
          / (institutional_holdings.shares + excluded.shares)
      END,
      shares = institutional_holdings.shares + excluded.shares,
      updated_at = excluded.updated_at
  `);
  const reduceInstHolding = db.prepare(`
    UPDATE institutional_holdings
    SET shares = MAX(0, shares - ?), updated_at = ?
    WHERE investor_id = ? AND company_id = ?
  `);
  const insertTrade = db.prepare(`
    INSERT INTO institutional_trades (
      id, investor_id, company_id, sector_id, resource_type, action, quantity, price, reason,
      corruption_opportunity_score, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateInvestor = db.prepare(`
    UPDATE institutional_investors
    SET credit_balance = ?, updated_at = ?
    WHERE id = ?
  `);
  const insertCorruptionLog = db.prepare(`
    INSERT INTO corruption_watch_log (
      id, timestamp, policy_change_id, project_id, affected_sector, affected_resource,
      affected_holding, institutional_investor, trade_action, corruption_opportunity_score, estimated_benefit
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    investors.forEach((investor, index) => {
      const ranked = demandRows
        .map((row) => {
          const company = companyMap.get(`${row.sectorName}::${row.resourceType}`);
          if (!company) return null;
          const trendScore = Number(row.marketMultiplier || 1) + (Number(row.exportStrength || 0) * 0.18) - (Number(row.importDependency || 0) * 0.05);
          return { ...row, company, trendScore };
        })
        .filter(Boolean)
        .sort((left, right) => right.trendScore - left.trendScore);
      const pick = ranked[index % Math.max(1, ranked.length)];
      if (!pick) return;
      const priceRatio = Number(pick.company.currentPrice || 0) / Math.max(1, Number(pick.company.basePrice || 1));
      const retailDemand = Number(recentPlayerDemand.get(pick.company.id) || 0);
      const distress = Number(pick.company.bankruptcyRisk || 0);
      let strategyAction = pick.marketMultiplier > 1.12 ? 'front_run_policy' : 'sector_monopoly_building';
      if (retailDemand >= 50 && priceRatio >= 1.08) strategyAction = 'sell_into_retail_hype';
      else if (distress >= 0.72 || normalizeMarketStatus(pick.company.marketStatus) === 'insolvent') strategyAction = 'acquire_distressed_assets';
      else if (pick.marketMultiplier < 0.9 || priceRatio < 0.9) strategyAction = 'buy_the_dip';
      else if (Number(pick.importDependency || 0) > 0.5) strategyAction = 'liquidity_trap';
      else if (Number(pick.exportStrength || 0) > 0.55) strategyAction = 'war_profiteering';
      if (investor.strategy === 'hostile_takeover' && (distress >= 0.55 || priceRatio < 0.96)) strategyAction = 'hostile_takeover';
      if (investor.strategy === 'embargo_profiteering' && Number(pick.importDependency || 0) > 0.45) strategyAction = 'embargo_profiteering';
      const wantsToSell = strategyAction === 'sell_into_retail_hype';
      let quantity = Math.max(1, Math.round((investor.riskTolerance * 35) + (Math.abs(pick.marketMultiplier - 1) * 120) + (retailDemand / 6)));
      if (['hostile_takeover', 'acquire_distressed_assets'].includes(strategyAction)) quantity = Math.round(quantity * 2.8);
      const tradePrice = Number(pick.company.currentPrice || 0);
      const instHolding = getInstHolding.get(investor.id, pick.company.id);
      if (wantsToSell) {
        quantity = Math.min(quantity, roundShares(instHolding?.shares));
        if (quantity <= 0) return;
      } else {
        quantity = Math.min(quantity, getAvailableFreeFloatShares(db, pick.company.id));
        if (quantity <= 0) return;
      }
      const value = round2(tradePrice * quantity);
      let nextBalance = Number(investor.creditBalance || 0);
      if (!wantsToSell && nextBalance < value) return;
      const corruptionOpportunityScore = calculateCorruptionOpportunity(
        { subsidy: getPolicyForEconomy(db).subsidy, activeShipProjects: 1, resourceType: pick.resourceType },
        pick.sectorName,
        pick.resourceType
      ) * Number(investor.corruptionAffinity || 0.5);
      nextBalance = wantsToSell ? nextBalance + value : nextBalance - value;
      if (wantsToSell) {
        reduceInstHolding.run(quantity, recordedAt, investor.id, pick.company.id);
      } else {
        addInstHolding.run(investor.id, pick.company.id, quantity, tradePrice, recordedAt);
      }
      updateInvestor.run(round2(nextBalance), recordedAt, investor.id);
      insertTrade.run(
        crypto.randomUUID(),
        investor.id,
        pick.company.id,
        pick.sectorId,
        pick.resourceType,
        wantsToSell ? 'SELL' : 'BUY',
        quantity,
        tradePrice,
        wantsToSell ? 'Überproduktion / politische Unsicherheit' : 'Steigende Nachfrageprognose',
        round2(corruptionOpportunityScore),
        recordedAt
      );
      const ownership = updateOwnershipStructure(db, pick.company.id, now);
      if (ownership?.controllingShareholder === investor.name) {
        const controlPercent = ownership.rows.find((row) => row.name === investor.name)?.percent || 0;
        if (controlPercent >= 51) {
          insertMarketEvent(db, {
            eventType: 'institutional_takeover',
            title: 'Institutionelle Kontrollmehrheit',
            description: `${investor.name} sichert sich Kontrollanteil an ${pick.company.name}.`,
            impact: controlPercent >= 75 ? -0.02 : 0.01,
            startedAt: recordedAt
          });
        }
      }
      if (corruptionOpportunityScore >= 0.45) {
        insertCorruptionLog.run(
          crypto.randomUUID(),
          recordedAt,
          `policy_${recordedAt.slice(0, 13)}`,
          '',
          pick.sectorName,
          pick.resourceType,
          pick.company.name,
          investor.name,
          wantsToSell ? 'SELL' : 'BUY',
          round2(corruptionOpportunityScore),
          round2(value * Math.max(0.08, pick.marketMultiplier - 0.92))
        );
      }
      applyDemandToMiningHolding(db, pick.sectorName, pick.resourceType, pick, {
        inflationRate: options.inflationRate || 0,
        recordedAt
      });
    });
    db.prepare(`
      DELETE FROM institutional_trades
      WHERE id NOT IN (
        SELECT id FROM institutional_trades
        ORDER BY created_at DESC
        LIMIT ${MAX_TRADE_HISTORY_ROWS}
      )
    `).run();
  })();
  return { ran: true, recordedAt };
}

export function readMarketSnapshot(db, investorId = '', userId = '') {
  const portfolio = investorId ? ensureRecentPortfolioSnapshot(db, investorId) : null;
  const companies = db.prepare(`
    SELECT id, symbol, name, faction, base_price AS basePrice,
      sector, sector_id AS sectorId, resource_key AS resourceKey, resource_refs_json AS resourceRefsJson,
      market_status AS marketStatus, bankruptcy_risk AS bankruptcyRisk,
      debt_index AS debtIndex, confidence_index AS confidenceIndex,
      is_embargoed AS isEmbargoed, acquired_by_company_id AS acquiredByCompanyId,
      merged_name AS mergedName, current_price AS currentPrice,
      previous_price AS previousPrice, total_shares AS totalShares,
      free_float_shares AS freeFloatShares, locked_institutional_shares AS lockedInstitutionalShares,
      market_cap AS marketCap, major_shareholders_json AS majorShareholdersJson,
      controlling_shareholder AS controllingShareholder, ownership_updated_at AS ownershipUpdatedAt,
      updated_at AS updatedAt
    FROM market_companies ORDER BY symbol
  `).all().map((company) => ({
    ...company,
    resourceRefs: parseResourceRefs(company),
    majorShareholders: safeJsonParse(company.majorShareholdersJson, []),
    marketStatusLabel: displayMarketStatus(company.marketStatus),
    isEmbargoed: Boolean(company.isEmbargoed)
  }));
  const historyCutoff = new Date(Date.now() - ACP_HISTORY_WINDOW_MS).toISOString();
  const historyRows = db.prepare(`
    SELECT h.company_id AS companyId, h.price, h.recorded_at AS recordedAt, c.resource_key AS resourceKey
    FROM market_history h
    LEFT JOIN market_companies c ON c.id = h.company_id
    WHERE recorded_at >= ?
    ORDER BY recorded_at
  `).all(historyCutoff);
  const history = {};
  historyRows.forEach((row) => {
    if (!history[row.companyId]) history[row.companyId] = [];
    history[row.companyId].push({ price: row.price, recordedAt: row.recordedAt });
  });
  const hourCutoff = Date.now() - (60 * 60 * 1000);
  const topLastHour = companies.map((company) => {
    const points = history[company.id] || [];
    const referencePoint = [...points].reverse().find((point) => Date.parse(point.recordedAt) <= hourCutoff)
      || points.find((point) => Date.parse(point.recordedAt) >= hourCutoff);
    const referencePrice = Number(referencePoint?.price || company.previousPrice || company.currentPrice || 0);
    const currentPrice = Number(company.currentPrice || 0);
    const change = currentPrice - referencePrice;
    const changePercent = referencePrice > 0 ? (change / referencePrice) * 100 : 0;
    return {
      ...company,
      referencePrice,
      change,
      changePercent
    };
  }).sort((left, right) => (
    right.changePercent - left.changePercent
    || right.currentPrice - left.currentPrice
  )).slice(0, 50);
  const holdings = investorId ? db.prepare(`
    SELECT company_id AS companyId, shares
    FROM market_holdings WHERE investor_id = ?
  `).all(investorId) : [];
  const investor = investorId ? getOrCreateMarketInvestor(db, investorId, userId) : null;
  const purchaseOrders = investorId ? db.prepare(`
    SELECT id, company_id AS companyId, quantity, unit_price AS unitPrice,
      total_value AS totalValue, remaining_quantity AS remainingQuantity,
      realized_profit AS realizedProfit, closed_at AS closedAt, created_at AS createdAt
    FROM market_orders
    WHERE investor_id = ?
    ORDER BY created_at ASC
  `).all(investorId) : [];
  const portfolioHistory = investorId ? readPortfolioHistory(db, investorId, 'sixMonths') : [];
  const leaderboard = db.prepare(`
    SELECT i.alias,
      ROUND(i.balance + COALESCE(SUM(h.shares * c.current_price), 0), 2) AS portfolioValue,
      ROUND(i.balance, 2) AS cashBalance,
      COALESCE(SUM(h.shares), 0) AS totalShares
    FROM market_investors i
    LEFT JOIN market_holdings h ON h.investor_id = i.id
    LEFT JOIN market_companies c ON c.id = h.company_id
    WHERE i.portfolio_enabled = 1
    GROUP BY i.id
    ORDER BY portfolioValue DESC
    LIMIT 20
  `).all();
  const events = db.prepare(`
    SELECT id, event_type AS eventType, title, description, impact,
      started_at AS startedAt, ends_at AS endsAt
    FROM market_events
    ORDER BY started_at DESC LIMIT 15
  `).all();
  const policy = getPolicyForEconomy(db);
  const sectorDemand = db.prepare(`
    SELECT sector_id AS sectorId, sector_name AS sectorName, resource_type AS resourceType,
      demand_score AS demandScore, supply_score AS supplyScore,
      import_dependency AS importDependency, export_strength AS exportStrength,
      market_multiplier AS marketMultiplier, updated_at AS updatedAt
    FROM sector_resource_demand
    ORDER BY sector_name COLLATE NOCASE, resource_type
  `).all();
  const intelligenceReports = db.prepare(`
    SELECT id, severity, sector_id AS sectorId, resource_type AS resourceType, message, created_at AS createdAt
    FROM market_intelligence_reports
    ORDER BY created_at DESC
    LIMIT 20
  `).all();
  const institutionalTrades = db.prepare(`
    SELECT t.id, i.name AS investorName, t.company_id AS companyId, t.sector_id AS sectorId,
      t.resource_type AS resourceType, t.action, t.quantity, t.price, t.reason,
      t.corruption_opportunity_score AS corruptionOpportunityScore, t.created_at AS createdAt
    FROM institutional_trades t
    LEFT JOIN institutional_investors i ON i.id = t.investor_id
    ORDER BY t.created_at DESC
    LIMIT 20
  `).all();
  const factionAccounts = Object.fromEntries(db.prepare(`
    SELECT faction, credits, updated_at AS updatedAt
    FROM faction_accounts ORDER BY faction
  `).all().map((account) => [account.faction, account]));
  const acp = buildAcpSnapshot(companies, historyRows.filter((row) => RESOURCE_KEYS.includes(row.resourceKey)));
  return {
    companies,
    history,
    topLastHour,
    holdings,
    purchaseOrders,
    portfolio,
    portfolioHistory,
    investor,
    leaderboard,
    events,
    policy,
    factionAccounts,
    sectorDemand,
    intelligenceReports,
    institutionalTrades,
    acp
  };
}

function coarseMetricLabel(value) {
  const numeric = Number(value || 0);
  if (numeric >= 1.35) return 'Sehr hoch';
  if (numeric >= 1.08) return 'Hoch';
  if (numeric >= 0.84) return 'Mittel';
  if (numeric >= 0.55) return 'Niedrig';
  return 'Sehr niedrig';
}

function toMetric(value) {
  const numeric = round2(Number(value || 0));
  return { value: numeric, label: coarseMetricLabel(numeric) };
}

function getSectorMaps(state) {
  const manualSectors = buildCanonicalManualSectors(state);
  const sectors = buildSectorMembership(state, manualSectors);
  return {
    manualSectors,
    sectors,
    byId: new Map(sectors.map((sector) => [String(sector.id), sector]))
  };
}

function getSectorStateRow(db, sectorId) {
  return db.prepare(`
    SELECT sector_id AS sectorId, sector_name AS sectorName, control_status AS controlStatus,
      is_embargoed AS isEmbargoed, economy_state AS economyState,
      population_index AS populationIndex, industrial_index AS industrialIndex,
      logistics_index AS logisticsIndex, war_pressure AS warPressure,
      consumer_confidence AS consumerConfidence, infrastructure_demand AS infrastructureDemand,
      black_market_pressure AS blackMarketPressure,
      import_dependency_json AS importDependencyJson, export_strength_json AS exportStrengthJson,
      last_updated AS lastUpdated, last_demand_tick AS lastDemandTick
    FROM sector_economy_state
    WHERE sector_id = ?
  `).get(sectorId);
}

function normalizeSectorEconomyRow(db, sector) {
  const row = getSectorStateRow(db, sector.id);
  const controlStatus = row?.controlStatus || mapSectorControlStatus(sector);
  const isEmbargoed = Boolean(Number(row?.isEmbargoed || 0) || controlStatus === 'OPFOR');
  const importDependency = safeJsonParse(row?.importDependencyJson, {});
  const exportStrength = safeJsonParse(row?.exportStrengthJson, {});
  const averageImport = average(RESOURCE_KEYS.map((key) => Number(importDependency[key] || 0.35)));
  const averageExport = average(RESOURCE_KEYS.map((key) => Number(exportStrength[key] || 0.1)));
  return {
    sectorId: sector.id,
    sectorName: sector.name,
    controlStatus,
    isEmbargoed,
    economyState: row?.economyState || 'Normal',
    consumerStrength: toMetric(row?.consumerConfidence || row?.populationIndex || 1),
    industryStrength: toMetric(row?.industrialIndex || 1),
    logisticsStrength: toMetric(row?.logisticsIndex || 1),
    warPressure: toMetric(row?.warPressure || 0),
    importDependency: toMetric(averageImport),
    exportStrength: toMetric(averageExport),
    importDependencyByResource: importDependency,
    exportStrengthByResource: exportStrength,
    blackMarketPressure: toMetric(row?.blackMarketPressure || (isEmbargoed ? 1.2 : 0.15)),
    lastUpdated: row?.lastUpdated || row?.lastDemandTick || null
  };
}

function sectorResourceLabel(resourceKey) {
  return RESOURCE_MARKET_CONFIG[resourceKey]?.label || resourceKey;
}

function getSectorResourcePrices(db, sectorId) {
  const rows = db.prepare(`
    SELECT sector_id AS sectorId, resource_type AS resourceType, base_price AS basePrice,
      current_price AS currentPrice, previous_price AS previousPrice,
      demand_score AS demandScore, supply_score AS supplyScore,
      speculation_score AS speculationScore, updated_at AS updatedAt
    FROM sector_resource_prices
    WHERE sector_id = ?
    ORDER BY resource_type
  `).all(sectorId);
  const byResource = new Map(rows.map((row) => [row.resourceType, row]));
  return RESOURCE_KEYS.map((resourceKey) => {
    const row = byResource.get(resourceKey);
    const basePrice = RESOURCE_MARKET_CONFIG[resourceKey]?.basePrice || 100;
    const currentPrice = Number(row?.currentPrice || basePrice);
    const previousPrice = Number(row?.previousPrice || basePrice);
    return {
      resourceType: resourceKey,
      label: sectorResourceLabel(resourceKey),
      basePrice,
      currentPrice: round2(currentPrice),
      previousPrice: round2(previousPrice),
      change: round2(currentPrice - previousPrice),
      changePercent: previousPrice > 0 ? round2(((currentPrice - previousPrice) / previousPrice) * 100) : 0,
      demandScore: round2(Number(row?.demandScore || 1)),
      supplyScore: round2(Number(row?.supplyScore || 1)),
      speculationScore: round2(Number(row?.speculationScore || 0)),
      updatedAt: row?.updatedAt || null
    };
  });
}

function getMineMetaFromSlot(slot) {
  const key = String(slot || '');
  if (RESOURCE_KEYS.includes(key)) {
    return {
      category: 'military',
      resourceType: key,
      productionRatePerHour: 1,
      yieldType: 'Militärischer Ressourcenpool'
    };
  }
  if (key.startsWith('civilian_')) {
    const resourceType = key.replace('civilian_', '');
    if (RESOURCE_KEYS.includes(resourceType)) {
      return {
        category: 'civilian',
        resourceType,
        productionRatePerHour: 1,
        yieldType: 'Zivile Credits'
      };
    }
  }
  if (key.startsWith('civil_')) {
    return {
      category: 'infrastructure',
      resourceType: '',
      productionRatePerHour: 0,
      yieldType: 'Infrastruktur'
    };
  }
  return null;
}

function prettifyInfrastructureName(key) {
  return String(key || '')
    .replace(/^civilian_/, 'Zivile ')
    .replace(/^civil_/, 'Zivile ')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function getSectorInfrastructure(state, sector, economy) {
  const slotsByPlanet = state?.planetResources || {};
  const buildJobs = Array.isArray(state?.buildJobs) ? state.buildJobs : [];
  const buildingJobsByPlanet = new Map();
  buildJobs.forEach((job) => {
    if (job?.status !== 'building') return;
    const planetId = job?.buildLocationPlanetId || job?.locationId;
    if (!planetId) return;
    if (!buildingJobsByPlanet.has(planetId)) buildingJobsByPlanet.set(planetId, []);
    buildingJobsByPlanet.get(planetId).push(job);
  });
  const output = { civilian: [], military: [], infrastructure: [] };
  sector.planets.forEach((planet) => {
    const slots = Array.isArray(slotsByPlanet?.[planet.id]) ? slotsByPlanet[planet.id] : [];
    slots.forEach((slot, index) => {
      const meta = getMineMetaFromSlot(slot);
      if (!meta) return;
      const status = economy.isEmbargoed && meta.category === 'civilian' ? 'Embargo' : 'Aktiv';
      const entry = {
        id: `${planet.id}_${index}_${slot}`,
        name: `${planet.name || 'Planet'} ${prettifyInfrastructureName(slot)}`,
        planetName: planet.name || '',
        resourceType: meta.resourceType,
        resourceLabel: meta.resourceType ? sectorResourceLabel(meta.resourceType) : 'Infrastruktur',
        owner: planet.owner || 'NEUTRAL',
        productionRatePerHour: meta.productionRatePerHour,
        status,
        yieldType: meta.yieldType
      };
      if (meta.category === 'military') output.military.push(entry);
      else if (meta.category === 'civilian') output.civilian.push(entry);
      else output.infrastructure.push(entry);
    });
    (buildingJobsByPlanet.get(planet.id) || []).forEach((job) => {
      const meta = getMineMetaFromSlot(job.buildingKey || job.resourceKey);
      if (!meta) return;
      const entry = {
        id: job.id,
        name: job.projectName || `${planet.name || 'Planet'} ${prettifyInfrastructureName(job.buildingKey || job.resourceKey)}`,
        planetName: planet.name || '',
        resourceType: meta.resourceType,
        resourceLabel: meta.resourceType ? sectorResourceLabel(meta.resourceType) : 'Infrastruktur',
        owner: job.faction || planet.owner || 'GAR',
        productionRatePerHour: meta.productionRatePerHour,
        status: 'Im Bau',
        yieldType: meta.yieldType
      };
      if (meta.category === 'military') output.military.push(entry);
      else if (meta.category === 'civilian') output.civilian.push(entry);
      else output.infrastructure.push(entry);
    });
  });
  return output;
}

function getSectorHoldings(db, sectorId, economy) {
  const dayCutoff = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
  const rows = db.prepare(`
    SELECT id, symbol, name, faction, sector, sector_id AS sectorId,
      resource_key AS resourceKey, resource_refs_json AS resourceRefsJson,
      base_price AS basePrice, current_price AS currentPrice, previous_price AS previousPrice,
      market_status AS marketStatus, bankruptcy_risk AS bankruptcyRisk,
      debt_index AS debtIndex, confidence_index AS confidenceIndex,
      is_embargoed AS isEmbargoed, acquired_by_company_id AS acquiredByCompanyId,
      merged_name AS mergedName, total_shares AS totalShares,
      free_float_shares AS freeFloatShares, locked_institutional_shares AS lockedInstitutionalShares,
      market_cap AS marketCap, major_shareholders_json AS majorShareholdersJson,
      controlling_shareholder AS controllingShareholder, ownership_updated_at AS ownershipUpdatedAt,
      updated_at AS updatedAt
    FROM market_companies
    WHERE sector_id = ? AND id LIKE 'sector_holding_%'
    ORDER BY name COLLATE NOCASE
  `).all(sectorId);
  const referencePrice = db.prepare(`
    SELECT price FROM market_history
    WHERE company_id = ? AND recorded_at <= ?
    ORDER BY recorded_at DESC LIMIT 1
  `);
  return rows.map((company) => {
    const refs = parseResourceRefs(company);
    const ref = referencePrice.get(company.id, dayCutoff);
    const previous = Number(ref?.price || company.previousPrice || company.currentPrice || 0);
    const current = Number(company.currentPrice || 0);
    const rawStatus = normalizeMarketStatus(company.marketStatus);
    const marketStatus = economy?.isEmbargoed || Number(company.isEmbargoed || 0) ? 'embargo' : rawStatus;
    return {
      id: company.id,
      symbol: company.symbol,
      name: company.mergedName || company.name,
      faction: company.faction,
      sector: company.sector,
      sectorId: company.sectorId,
      resourceKey: company.resourceKey,
      resourceRefs: refs,
      resourceLabels: refs.map(sectorResourceLabel),
      currentPrice: round2(current),
      previousPrice: round2(previous),
      dailyChange: round2(current - previous),
      dailyChangePercent: previous > 0 ? round2(((current - previous) / previous) * 100) : 0,
      economyState: economy?.economyState || 'Normal',
      bankruptcyRisk: round2(Number(company.bankruptcyRisk || 0)),
      totalShares: roundShares(company.totalShares),
      freeFloatShares: roundShares(company.freeFloatShares),
      lockedInstitutionalShares: roundShares(company.lockedInstitutionalShares),
      marketCap: round2(company.marketCap),
      majorShareholders: safeJsonParse(company.majorShareholdersJson, []),
      controllingShareholder: company.controllingShareholder || '',
      marketStatus,
      marketStatusLabel: displayMarketStatus(marketStatus),
      isEmbargoed: marketStatus === 'embargo',
      updatedAt: company.updatedAt
    };
  });
}

function getRecentSectorPurchases(db, sectorId) {
  return db.prepare(`
    SELECT id, sector_id AS sectorId, resource_type AS resourceType, quantity,
      unit_price AS unitPrice, total_price AS totalPrice,
      buyer_role AS buyerRole, buyer_name AS buyerName, buyer_account AS buyerAccount,
      created_at AS createdAt
    FROM civilian_resource_purchases
    WHERE sector_id = ?
    ORDER BY created_at DESC
    LIMIT 25
  `).all(sectorId).map((row) => ({
    ...row,
    resourceLabel: sectorResourceLabel(row.resourceType)
  }));
}

export function listEconomySectors(db, state) {
  const { sectors } = getSectorMaps(state);
  return sectors.map((sector) => {
    const economy = normalizeSectorEconomyRow(db, sector);
    return {
      id: sector.id,
      name: sector.name,
      controlStatus: economy.controlStatus,
      isEmbargoed: economy.isEmbargoed,
      economyState: economy.economyState,
      isEconomyExcluded: isEconomyExcludedSector(sector.name),
      planetCount: sector.planets.length
    };
  }).sort((left, right) => left.name.localeCompare(right.name, 'de', { numeric: true }));
}

export function readEconomySector(db, state, sectorId) {
  const { byId } = getSectorMaps(state);
  const sector = byId.get(String(sectorId || ''));
  if (!sector) {
    const error = new Error('Sektor nicht gefunden.');
    error.status = 404;
    throw error;
  }
  const economy = normalizeSectorEconomyRow(db, sector);
  const isEconomyExcluded = isEconomyExcludedSector(sector.name);
  if (isEconomyExcluded) {
    return {
      id: sector.id,
      name: sector.name,
      isEconomyExcluded: true,
      exclusionReason: 'Dieser Sektor hat keine Wirtschaft und keine Holdings.',
      economy,
      mines: { civilian: [], military: [], infrastructure: [] },
      holdings: [],
      resourcePrices: [],
      purchases: []
    };
  }
  const infrastructure = getSectorInfrastructure(state, sector, economy);
  return {
    id: sector.id,
    name: sector.name,
    isEconomyExcluded: false,
    economy,
    mines: {
      civilian: infrastructure.civilian,
      military: infrastructure.military
    },
    infrastructure: infrastructure.infrastructure,
    holdings: getSectorHoldings(db, sector.id, economy),
    resourcePrices: getSectorResourcePrices(db, sector.id),
    purchases: getRecentSectorPurchases(db, sector.id)
  };
}

export function readEconomySectorHoldings(db, state, sectorId) {
  return readEconomySector(db, state, sectorId).holdings;
}

function insertMarketEvent(db, { eventType, title, description, impact = 0, startedAt = new Date().toISOString(), durationMs = 24 * 60 * 60 * 1000 }) {
  db.prepare(`
    INSERT INTO market_events (id, event_type, title, description, impact, started_at, ends_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    eventType,
    title,
    description,
    round2(impact),
    startedAt,
    new Date(Date.parse(startedAt) + durationMs).toISOString()
  );
}

export function buyCivilianSectorResource(db, state, input = {}) {
  const resourceType = String(input.resourceType || '');
  const quantity = Math.floor(Number(input.quantity || 0));
  if (!RESOURCE_KEYS.includes(resourceType)) {
    const error = new Error('Ungültige Ressource.');
    error.status = 400;
    throw error;
  }
  if (!Number.isFinite(quantity) || quantity < 1 || quantity > 100000) {
    const error = new Error('Ungültige Menge.');
    error.status = 400;
    throw error;
  }
  const detail = readEconomySector(db, state, input.sectorId);
  if (detail.isEconomyExcluded) {
    const error = new Error('Dieser Sektor hat keine zivile Wirtschaft.');
    error.status = 409;
    throw error;
  }
  if (detail.economy.isEmbargoed || detail.economy.controlStatus === 'OPFOR') {
    const error = new Error('Dieser Sektor steht unter Embargo. Ziviler Handel ist blockiert.');
    error.status = 409;
    throw error;
  }
  if (detail.economy.controlStatus !== 'BLUFOR') {
    const error = new Error('Zivile GAR-Beschaffung ist nur in BLUFOR-Sektoren erlaubt.');
    error.status = 409;
    throw error;
  }
  const priceRow = detail.resourcePrices.find((entry) => entry.resourceType === resourceType);
  const unitPrice = round2(Math.max(1, Number(priceRow?.currentPrice || RESOURCE_MARKET_CONFIG[resourceType].basePrice)));
  const totalPrice = round2(unitPrice * quantity);
  const nextState = JSON.parse(JSON.stringify(state || {}));
  nextState.resources = nextState.resources || {};
  nextState.resources.GAR = nextState.resources.GAR || {};
  const availableCredits = Number(nextState.resources.GAR.credits || 0);
  if (!Number.isFinite(availableCredits) || availableCredits < totalPrice) {
    const error = new Error('Nicht genug GAR-Credits für diesen Ressourcenkauf.');
    error.status = 409;
    throw error;
  }
  const purchasedAt = new Date(input.now || Date.now()).toISOString();
  nextState.resources.GAR.credits = round2(availableCredits - totalPrice);
  nextState.resources.GAR[resourceType] = round2(Number(nextState.resources.GAR[resourceType] || 0) + quantity);

  return db.transaction(() => {
    const speculationImpact = round2(Math.min(1.4, 0.04 + Math.sqrt(quantity) / 120));
    const priceImpact = Math.min(0.18, 0.008 + Math.sqrt(quantity) / 420);
    const nextUnitPrice = round2(unitPrice * (1 + priceImpact));
    db.prepare(`
      INSERT INTO sector_resource_prices (
        sector_id, resource_type, base_price, current_price, previous_price,
        demand_score, supply_score, speculation_score, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sector_id, resource_type) DO UPDATE SET
        previous_price = sector_resource_prices.current_price,
        current_price = excluded.current_price,
        demand_score = sector_resource_prices.demand_score + ?,
        speculation_score = MIN(2, sector_resource_prices.speculation_score + ?),
        updated_at = excluded.updated_at
    `).run(
      detail.id,
      resourceType,
      RESOURCE_MARKET_CONFIG[resourceType].basePrice,
      nextUnitPrice,
      unitPrice,
      Number(priceRow?.demandScore || 1) + Math.min(0.45, quantity / 5000),
      Number(priceRow?.supplyScore || 1),
      speculationImpact,
      purchasedAt,
      Math.min(0.45, quantity / 5000),
      speculationImpact
    );
    db.prepare(`
      INSERT INTO civilian_resource_purchases (
        id, sector_id, resource_type, quantity, unit_price, total_price,
        buyer_role, buyer_name, buyer_account, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      detail.id,
      resourceType,
      quantity,
      unitPrice,
      totalPrice,
      input.buyerRole || 'Unbekannt',
      input.buyerName || 'Unbekannt',
      input.buyerAccount || 'GAR',
      purchasedAt
    );
    applyDemandToMiningHolding(db, detail.name, resourceType, {
      demandScore: Number(priceRow?.demandScore || 1) + Math.min(1.25, quantity / 2200),
      supplyScore: Number(priceRow?.supplyScore || 1),
      marketMultiplier: 1 + priceImpact + (speculationImpact * 0.04)
    }, {
      inflationRate: Math.min(0.25, Number(nextState.resources.GAR.credits || 0) / 2000000),
      recordedAt: purchasedAt
    });
    insertMarketEvent(db, {
      eventType: input.buyerRole === 'Republic Navy Admin' ? 'navy_procurement' : 'senate_civilian_purchase',
      title: input.buyerRole === 'Republic Navy Admin' ? 'Navy-Beschaffung' : 'Senatskauf ziviler Ressourcen',
      description: `${input.buyerName || input.buyerRole || 'GAR'} kauft ${quantity} ${sectorResourceLabel(resourceType)} im Sektor ${detail.name}. Lokale Holdings reagieren spekulativ.`,
      impact: priceImpact,
      startedAt: purchasedAt
    });
    db.prepare(`
      INSERT INTO market_intelligence_reports (id, severity, sector_id, resource_type, message, created_at)
      VALUES (?, 'positive', ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      detail.id,
      resourceType,
      `${sectorResourceLabel(resourceType)}-Beschaffung im Sektor ${detail.name} erhöht lokale Nachfrage und Holding-Spekulation.`,
      purchasedAt
    );
    return {
      state: nextState,
      purchase: {
        sectorId: detail.id,
        sectorName: detail.name,
        resourceType,
        resourceLabel: sectorResourceLabel(resourceType),
        quantity,
        unitPrice,
        totalPrice,
        nextUnitPrice,
        buyerRole: input.buyerRole || '',
        buyerName: input.buyerName || '',
        createdAt: purchasedAt
      }
    };
  })();
}

export function setSectorEmbargo(db, state, input = {}) {
  const detail = readEconomySector(db, state, input.sectorId);
  if (detail.isEconomyExcluded) {
    const error = new Error('Dieser Sektor hat keine Wirtschaft.');
    error.status = 409;
    throw error;
  }
  const isEmbargoed = Boolean(input.isEmbargoed);
  const now = new Date(input.now || Date.now()).toISOString();
  const economy = detail.economy;
  db.transaction(() => {
    db.prepare(`
      INSERT INTO sector_economy_state (
        sector_id, sector_name, control_status, is_embargoed, economy_state,
        population_index, industrial_index, logistics_index, war_pressure,
        consumer_confidence, infrastructure_demand, black_market_pressure,
        import_dependency_json, export_strength_json, last_demand_tick, last_updated
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(sector_id) DO UPDATE SET
        is_embargoed = excluded.is_embargoed,
        last_updated = excluded.last_updated
    `).run(
      detail.id,
      detail.name,
      economy.controlStatus,
      isEmbargoed ? 1 : 0,
      economy.economyState,
      economy.consumerStrength.value || 1,
      economy.industryStrength.value || 1,
      economy.logisticsStrength.value || 1,
      economy.warPressure.value || 0,
      economy.consumerStrength.value || 1,
      1,
      economy.blackMarketPressure.value || 0,
      JSON.stringify(economy.importDependencyByResource || {}),
      JSON.stringify(economy.exportStrengthByResource || {}),
      now,
      now
    );
    db.prepare(`
      UPDATE market_companies
      SET is_embargoed = ?, market_status = ?, updated_at = ?
      WHERE sector_id = ? AND id LIKE 'sector_holding_%'
    `).run(isEmbargoed ? 1 : 0, isEmbargoed ? 'embargo' : 'tradeable', now, detail.id);
    insertMarketEvent(db, {
      eventType: isEmbargoed ? 'embargo_imposed' : 'embargo_lifted',
      title: isEmbargoed ? 'Embargo verhängt' : 'Embargo aufgehoben',
      description: isEmbargoed
        ? `Embargo gegen den Sektor ${detail.name} blockiert zivilen Handel.`
        : `Embargo gegen den Sektor ${detail.name} wurde aufgehoben; ziviler Handel kann wieder anlaufen.`,
      impact: isEmbargoed ? -0.08 : 0.05,
      startedAt: now
    });
  })();
  return readEconomySector(db, state, detail.id);
}

export function refreshHoldingSolvency(db, now = Date.now()) {
  const recordedAt = new Date(now).toISOString();
  const rows = db.prepare(`
    SELECT c.id, c.name, c.sector, c.sector_id AS sectorId, c.resource_key AS resourceKey,
      c.resource_refs_json AS resourceRefsJson, c.current_price AS currentPrice, c.base_price AS basePrice,
      c.bankruptcy_risk AS bankruptcyRisk, c.debt_index AS debtIndex, c.confidence_index AS confidenceIndex,
      c.market_status AS marketStatus, c.is_embargoed AS isEmbargoed,
      s.market_multiplier AS marketMultiplier, e.is_embargoed AS sectorEmbargoed,
      e.economy_state AS economyState
    FROM market_companies c
    LEFT JOIN sector_resource_demand s ON s.sector_id = c.sector_id AND s.resource_type = c.resource_key
    LEFT JOIN sector_economy_state e ON e.sector_id = c.sector_id
    WHERE c.id LIKE 'sector_holding_%' AND c.acquired_by_company_id IS NULL
  `).all();
  const updateRisk = db.prepare(`
    UPDATE market_companies
    SET bankruptcy_risk = ?, debt_index = ?, confidence_index = ?, market_status = ?, is_embargoed = ?, updated_at = ?
    WHERE id = ?
  `);
  db.transaction(() => {
    rows.forEach((company) => {
      const pricePressure = clamp(1 - (Number(company.currentPrice || 0) / Math.max(1, Number(company.basePrice || 1))), -0.4, 0.8);
      const demandPressure = clamp(1 - Number(company.marketMultiplier || 1), -0.35, 0.75);
      const embargoPressure = Number(company.sectorEmbargoed || company.isEmbargoed || 0) ? 0.25 : 0;
      const recessionPressure = company.economyState === 'Rezession' ? 0.14 : company.economyState === 'Abschwung' ? 0.08 : -0.04;
      const nextRisk = clamp(
        Number(company.bankruptcyRisk || 0) * 0.78
          + pricePressure * 0.14
          + demandPressure * 0.18
          + embargoPressure
          + recessionPressure,
        0,
        1
      );
      const nextDebt = clamp(Number(company.debtIndex || 0.1) + (nextRisk > 0.62 ? 0.035 : -0.018), 0, 1);
      const nextConfidence = clamp(Number(company.confidenceIndex || 1) + (nextRisk > 0.65 ? -0.04 : 0.02), 0.1, 1.4);
      const embargoed = Number(company.sectorEmbargoed || company.isEmbargoed || 0) ? 1 : 0;
      let nextStatus = embargoed ? 'embargo' : normalizeMarketStatus(company.marketStatus);
      if (!embargoed && nextRisk >= 0.92) nextStatus = 'insolvent';
      else if (!embargoed && nextRisk >= 0.8) nextStatus = 'suspended';
      else if (!embargoed && ['embargo', 'suspended'].includes(nextStatus) && nextRisk < 0.7) nextStatus = 'tradeable';
      updateRisk.run(round2(nextRisk), round2(nextDebt), round2(nextConfidence), nextStatus, embargoed, recordedAt, company.id);
      if (nextStatus === 'insolvent' && normalizeMarketStatus(company.marketStatus) !== 'insolvent') {
        insertMarketEvent(db, {
          eventType: 'holding_bankruptcy',
          title: 'Holding-Insolvenz',
          description: `${company.name} meldet nach anhaltender Schwäche im Sektor ${company.sector} Insolvenzrisiko an; Handel wird ausgesetzt.`,
          impact: -0.12,
          startedAt: recordedAt
        });
      }
    });
    const candidates = db.prepare(`
      SELECT id, name, sector_id AS sectorId, resource_refs_json AS resourceRefsJson,
        current_price AS currentPrice, base_price AS basePrice, bankruptcy_risk AS bankruptcyRisk,
        market_status AS marketStatus
      FROM market_companies
      WHERE id LIKE 'sector_holding_%' AND acquired_by_company_id IS NULL
    `).all();
    const bySector = new Map();
    candidates.forEach((company) => {
      if (!bySector.has(company.sectorId)) bySector.set(company.sectorId, []);
      bySector.get(company.sectorId).push(company);
    });
    bySector.forEach((sectorCompanies, sectorId) => {
      const weak = sectorCompanies.find((company) => (
        normalizeMarketStatus(company.marketStatus) === 'insolvent'
        || Number(company.bankruptcyRisk || 0) >= 0.96
      ));
      const strong = sectorCompanies
        .filter((company) => company.id !== weak?.id && normalizeMarketStatus(company.marketStatus) === 'tradeable')
        .sort((left, right) => (
          (Number(right.currentPrice || 0) / Math.max(1, Number(right.basePrice || 1)))
          - (Number(left.currentPrice || 0) / Math.max(1, Number(left.basePrice || 1)))
        ))[0];
      if (!weak || !strong) return;
      const mergerExists = db.prepare(`
        SELECT 1 FROM holding_mergers
        WHERE acquiring_company_id = ? AND acquired_company_id = ?
        LIMIT 1
      `).get(strong.id, weak.id);
      if (mergerExists) return;
      const combinedResources = [...new Set([...parseResourceRefs(strong), ...parseResourceRefs(weak)])];
      const newName = combinedResources.length > 2
        ? `${strong.name.split(' ')[0]} Industrial Holdings`
        : `${strong.name} & ${weak.name.replace(strong.name.split(' ')[0], '').trim()}`;
      db.prepare(`
        UPDATE market_companies
        SET name = ?, merged_name = ?, resource_refs_json = ?, market_status = 'tradeable',
          bankruptcy_risk = MAX(0, bankruptcy_risk - 0.12), confidence_index = confidence_index + 0.08,
          updated_at = ?
        WHERE id = ?
      `).run(newName, newName, JSON.stringify(combinedResources), recordedAt, strong.id);
      db.prepare(`
        UPDATE market_companies
        SET acquired_by_company_id = ?, market_status = 'takeover', updated_at = ?
        WHERE id = ?
      `).run(strong.id, recordedAt, weak.id);
      db.prepare(`
        INSERT INTO holding_mergers (
          id, acquiring_company_id, acquired_company_id, sector_id, old_name, new_name,
          acquired_resources_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        strong.id,
        weak.id,
        sectorId,
        `${strong.name} / ${weak.name}`,
        newName,
        JSON.stringify(combinedResources),
        'Insolvenz / Konsolidierung',
        recordedAt
      );
      insertMarketEvent(db, {
        eventType: 'holding_merger',
        title: 'Holding-Übernahme',
        description: `${strong.name} übernimmt ${weak.name} nach anhaltender Rezession.`,
        impact: 0.04,
        startedAt: recordedAt
      });
    });
  })();
}

export function purchaseMarketShare(db, investorId, companyId, now = Date.now()) {
  return db.transaction(() => {
    const investor = getOrCreateMarketInvestor(db, investorId);
    const lastPurchaseAt = investor.last_purchase_at ? Date.parse(investor.last_purchase_at) : 0;
    const cooldownMs = 60 * 60 * 1000;
    if (lastPurchaseAt && now - lastPurchaseAt < cooldownMs) {
      const error = new Error('Der nächste Aktienkauf ist erst nach Ablauf der 60 Minuten möglich.');
      error.status = 429;
      error.nextPurchaseAt = new Date(lastPurchaseAt + cooldownMs).toISOString();
      throw error;
    }
    const company = db.prepare('SELECT * FROM market_companies WHERE id = ?').get(companyId);
    if (!company) {
      const error = new Error('Unternehmen nicht gefunden.');
      error.status = 404;
      throw error;
    }
    db.prepare(`
      INSERT INTO market_holdings (investor_id, company_id, shares)
      VALUES (?, ?, 1)
      ON CONFLICT(investor_id, company_id) DO UPDATE SET shares = shares + 1
    `).run(investorId, companyId);
    const purchasedAt = new Date(now).toISOString();
    db.prepare('UPDATE market_investors SET last_purchase_at = ? WHERE id = ?').run(purchasedAt, investorId);
    const nextPrice = Math.round(company.current_price * 1.0125 * 100) / 100;
    db.prepare(`
      UPDATE market_companies
      SET previous_price = current_price, current_price = ?, updated_at = ?
      WHERE id = ?
    `).run(nextPrice, purchasedAt, companyId);
    db.prepare(`
      INSERT INTO market_history (id, company_id, price, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), companyId, nextPrice, purchasedAt);
    return { companyId, price: company.current_price, purchasedAt, nextPurchaseAt: new Date(now + cooldownMs).toISOString() };
  })();
}

export function purchaseMarketDemand(db, { investorId, userId, consumerKey, companyId, quantity = 1 }, now = Date.now()) {
  return db.transaction(() => {
    const company = db.prepare('SELECT * FROM market_companies WHERE id = ?').get(companyId);
    if (!company) {
      const error = new Error('Unternehmen nicht gefunden.');
      error.status = 404;
      throw error;
    }
    if (
      Number(company.is_embargoed || 0)
      || ['embargo', 'suspended', 'insolvent', 'takeover'].includes(normalizeMarketStatus(company.market_status))
      || company.acquired_by_company_id
    ) {
      const error = new Error('Diese Holding ist aktuell nicht normal handelbar.');
      error.status = 409;
      throw error;
    }

    const purchasedAt = new Date(now).toISOString();
    const cooldownMs = 60 * 60 * 1000;
    let purchaseType = 'portfolio';
    let nextPurchaseAt = null;
    const requestedQuantity = Math.floor(Number(quantity || 1));
    const effectiveQuantity = investorId ? requestedQuantity : 1;
    if (!Number.isInteger(effectiveQuantity) || effectiveQuantity < 1 || effectiveQuantity > 10000) {
      const error = new Error('Ungültige Aktienmenge.');
      error.status = 400;
      throw error;
    }

    if (investorId) {
      const investor = getOrCreateMarketInvestor(db, investorId, userId);
      const totalCost = Math.round(Number(company.current_price || 0) * effectiveQuantity * 100) / 100;
      const availableShares = getAvailableFreeFloatShares(db, companyId);
      if (availableShares < effectiveQuantity) {
        const error = new Error('Nicht genügend frei handelbare Aktien verfügbar.');
        error.status = 409;
        error.availableShares = availableShares;
        throw error;
      }
      if (Number(investor.balance || 0) < totalCost) {
        const error = new Error('Nicht genug Credits im persönlichen Portfolio.');
        error.status = 409;
        throw error;
      }
      db.prepare(`
        INSERT INTO market_holdings (investor_id, company_id, shares)
        VALUES (?, ?, ?)
        ON CONFLICT(investor_id, company_id) DO UPDATE SET shares = shares + excluded.shares
      `).run(investorId, companyId, effectiveQuantity);
      db.prepare(`
        UPDATE market_investors
        SET balance = balance - ?, last_purchase_at = ?
        WHERE id = ?
      `).run(totalCost, purchasedAt, investorId);
      db.prepare(`
        INSERT INTO market_orders (
          id, investor_id, company_id, quantity, unit_price, total_value,
          remaining_quantity, realized_profit, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
      `).run(crypto.randomUUID(), investorId, companyId, effectiveQuantity, company.current_price, totalCost, effectiveQuantity, purchasedAt);
    } else {
      purchaseType = 'consumer';
      const activity = db.prepare(`
        SELECT last_purchase_at FROM market_consumer_activity WHERE consumer_key = ?
      `).get(consumerKey);
      const lastPurchaseAt = activity?.last_purchase_at ? Date.parse(activity.last_purchase_at) : 0;
      if (lastPurchaseAt && now - lastPurchaseAt < cooldownMs) {
        const error = new Error('Die nächste Nachfrageaktion ist erst nach Ablauf der 60 Minuten möglich.');
        error.status = 429;
        error.nextPurchaseAt = new Date(lastPurchaseAt + cooldownMs).toISOString();
        throw error;
      }
      db.prepare(`
        INSERT INTO market_consumer_activity (consumer_key, last_purchase_at)
        VALUES (?, ?)
        ON CONFLICT(consumer_key) DO UPDATE SET last_purchase_at = excluded.last_purchase_at
      `).run(consumerKey, purchasedAt);
      nextPurchaseAt = new Date(now + cooldownMs).toISOString();
    }

    const priceImpact = 1 + (0.0125 * Math.sqrt(effectiveQuantity));
    const nextPrice = Math.round(company.current_price * priceImpact * 100) / 100;
    db.prepare(`
      UPDATE market_companies
      SET previous_price = current_price, current_price = ?, updated_at = ?
      WHERE id = ?
    `).run(nextPrice, purchasedAt, companyId);
    db.prepare(`
      INSERT INTO market_history (id, company_id, price, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), companyId, nextPrice, purchasedAt);
    updateOwnershipStructure(db, companyId, now);
    if (investorId) writePortfolioSnapshot(db, investorId, purchasedAt);

    return {
      companyId,
      price: company.current_price,
      quantity: effectiveQuantity,
      totalCost: investorId ? Math.round(company.current_price * effectiveQuantity * 100) / 100 : 0,
      availableShares: investorId ? getAvailableFreeFloatShares(db, companyId) : null,
      purchasedAt,
      purchaseType,
      nextPurchaseAt
    };
  })();
}

export function getConsumerNextPurchaseAt(db, consumerKey) {
  const activity = db.prepare(`
    SELECT last_purchase_at FROM market_consumer_activity WHERE consumer_key = ?
  `).get(consumerKey);
  return activity?.last_purchase_at
    ? new Date(Date.parse(activity.last_purchase_at) + (60 * 60 * 1000)).toISOString()
    : null;
}

export function sellMarketShare(db, { investorId, companyId, quantity = 1 }, now = Date.now()) {
  return db.transaction(() => {
    const company = db.prepare('SELECT * FROM market_companies WHERE id = ?').get(companyId);
    if (!company) {
      const error = new Error('Unternehmen nicht gefunden.');
      error.status = 404;
      throw error;
    }
    const holding = db.prepare(`
      SELECT shares FROM market_holdings
      WHERE investor_id = ? AND company_id = ?
    `).get(investorId, companyId);
    const requestedQuantity = Math.floor(Number(quantity || 1));
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > 10000) {
      const error = new Error('Ungültige Aktienmenge.');
      error.status = 400;
      throw error;
    }
    if (!holding || Number(holding.shares || 0) < requestedQuantity) {
      const error = new Error('Du besitzt keine Aktie dieser Holding.');
      error.status = 409;
      throw error;
    }

    const soldAt = new Date(now).toISOString();
    const grossProceeds = round2(Number(company.current_price || 0) * requestedQuantity);
    const taxRate = 0.02;
    const taxAmount = round2(grossProceeds * taxRate);
    const netProceeds = round2(grossProceeds - taxAmount);
    let remainingToClose = requestedQuantity;
    let soldCostBasis = 0;
    const openOrders = db.prepare(`
      SELECT id, remaining_quantity AS remainingQuantity, unit_price AS unitPrice,
        realized_profit AS realizedProfit
      FROM market_orders
      WHERE investor_id = ? AND company_id = ? AND COALESCE(remaining_quantity, quantity) > 0
      ORDER BY created_at ASC
    `).all(investorId, companyId);
    const updateOrderLot = db.prepare(`
      UPDATE market_orders
      SET remaining_quantity = ?, realized_profit = realized_profit + ?, closed_at = ?
      WHERE id = ?
    `);
    openOrders.forEach((order) => {
      if (remainingToClose <= 0) return;
      const lotQuantity = roundShares(order.remainingQuantity);
      const closedQuantity = Math.min(lotQuantity, remainingToClose);
      const lotCost = round2(closedQuantity * Number(order.unitPrice || 0));
      const lotGross = round2(closedQuantity * Number(company.current_price || 0));
      const lotTax = round2(taxAmount * (closedQuantity / requestedQuantity));
      const lotRealizedProfit = round2((lotGross - lotTax) - lotCost);
      const nextRemaining = lotQuantity - closedQuantity;
      soldCostBasis += lotCost;
      remainingToClose -= closedQuantity;
      updateOrderLot.run(
        nextRemaining,
        lotRealizedProfit,
        nextRemaining <= 0 ? soldAt : null,
        order.id
      );
    });
    if (remainingToClose > 0) {
      const fallbackCost = round2(remainingToClose * Number(company.current_price || 0));
      const fallbackTax = round2(taxAmount * (remainingToClose / requestedQuantity));
      const fallbackRealized = round2((round2(remainingToClose * Number(company.current_price || 0)) - fallbackTax) - fallbackCost);
      soldCostBasis += fallbackCost;
      db.prepare(`
        INSERT INTO market_orders (
          id, investor_id, company_id, quantity, unit_price, total_value,
          remaining_quantity, realized_profit, closed_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?)
      `).run(
        crypto.randomUUID(),
        investorId,
        companyId,
        remainingToClose,
        Number(company.current_price || 0),
        fallbackCost,
        fallbackRealized,
        soldAt,
        soldAt
      );
    }
    const realizedProfit = round2(netProceeds - soldCostBasis);
    if (holding.shares === requestedQuantity) {
      db.prepare(`
        DELETE FROM market_holdings
        WHERE investor_id = ? AND company_id = ?
      `).run(investorId, companyId);
    } else {
      db.prepare(`
        UPDATE market_holdings
        SET shares = shares - ?
        WHERE investor_id = ? AND company_id = ?
      `).run(requestedQuantity, investorId, companyId);
    }
    db.prepare(`
      UPDATE market_investors
      SET balance = balance + ?
      WHERE id = ?
    `).run(netProceeds, investorId);
    db.prepare(`
      INSERT INTO market_taxes (
        id, investor_id, company_id, quantity, gross_proceeds, tax_amount,
        net_proceeds, tax_rate, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      investorId,
      companyId,
      requestedQuantity,
      grossProceeds,
      taxAmount,
      netProceeds,
      taxRate,
      soldAt
    );
    db.prepare(`
      INSERT INTO faction_accounts (faction, credits, updated_at)
      VALUES ('GAR', ?, ?)
      ON CONFLICT(faction) DO UPDATE SET
        credits = credits + excluded.credits,
        updated_at = excluded.updated_at
    `).run(taxAmount, soldAt);

    const priceImpact = Math.max(0.75, 1 - (0.0125 * Math.sqrt(requestedQuantity)));
    const nextPrice = Math.max(25, Math.round(company.current_price * priceImpact * 100) / 100);
    db.prepare(`
      UPDATE market_companies
      SET previous_price = current_price, current_price = ?, updated_at = ?
      WHERE id = ?
    `).run(nextPrice, soldAt, companyId);
    db.prepare(`
      INSERT INTO market_history (id, company_id, price, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), companyId, nextPrice, soldAt);
    updateOwnershipStructure(db, companyId, now);
    writePortfolioSnapshot(db, investorId, soldAt);

    return {
      companyId,
      price: company.current_price,
      quantity: requestedQuantity,
      soldAt,
      grossProceeds,
      taxRate,
      taxAmount,
      netProceeds,
      credited: netProceeds,
      costBasis: round2(soldCostBasis),
      realizedProfit
    };
  })();
}

export function updateEconomyPolicy(db, { taxRate, subsidy }) {
  const updatedAt = new Date().toISOString();
  db.prepare(`
    INSERT INTO economy_policy (faction, tax_rate, subsidy, updated_at)
    VALUES ('GAR', ?, ?, ?)
    ON CONFLICT(faction) DO UPDATE SET tax_rate = excluded.tax_rate,
      subsidy = excluded.subsidy, updated_at = excluded.updated_at
  `).run(taxRate, subsidy, updatedAt);
  return db.prepare(`
    SELECT faction, tax_rate AS taxRate, subsidy, updated_at AS updatedAt
    FROM economy_policy WHERE faction = 'GAR'
  `).get();
}

export function runMarketTick(db, inflationRate = 0, now = Date.now(), state = null) {
  if (state) {
    runCivilianDemandTick(state, { db, now });
    runInstitutionalInvestorTick(state, { db, now, inflationRate });
  }
  const companies = db.prepare('SELECT * FROM market_companies').all();
  if (!companies.length) return false;
  const latestUpdate = Math.max(...companies.map((company) => Date.parse(company.updated_at) || 0));
  if (now - latestUpdate < 15 * 1000) return false;
  const activeEvent = db.prepare(`
    SELECT * FROM market_events WHERE ends_at > ? ORDER BY started_at DESC LIMIT 1
  `).get(new Date(now).toISOString());
  const recordedAt = new Date(now).toISOString();
  const updateCompany = db.prepare(`
    UPDATE market_companies SET previous_price = current_price, current_price = ?, updated_at = ? WHERE id = ?
  `);
  const insertHistory = db.prepare(`
    INSERT INTO market_history (id, company_id, price, recorded_at) VALUES (?, ?, ?, ?)
  `);
  const demandMap = new Map(db.prepare(`
    SELECT sector_name AS sectorName, resource_type AS resourceType,
      demand_score AS demandScore, supply_score AS supplyScore,
      market_multiplier AS marketMultiplier, import_dependency AS importDependency,
      export_strength AS exportStrength
    FROM sector_resource_demand
  `).all().map((row) => [`${row.sectorName}::${row.resourceType}`, row]));
  db.transaction(() => {
    companies.forEach((company) => {
      const demandData = company.sector && company.resource_key
        ? demandMap.get(`${company.sector}::${company.resource_key}`)
        : null;
      const pullToBase = (company.base_price - company.current_price) / company.base_price * 0.04;
      const noise = (Math.random() - 0.5) * 0.04;
      const eventImpact = Number(activeEvent?.impact || 0);
      const inflationImpact = Math.min(0.08, Math.max(0, inflationRate)) * 0.25;
      const demandImpact = demandData
        ? ((Number(demandData.marketMultiplier || 1) - 1) * 0.14) + ((Number(demandData.demandScore || 1) - Number(demandData.supplyScore || 1)) * 0.015)
        : 0;
      const nextPrice = Math.max(25, Math.round(company.current_price * (1 + pullToBase + noise + eventImpact + inflationImpact + demandImpact) * 100) / 100);
      updateCompany.run(nextPrice, recordedAt, company.id);
      insertHistory.run(crypto.randomUUID(), company.id, nextPrice, recordedAt);
      updateOwnershipStructure(db, company.id, now);
    });
    const latestEvent = db.prepare('SELECT started_at FROM market_events ORDER BY started_at DESC LIMIT 1').get();
    if (!latestEvent || now - Date.parse(latestEvent.started_at) >= 6 * 60 * 60 * 1000) {
      const templates = [
        ['trade_boom', 'Galaktischer Handelsboom', 'Steigende Nachfrage belebt die Märkte.', 0.035],
        ['market_crash', 'Börsenkorrektur', 'Unsicherheit sorgt für deutliche Kursverluste.', -0.05],
        ['fuel_shortage', 'Treibstoffknappheit', 'Lieferketten geraten durch knappe Treibstoffe unter Druck.', -0.025],
        ['industrial_order', 'Großauftrag der Republik', 'Neue öffentliche Aufträge stärken Industrieunternehmen.', 0.025]
      ];
      const [eventType, title, description, impact] = templates[Math.floor(Math.random() * templates.length)];
      db.prepare(`
        INSERT INTO market_events (id, event_type, title, description, impact, started_at, ends_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), eventType, title, description, impact, recordedAt, new Date(now + 3 * 60 * 60 * 1000).toISOString());
    }
  })();
  db.prepare('SELECT id FROM market_investors WHERE portfolio_enabled = 1').all()
    .forEach((investor) => writePortfolioSnapshot(db, investor.id, recordedAt));
  return true;
}
