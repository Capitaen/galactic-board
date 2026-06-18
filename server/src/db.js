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
const DEMAND_TICK_MS = 15 * 1000;
const SOLVENCY_TICK_MS = 10 * 60 * 1000;
const INSTITUTIONAL_TICK_MS = 10 * 60 * 1000;
const PORTFOLIO_SNAPSHOT_TICK_MS = 2 * 60 * 1000;
const MARKET_SUMMARY_SNAPSHOT_TICK_MS = 2 * 60 * 1000;
const ACP_HISTORY_SNAPSHOT_TICK_MS = 5 * 60 * 1000;
const CORPORATE_BUILD_TICK_MS = 30 * 60 * 1000;
const CORPORATE_PRODUCTION_TICK_MS = 15 * 60 * 1000;
const CORPORATE_CIVILIAN_SALE_TICK_MS = 60 * 1000;
const CORPORATE_FINANCE_TICK_MS = 15 * 60 * 1000;
const CORPORATE_BUILD_DURATION_MS = 10 * 60 * 60 * 1000;
const CORPORATE_BUILD_TICK_TIME_BUDGET_MS = 750;
const CORPORATE_BUILD_TICK_COMPANY_LIMIT = 4;
const CORPORATE_BUILD_TICK_START_LIMIT = 2;
const CORPORATE_BUILD_SELLER_SCAN_LIMIT = 6;
const CORPORATE_CIVILIAN_SALE_MIN_RATIO = 0.0035;
const CORPORATE_CIVILIAN_SALE_MAX_RATIO = 0.02;
const CORPORATE_CIVILIAN_SALE_HARD_CAP = 90;
const CORPORATE_CIVILIAN_SALE_COMPANY_BATCH = 30;
const CORPORATE_CIVILIAN_SALE_MAX_TRADES_PER_TICK = 36;
const CORPORATE_MAX_ACTIVE_PROJECTS = 5;
const CORPORATE_MAX_COMPLETED_48H = 5;
const CORPORATE_COMPLETION_WINDOW_MS = 48 * 60 * 60 * 1000;
const ACP_HISTORY_WINDOW_MS = 183 * 24 * 60 * 60 * 1000;
const MARKET_SUMMARY_SNAPSHOT_VERSION = 2;
const MAX_INTELLIGENCE_REPORTS = 80;
const MAX_TRADE_HISTORY_ROWS = 6000;
const MIN_MARKET_PRICE = 25;
const MAX_SINGLE_TRADE_MOVE = 0.18;
const ABNORMAL_15M_PRICE_MULTIPLIER = 4;
const MAX_PORTFOLIO_TRADE_QUANTITY = 10000;
const RESOURCE_DEPENDENCY_CHAIN = {
  quadraniumErz: { target: 'tibannaGas', delayTicks: 4 },
  tibannaGas: { target: 'kavamSalz', delayTicks: 8 },
  kavamSalz: { target: 'agrinium', delayTicks: 12 },
  agrinium: { target: 'baradium', delayTicks: 16 },
  baradium: { target: 'quadraniumErz', delayTicks: 20 }
};
const RESOURCE_CHAIN_SOURCES = Object.fromEntries(
  Object.entries(RESOURCE_DEPENDENCY_CHAIN).map(([source, config]) => [config.target, { source, delayTicks: config.delayTicks }])
);
const RESOURCE_STOCKPILE_COLUMNS = {
  quadraniumErz: 'stockpileMetals',
  tibannaGas: 'stockpileFuel',
  kavamSalz: 'stockpileSupplies',
  agrinium: 'stockpileTechnology',
  baradium: 'stockpileChemicals'
};
const MARKET_SENTIMENT_EFFECTS = {
  Panik: -0.14,
  Negativ: -0.06,
  Neutral: 0,
  Positiv: 0.05,
  Euphorisch: 0.1
};

const CORPORATE_STRATEGIES = [
  'conservative',
  'aggressive_growth',
  'monopoly_builder',
  'war_profiteer',
  'infrastructure_supplier',
  'distressed_survivor',
  'export_focused',
  'local_dominance'
];

const CORPORATE_BUILDING_CONFIG = {
  corporate_storage_hub: { resourceType: 'kavamSalz', label: 'Privates Lager', productionPerHour: 0, revenuePerHour: 0, maintenanceCostPerHour: 8, strategicValue: 0.44 },
  corporate_metal_mine: { resourceType: 'quadraniumErz', label: 'Private Metallmine', productionPerHour: 18, revenuePerHour: 145, maintenanceCostPerHour: 32, strategicValue: 0.58 },
  corporate_foundry: { resourceType: 'quadraniumErz', label: 'Private Gießerei', productionPerHour: 14, revenuePerHour: 138, maintenanceCostPerHour: 34, strategicValue: 0.63 },
  corporate_heavy_industry: { resourceType: 'quadraniumErz', label: 'Schwerindustrie-Komplex', productionPerHour: 11, revenuePerHour: 164, maintenanceCostPerHour: 46, strategicValue: 0.72 },
  corporate_tech_complex: { resourceType: 'agrinium', label: 'Technologie-Komplex', productionPerHour: 10, revenuePerHour: 176, maintenanceCostPerHour: 44, strategicValue: 0.76 },
  corporate_research_lab: { resourceType: 'agrinium', label: 'Forschungslabor', productionPerHour: 8, revenuePerHour: 188, maintenanceCostPerHour: 52, strategicValue: 0.81 },
  corporate_droid_component_factory: { resourceType: 'agrinium', label: 'Droidenkomponenten-Fabrik', productionPerHour: 12, revenuePerHour: 172, maintenanceCostPerHour: 43, strategicValue: 0.74 },
  corporate_fuel_refinery: { resourceType: 'tibannaGas', label: 'Treibstoffraffinerie', productionPerHour: 16, revenuePerHour: 159, maintenanceCostPerHour: 35, strategicValue: 0.68 },
  corporate_fuel_depot: { resourceType: 'tibannaGas', label: 'Treibstoffdepot', productionPerHour: 9, revenuePerHour: 124, maintenanceCostPerHour: 24, strategicValue: 0.51 },
  corporate_logistics_hub: { resourceType: 'tibannaGas', label: 'Logistik-Hub', productionPerHour: 7, revenuePerHour: 141, maintenanceCostPerHour: 28, strategicValue: 0.65 },
  corporate_chemical_plant: { resourceType: 'baradium', label: 'Chemieanlage', productionPerHour: 11, revenuePerHour: 151, maintenanceCostPerHour: 37, strategicValue: 0.66 },
  corporate_baradium_facility: { resourceType: 'baradium', label: 'Baradium-Anlage', productionPerHour: 8, revenuePerHour: 182, maintenanceCostPerHour: 49, strategicValue: 0.83 },
  corporate_medical_chem_lab: { resourceType: 'baradium', label: 'Medizinisches Chemielabor', productionPerHour: 9, revenuePerHour: 169, maintenanceCostPerHour: 41, strategicValue: 0.71 },
  corporate_supply_depot: { resourceType: 'kavamSalz', label: 'Versorgungsdepot', productionPerHour: 13, revenuePerHour: 117, maintenanceCostPerHour: 21, strategicValue: 0.47 },
  corporate_agri_industry: { resourceType: 'kavamSalz', label: 'Agrarindustrie', productionPerHour: 15, revenuePerHour: 126, maintenanceCostPerHour: 23, strategicValue: 0.49 },
  corporate_consumer_goods_factory: { resourceType: 'kavamSalz', label: 'Konsumgüterfabrik', productionPerHour: 12, revenuePerHour: 139, maintenanceCostPerHour: 28, strategicValue: 0.57 },
  corporate_medical_supply_factory: { resourceType: 'kavamSalz', label: 'Medizinische Versorgungsgüterfabrik', productionPerHour: 10, revenuePerHour: 154, maintenanceCostPerHour: 33, strategicValue: 0.7 }
};

const CORPORATE_BUILDING_COSTS = {
  quadraniumErz: { quadraniumErz: 980, agrinium: 280, tibannaGas: 140, baradium: 210, kavamSalz: 280, credits: 3780 },
  agrinium: { quadraniumErz: 760, agrinium: 460, tibannaGas: 180, baradium: 260, kavamSalz: 220, credits: 4120 },
  tibannaGas: { quadraniumErz: 840, agrinium: 240, tibannaGas: 320, baradium: 180, kavamSalz: 190, credits: 3960 },
  baradium: { quadraniumErz: 720, agrinium: 300, tibannaGas: 160, baradium: 330, kavamSalz: 180, credits: 4010 },
  kavamSalz: { quadraniumErz: 610, agrinium: 180, tibannaGas: 110, baradium: 150, kavamSalz: 360, credits: 3380 }
};

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

function addPlanetRouteLink(linkMap, leftId, rightId) {
  const a = String(leftId || '').trim();
  const b = String(rightId || '').trim();
  if (!a || !b || a === b) return;
  if (!linkMap.has(a)) linkMap.set(a, new Set());
  if (!linkMap.has(b)) linkMap.set(b, new Set());
  linkMap.get(a).add(b);
  linkMap.get(b).add(a);
}

function normalizeCustomRouteConnection(connection) {
  const startPlanetId = String(connection?.startPlanetId || '').trim();
  const endPlanetId = String(connection?.endPlanetId || '').trim();
  if (!startPlanetId || !endPlanetId || startPlanetId === endPlanetId) return null;
  return { startPlanetId, endPlanetId };
}

function buildPlanetHyperlaneDegreeMap(state) {
  const planets = Array.isArray(state?.planets) ? state.planets : [];
  const linkMap = new Map(planets.map((planet) => [String(planet.id || '').trim(), new Set()]));
  const radiusSq = 120 * 120;

  for (let index = 0; index < planets.length; index += 1) {
    const base = planets[index];
    const baseId = String(base?.id || '').trim();
    if (!baseId) continue;
    const candidates = [];
    for (let otherIndex = 0; otherIndex < planets.length; otherIndex += 1) {
      if (index === otherIndex) continue;
      const other = planets[otherIndex];
      const otherId = String(other?.id || '').trim();
      if (!otherId) continue;
      const dx = Number(base?.x || 0) - Number(other?.x || 0);
      const dy = Number(base?.y || 0) - Number(other?.y || 0);
      const distanceSq = dx * dx + dy * dy;
      if (distanceSq <= radiusSq) candidates.push([distanceSq, otherId]);
    }
    candidates
      .sort((left, right) => left[0] - right[0])
      .slice(0, 3)
      .forEach(([, otherId]) => addPlanetRouteLink(linkMap, baseId, otherId));
  }

  const customRoutes = Array.isArray(state?.meta?.customRoutes) ? state.meta.customRoutes : [];
  customRoutes.forEach((route) => {
    (Array.isArray(route?.connections) ? route.connections : [])
      .map(normalizeCustomRouteConnection)
      .filter(Boolean)
      .forEach((connection) => addPlanetRouteLink(linkMap, connection.startPlanetId, connection.endPlanetId));
  });

  return new Map([...linkMap.entries()].map(([planetId, neighbors]) => [planetId, neighbors.size]));
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

function safeNumber(value, fallback = 0, min = -Infinity, max = Infinity) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric, min, max);
}

function logTimedPhase(label, startedAt, details = {}) {
  const elapsedMs = Date.now() - startedAt;
  if (elapsedMs > 1000) {
    console.error(`${label} slow`, { elapsedMs, ...details });
  } else if (elapsedMs > 100) {
    console.warn(`${label} slow`, { elapsedMs, ...details });
  }
  return elapsedMs;
}

function sanitizeResourceBag(input, defaultValue = 0) {
  const bag = typeof input === 'string' ? safeJsonParse(input, {}) : (input && typeof input === 'object' ? input : {});
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, round2(safeNumber(bag[key], defaultValue, 0, 1e9))]));
}

function emptyResourceBag() {
  return Object.fromEntries(RESOURCE_KEYS.map((key) => [key, 0]));
}

function sumResourceBag(values = []) {
  return values.reduce((accumulator, entry) => {
    const bag = sanitizeResourceBag(entry);
    RESOURCE_KEYS.forEach((key) => {
      accumulator[key] = round2(safeNumber(accumulator[key], 0, 0, 1e9) + safeNumber(bag[key], 0, 0, 1e9));
    });
    return accumulator;
  }, emptyResourceBag());
}

function getCorporateBuildingMeta(buildingType) {
  return CORPORATE_BUILDING_CONFIG[String(buildingType || '')] || null;
}

function chooseCorporateStrategy(companyId) {
  const digest = crypto.createHash('sha1').update(`strategy:${companyId}`).digest('hex');
  const index = parseInt(digest.slice(0, 8), 16) % CORPORATE_STRATEGIES.length;
  return CORPORATE_STRATEGIES[index];
}

function parseIsoToMs(value) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function getRuntimeStateNumber(db, key, fallback = 0) {
  const row = db.prepare('SELECT state_value FROM economy_runtime_state WHERE state_key = ?').get(key);
  return safeNumber(row?.state_value, fallback, 0, Number.MAX_SAFE_INTEGER);
}

function getRuntimeStateJson(db, key, fallback = null) {
  const row = db.prepare('SELECT state_value FROM economy_runtime_state WHERE state_key = ?').get(key);
  return safeJsonParse(row?.state_value, fallback);
}

function setRuntimeStateNumber(db, key, value, updatedAt = new Date().toISOString()) {
  db.prepare(`
    INSERT INTO economy_runtime_state (state_key, state_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(state_key) DO UPDATE SET
      state_value = excluded.state_value,
      updated_at = excluded.updated_at
  `).run(key, String(Math.floor(safeNumber(value, 0, 0, Number.MAX_SAFE_INTEGER))), updatedAt);
}

function setRuntimeStateJson(db, key, value, updatedAt = new Date().toISOString()) {
  db.prepare(`
    INSERT INTO economy_runtime_state (state_key, state_value, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(state_key) DO UPDATE SET
      state_value = excluded.state_value,
      updated_at = excluded.updated_at
  `).run(key, JSON.stringify(value ?? null), updatedAt);
}

function canRunCadence(db, key, intervalMs, now) {
  const lastTick = getRuntimeStateNumber(db, key, 0);
  return !lastTick || now - lastTick >= intervalMs;
}

function getPlanetInfrastructureModifier(state, planetId) {
  const slots = Array.isArray(state?.planetResources?.[planetId]) ? state.planetResources[planetId] : [];
  const developmentSlots = slots.filter((slot) => typeof slot === 'string' && slot.includes('development')).length;
  const civilianSlots = slots.filter((slot) => typeof slot === 'string' && slot.startsWith('civilian_')).length;
  return {
    productionBonus: clamp((developmentSlots * 0.04) + (civilianSlots * 0.01), 0, 0.24),
    maintenanceRelief: clamp((developmentSlots * 0.02), 0, 0.12),
    stabilityBonus: clamp((developmentSlots * 0.03), 0, 0.18)
  };
}

function getPlanetConflictPressure(state, planetId) {
  const fleets = Array.isArray(state?.fleets) ? state.fleets : [];
  const present = fleets.filter((fleet) => (fleet?.locationId || fleet?.planetId) === planetId);
  const factions = new Set(present.map((fleet) => String(fleet?.faction || fleet?.owner || '')).filter(Boolean));
  if (factions.size >= 2) return 0.22;
  return present.length >= 4 ? 0.08 : 0;
}

function getCompanyStrengthScore(company) {
  return clamp(
    safeNumber(company.currentPrice, 0) / Math.max(1, safeNumber(company.basePrice, 1))
    + safeNumber(company.confidenceIndex, 1, 0, 1.5) * 0.35
    + (1 - safeNumber(company.debtIndex, 0.2, 0, 1)) * 0.25
    + Math.min(1, safeNumber(company.corporateCash, 0, 0, 1e9) / 15000) * 0.4
    + Math.min(1, safeNumber(company.privateAssetValue, 0, 0, 1e9) / 22000) * 0.3
    - safeNumber(company.bankruptcyRisk, 0, 0, 1) * 0.8,
    0,
    3
  );
}

function getCompanyActivityWindowStats(db, companyId, now) {
  const activeProjects = db.prepare(`
    SELECT COUNT(*) AS count
    FROM corporate_build_projects
    WHERE company_id = ? AND status IN ('planned', 'building')
  `).get(companyId)?.count || 0;
  const completed48h = db.prepare(`
    SELECT COUNT(*) AS count
    FROM corporate_build_projects
    WHERE company_id = ? AND status = 'completed' AND completes_at >= ?
  `).get(companyId, new Date(now - CORPORATE_COMPLETION_WINDOW_MS).toISOString())?.count || 0;
  return {
    activeProjects: Number(activeProjects || 0),
    completed48h: Number(completed48h || 0)
  };
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
  const degreeMap = buildPlanetHyperlaneDegreeMap(state);
  return manualSectors.map((sector) => {
    const points = Array.isArray(sector?.points) ? sector.points : [];
    const sectorPlanets = planets
      .filter((planet) => pointInPolygon({ x: Number(planet?.x), y: Number(planet?.y) }, points))
      .map((planet) => {
        const routeDegree = Number(degreeMap.get(String(planet.id || '').trim()) || 0);
        return {
          ...planet,
          routeDegree,
          isRoutePlanet: routeDegree >= 1,
          isLogisticsHub: routeDegree >= 3
        };
      });
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
      routePlanetCount: sectorPlanets.filter((planet) => planet.isRoutePlanet).length,
      logisticsHubCount: sectorPlanets.filter((planet) => planet.isLogisticsHub).length,
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

function buildAcpSnapshot(priceRows, historyRows, companyCounts = {}) {
  const currentByResource = {};
  RESOURCE_KEYS.forEach((resourceKey) => {
    const resourceRows = priceRows.filter((row) => row.resourceKey === resourceKey);
    currentByResource[resourceKey] = {
      resourceKey,
      label: RESOURCE_MARKET_CONFIG[resourceKey].label,
      averagePrice: round2(average(resourceRows.map((row) => Number(row.currentPrice || 0)))),
      averageBasePrice: round2(average(resourceRows.map((row) => Number(row.basePrice || 0)))),
      companyCount: Number(companyCounts[resourceKey] || 0),
      sectorCount: resourceRows.length
    };
  });
  const history = {};
  RESOURCE_KEYS.forEach((resourceKey) => {
    const resourceHistory = historyRows
      .filter((row) => row.resourceKey === resourceKey)
      .sort((left, right) => String(left.recordedAt || '').localeCompare(String(right.recordedAt || '')))
      .map((row) => ({
        recordedAt: row.recordedAt,
        price: round2(Number(row.price || 0)),
        basePrice: round2(Number(row.basePrice || 0)),
        sectorCount: Number(row.sectorCount || 0)
      }));
    if (!resourceHistory.length) {
      const currentRow = currentByResource[resourceKey];
      history[resourceKey] = currentRow && currentRow.sectorCount > 0
        ? [{
          recordedAt: new Date().toISOString(),
          price: currentRow.averagePrice,
          basePrice: currentRow.averageBasePrice,
          sectorCount: currentRow.sectorCount
        }]
        : [];
      return;
    }
    history[resourceKey] = resourceHistory;
  });
  return {
    current: Object.values(currentByResource),
    history
  };
}

function getTradeWindowRevenue(db, companyId, sinceIso) {
  return round2(db.prepare(`
    SELECT COALESCE(SUM(total_price), 0) AS total
    FROM corporate_resource_trades
    WHERE seller_company_id = ? AND created_at >= ?
  `).get(companyId, sinceIso)?.total || 0);
}

function getTradeWindowPurchases(db, companyId, sinceIso) {
  return round2(db.prepare(`
    SELECT COALESCE(SUM(total_price), 0) AS total
    FROM corporate_resource_trades
    WHERE buyer_company_id = ? AND created_at >= ?
  `).get(companyId, sinceIso)?.total || 0);
}

function getCompanyInventoryValue(db, sectorId, resourceBag = {}) {
  const bag = sanitizeResourceBag(resourceBag);
  return round2(RESOURCE_KEYS.reduce((sum, resourceKey) => {
    const price = round2(Math.max(1, Number(db.prepare(`
      SELECT current_price AS currentPrice
      FROM sector_resource_prices
      WHERE sector_id = ? AND resource_type = ?
      LIMIT 1
    `).get(sectorId, resourceKey)?.currentPrice || RESOURCE_MARKET_CONFIG[resourceKey]?.basePrice || 1)));
    return sum + (safeNumber(bag[resourceKey], 0, 0, 1e9) * price);
  }, 0));
}

function buildAcpHistoryRows(db, cutoffIso) {
  return db.prepare(`
    SELECT resource_type AS resourceKey,
      substr(recorded_at, 1, 13) || ':00:00.000Z' AS recordedAt,
      AVG(price) AS price,
      AVG(base_price) AS basePrice,
      COUNT(DISTINCT sector_id) AS sectorCount
    FROM sector_resource_price_history
    WHERE recorded_at >= ?
      AND resource_type IN (${RESOURCE_KEYS.map(() => '?').join(', ')})
    GROUP BY resource_type, substr(recorded_at, 1, 13)
    ORDER BY recordedAt ASC
  `).all(cutoffIso, ...RESOURCE_KEYS);
}

function getAcpPriceRows(db) {
  return db.prepare(`
    SELECT resource_type AS resourceKey,
      sector_id AS sectorId,
      current_price AS currentPrice,
      base_price AS basePrice,
      previous_price AS previousPrice,
      demand_score AS demandScore,
      supply_score AS supplyScore,
      speculation_score AS speculationScore,
      updated_at AS updatedAt
    FROM sector_resource_prices
    WHERE resource_type IN (${RESOURCE_KEYS.map(() => '?').join(', ')})
  `).all(...RESOURCE_KEYS);
}

function getAcpCompanyCounts(db) {
  return Object.fromEntries(db.prepare(`
    SELECT resource_key AS resourceKey, COUNT(*) AS companyCount
    FROM market_companies
    WHERE resource_key IN (${RESOURCE_KEYS.map(() => '?').join(', ')})
    GROUP BY resource_key
  `).all(...RESOURCE_KEYS).map((row) => [row.resourceKey, Number(row.companyCount || 0)]));
}

function writeSectorResourcePriceHistorySnapshot(db, recordedAt) {
  const rows = db.prepare(`
    SELECT sector_id AS sectorId, resource_type AS resourceType, current_price AS currentPrice,
      base_price AS basePrice, demand_score AS demandScore, supply_score AS supplyScore
    FROM sector_resource_prices
    WHERE resource_type IN (${RESOURCE_KEYS.map(() => '?').join(', ')})
  `).all(...RESOURCE_KEYS);
  if (!rows.length) return 0;
  const insertHistory = db.prepare(`
    INSERT INTO sector_resource_price_history (
      id, sector_id, resource_type, price, base_price, demand_score, supply_score, recorded_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  rows.forEach((row) => {
    insertHistory.run(
      crypto.randomUUID(),
      row.sectorId,
      row.resourceType,
      round2(Number(row.currentPrice || 0)),
      round2(Number(row.basePrice || 0)),
      round2(Number(row.demandScore || 1)),
      round2(Number(row.supplyScore || 1)),
      recordedAt
    );
  });
  db.prepare(`
    DELETE FROM sector_resource_price_history
    WHERE recorded_at < ?
  `).run(new Date(Date.parse(recordedAt) - ACP_HISTORY_WINDOW_MS).toISOString());
  return rows.length;
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

function polygonArea(points) {
  if (!Array.isArray(points) || points.length < 3) return Number.POSITIVE_INFINITY;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    area += (Number(current?.x || 0) * Number(next?.y || 0)) - (Number(next?.x || 0) * Number(current?.y || 0));
  }
  return Math.abs(area / 2);
}

function centroidOfPolygon(points) {
  if (!Array.isArray(points) || !points.length) return { x: 0, y: 0 };
  const sum = points.reduce((accumulator, point) => ({
    x: accumulator.x + Number(point?.x || 0),
    y: accumulator.y + Number(point?.y || 0)
  }), { x: 0, y: 0 });
  return {
    x: sum.x / points.length,
    y: sum.y / points.length
  };
}

function resolveManualSectorName(planet, manualSectors) {
  if (!planet || !Array.isArray(manualSectors) || !manualSectors.length) return '';
  const point = {
    x: Number(planet.x),
    y: Number(planet.y)
  };
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return '';
  const matches = manualSectors
    .map((sector) => {
      const name = String(sector?.name || '').trim();
      const polygon = Array.isArray(sector?.points) ? sector.points : [];
      if (!name || polygon.length < 3 || !pointInPolygon(point, polygon)) return null;
      const centroid = centroidOfPolygon(polygon);
      return {
        name,
        area: polygonArea(polygon),
        distance: Math.hypot(point.x - centroid.x, point.y - centroid.y)
      };
    })
    .filter(Boolean)
    .sort((left, right) => left.area - right.area || left.distance - right.distance || left.name.localeCompare(right.name, 'de'));
  return matches[0]?.name || '';
}

export function createDb(projectRoot) {
  // 🔥 FIX: benutze process.cwd() statt projectRoot
  const dbPath = path.join(process.cwd(), 'server', 'data.sqlite');

  const db = new Database(dbPath);
  db.pragma('busy_timeout = 5000');
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

    CREATE TABLE IF NOT EXISTS tutorial_seen_ips (
      id TEXT PRIMARY KEY,
      ip_hash TEXT UNIQUE NOT NULL,
      user_id TEXT,
      first_seen_at TEXT NOT NULL,
      completed_at TEXT,
      skipped_at TEXT
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
      market_sentiment TEXT NOT NULL DEFAULT 'Neutral',
      stockpile_metals REAL NOT NULL DEFAULT 0,
      stockpile_fuel REAL NOT NULL DEFAULT 0,
      stockpile_supplies REAL NOT NULL DEFAULT 0,
      stockpile_technology REAL NOT NULL DEFAULT 0,
      stockpile_chemicals REAL NOT NULL DEFAULT 0,
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
      pressure_score REAL NOT NULL DEFAULT 0,
      momentum REAL NOT NULL DEFAULT 0,
      trend REAL NOT NULL DEFAULT 0,
      volatility REAL NOT NULL DEFAULT 0.08,
      chain_impulse REAL NOT NULL DEFAULT 0,
      chain_source_resource TEXT NOT NULL DEFAULT '',
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

    CREATE TABLE IF NOT EXISTS sector_resource_price_history (
      id TEXT PRIMARY KEY,
      sector_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      price REAL NOT NULL,
      base_price REAL NOT NULL,
      demand_score REAL NOT NULL DEFAULT 1,
      supply_score REAL NOT NULL DEFAULT 1,
      recorded_at TEXT NOT NULL
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

    CREATE TABLE IF NOT EXISTS market_integrity_logs (
      id TEXT PRIMARY KEY,
      investor_id TEXT,
      company_id TEXT,
      issue_type TEXT NOT NULL,
      severity TEXT NOT NULL,
      before_json TEXT,
      after_json TEXT,
      action_taken TEXT NOT NULL,
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

    CREATE TABLE IF NOT EXISTS economy_runtime_state (
      state_key TEXT PRIMARY KEY,
      state_value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS corporate_build_projects (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      sector_id TEXT NOT NULL,
      planet_id TEXT,
      building_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      completes_at TEXT NOT NULL,
      cost_resources_json TEXT NOT NULL DEFAULT '{}',
      cost_credits REAL NOT NULL DEFAULT 0,
      expected_roi REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS corporate_assets (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL,
      sector_id TEXT NOT NULL,
      planet_id TEXT,
      building_type TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      production_per_hour REAL NOT NULL DEFAULT 0,
      revenue_per_hour REAL NOT NULL DEFAULT 0,
      maintenance_cost_per_hour REAL NOT NULL DEFAULT 0,
      condition_index REAL NOT NULL DEFAULT 1,
      risk_index REAL NOT NULL DEFAULT 0,
      damage_index REAL NOT NULL DEFAULT 0,
      blockade_index REAL NOT NULL DEFAULT 0,
      strategic_value REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS corporate_resource_trades (
      id TEXT PRIMARY KEY,
      seller_company_id TEXT,
      buyer_company_id TEXT,
      buyer_type TEXT NOT NULL,
      sector_id TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      quantity REAL NOT NULL DEFAULT 0,
      unit_price REAL NOT NULL DEFAULT 0,
      total_price REAL NOT NULL DEFAULT 0,
      reason TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
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

    CREATE INDEX IF NOT EXISTS idx_market_integrity_logs_company_created_at
      ON market_integrity_logs (company_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_market_integrity_logs_investor_created_at
      ON market_integrity_logs (investor_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sector_resource_prices_updated_at
      ON sector_resource_prices (updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sector_resource_price_history_resource_recorded_at
      ON sector_resource_price_history (resource_type, recorded_at DESC);

    CREATE INDEX IF NOT EXISTS idx_sector_resource_price_history_sector_recorded_at
      ON sector_resource_price_history (sector_id, recorded_at DESC);

    CREATE INDEX IF NOT EXISTS idx_civilian_resource_purchases_created_at
      ON civilian_resource_purchases (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_holding_mergers_created_at
      ON holding_mergers (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_corporate_build_projects_company_status
      ON corporate_build_projects (company_id, status, completes_at DESC);

    CREATE INDEX IF NOT EXISTS idx_corporate_assets_company_updated_at
      ON corporate_assets (company_id, updated_at DESC);

    CREATE INDEX IF NOT EXISTS idx_corporate_resource_trades_created_at
      ON corporate_resource_trades (created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_corporate_resource_trades_seller_created_at
      ON corporate_resource_trades (seller_company_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_corporate_resource_trades_buyer_created_at
      ON corporate_resource_trades (buyer_company_id, created_at DESC);

    CREATE INDEX IF NOT EXISTS idx_market_companies_symbol
      ON market_companies (symbol COLLATE NOCASE);

    CREATE INDEX IF NOT EXISTS idx_market_companies_name
      ON market_companies (name COLLATE NOCASE);

    CREATE INDEX IF NOT EXISTS idx_market_companies_sector
      ON market_companies (sector COLLATE NOCASE);

    CREATE INDEX IF NOT EXISTS idx_market_companies_resource_key
      ON market_companies (resource_key);

    CREATE INDEX IF NOT EXISTS idx_market_history_company_recorded_at
      ON market_history (company_id, recorded_at DESC);

    CREATE INDEX IF NOT EXISTS idx_market_history_recorded_at
      ON market_history (recorded_at DESC);
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
  if (!marketCompanyColumns.has('risk_since')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN risk_since INTEGER');
  }
  if (!marketCompanyColumns.has('suspended_since')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN suspended_since INTEGER');
  }
  if (!marketCompanyColumns.has('insolvent_since')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN insolvent_since INTEGER');
  }
  if (!marketCompanyColumns.has('corporate_cash')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN corporate_cash REAL NOT NULL DEFAULT 0');
  }
  if (!marketCompanyColumns.has('corporate_resources_json')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN corporate_resources_json TEXT NOT NULL DEFAULT '{}'");
  }
  if (!marketCompanyColumns.has('corporate_strategy')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN corporate_strategy TEXT NOT NULL DEFAULT 'conservative'");
  }
  if (!marketCompanyColumns.has('expansion_score')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN expansion_score REAL NOT NULL DEFAULT 0');
  }
  if (!marketCompanyColumns.has('monopoly_score')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN monopoly_score REAL NOT NULL DEFAULT 0');
  }
  if (!marketCompanyColumns.has('corporate_build_cooldown_until')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN corporate_build_cooldown_until INTEGER');
  }
  if (!marketCompanyColumns.has('last_corporate_build_at')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN last_corporate_build_at INTEGER');
  }
  if (!marketCompanyColumns.has('corporate_builds_48h')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN corporate_builds_48h INTEGER NOT NULL DEFAULT 0');
  }
  if (!marketCompanyColumns.has('private_asset_value')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN private_asset_value REAL NOT NULL DEFAULT 0');
  }
  if (!marketCompanyColumns.has('private_production_json')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN private_production_json TEXT NOT NULL DEFAULT '{}'");
  }
  if (!marketCompanyColumns.has('state_contract_revenue_per_hour')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN state_contract_revenue_per_hour REAL NOT NULL DEFAULT 0');
  }
  if (!marketCompanyColumns.has('state_contract_output_json')) {
    db.exec("ALTER TABLE market_companies ADD COLUMN state_contract_output_json TEXT NOT NULL DEFAULT '{}'");
  }
  if (!marketCompanyColumns.has('state_contract_score')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN state_contract_score REAL NOT NULL DEFAULT 0');
  }
  if (!marketCompanyColumns.has('state_backed_slot_count')) {
    db.exec('ALTER TABLE market_companies ADD COLUMN state_backed_slot_count INTEGER NOT NULL DEFAULT 0');
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
  if (!sectorEconomyColumns.has('market_sentiment')) {
    db.exec("ALTER TABLE sector_economy_state ADD COLUMN market_sentiment TEXT NOT NULL DEFAULT 'Neutral'");
  }
  if (!sectorEconomyColumns.has('stockpile_metals')) {
    db.exec('ALTER TABLE sector_economy_state ADD COLUMN stockpile_metals REAL NOT NULL DEFAULT 0');
  }
  if (!sectorEconomyColumns.has('stockpile_fuel')) {
    db.exec('ALTER TABLE sector_economy_state ADD COLUMN stockpile_fuel REAL NOT NULL DEFAULT 0');
  }
  if (!sectorEconomyColumns.has('stockpile_supplies')) {
    db.exec('ALTER TABLE sector_economy_state ADD COLUMN stockpile_supplies REAL NOT NULL DEFAULT 0');
  }
  if (!sectorEconomyColumns.has('stockpile_technology')) {
    db.exec('ALTER TABLE sector_economy_state ADD COLUMN stockpile_technology REAL NOT NULL DEFAULT 0');
  }
  if (!sectorEconomyColumns.has('stockpile_chemicals')) {
    db.exec('ALTER TABLE sector_economy_state ADD COLUMN stockpile_chemicals REAL NOT NULL DEFAULT 0');
  }
  const sectorDemandColumns = new Set(db.prepare('PRAGMA table_info(sector_resource_demand)').all().map((column) => column.name));
  if (!sectorDemandColumns.has('pressure_score')) {
    db.exec('ALTER TABLE sector_resource_demand ADD COLUMN pressure_score REAL NOT NULL DEFAULT 0');
  }
  if (!sectorDemandColumns.has('momentum')) {
    db.exec('ALTER TABLE sector_resource_demand ADD COLUMN momentum REAL NOT NULL DEFAULT 0');
  }
  if (!sectorDemandColumns.has('trend')) {
    db.exec('ALTER TABLE sector_resource_demand ADD COLUMN trend REAL NOT NULL DEFAULT 0');
  }
  if (!sectorDemandColumns.has('volatility')) {
    db.exec('ALTER TABLE sector_resource_demand ADD COLUMN volatility REAL NOT NULL DEFAULT 0.08');
  }
  if (!sectorDemandColumns.has('chain_impulse')) {
    db.exec('ALTER TABLE sector_resource_demand ADD COLUMN chain_impulse REAL NOT NULL DEFAULT 0');
  }
  if (!sectorDemandColumns.has('chain_source_resource')) {
    db.exec("ALTER TABLE sector_resource_demand ADD COLUMN chain_source_resource TEXT NOT NULL DEFAULT ''");
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
  const tutorialSeenColumns = new Set(db.prepare('PRAGMA table_info(tutorial_seen_ips)').all().map((column) => column.name));
  if (!tutorialSeenColumns.has('user_id')) {
    db.exec('ALTER TABLE tutorial_seen_ips ADD COLUMN user_id TEXT');
  }
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_tutorial_seen_ips_user_id ON tutorial_seen_ips(user_id) WHERE user_id IS NOT NULL');
  db.prepare(`
    UPDATE market_companies
    SET corporate_strategy = CASE
      WHEN corporate_strategy IS NULL OR trim(corporate_strategy) = '' THEN 'conservative'
      ELSE corporate_strategy
    END,
    corporate_resources_json = CASE
      WHEN corporate_resources_json IS NULL OR trim(corporate_resources_json) = '' THEN '{}'
      ELSE corporate_resources_json
    END,
    private_production_json = CASE
      WHEN private_production_json IS NULL OR trim(private_production_json) = '' THEN '{}'
      ELSE private_production_json
    END
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
      corporate_cash, corporate_resources_json, corporate_strategy, expansion_score, monopoly_score,
      corporate_builds_48h, private_asset_value, private_production_json,
      base_price, current_price, previous_price, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateSectorHolding = db.prepare(`
    UPDATE market_companies
    SET symbol = ?, name = ?, faction = ?, sector = ?, resource_key = ?, sector_id = ?,
      resource_refs_json = CASE
        WHEN resource_refs_json IS NULL OR resource_refs_json = '' OR resource_refs_json = '[]' THEN ?
        ELSE resource_refs_json
      END,
      corporate_cash = CASE WHEN corporate_cash <= 0 THEN ? ELSE corporate_cash END,
      corporate_strategy = CASE WHEN corporate_strategy IS NULL OR trim(corporate_strategy) = '' THEN ? ELSE corporate_strategy END,
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
          const corporateCashSeed = round2(price * 34);
          updateSectorHolding.run(
            symbol,
            `${sector} ${holdingLabel}`,
            faction,
            sector,
            resourceKey,
            sectorId,
            JSON.stringify([resourceKey]),
            corporateCashSeed,
            chooseCorporateStrategy(companyId),
            price,
            migrationTime,
            companyId
          );
        } else {
          const corporateCashSeed = round2(price * 34);
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
            corporateCashSeed,
            JSON.stringify(emptyResourceBag()),
            chooseCorporateStrategy(companyId),
            0.2,
            0,
            0,
            0,
            JSON.stringify(emptyResourceBag()),
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
  try {
    initializeMarketOwnership(db, campaignState, migrationTime);
  } catch (error) {
    if (error?.code === 'SQLITE_BUSY') {
      console.warn('Market ownership initialization skipped during startup because the database is busy.');
    } else {
      throw error;
    }
  }

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
  const faction = String(company.faction || '').trim();
  const factionPreferred = faction === 'KUS'
    ? ['inst_techno_union', 'inst_trade_federation', 'inst_corporate_alliance', 'inst_igbc']
    : (faction === 'GAR' ? ['inst_republic_infra_fund', 'inst_core_pension', 'inst_sector_authority'] : []);
  const preferredIds = [...new Set([...factionPreferred, ...(preferredByResource[resourceKey] || [])])];
  const preferred = preferredIds
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

function writeMarketIntegrityLog(db, input = {}) {
  const createdAt = input.createdAt || new Date().toISOString();
  db.prepare(`
    INSERT INTO market_integrity_logs (
      id, investor_id, company_id, issue_type, severity,
      before_json, after_json, action_taken, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    crypto.randomUUID(),
    input.investorId || null,
    input.companyId || null,
    input.issueType || 'unknown',
    input.severity || 'warning',
    input.before ? JSON.stringify(input.before) : null,
    input.after ? JSON.stringify(input.after) : null,
    input.actionTaken || 'logged',
    createdAt
  );
  return { createdAt };
}

function getSellableLotQuantity(db, investorId, companyId) {
  return roundShares(db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN COALESCE(remaining_quantity, quantity) > 0
      THEN COALESCE(remaining_quantity, quantity) ELSE 0 END), 0) AS shares
    FROM market_orders
    WHERE investor_id = ? AND company_id = ?
  `).get(investorId, companyId)?.shares);
}

function setHoldingCache(db, investorId, companyId, shares) {
  const nextShares = Math.max(0, roundShares(shares));
  if (nextShares <= 0) {
    db.prepare('DELETE FROM market_holdings WHERE investor_id = ? AND company_id = ?').run(investorId, companyId);
    return nextShares;
  }
  db.prepare(`
    INSERT INTO market_holdings (investor_id, company_id, shares)
    VALUES (?, ?, ?)
    ON CONFLICT(investor_id, company_id) DO UPDATE SET shares = excluded.shares
  `).run(investorId, companyId, nextShares);
  return nextShares;
}

export function reconcileInvestorCompanyHolding(db, investorId, companyId, options = {}) {
  if (!investorId || !companyId) return { sellableQuantity: 0, cachedQuantity: 0, repaired: false, warning: null };
  const createdAt = options.createdAt || new Date().toISOString();
  const negativeLots = db.prepare(`
    SELECT id, remaining_quantity AS remainingQuantity
    FROM market_orders
    WHERE investor_id = ? AND company_id = ? AND COALESCE(remaining_quantity, quantity) < 0
  `).all(investorId, companyId);
  if (negativeLots.length) {
    const before = { negativeLots };
    db.prepare(`
      UPDATE market_orders
      SET remaining_quantity = 0, closed_at = COALESCE(closed_at, ?)
      WHERE investor_id = ? AND company_id = ? AND COALESCE(remaining_quantity, quantity) < 0
    `).run(createdAt, investorId, companyId);
    writeMarketIntegrityLog(db, {
      investorId,
      companyId,
      issueType: 'negative_remaining_quantity',
      severity: 'critical',
      before,
      after: { negativeLotsRepaired: negativeLots.length },
      actionTaken: 'negative_remaining_quantity_clamped_to_zero',
      createdAt
    });
  }
  const sellableQuantity = getSellableLotQuantity(db, investorId, companyId);
  const cachedQuantity = roundShares(db.prepare(`
    SELECT shares FROM market_holdings
    WHERE investor_id = ? AND company_id = ?
  `).get(investorId, companyId)?.shares);
  if (cachedQuantity !== sellableQuantity) {
    setHoldingCache(db, investorId, companyId, sellableQuantity);
    writeMarketIntegrityLog(db, {
      investorId,
      companyId,
      issueType: 'holdings_lot_mismatch',
      severity: 'warning',
      before: { cachedQuantity, sellableQuantity },
      after: { cachedQuantity: sellableQuantity },
      actionTaken: 'market_holdings_cache_reconciled_from_open_lots',
      createdAt
    });
    updateOwnershipStructure(db, companyId, Date.parse(createdAt) || Date.now());
    return {
      sellableQuantity,
      cachedQuantity: sellableQuantity,
      repaired: true,
      warning: 'Bestand wurde aus offenen Kauf-Lots korrigiert.'
    };
  }
  return { sellableQuantity, cachedQuantity, repaired: false, warning: null };
}

export function repairInvestorCompany(db, investorId, companyId) {
  return db.transaction(() => {
    const result = reconcileInvestorCompanyHolding(db, investorId, companyId, { createdAt: new Date().toISOString() });
    writePortfolioSnapshot(db, investorId);
    return result;
  })();
}

export function repairCompanyHoldings(db, companyId) {
  return db.transaction(() => {
    const investorIds = db.prepare(`
      SELECT investor_id AS investorId FROM market_holdings WHERE company_id = ?
      UNION
      SELECT investor_id AS investorId FROM market_orders WHERE company_id = ?
    `).all(companyId, companyId).map((row) => row.investorId).filter(Boolean);
    const results = investorIds.map((investorId) => reconcileInvestorCompanyHolding(db, investorId, companyId));
    updateOwnershipStructure(db, companyId);
    investorIds.forEach((investorId) => writePortfolioSnapshot(db, investorId));
    return { companyId, repairedInvestors: results.filter((entry) => entry.repaired).length, checkedInvestors: results.length };
  })();
}

export function repairAllMarket(db) {
  return db.transaction(() => {
    const companyIds = db.prepare(`
      SELECT id FROM market_companies
      UNION
      SELECT company_id AS id FROM market_orders
      UNION
      SELECT company_id AS id FROM market_holdings
    `).all().map((row) => row.id).filter(Boolean);
    let checkedInvestors = 0;
    let repairedInvestors = 0;
    companyIds.forEach((companyId) => {
      const result = repairCompanyHoldings(db, companyId);
      checkedInvestors += result.checkedInvestors;
      repairedInvestors += result.repairedInvestors;
    });
    return { companies: companyIds.length, checkedInvestors, repairedInvestors };
  })();
}

function suspendCompanyInternal(db, companyId, reason = 'Marktintegritaetsschutz', createdAt = new Date().toISOString()) {
  const company = db.prepare('SELECT id, name, market_status AS marketStatus FROM market_companies WHERE id = ? OR symbol = ?').get(companyId, companyId);
  if (!company) {
    const error = new Error('Unternehmen nicht gefunden.');
    error.status = 404;
    throw error;
  }
  db.prepare(`
    UPDATE market_companies
    SET market_status = 'suspended', updated_at = ?
    WHERE id = ?
  `).run(createdAt, company.id);
  writeMarketIntegrityLog(db, {
    companyId: company.id,
    issueType: 'suspended_company',
    severity: 'critical',
    before: { marketStatus: company.marketStatus },
    after: { marketStatus: 'suspended' },
    actionTaken: reason,
    createdAt
  });
  insertMarketEvent(db, {
    eventType: 'market_suspended',
    title: 'Handel ausgesetzt',
    description: reason,
    impact: 0,
    startedAt: createdAt
  });
  return { companyId: company.id, suspended: true, reason };
}

export function suspendCompany(db, companyId, reason = 'Marktintegritaetsschutz') {
  return db.transaction(() => suspendCompanyInternal(db, companyId, reason))();
}

export function resetCompanyPrice(db, companyId, fairPrice, reason = 'Admin-Fair-Price-Reset') {
  return db.transaction(() => {
    const createdAt = new Date().toISOString();
    const company = db.prepare('SELECT * FROM market_companies WHERE id = ? OR symbol = ?').get(companyId, companyId);
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
    const price = round2(Math.max(MIN_MARKET_PRICE, Number(fairPrice || company.base_price || MIN_MARKET_PRICE)));
    db.prepare(`
      UPDATE market_companies
      SET previous_price = current_price, current_price = ?, market_cap = ?, updated_at = ?
      WHERE id = ?
    `).run(price, round2(price * roundShares(company.total_shares)), createdAt, company.id);
    db.prepare('INSERT INTO market_history (id, company_id, price, recorded_at) VALUES (?, ?, ?, ?)')
      .run(crypto.randomUUID(), company.id, price, createdAt);
    writeMarketIntegrityLog(db, {
      companyId: company.id,
      issueType: 'repaired_company',
      severity: 'admin',
      before: { currentPrice: company.current_price, previousPrice: company.previous_price },
      after: { currentPrice: price },
      actionTaken: reason,
      createdAt
    });
    insertMarketEvent(db, {
      eventType: 'market_price_reset',
      title: 'Fair-Price-Reset',
      description: reason,
      impact: 0,
      startedAt: createdAt
    });
    updateOwnershipStructure(db, company.id, Date.parse(createdAt) || Date.now());
    return { companyId: company.id, fairPrice: price };
  })();
}

function assertPriceIsFinite(db, companyId, price, context = {}) {
  if (!Number.isFinite(Number(price)) || Number.isNaN(Number(price)) || Number(price) < MIN_MARKET_PRICE) {
    writeMarketIntegrityLog(db, {
      investorId: context.investorId || null,
      companyId,
      issueType: 'invalid_price',
      severity: 'critical',
      before: context,
      after: { rejectedPrice: price },
      actionTaken: 'transaction_rollback',
      createdAt: context.createdAt
    });
    const error = new Error('Ungueltiger Marktpreis. Trade wurde abgebrochen.');
    error.status = 409;
    throw error;
  }
}

function calculateBoundedTradePricing(db, company, quantity, side, context = {}) {
  const currentPrice = Number(company.current_price || 0);
  assertPriceIsFinite(db, company.id, currentPrice, context);
  const rawMove = 0.0125 * Math.sqrt(Math.max(1, Number(quantity || 1)));
  const cappedMove = Math.min(MAX_SINGLE_TRADE_MOVE, rawMove);
  const direction = side === 'sell' ? -1 : 1;
  const nextPrice = round2(Math.max(MIN_MARKET_PRICE, currentPrice * (1 + (direction * cappedMove))));
  const executionPrice = round2(Math.max(MIN_MARKET_PRICE, currentPrice * (1 + (direction * cappedMove * 0.5))));
  if (rawMove > MAX_SINGLE_TRADE_MOVE) {
    writeMarketIntegrityLog(db, {
      investorId: context.investorId || null,
      companyId: company.id,
      issueType: 'abnormal_price_move',
      severity: 'warning',
      before: { currentPrice, requestedQuantity: quantity, rawMove, side },
      after: { cappedMove, nextPrice, executionPrice },
      actionTaken: 'price_impact_capped',
      createdAt: context.createdAt
    });
  }
  assertPriceIsFinite(db, company.id, nextPrice, { ...context, currentPrice, nextPrice });
  return { executionPrice, nextPrice, rawMove, cappedMove };
}

function assertRecentPriceWindowHealthy(db, company, nextPrice, context = {}) {
  const createdAt = context.createdAt || new Date().toISOString();
  const cutoff = new Date((Date.parse(createdAt) || Date.now()) - (15 * 60 * 1000)).toISOString();
  const rows = db.prepare(`
    SELECT price FROM market_history
    WHERE company_id = ? AND recorded_at >= ?
    ORDER BY recorded_at ASC
  `).all(company.id, cutoff);
  if (!rows.length) return;
  const baseline = Number(rows[0].price || company.current_price || company.base_price || MIN_MARKET_PRICE);
  if (!Number.isFinite(baseline) || baseline < MIN_MARKET_PRICE) return;
  const ratio = Number(nextPrice) / baseline;
  if (ratio > ABNORMAL_15M_PRICE_MULTIPLIER || ratio < (1 / ABNORMAL_15M_PRICE_MULTIPLIER)) {
    suspendCompanyInternal(
      db,
      company.id,
      `${company.name} wurde wegen abnormaler Kursbewegung im 15-Minuten-Fenster ausgesetzt.`,
      createdAt
    );
    writeMarketIntegrityLog(db, {
      investorId: context.investorId || null,
      companyId: company.id,
      issueType: 'abnormal_price_move',
      severity: 'critical',
      before: { baseline, currentPrice: company.current_price, nextPrice, ratio },
      after: { marketStatus: 'suspended' },
      actionTaken: 'transaction_rollback_company_suspended',
      createdAt
    });
    const error = new Error('Handel wegen abnormaler Kursbewegung ausgesetzt.');
    error.status = 409;
    throw error;
  }
}

function getPortfolioMetrics(db, investorId) {
  const investor = getOrCreateMarketInvestor(db, investorId);
  db.prepare(`
    SELECT company_id AS companyId FROM market_holdings WHERE investor_id = ?
    UNION
    SELECT company_id AS companyId FROM market_orders WHERE investor_id = ?
  `).all(investorId, investorId)
    .map((row) => row.companyId)
    .filter(Boolean)
    .forEach((companyId) => reconcileInvestorCompanyHolding(db, investorId, companyId));
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

export function runCorporateBuildTick(db, state, now = Date.now()) {
  if (!state || !canRunCadence(db, 'last_corporate_build_tick', CORPORATE_BUILD_TICK_MS, now)) return 0;
  const tickStartedAt = Date.now();
  const deadlineAt = tickStartedAt + CORPORATE_BUILD_TICK_TIME_BUDGET_MS;
  const rows = db.prepare(`
    SELECT id, name, sector_id AS sectorId, resource_refs_json AS resourceRefsJson,
      market_status AS marketStatus, is_embargoed AS isEmbargoed,
      bankruptcy_risk AS bankruptcyRisk, debt_index AS debtIndex, confidence_index AS confidenceIndex,
      corporate_cash AS corporateCash, corporate_resources_json AS corporateResourcesJson,
      corporate_strategy AS corporateStrategy, expansion_score AS expansionScore,
      monopoly_score AS monopolyScore, private_asset_value AS privateAssetValue,
      current_price AS currentPrice, base_price AS basePrice,
      corporate_build_cooldown_until AS corporateBuildCooldownUntil
    FROM market_companies
    WHERE id LIKE 'sector_holding_%' AND acquired_by_company_id IS NULL
  `).all();
  const demandRows = db.prepare(`
    SELECT sector_id AS sectorId, resource_type AS resourceType, demand_score AS demandScore,
      supply_score AS supplyScore, market_multiplier AS marketMultiplier
    FROM sector_resource_demand
  `).all();
  const demandBySector = new Map();
  demandRows.forEach((row) => {
    if (!demandBySector.has(row.sectorId)) demandBySector.set(row.sectorId, []);
    demandBySector.get(row.sectorId).push(row);
  });
  const sectorStateMap = new Map(db.prepare(`
    SELECT sector_id AS sectorId, is_embargoed AS isEmbargoed, war_pressure AS warPressure
    FROM sector_economy_state
  `).all().map((row) => [row.sectorId, row]));
  const insertProject = db.prepare(`
    INSERT INTO corporate_build_projects (
      id, company_id, sector_id, planet_id, building_type, resource_type, status,
      started_at, completes_at, cost_resources_json, cost_credits, expected_roi,
      reason, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateCompany = db.prepare(`
    UPDATE market_companies
    SET corporate_cash = ?, corporate_resources_json = ?, last_corporate_build_at = ?,
      corporate_build_cooldown_until = ?, expansion_score = ?, monopoly_score = ?, updated_at = ?
    WHERE id = ?
  `);
  const readRefreshedCompany = db.prepare(`
    SELECT id, corporate_cash AS corporateCash, corporate_resources_json AS corporateResourcesJson
    FROM market_companies
    WHERE id = ?
    LIMIT 1
  `);
  const tryStartBuildForCompany = db.transaction((company, sectorState, choice, cost) => {
    if (Date.now() >= deadlineAt) {
      throw Object.assign(new Error('corporate-build-budget-exceeded'), { code: 'CORPORATE_BUILD_SKIP' });
    }
    const planets = getSectorPlanetsForCompany(state, company);
    const currentAssets = readCompanyCorporateAssets(db, state, company.id);
    const targetPlanet = pickCorporateAssetPlanet(planets, `${company.id}:build`, currentAssets, true);
    if (!targetPlanet) {
      throw Object.assign(new Error('corporate-build-no-planet'), { code: 'CORPORATE_BUILD_SKIP' });
    }
    const procurement = procureResourcesForCorporateBuild(db, state, company, cost, {
      reason: `Input-Beschaffung fuer ${choice.buildingType}`,
      expectedRoi: choice.expectedRoi,
      createdAt: new Date(now).toISOString(),
      deadlineAt
    });
    if (!procurement.ok) {
      throw Object.assign(new Error(procurement.reason || 'corporate-build-procurement-failed'), { code: 'CORPORATE_BUILD_SKIP' });
    }
    const refreshedCompany = readRefreshedCompany.get(company.id);
    if (!refreshedCompany) {
      throw Object.assign(new Error('corporate-build-company-refresh-missing'), { code: 'CORPORATE_BUILD_SKIP' });
    }
    const refreshedResources = sanitizeResourceBag(refreshedCompany.corporateResourcesJson);
    if (RESOURCE_KEYS.some((key) => safeNumber(refreshedResources[key], 0, 0, 1e9) < safeNumber(cost.costResources[key], 0, 0, 1e9))) {
      throw Object.assign(new Error('corporate-build-insufficient-resources-after-procurement'), { code: 'CORPORATE_BUILD_SKIP' });
    }
    if (safeNumber(refreshedCompany.corporateCash, 0, 0, 1e9) < safeNumber(cost.costCredits, 0, 0, 1e9)) {
      throw Object.assign(new Error('corporate-build-insufficient-cash-after-procurement'), { code: 'CORPORATE_BUILD_SKIP' });
    }
    const charged = chargeCorporateBuildCost({
      corporateCash: refreshedCompany.corporateCash,
      corporateResourcesJson: JSON.stringify(refreshedResources)
    }, cost);
    const createdAt = new Date(now).toISOString();
    updateCompany.run(
      charged.nextCash,
      JSON.stringify(charged.nextResources),
      now,
      now + (choice.expectedRoi > 0.25 ? (12 * 60 * 60 * 1000) : (18 * 60 * 60 * 1000)),
      clamp(safeNumber(company.expansionScore, 0.2, 0, 1) + 0.04, 0, 1),
      clamp(safeNumber(company.monopolyScore, 0, 0, 1) + (choice.expectedRoi >= 0.22 ? 0.03 : 0.01), 0, 1),
      createdAt,
      company.id
    );
    insertProject.run(
      crypto.randomUUID(),
      company.id,
      company.sectorId,
      targetPlanet.id,
      choice.buildingType,
      choice.resourceType,
      'building',
      createdAt,
      new Date(now + CORPORATE_BUILD_DURATION_MS).toISOString(),
      JSON.stringify(cost.costResources),
      cost.costCredits,
      choice.expectedRoi,
      choice.reason,
      createdAt,
      createdAt
    );
    insertMarketEvent(db, {
      eventType: 'corporate_build_started',
      title: 'Privates Holding-Bauprojekt',
      description: `${company.name} startet den privaten Ausbau von ${getCorporateBuildingMeta(choice.buildingType)?.label || choice.buildingType}.`,
      impact: 0.02,
      startedAt: createdAt
    });
    refreshCorporateSummaries(
      db,
      procurement.touchedCompanyIds?.length ? procurement.touchedCompanyIds : [company.id],
      Date.parse(createdAt) || now
    );
    return true;
  });
  let started = 0;
  let processed = 0;
  for (const company of rows) {
    if (processed >= CORPORATE_BUILD_TICK_COMPANY_LIMIT) break;
    if (started >= CORPORATE_BUILD_TICK_START_LIMIT) break;
    if (Date.now() >= deadlineAt) break;
    processed += 1;
    if (normalizeMarketStatus(company.marketStatus) !== 'tradeable' || Number(company.isEmbargoed || 0)) continue;
    const sectorState = sectorStateMap.get(company.sectorId) || {};
    if (Number(sectorState.isEmbargoed || 0)) continue;
    const activity = getCompanyActivityWindowStats(db, company.id, now);
    if (activity.activeProjects >= CORPORATE_MAX_ACTIVE_PROJECTS || activity.completed48h >= CORPORATE_MAX_COMPLETED_48H) continue;
    if (safeNumber(company.corporateBuildCooldownUntil, 0, 0, Number.MAX_SAFE_INTEGER) > now) continue;
    const opportunities = evaluateCorporateBuildOpportunities(company, sectorState, demandBySector.get(company.sectorId) || [], state);
    const choice = opportunities[0];
    if (!choice) continue;
    const cost = calculateCorporateBuildCost(company, choice.buildingType, sectorState);
    if (!cost || safeNumber(company.corporateCash, 0, 0, 1e9) < cost.costCredits) continue;
    try {
      if (tryStartBuildForCompany(company, sectorState, choice, cost)) {
        started += 1;
      }
    } catch (error) {
      if (error?.code !== 'CORPORATE_BUILD_SKIP') throw error;
    }
  }
  setRuntimeStateNumber(db, 'last_corporate_build_tick', now, new Date(now).toISOString());
  return started;
}

export function completeCorporateBuildProjects(db, state, now = Date.now()) {
  const due = db.prepare(`
    SELECT id, company_id AS companyId, sector_id AS sectorId, planet_id AS planetId,
      building_type AS buildingType, resource_type AS resourceType
    FROM corporate_build_projects
    WHERE status = 'building' AND completes_at <= ?
  `).all(new Date(now).toISOString());
  if (!due.length) return 0;
  const insertAsset = db.prepare(`
    INSERT INTO corporate_assets (
      id, company_id, sector_id, planet_id, building_type, resource_type,
      production_per_hour, revenue_per_hour, maintenance_cost_per_hour,
      condition_index, risk_index, damage_index, blockade_index, strategic_value,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const markComplete = db.prepare(`UPDATE corporate_build_projects SET status = 'completed', updated_at = ? WHERE id = ?`);
  let completed = 0;
  db.transaction(() => {
    const sectorMaps = getSectorMaps(state);
    due.forEach((project) => {
      const meta = getCorporateBuildingMeta(project.buildingType);
      if (!meta) return;
      const createdAt = new Date(now).toISOString();
      insertAsset.run(
        crypto.randomUUID(),
        project.companyId,
        project.sectorId,
        project.planetId,
        project.buildingType,
        project.resourceType,
        meta.productionPerHour,
        meta.revenuePerHour,
        meta.maintenanceCostPerHour,
        1,
        0.07,
        0,
        0,
        meta.strategicValue,
        createdAt,
        createdAt
      );
      markComplete.run(createdAt, project.id);
      updateCompanyCorporateSummary(db, project.companyId, now);
      const company = db.prepare('SELECT name FROM market_companies WHERE id = ?').get(project.companyId);
      const planet = (state?.planets || []).find((entry) => entry.id === project.planetId);
      const sectorName = sectorMaps.byId.get(String(project.sectorId || ''))?.name || '';
      insertMarketEvent(db, {
        eventType: 'corporate_build_completed',
        title: 'Privates Holding-Projekt abgeschlossen',
        description: `${company?.name || 'Eine Holding'} eroeffnet ${meta.label || project.buildingType}${sectorName ? ` im ${sectorName}-Sektor` : ''}${planet?.name ? ` auf ${planet.name}` : ''}.`,
        impact: 0.025,
        startedAt: createdAt
      });
      completed += 1;
    });
  })();
  return completed;
}

export function runCorporateProductionTick(db, state, now = Date.now()) {
  if (!state || !canRunCadence(db, 'last_corporate_production_tick', CORPORATE_PRODUCTION_TICK_MS, now)) return 0;
  const assets = db.prepare(`
    SELECT a.id, a.company_id AS companyId, a.sector_id AS sectorId, a.planet_id AS planetId, a.resource_type AS resourceType,
      a.production_per_hour AS productionPerHour, a.revenue_per_hour AS revenuePerHour,
      a.maintenance_cost_per_hour AS maintenanceCostPerHour, a.condition_index AS conditionIndex,
      a.risk_index AS riskIndex, a.damage_index AS damageIndex, a.blockade_index AS blockadeIndex,
      c.corporate_resources_json AS corporateResourcesJson, c.corporate_cash AS corporateCash
    FROM corporate_assets a
    LEFT JOIN market_companies c ON c.id = a.company_id
    WHERE c.acquired_by_company_id IS NULL
  `).all();
  const companyUpdates = new Map();
  const updateAsset = db.prepare(`
    UPDATE corporate_assets
    SET condition_index = ?, risk_index = ?, damage_index = ?, blockade_index = ?, updated_at = ?
    WHERE id = ?
  `);
  const updateCompany = db.prepare(`
    UPDATE market_companies
    SET corporate_resources_json = ?, corporate_cash = ?, updated_at = ?
    WHERE id = ?
  `);
  const updateSupply = db.prepare(`
    UPDATE sector_resource_demand
    SET supply_score = ?, updated_at = ?
    WHERE sector_id = ? AND resource_type = ?
  `);
  db.transaction(() => {
    assets.forEach((asset) => {
      const infra = getPlanetInfrastructureModifier(state, asset.planetId);
      const conflictPressure = getPlanetConflictPressure(state, asset.planetId);
      const nextDamage = clamp(safeNumber(asset.damageIndex, 0, 0, 1) + conflictPressure - infra.stabilityBonus * 0.25, 0, 1);
      const nextBlockade = clamp(safeNumber(asset.blockadeIndex, 0, 0, 1) + (conflictPressure > 0.2 ? 0.06 : -0.03), 0, 1);
      const nextCondition = clamp(safeNumber(asset.conditionIndex, 1, 0, 1.2) - nextDamage * 0.02 + infra.stabilityBonus * 0.015, 0.35, 1.1);
      const effectiveProduction = safeNumber(asset.productionPerHour, 0, 0, 1e6)
        * nextCondition
        * (1 + infra.productionBonus)
        * (1 - nextDamage * 0.45)
        * (1 - nextBlockade * 0.35);
      const maintenanceCost = safeNumber(asset.maintenanceCostPerHour, 0, 0, 1e6)
        * (1 + nextDamage * 0.35 + nextBlockade * 0.22);
      if (!companyUpdates.has(asset.companyId)) {
        companyUpdates.set(asset.companyId, {
          cash: safeNumber(asset.corporateCash, 0, 0, 1e9),
          resources: sanitizeResourceBag(asset.corporateResourcesJson)
        });
      }
      const entry = companyUpdates.get(asset.companyId);
      entry.resources[asset.resourceType] = round2(safeNumber(entry.resources[asset.resourceType], 0, 0, 1e9) + effectiveProduction);
      entry.cash = round2(Math.max(0, entry.cash - maintenanceCost));
      if (asset.sectorId && effectiveProduction > 0) {
        const demandRow = db.prepare(`
          SELECT supply_score AS supplyScore
          FROM sector_resource_demand
          WHERE sector_id = ? AND resource_type = ?
          LIMIT 1
        `).get(asset.sectorId, asset.resourceType);
        if (demandRow) {
          updateSupply.run(
            round2(clamp(safeNumber(demandRow.supplyScore, 1, 0, 5.2) + Math.min(0.04, effectiveProduction / 1200), 0.15, 5.2)),
            new Date(now).toISOString(),
            asset.sectorId,
            asset.resourceType
          );
        }
      }
      updateAsset.run(nextCondition, clamp(safeNumber(asset.riskIndex, 0.08, 0, 1) + conflictPressure * 0.4, 0, 1), nextDamage, nextBlockade, new Date(now).toISOString(), asset.id);
    });
    companyUpdates.forEach((entry, companyId) => {
      updateCompany.run(JSON.stringify(entry.resources), entry.cash, new Date(now).toISOString(), companyId);
      updateCompanyCorporateSummary(db, companyId, now);
    });
    setRuntimeStateNumber(db, 'last_corporate_production_tick', now, new Date(now).toISOString());
  })();
  return companyUpdates.size;
}

export function runCorporateFinanceTick(db, state, now = Date.now()) {
  if (!state || !canRunCadence(db, 'last_corporate_finance_tick', CORPORATE_FINANCE_TICK_MS, now)) return 0;
  const lastTickMs = getRuntimeStateNumber(db, 'last_corporate_finance_tick', 0);
  const lastTickIso = new Date(lastTickMs || (now - CORPORATE_FINANCE_TICK_MS)).toISOString();
  const companies = db.prepare(`
    SELECT id, debt_index AS debtIndex, confidence_index AS confidenceIndex,
      sector_id AS sectorId, corporate_cash AS corporateCash, corporate_resources_json AS corporateResourcesJson,
      private_asset_value AS privateAssetValue,
      bankruptcy_risk AS bankruptcyRisk
    FROM market_companies
    WHERE id LIKE 'sector_holding_%' AND acquired_by_company_id IS NULL
  `).all();
  const financeRows = db.prepare(`
    SELECT company_id AS companyId,
      SUM(maintenance_cost_per_hour * (1 + damage_index * 0.5 + blockade_index * 0.3)) AS maintenance
    FROM corporate_assets
    GROUP BY company_id
  `).all();
  const financeMap = new Map(financeRows.map((row) => [row.companyId, row]));
  const updateCompany = db.prepare(`
    UPDATE market_companies
    SET corporate_cash = ?, debt_index = ?, confidence_index = ?, bankruptcy_risk = ?, updated_at = ?
    WHERE id = ?
  `);
  db.transaction(() => {
    companies.forEach((company) => {
      const finance = financeMap.get(company.id) || {};
      const realizedRevenue = getTradeWindowRevenue(db, company.id, lastTickIso);
      const realizedPurchases = getTradeWindowPurchases(db, company.id, lastTickIso);
      const maintenance = safeNumber(finance.maintenance, 0, 0, 1e9);
      const interest = safeNumber(company.debtIndex, 0, 0, 1) * 48;
      const net = realizedRevenue - realizedPurchases - interest - Math.max(0, maintenance * 0.2);
      const cashReserve = round2(Math.max(0, safeNumber(company.corporateCash, 0, 0, 1e9) - interest));
      const inventoryValue = getCompanyInventoryValue(db, company.sectorId, company.corporateResourcesJson);
      const nextDebt = clamp(safeNumber(company.debtIndex, 0.1, 0, 1) + (net < 0 ? 0.004 : -0.003), 0, 1);
      const nextConfidence = clamp(safeNumber(company.confidenceIndex, 1, 0, 1.4) + (realizedRevenue > 0 ? 0.005 : -0.003) + (net >= 0 ? 0.003 : -0.004), 0, 1.2);
      const assetCover = Math.min(0.35, safeNumber(company.privateAssetValue, 0, 0, 1e9) / 90000);
      const inventoryCover = Math.min(0.18, inventoryValue / 60000);
      const cashCover = Math.min(0.28, cashReserve / 50000);
      const nextRisk = clamp(
        safeNumber(company.bankruptcyRisk, 0, 0, 1)
          + (net < 0 ? 0.018 : -0.014)
          - assetCover
          - inventoryCover
          - cashCover
          - Math.min(0.06, realizedRevenue / 18000),
        0,
        1
      );
      updateCompany.run(cashReserve, nextDebt, nextConfidence, nextRisk, new Date(now).toISOString(), company.id);
      updateCompanyCorporateSummary(db, company.id, now);
    });
    setRuntimeStateNumber(db, 'last_corporate_finance_tick', now, new Date(now).toISOString());
  })();
  return companies.length;
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
      market_multiplier AS marketMultiplier, pressure_score AS pressureScore,
      momentum, trend, volatility, chain_impulse AS chainImpulse,
      chain_source_resource AS chainSourceResource, updated_at AS updatedAt
    FROM sector_resource_demand
  `).all();
  const previousDemandMap = new Map(previousDemandRows.map((row) => [`${row.sectorId}::${row.resourceType}`, row]));
  const previousSectorRows = db.prepare(`
    SELECT sector_id AS sectorId, sector_name AS sectorName, market_sentiment AS marketSentiment,
      stockpile_metals AS stockpileMetals, stockpile_fuel AS stockpileFuel,
      stockpile_supplies AS stockpileSupplies, stockpile_technology AS stockpileTechnology,
      stockpile_chemicals AS stockpileChemicals
    FROM sector_economy_state
  `).all();
  const previousSectorMap = new Map(previousSectorRows.map((row) => [row.sectorId, row]));
  const galacticAverages = {};
  RESOURCE_KEYS.forEach((resourceKey) => {
    const rows = previousDemandRows.filter((row) => row.resourceType === resourceKey);
    galacticAverages[resourceKey] = {
      demandScore: average(rows.map((row) => Number(row.demandScore || 1))) || 1,
      supplyScore: average(rows.map((row) => Number(row.supplyScore || 1))) || 1,
      pressureScore: average(rows.map((row) => Number(row.pressureScore || 0))) || 0,
      momentum: average(rows.map((row) => Number(row.momentum || 0))) || 0
    };
  });
  return {
    now,
    state,
    sectors,
    neighbors,
    inflationRate,
    policy,
    activeEvents,
    previousDemandMap,
    previousSectorMap,
    galacticAverages
  };
}

function getDemandRowFromMap(map, sectorId, resourceType) {
  return map?.get(`${sectorId}::${resourceType}`) || null;
}

function calculateSentimentLabel(score) {
  if (score <= -0.55) return 'Panik';
  if (score <= -0.16) return 'Negativ';
  if (score >= 0.62) return 'Euphorisch';
  if (score >= 0.18) return 'Positiv';
  return 'Neutral';
}

function calculateDelayedChainImpulse(sectorId, targetResource, options = {}) {
  const sourceConfig = RESOURCE_CHAIN_SOURCES[targetResource];
  if (!sourceConfig) return { impulse: 0, sourceResource: '' };
  const { source, delayTicks } = sourceConfig;
  const previousTarget = getDemandRowFromMap(options.previousDemandMap, sectorId, targetResource);
  const localSource = getDemandRowFromMap(options.previousDemandMap, sectorId, source);
  const neighborIds = options.neighbors?.get(sectorId) || [];
  const neighborRows = neighborIds
    .map((neighborId) => getDemandRowFromMap(options.previousDemandMap, neighborId, source))
    .filter(Boolean);
  const galactic = options.galacticAverages?.[source] || {};
  const localPressure = Number(localSource?.pressureScore || 0) + Number(localSource?.momentum || 0) * 0.45;
  const neighborPressure = neighborRows.length
    ? average(neighborRows.map((row) => Number(row.pressureScore || 0) + Number(row.momentum || 0) * 0.35))
    : localPressure * 0.35;
  const galacticPressure = Number(galactic.pressureScore || 0) + Number(galactic.momentum || 0) * 0.25;
  const weightedPressure = (localPressure * 0.7) + (neighborPressure * 0.2) + (galacticPressure * 0.1);
  const tickBucket = Math.floor(Number(options.now || Date.now()) / DEMAND_TICK_MS);
  const probabilityNoise = stableNoise(`chain-prob:${sectorId}:${source}:${targetResource}:${tickBucket}`, 0.18);
  const activationChance = clamp(0.22 + Math.max(0, weightedPressure) * 0.18 + probabilityNoise, 0.05, 0.82);
  const activated = stableNoise(`chain-gate:${sectorId}:${source}:${targetResource}:${tickBucket}`, 0.5) + 0.5 <= activationChance;
  const delayedBuild = activated ? weightedPressure / Math.max(1, delayTicks) : 0;
  const previousImpulse = Number(previousTarget?.chainImpulse || 0);
  const decay = clamp(0.91 - (1 / Math.max(8, delayTicks * 4)), 0.76, 0.9);
  return {
    impulse: round2(clamp((previousImpulse * decay) + delayedBuild, -0.55, 1.25)),
    sourceResource: source
  };
}

function calculateResourceStockpile(previousValue, sector, resourceType, demandScore, supplyScore, sectorState, options = {}) {
  const production = Number(sector.slotSummary?.production?.[resourceType] || 0);
  const embargoDrain = Number(sectorState?.isEmbargoed || 0) ? 0.18 : 0;
  const warDrain = Number(sectorState?.warPressure || 0) * 0.06;
  const netFlow = (production * 0.8) + (Number(supplyScore || 1) * 0.35) - (Number(demandScore || 1) * 0.3) - embargoDrain - warDrain;
  const storageNoise = stableNoise(`stockpile:${sector.id}:${resourceType}:${Math.floor(Number(options.now || Date.now()) / DEMAND_TICK_MS)}`, 0.08);
  return round2(clamp(Number(previousValue || 0) * 0.96 + netFlow + storageNoise, 0, 500));
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
      marketMultiplier: 1,
      pressureScore: 0,
      momentum: 0,
      trend: 0,
      volatility: 0.08,
      chainImpulse: 0,
      chainSourceResource: ''
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
  const hubBonus = clamp(Number(sector.logisticsHubCount || 0) * 0.15, 0, 0.5);
  const logisticsIndexBase = 0.45 + (civilians * 0.03) + (fleets * 0.04) + (planets * 0.02);
  const logisticsIndex = clamp(logisticsIndexBase * (1 + hubBonus), 0.3, 3.9);
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
  const supplyDisruption = clamp(
    (warPressure * 0.08)
      + (blackMarketPressure * 0.035)
      + (sector.dominantOwner === 'OPFOR' ? 0.25 : 0),
    0,
    0.48
  );
  const supplyScore = clamp((0.35 + (production * 0.34) + exportStrength * 0.08) * (1 - supplyDisruption), 0.15, 5.2);
  const randomNoise = stableNoise(`${sectorId}:${resourceType}:${Math.floor(options.now / DEMAND_TICK_MS)}`, 0.035);
  const speculationFactor = stableNoise(`spec:${sectorId}:${resourceType}:${Math.floor(options.now / (DEMAND_TICK_MS * 2))}`, 0.05);
  const tradeRouteDisruption = warPressure * 0.04 + blackMarketPressure * 0.03;
  const corruptionMultiplier = 1 + (blackMarketPressure * 0.03);
  const previous = options.previousDemandMap?.get(`${sectorId}::${resourceType}`);
  const previousSector = options.previousSectorMap?.get(sectorId);
  const previousSentiment = previousSector?.marketSentiment || 'Neutral';
  const sentimentEffect = MARKET_SENTIMENT_EFFECTS[previousSentiment] || 0;
  const chain = calculateDelayedChainImpulse(sectorId, resourceType, options);
  const chainDemandGate = stableNoise(`chain-demand:${sectorId}:${resourceType}:${Math.floor(options.now / DEMAND_TICK_MS)}`, 0.5) + 0.5;
  const chainDemandEffect = chainDemandGate > 0.34
    ? Number(chain.impulse || 0) * clamp(0.2 + chainDemandGate * 0.22, 0.12, 0.46)
    : 0;
  const rawDemand = clamp(
    baseDemand
      + neighborDemand.averageNeed * 0.35
      + chainDemandEffect
      + sentimentEffect * 0.35
      + randomNoise
      + speculationFactor,
    0.25,
    5.6
  );
  const delayedDemandEffect = previous ? (Number(previous.demandScore || rawDemand) * 0.76) + (rawDemand * 0.24) : rawDemand;
  const supplySurplusPressure = Math.max(0, supplyScore - rawDemand) * 0.42;
  const scarcityPressure = Math.max(0, rawDemand - supplyScore) * 0.34;
  const neighborPressure = neighborDemand.averageNeed * 0.16;
  const speculationPressure = Math.abs(speculationFactor) * 1.4;
  const pressureScore = clamp(
    supplySurplusPressure
      + scarcityPressure
      + neighborPressure
      + warPressure * 0.16
      + blackMarketPressure * 0.1
      + importDependency * 0.06
      + Math.max(0, chain.impulse) * 0.42
      + speculationPressure
      + sentimentEffect * 0.32
      + options.activeEvents.totalImpact * 0.3,
    -0.45,
    3.2
  );
  const previousMomentum = Number(previous?.momentum || 0);
  const previousMultiplier = Number(previous?.marketMultiplier || 1);
  const momentum = clamp((previousMomentum * 0.84) + ((pressureScore - 0.45) * 0.13) + Number(chain.impulse || 0) * 0.09, -1.1, 1.8);
  const marketMultiplier = clamp(
    1
      + ((delayedDemandEffect - supplyScore) * 0.07)
      + (importDependency * 0.06)
      + (exportStrength * 0.045)
      + ((consumerConfidence - 1) * 0.08)
      + (momentum * 0.035)
      + (pressureScore * 0.018)
      + options.activeEvents.totalImpact * 0.5
      - tradeRouteDisruption
      + (options.inflationRate * 0.04),
    0.72,
    1.45
  ) * corruptionMultiplier;
  const trend = clamp((Number(previous?.trend || 0) * 0.72) + ((marketMultiplier - previousMultiplier) * 0.28), -0.8, 0.8);
  const volatility = clamp(
    Number(previous?.volatility || 0.08) * 0.86
      + Math.abs(trend) * 0.45
      + Math.abs(momentum) * 0.035
      + warPressure * 0.018
      + Math.abs(speculationFactor) * 0.4,
    0.03,
    0.58
  );
  return {
    demandScore: round2(delayedDemandEffect),
    supplyScore: round2(supplyScore),
    importDependency: round2(importDependency),
    exportStrength: round2(exportStrength),
    marketMultiplier: round2(clamp(marketMultiplier, 0.72, 1.45)),
    pressureScore: round2(pressureScore),
    momentum: round2(momentum),
    trend: round2(trend),
    volatility: round2(volatility),
    chainImpulse: round2(chain.impulse),
    chainSourceResource: chain.sourceResource,
    sectorState: {
      populationIndex: round2(populationIndex),
      industrialIndex: round2(industrialIndex),
      logisticsIndex: round2(logisticsIndex),
      warPressure: round2(warPressure),
      consumerConfidence: round2(consumerConfidence),
      infrastructureDemand: round2(infrastructureDemand),
      blackMarketPressure: round2(blackMarketPressure)
      ,
      logisticsHubBonus: round2(hubBonus),
      logisticsHubCount: Number(sector.logisticsHubCount || 0),
      routePlanetCount: Number(sector.routePlanetCount || 0)
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
      market_sentiment, stockpile_metals, stockpile_fuel, stockpile_supplies,
      stockpile_technology, stockpile_chemicals,
      import_dependency_json, export_strength_json, last_demand_tick, last_updated
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      market_sentiment = excluded.market_sentiment,
      stockpile_metals = excluded.stockpile_metals,
      stockpile_fuel = excluded.stockpile_fuel,
      stockpile_supplies = excluded.stockpile_supplies,
      stockpile_technology = excluded.stockpile_technology,
      stockpile_chemicals = excluded.stockpile_chemicals,
      import_dependency_json = excluded.import_dependency_json,
      export_strength_json = excluded.export_strength_json,
      last_demand_tick = excluded.last_demand_tick,
      last_updated = excluded.last_updated
  `);
  const upsertResourceDemand = db.prepare(`
    INSERT INTO sector_resource_demand (
      sector_id, sector_name, resource_type, demand_score, supply_score,
      import_dependency, export_strength, market_multiplier,
      pressure_score, momentum, trend, volatility, chain_impulse, chain_source_resource,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(sector_id, resource_type) DO UPDATE SET
      sector_name = excluded.sector_name,
      demand_score = excluded.demand_score,
      supply_score = excluded.supply_score,
      import_dependency = excluded.import_dependency,
      export_strength = excluded.export_strength,
      market_multiplier = excluded.market_multiplier,
      pressure_score = excluded.pressure_score,
      momentum = excluded.momentum,
      trend = excluded.trend,
      volatility = excluded.volatility,
      chain_impulse = excluded.chain_impulse,
      chain_source_resource = excluded.chain_source_resource,
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
      const stockpileValues = {
        stockpileMetals: 0,
        stockpileFuel: 0,
        stockpileSupplies: 0,
        stockpileTechnology: 0,
        stockpileChemicals: 0
      };
      const previousSector = context.previousSectorMap?.get(sector.id);
      const controlStatus = mapSectorControlStatus(sector);
      let referenceSectorState = null;
      let multiplierTotal = 0;
      let pressureTotal = 0;
      let momentumTotal = 0;
      let trendTotal = 0;
      RESOURCE_KEYS.forEach((resourceKey) => {
        const demandRow = demandByResource[resourceKey];
        referenceSectorState = referenceSectorState || demandRow.sectorState;
        multiplierTotal += Number(demandRow.marketMultiplier || 1);
        pressureTotal += Number(demandRow.pressureScore || 0);
        momentumTotal += Number(demandRow.momentum || 0);
        trendTotal += Number(demandRow.trend || 0);
        importDependencyJson[resourceKey] = demandRow.importDependency;
        exportStrengthJson[resourceKey] = demandRow.exportStrength;
        const stockpileKey = RESOURCE_STOCKPILE_COLUMNS[resourceKey];
        stockpileValues[stockpileKey] = calculateResourceStockpile(
          previousSector?.[stockpileKey] || 0,
          sector,
          resourceKey,
          demandRow.demandScore,
          demandRow.supplyScore,
          {
            ...demandRow.sectorState,
            isEmbargoed: controlStatus === 'OPFOR' ? 1 : 0
          },
          { now }
        );
        upsertResourceDemand.run(
          sector.id,
          sector.name,
          resourceKey,
          demandRow.demandScore,
          demandRow.supplyScore,
          demandRow.importDependency,
          demandRow.exportStrength,
          demandRow.marketMultiplier,
          demandRow.pressureScore,
          demandRow.momentum,
          demandRow.trend,
          demandRow.volatility,
          demandRow.chainImpulse,
          demandRow.chainSourceResource,
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
      const averageMultiplier = multiplierTotal / Math.max(1, RESOURCE_KEYS.length);
      const averagePressure = pressureTotal / Math.max(1, RESOURCE_KEYS.length);
      const averageMomentum = momentumTotal / Math.max(1, RESOURCE_KEYS.length);
      const averageTrend = trendTotal / Math.max(1, RESOURCE_KEYS.length);
      const sentimentScore = (
        ((averageMultiplier - 1) * 2.2)
        + (averageMomentum * 0.35)
        + (averageTrend * 1.1)
        - Number(referenceSectorState?.warPressure || 0) * 0.12
        - Number(referenceSectorState?.blackMarketPressure || 0) * 0.08
        + stableNoise(`sentiment:${sector.id}:${Math.floor(now / (DEMAND_TICK_MS * 4))}`, 0.08)
      );
      const marketSentiment = calculateSentimentLabel(sentimentScore + averagePressure * 0.06);
      const economyState = mapEconomyStateFromMultiplier(averageMultiplier);
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
        marketSentiment,
        stockpileValues.stockpileMetals,
        stockpileValues.stockpileFuel,
        stockpileValues.stockpileSupplies,
        stockpileValues.stockpileTechnology,
        stockpileValues.stockpileChemicals,
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
  return { ran: true, recordedAt };
}

function getSectorPlanetsForCompany(state, company) {
  const { byId } = getSectorMaps(state);
  const sector = byId.get(String(company?.sectorId || ''));
  return Array.isArray(sector?.planets) ? sector.planets : [];
}

function pickCorporateAssetPlanet(planets, companyId, existingAssets = [], preferredEmpty = true) {
  if (!Array.isArray(planets) || !planets.length) return null;
  const existingPlanetCounts = new Map();
  existingAssets.forEach((asset) => {
    const planetId = String(asset?.planetId || '');
    if (!planetId) return;
    existingPlanetCounts.set(planetId, (existingPlanetCounts.get(planetId) || 0) + 1);
  });
  const sorted = [...planets].sort((left, right) => {
    const countDiff = (existingPlanetCounts.get(left.id) || 0) - (existingPlanetCounts.get(right.id) || 0);
    if (preferredEmpty && countDiff !== 0) return countDiff;
    return stableNoise(`${companyId}:${left.id}`, 0.25) - stableNoise(`${companyId}:${right.id}`, 0.25);
  });
  return sorted[0] || planets[0] || null;
}

function hydrateCorporateAssetRow(asset, state) {
  const meta = getCorporateBuildingMeta(asset.buildingType);
  const planet = (state?.planets || []).find((entry) => entry.id === asset.planetId) || null;
  return {
    ...asset,
    label: meta?.label || asset.buildingType,
    planetName: planet?.name || '',
    owner: planet?.owner || '',
    infrastructureType: 'corporate_private'
  };
}

function readCompanyCorporateAssets(db, state, companyId) {
  return db.prepare(`
    SELECT id, company_id AS companyId, sector_id AS sectorId, planet_id AS planetId,
      building_type AS buildingType, resource_type AS resourceType,
      production_per_hour AS productionPerHour, revenue_per_hour AS revenuePerHour,
      maintenance_cost_per_hour AS maintenanceCostPerHour, condition_index AS conditionIndex,
      risk_index AS riskIndex, damage_index AS damageIndex, blockade_index AS blockadeIndex,
      strategic_value AS strategicValue, created_at AS createdAt, updated_at AS updatedAt
    FROM corporate_assets
    WHERE company_id = ?
    ORDER BY created_at DESC
  `).all(companyId).map((asset) => hydrateCorporateAssetRow(asset, state));
}

function readCompanyCorporateProjects(db, companyId, state = null) {
  return db.prepare(`
    SELECT id, company_id AS companyId, sector_id AS sectorId, planet_id AS planetId,
      building_type AS buildingType, resource_type AS resourceType, status,
      started_at AS startedAt, completes_at AS completesAt,
      cost_resources_json AS costResourcesJson, cost_credits AS costCredits,
      expected_roi AS expectedRoi, reason, created_at AS createdAt, updated_at AS updatedAt
    FROM corporate_build_projects
    WHERE company_id = ?
    ORDER BY created_at DESC
  `).all(companyId).map((project) => ({
    ...project,
    costResources: sanitizeResourceBag(project.costResourcesJson),
    planetName: state ? ((state.planets || []).find((entry) => entry.id === project.planetId)?.name || '') : ''
  }));
}

function readRecentCorporateTrades(db, companyId, direction = 'all', limit = 12) {
  const normalizedDirection = String(direction || 'all');
  const whereSql = normalizedDirection === 'sales'
    ? 'seller_company_id = ?'
    : normalizedDirection === 'purchases'
      ? 'buyer_company_id = ?'
      : '(seller_company_id = ? OR buyer_company_id = ?)';
  const params = normalizedDirection === 'all' ? [companyId, companyId] : [companyId];
  return db.prepare(`
    SELECT t.id, t.seller_company_id AS sellerCompanyId, t.buyer_company_id AS buyerCompanyId,
      t.buyer_type AS buyerType, t.sector_id AS sectorId, t.resource_type AS resourceType,
      t.quantity, t.unit_price AS unitPrice, t.total_price AS totalPrice, t.reason, t.created_at AS createdAt,
      seller.name AS sellerName, buyer.name AS buyerName
    FROM corporate_resource_trades t
    LEFT JOIN market_companies seller ON seller.id = t.seller_company_id
    LEFT JOIN market_companies buyer ON buyer.id = t.buyer_company_id
    WHERE ${whereSql}
    ORDER BY t.created_at DESC
    LIMIT ${clamp(Number(limit || 12), 1, 50)}
  `).all(...params).map((trade) => ({
    ...trade,
    counterpartyName: normalizedDirection === 'sales'
      ? (trade.buyerName || (trade.buyerType === 'civilian_market' ? 'Ziviler Markt' : '-'))
      : normalizedDirection === 'purchases'
        ? (trade.sellerName || (!trade.sellerCompanyId ? 'Ziviler Markt' : '-'))
        : (trade.buyerName || trade.sellerName || (trade.buyerType === 'civilian_market' ? 'Ziviler Markt' : '-')),
    resourceLabel: sectorResourceLabel(trade.resourceType)
  }));
}

function updateCompanyCorporateSummary(db, companyId, now = Date.now()) {
  const assets = db.prepare(`
    SELECT resource_type AS resourceType, production_per_hour AS productionPerHour,
      revenue_per_hour AS revenuePerHour, maintenance_cost_per_hour AS maintenanceCostPerHour,
      condition_index AS conditionIndex, damage_index AS damageIndex, blockade_index AS blockadeIndex,
      strategic_value AS strategicValue
    FROM corporate_assets
    WHERE company_id = ?
  `).all(companyId);
  const completed48h = db.prepare(`
    SELECT COUNT(*) AS count
    FROM corporate_build_projects
    WHERE company_id = ? AND status = 'completed' AND completes_at >= ?
  `).get(companyId, new Date(now - CORPORATE_COMPLETION_WINDOW_MS).toISOString())?.count || 0;
  const productionBag = emptyResourceBag();
  let assetValue = 0;
  assets.forEach((asset) => {
    const effectiveProduction = safeNumber(asset.productionPerHour, 0, 0, 1e6)
      * clamp(safeNumber(asset.conditionIndex, 1, 0, 1.2) - safeNumber(asset.damageIndex, 0, 0, 1), 0, 1.2)
      * (1 - safeNumber(asset.blockadeIndex, 0, 0, 0.95));
    const resourceType = String(asset.resourceType || '');
    if (RESOURCE_KEYS.includes(resourceType)) {
      productionBag[resourceType] = round2(safeNumber(productionBag[resourceType], 0, 0, 1e9) + effectiveProduction);
    }
    assetValue += (
      safeNumber(asset.revenuePerHour, 0, 0, 1e9) * 18
      + safeNumber(asset.productionPerHour, 0, 0, 1e9) * 24
      + safeNumber(asset.strategicValue, 0, 0, 2) * 600
      - safeNumber(asset.maintenanceCostPerHour, 0, 0, 1e9) * 8
    ) * clamp(safeNumber(asset.conditionIndex, 1, 0, 1.4), 0.2, 1.2);
  });
  db.prepare(`
    UPDATE market_companies
    SET private_asset_value = ?, private_production_json = ?, corporate_builds_48h = ?, updated_at = ?
    WHERE id = ?
  `).run(round2(Math.max(0, assetValue)), JSON.stringify(productionBag), Number(completed48h || 0), new Date(now).toISOString(), companyId);
  return {
    privateAssetValue: round2(Math.max(0, assetValue)),
    privateProduction: productionBag,
    corporateBuilds48h: Number(completed48h || 0)
  };
}

function refreshCorporateSummaries(db, companyIds, now = Date.now()) {
  const seen = new Set();
  for (const companyId of Array.isArray(companyIds) ? companyIds : []) {
    const normalizedCompanyId = String(companyId || '').trim();
    if (!normalizedCompanyId || seen.has(normalizedCompanyId)) continue;
    seen.add(normalizedCompanyId);
    updateCompanyCorporateSummary(db, normalizedCompanyId, now);
  }
}

function seedCorporateAssetsForHoldings(db, state, now = Date.now()) {
  const companies = db.prepare(`
    SELECT id, sector_id AS sectorId, resource_refs_json AS resourceRefsJson
    FROM market_companies
    WHERE id LIKE 'sector_holding_%' AND acquired_by_company_id IS NULL
  `).all();
  const assetRows = db.prepare(`
    SELECT company_id AS companyId, planet_id AS planetId, building_type AS buildingType
    FROM corporate_assets
    WHERE company_id LIKE 'sector_holding_%'
  `).all();
  const assetsByCompanyId = new Map();
  assetRows.forEach((asset) => {
    const companyAssets = assetsByCompanyId.get(asset.companyId) || [];
    companyAssets.push(asset);
    assetsByCompanyId.set(asset.companyId, companyAssets);
  });
  const insertAsset = db.prepare(`
    INSERT INTO corporate_assets (
      id, company_id, sector_id, planet_id, building_type, resource_type,
      production_per_hour, revenue_per_hour, maintenance_cost_per_hour,
      condition_index, risk_index, damage_index, blockade_index, strategic_value,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const createdAt = new Date(now).toISOString();
  const changedCompanyIds = [];
  db.transaction(() => {
    companies.forEach((company) => {
      const currentAssets = [...(assetsByCompanyId.get(company.id) || [])];
      if (currentAssets.length) {
        return;
      }
      const resources = parseResourceRefs(company);
      const primaryResource = resources[0] || 'quadraniumErz';
      const primaryBuilding = Object.entries(CORPORATE_BUILDING_CONFIG).find(([, meta]) => meta.resourceType === primaryResource)?.[0];
      const planets = getSectorPlanetsForCompany(state, company);
      const primaryPlanet = pickCorporateAssetPlanet(planets, company.id, currentAssets, true);
      if (primaryBuilding && primaryPlanet) {
        const meta = getCorporateBuildingMeta(primaryBuilding);
        insertAsset.run(
          crypto.randomUUID(),
          company.id,
          company.sectorId,
          primaryPlanet.id,
          primaryBuilding,
          meta.resourceType,
          meta.productionPerHour,
          meta.revenuePerHour,
          meta.maintenanceCostPerHour,
          1,
          0.08,
          0,
          0,
          meta.strategicValue,
          createdAt,
          createdAt
        );
        currentAssets.push({
          companyId: company.id,
          planetId: primaryPlanet.id,
          buildingType: primaryBuilding
        });
      }
      if (stableNoise(`extra-asset:${company.id}`, 0.5) + 0.5 <= 0.3) {
        const alternatives = Object.entries(CORPORATE_BUILDING_CONFIG)
          .filter(([, meta]) => resources.includes(meta.resourceType) && meta.resourceType !== primaryResource);
        const [extraType, extraMeta] = alternatives[0] || [];
        const extraPlanet = pickCorporateAssetPlanet(planets, `${company.id}:extra`, currentAssets, true) || primaryPlanet;
        if (extraType && extraPlanet) {
          insertAsset.run(
            crypto.randomUUID(),
            company.id,
            company.sectorId,
            extraPlanet.id,
            extraType,
            extraMeta.resourceType,
            extraMeta.productionPerHour,
            extraMeta.revenuePerHour,
            extraMeta.maintenanceCostPerHour,
            0.96,
            0.1,
            0,
            0,
            extraMeta.strategicValue,
            createdAt,
            createdAt
          );
          currentAssets.push({
            companyId: company.id,
            planetId: extraPlanet.id,
            buildingType: extraType
          });
        }
      }
      assetsByCompanyId.set(company.id, currentAssets);
      changedCompanyIds.push(company.id);
    });
  })();
  refreshCorporateSummaries(db, changedCompanyIds, now);
  return {
    ran: true,
    changedCompanyIds
  };
}

export function calculateCorporateBuildCost(company, buildingType, sectorState = {}) {
  const meta = getCorporateBuildingMeta(buildingType);
  if (!meta) return null;
  const base = CORPORATE_BUILDING_COSTS[meta.resourceType] || CORPORATE_BUILDING_COSTS.quadraniumErz;
  const debtPenalty = safeNumber(company?.debtIndex, 0.2, 0, 1) * 0.18;
  const confidencePenalty = (1 - clamp(safeNumber(company?.confidenceIndex, 1, 0, 1.4), 0, 1.4)) * 0.12;
  const warPenalty = safeNumber(sectorState?.warPressure, 0, 0, 2) * 0.14;
  const embargoPenalty = sectorState?.isEmbargoed ? 0.24 : 0;
  const creditRelief = Math.min(0.08, Math.max(0, safeNumber(company?.confidenceIndex, 1, 0, 1.2) - 0.9) * 0.08);
  const monopolyRelief = Math.min(0.06, safeNumber(company?.monopolyScore, 0, 0, 1) * 0.05);
  const multiplier = clamp(1 + debtPenalty + confidencePenalty + warPenalty + embargoPenalty - creditRelief - monopolyRelief, 0.82, 1.9);
  const costResources = Object.fromEntries(RESOURCE_KEYS.map((key) => [key, round2(safeNumber(base[key], 0, 0, 1e9) * multiplier)]));
  return {
    resourceType: meta.resourceType,
    buildingType,
    costResources,
    costCredits: round2(safeNumber(base.credits, 0, 0, 1e9) * multiplier)
  };
}

export function evaluateCorporateBuildOpportunities(company, sectorState, demandData = [], state = null) {
  const resources = parseResourceRefs(company);
  const demandByResource = new Map((Array.isArray(demandData) ? demandData : []).map((entry) => [entry.resourceType, entry]));
  const strategy = String(company?.corporateStrategy || 'conservative');
  const strategyBias = {
    conservative: -0.05,
    aggressive_growth: 0.08,
    monopoly_builder: 0.04,
    war_profiteer: 0.03,
    infrastructure_supplier: 0.02,
    distressed_survivor: -0.14,
    export_focused: 0.03,
    local_dominance: 0.05
  }[strategy] || 0;
  return Object.entries(CORPORATE_BUILDING_CONFIG)
    .filter(([, meta]) => resources.includes(meta.resourceType))
    .map(([buildingType, meta]) => {
      const demand = demandByResource.get(meta.resourceType) || {};
      const sectorMultiplier = safeNumber(demand.marketMultiplier, 1, 0.3, 2.4);
      const demandGap = safeNumber(demand.demandScore, 1, 0, 5) - safeNumber(demand.supplyScore, 1, 0, 5);
      const cashBuffer = Math.min(1.25, safeNumber(company.corporateCash, 0, 0, 1e9) / 9000);
      const riskPenalty = safeNumber(company.bankruptcyRisk, 0, 0, 1) * 0.5;
      const warPenalty = safeNumber(sectorState?.warPressure, 0, 0, 2) * (strategy === 'war_profiteer' ? 0.04 : 0.15);
      const embargoPenalty = sectorState?.isEmbargoed ? 0.6 : 0;
      const monopolyBoost = safeNumber(company.monopolyScore, 0, 0, 1) * (strategy === 'monopoly_builder' ? 0.18 : 0.06);
      const expansionBoost = safeNumber(company.expansionScore, 0, 0, 1) * 0.08;
      const infrastructureBoost = state && company?.sectorId
        ? average(getSectorPlanetsForCompany(state, company).map((planet) => getPlanetInfrastructureModifier(state, planet.id).productionBonus))
        : 0;
      const expectedRoi = round2(
        (sectorMultiplier - 0.94) * 0.7
        + Math.max(0, demandGap) * 0.16
        + monopolyBoost
        + expansionBoost
        + infrastructureBoost
        + strategyBias
        + cashBuffer * 0.12
        - riskPenalty
        - warPenalty
        - embargoPenalty
      );
      return {
        buildingType,
        resourceType: meta.resourceType,
        expectedRoi,
        reason: `${RESOURCE_MARKET_CONFIG[meta.resourceType]?.label || meta.resourceType}: Nachfrage ${round2(sectorMultiplier)} / Luecke ${round2(demandGap)}`
      };
    })
    .filter((entry) => entry.expectedRoi > 0)
    .sort((left, right) => right.expectedRoi - left.expectedRoi);
}

function chargeCorporateBuildCost(company, cost) {
  const resources = sanitizeResourceBag(company.corporateResourcesJson);
  const nextResources = { ...resources };
  RESOURCE_KEYS.forEach((key) => {
    nextResources[key] = round2(Math.max(0, safeNumber(resources[key], 0, 0, 1e9) - safeNumber(cost.costResources[key], 0, 0, 1e9)));
  });
  return {
    nextCash: round2(Math.max(0, safeNumber(company.corporateCash, 0, 0, 1e9) - safeNumber(cost.costCredits, 0, 0, 1e9))),
    nextResources
  };
}

function getCorporateSectorState(db, sectorId) {
  return db.prepare(`
    SELECT sector_id AS sectorId, sector_name AS sectorName, is_embargoed AS isEmbargoed,
      control_status AS controlStatus, war_pressure AS warPressure, market_sentiment AS marketSentiment
    FROM sector_economy_state
    WHERE sector_id = ?
    LIMIT 1
  `).get(sectorId);
}

function areNeighborSectors(state, leftSectorId, rightSectorId) {
  if (!state || !leftSectorId || !rightSectorId || leftSectorId === rightSectorId) return false;
  const { sectors } = getSectorMaps(state);
  const neighbors = buildNeighborMap(sectors, 5);
  return (neighbors.get(leftSectorId) || []).includes(rightSectorId)
    || (neighbors.get(rightSectorId) || []).includes(leftSectorId);
}

function getSectorTradeDistanceHops(state, leftSectorId, rightSectorId) {
  if (!state || !leftSectorId || !rightSectorId) return 5;
  if (leftSectorId === rightSectorId) return 0;
  const { sectors } = getSectorMaps(state);
  const neighbors = buildNeighborMap(sectors, 5);
  const queue = [{ id: leftSectorId, hops: 0 }];
  const visited = new Set([leftSectorId]);
  while (queue.length) {
    const current = queue.shift();
    const nextHops = current.hops + 1;
    for (const neighborId of (neighbors.get(current.id) || [])) {
      if (neighborId === rightSectorId) return nextHops;
      if (visited.has(neighborId)) continue;
      visited.add(neighborId);
      queue.push({ id: neighborId, hops: nextHops });
    }
  }
  return 5;
}

function getCorporateTradeDistanceModifier(state, sellerSectorId, buyerSectorId) {
  if (!sellerSectorId || !buyerSectorId || sellerSectorId === buyerSectorId) return 1;
  const hops = getSectorTradeDistanceHops(state, sellerSectorId, buyerSectorId);
  if (hops <= 1) return 1.06;
  if (hops === 2) return 1.14;
  if (hops === 3) return 1.24;
  if (hops === 4) return 1.36;
  return 1.52;
}

function getCorporateTradeUnitPrice(db, state, seller, buyer, resourceType, quantity, options = {}) {
  const sellerSectorId = seller?.sectorId || options.sectorId || buyer?.sectorId || '';
  const buyerSectorId = buyer?.sectorId || sellerSectorId;
  const sectorPriceRow = db.prepare(`
    SELECT current_price AS currentPrice, demand_score AS demandScore, supply_score AS supplyScore, speculation_score AS speculationScore
    FROM sector_resource_prices
    WHERE sector_id = ? AND resource_type = ?
    LIMIT 1
  `).get(buyerSectorId || sellerSectorId, resourceType);
  const sectorState = getCorporateSectorState(db, buyerSectorId || sellerSectorId) || {};
  const basePrice = round2(Math.max(1, Number(sectorPriceRow?.currentPrice || RESOURCE_MARKET_CONFIG[resourceType]?.basePrice || 1)));
  const sellerInventory = seller ? sanitizeResourceBag(seller.corporateResourcesJson) : emptyResourceBag();
  const sellerStock = safeNumber(sellerInventory[resourceType], 0, 0, 1e9);
  const demandScore = safeNumber(sectorPriceRow?.demandScore, 1, 0, 10);
  const supplyScore = safeNumber(sectorPriceRow?.supplyScore, 1, 0, 10);
  const scarcityModifier = clamp(1 + Math.max(0, demandScore - supplyScore) * 0.05, 0.92, 1.45);
  const stockModifier = seller
    ? clamp(1.14 - Math.min(0.22, sellerStock / Math.max(1, quantity * 30)), 0.82, 1.18)
    : 1.18;
  const transportModifier = getCorporateTradeDistanceModifier(state, sellerSectorId, buyerSectorId);
  const warModifier = 1 + Math.min(0.16, safeNumber(sectorState.warPressure, 0, 0, 2) * 0.08);
  const embargoModifier = Number(sectorState.isEmbargoed || 0) ? 1.25 : 1;
  const speculationModifier = 1 + Math.min(0.12, safeNumber(sectorPriceRow?.speculationScore, 0, 0, 2) * 0.04);
  const relationshipModifier = seller && buyer && sellerSectorId === buyerSectorId ? 0.97 : 1;
  return round2(basePrice * stockModifier * scarcityModifier * transportModifier * warModifier * embargoModifier * speculationModifier * relationshipModifier);
}

function applyCorporateTradeMarketImpact(db, sellerCompanyId, buyerCompanyId, totalPrice, expectedRoi = 0, createdAt = new Date().toISOString()) {
  const updateCompany = db.prepare(`
    UPDATE market_companies
    SET confidence_index = ?, bankruptcy_risk = ?, current_price = ?, previous_price = current_price, updated_at = ?
    WHERE id = ?
  `);
  const updateOne = (companyId, config = {}) => {
    if (!companyId) return;
    const company = db.prepare(`
      SELECT confidence_index AS confidenceIndex, bankruptcy_risk AS bankruptcyRisk,
        current_price AS currentPrice, base_price AS basePrice
      FROM market_companies
      WHERE id = ?
      LIMIT 1
    `).get(companyId);
    if (!company) return;
    const valueFactor = Math.min(0.012, safeNumber(totalPrice, 0, 0, 1e9) / 300000);
    const confidence = clamp(safeNumber(company.confidenceIndex, 1, 0, 1.2) + safeNumber(config.confidenceDelta, 0) + valueFactor, 0, 1.2);
    const risk = clamp(safeNumber(company.bankruptcyRisk, 0, 0, 1) + safeNumber(config.riskDelta, 0), 0, 1);
    const priceMove = clamp(safeNumber(config.priceMove, 0) + valueFactor, -0.01, 0.018);
    const nextPrice = round2(Math.max(MIN_MARKET_PRICE, safeNumber(company.currentPrice, safeNumber(company.basePrice, MIN_MARKET_PRICE), MIN_MARKET_PRICE, 1e9) * (1 + priceMove)));
    updateCompany.run(confidence, risk, nextPrice, createdAt, companyId);
    db.prepare(`
      INSERT INTO market_history (id, company_id, price, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), companyId, nextPrice, createdAt);
  };
  updateOne(sellerCompanyId, { confidenceDelta: 0.006, riskDelta: -0.008, priceMove: 0.004 });
  updateOne(buyerCompanyId, {
    confidenceDelta: expectedRoi > 0.2 ? 0.003 : -0.001,
    riskDelta: expectedRoi > 0.2 ? -0.003 : 0.001,
    priceMove: expectedRoi > 0.22 ? 0.003 : 0
  });
}

export function executeCorporateResourceTrade(db, state, input = {}) {
  const sellerCompanyId = input.sellerCompanyId ? String(input.sellerCompanyId).trim() : '';
  const buyerCompanyId = input.buyerCompanyId ? String(input.buyerCompanyId).trim() : '';
  const resourceType = String(input.resourceType || '').trim();
  const quantity = round2(safeNumber(input.quantity, 0, 0, 1e9));
  const requestedUnitPrice = safeNumber(input.unitPrice, 0, 0, 1e9);
  const buyerType = String(input.buyerType || (buyerCompanyId ? 'holding' : 'civilian_market')).trim();
  const createdAt = input.createdAt || new Date().toISOString();
  const reason = String(input.reason || 'Corporate resource trade').trim();
  const skipSummaryRefresh = Boolean(input.skipSummaryRefresh);
  if (!RESOURCE_KEYS.includes(resourceType)) throw Object.assign(new Error('Ungueltiger Ressourcentyp.'), { status: 400 });
  if (!(quantity > 0) || !(requestedUnitPrice > 0 || buyerType === 'civilian_market')) throw Object.assign(new Error('Menge und Preis muessen positiv sein.'), { status: 400 });
  const seller = sellerCompanyId ? db.prepare(`
    SELECT id, name, sector_id AS sectorId, market_status AS marketStatus, is_embargoed AS isEmbargoed,
      corporate_cash AS corporateCash, corporate_resources_json AS corporateResourcesJson
    FROM market_companies
    WHERE id = ?
    LIMIT 1
  `).get(sellerCompanyId) : null;
  const buyer = buyerCompanyId ? db.prepare(`
    SELECT id, name, sector_id AS sectorId, market_status AS marketStatus, is_embargoed AS isEmbargoed,
      corporate_cash AS corporateCash, corporate_resources_json AS corporateResourcesJson
    FROM market_companies
    WHERE id = ?
    LIMIT 1
  `).get(buyerCompanyId) : null;
  if (sellerCompanyId && !seller) throw Object.assign(new Error('Verkaeufer-Holding nicht gefunden.'), { status: 404 });
  if (buyerCompanyId && !buyer) throw Object.assign(new Error('Kaeufer-Holding nicht gefunden.'), { status: 404 });
  if (seller && normalizeMarketStatus(seller.marketStatus) !== 'tradeable') throw Object.assign(new Error('Verkaeufer ist nicht handelbar.'), { status: 409 });
  if (buyer && normalizeMarketStatus(buyer.marketStatus) === 'insolvent') throw Object.assign(new Error('Kaeufer ist insolvent.'), { status: 409 });
  const sellerSectorState = seller?.sectorId ? getCorporateSectorState(db, seller.sectorId) : null;
  const buyerSectorState = buyer?.sectorId ? getCorporateSectorState(db, buyer.sectorId) : null;
  if (Number(seller?.isEmbargoed || sellerSectorState?.isEmbargoed || 0) || Number(buyer?.isEmbargoed || buyerSectorState?.isEmbargoed || 0)) {
    throw Object.assign(new Error('Embargo blockiert diesen Ressourcenhandel.'), { status: 409 });
  }
  if (String(sellerSectorState?.controlStatus || '') === 'OPFOR' || String(buyerSectorState?.controlStatus || '') === 'OPFOR') {
    throw Object.assign(new Error('OPFOR-Sektor blockiert diesen Ressourcenhandel.'), { status: 409 });
  }
  const sellerResources = sanitizeResourceBag(seller?.corporateResourcesJson);
  if (seller && safeNumber(sellerResources[resourceType], 0, 0, 1e9) < quantity) {
    throw Object.assign(new Error('Verkaeufer hat nicht genug Lagerbestand.'), { status: 409 });
  }
  const unitPrice = !seller && buyer
    ? getCorporateTradeUnitPrice(db, state, null, buyer, resourceType, quantity, { sectorId: buyer?.sectorId })
    : round2(requestedUnitPrice);
  const totalPrice = round2(unitPrice * quantity);
  const buyerResources = sanitizeResourceBag(buyer?.corporateResourcesJson);
  if (buyer && safeNumber(buyer.corporateCash, 0, 0, 1e9) < totalPrice) {
    throw Object.assign(new Error('Kaeufer hat nicht genug Corporate Cash.'), { status: 409 });
  }
  return db.transaction(() => {
    if (seller) {
      sellerResources[resourceType] = round2(Math.max(0, safeNumber(sellerResources[resourceType], 0, 0, 1e9) - quantity));
      db.prepare(`
        UPDATE market_companies
        SET corporate_resources_json = ?, corporate_cash = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(sellerResources), round2(safeNumber(seller.corporateCash, 0, 0, 1e9) + totalPrice), createdAt, seller.id);
      if (!skipSummaryRefresh) {
        updateCompanyCorporateSummary(db, seller.id, Date.parse(createdAt) || Date.now());
      }
    }
    if (buyer) {
      buyerResources[resourceType] = round2(safeNumber(buyerResources[resourceType], 0, 0, 1e9) + quantity);
      db.prepare(`
        UPDATE market_companies
        SET corporate_resources_json = ?, corporate_cash = ?, updated_at = ?
        WHERE id = ?
      `).run(JSON.stringify(buyerResources), round2(Math.max(0, safeNumber(buyer.corporateCash, 0, 0, 1e9) - totalPrice)), createdAt, buyer.id);
      if (!skipSummaryRefresh) {
        updateCompanyCorporateSummary(db, buyer.id, Date.parse(createdAt) || Date.now());
      }
    }
    db.prepare(`
      INSERT INTO corporate_resource_trades (
        id, seller_company_id, buyer_company_id, buyer_type, sector_id, resource_type,
        quantity, unit_price, total_price, reason, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      crypto.randomUUID(),
      seller?.id || null,
      buyer?.id || null,
      buyerType,
      buyer?.sectorId || seller?.sectorId || '',
      resourceType,
      quantity,
      unitPrice,
      totalPrice,
      reason,
      createdAt
    );
    if (!seller && buyer?.sectorId) {
      const priceRow = db.prepare(`
        SELECT current_price AS currentPrice, demand_score AS demandScore, supply_score AS supplyScore, speculation_score AS speculationScore
        FROM sector_resource_prices
        WHERE sector_id = ? AND resource_type = ?
        LIMIT 1
      `).get(buyer.sectorId, resourceType);
      const speculationImpact = round2(Math.min(1.2, 0.03 + Math.sqrt(quantity) / 160));
      const priceImpact = Math.min(0.12, 0.006 + Math.sqrt(quantity) / 520);
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
        buyer.sectorId,
        resourceType,
        RESOURCE_MARKET_CONFIG[resourceType].basePrice,
        round2(unitPrice * (1 + priceImpact)),
        unitPrice,
        Number(priceRow?.demandScore || 1) + Math.min(0.35, quantity / 6000),
        Number(priceRow?.supplyScore || 1),
        speculationImpact,
        createdAt,
        Math.min(0.35, quantity / 6000),
        speculationImpact
      );
    }
    applyCorporateTradeMarketImpact(db, seller?.id || '', buyer?.id || '', totalPrice, safeNumber(input.expectedRoi, 0, -1, 1), createdAt);
    const eventType = !seller
      ? 'corporate_resource_procurement'
      : (buyer ? 'corporate_resource_trade' : 'corporate_resource_sale');
    const eventTitle = !seller
      ? 'Privater Marktbezug'
      : (buyer ? 'Holding-Ressourcenhandel' : 'Ziviler Ressourcenverkauf');
    const eventDescription = seller && buyer
      ? `${buyer.name} kauft ${round2(quantity)} ${sectorResourceLabel(resourceType)} von ${seller.name}.`
      : (seller
        ? `${seller.name} verkauft ${round2(quantity)} ${sectorResourceLabel(resourceType)} an den zivilen Markt.`
        : `${buyer?.name || 'Eine Holding'} beschafft ${round2(quantity)} ${sectorResourceLabel(resourceType)} am zivilen Markt.`);
    insertMarketEvent(db, {
      eventType,
      title: eventTitle,
      description: eventDescription,
      impact: Math.min(0.018, totalPrice / 250000),
      startedAt: createdAt
    });
    return {
      sellerCompanyId: seller?.id || null,
      buyerCompanyId: buyer?.id || null,
      buyerType,
      resourceType,
      quantity,
      unitPrice,
      totalPrice,
      createdAt
    };
  })();
}

export function sellCorporateInventoryToCivilianMarket(db, state, now = Date.now()) {
  if (!state || !canRunCadence(db, 'last_corporate_civilian_sale_tick', CORPORATE_CIVILIAN_SALE_TICK_MS, now)) {
    return { holdings: 0, trades: 0, totalValue: 0 };
  }
  const tickStartedAt = Date.now();
  const recordedAt = new Date(now).toISOString();
  const companies = db.prepare(`
    SELECT id, name, sector_id AS sectorId, resource_key AS resourceKey,
      market_status AS marketStatus, is_embargoed AS isEmbargoed,
      corporate_resources_json AS corporateResourcesJson
    FROM market_companies
    WHERE id LIKE 'sector_holding_%'
      AND COALESCE(acquired_by_company_id, '') = ''
  `).all();
  const sectorStateMap = new Map(db.prepare(`
    SELECT sector_id AS sectorId, is_embargoed AS isEmbargoed, control_status AS controlStatus
    FROM sector_economy_state
  `).all().map((row) => [String(row.sectorId || '').trim(), row]));
  const demandMap = new Map(db.prepare(`
    SELECT sector_id AS sectorId, resource_type AS resourceType,
      demand_score AS demandScore, supply_score AS supplyScore
    FROM sector_resource_demand
    WHERE resource_type IN (${RESOURCE_KEYS.map(() => '?').join(', ')})
  `).all(...RESOURCE_KEYS).map((row) => [`${row.sectorId}::${row.resourceType}`, {
    demandScore: safeNumber(row.demandScore, 1, 0, 10),
    supplyScore: safeNumber(row.supplyScore, 1, 0, 10)
  }]));
  const priceRows = getAcpPriceRows(db);
  const priceMap = new Map(priceRows.map((row) => [`${row.sectorId}::${row.resourceKey}`, {
    currentPrice: safeNumber(row.currentPrice, RESOURCE_MARKET_CONFIG[row.resourceKey]?.basePrice || 1, 1, 1e9),
    basePrice: safeNumber(row.basePrice, RESOURCE_MARKET_CONFIG[row.resourceKey]?.basePrice || 1, 1, 1e9),
    demandScore: safeNumber(row.demandScore, 1, 0, 10),
    supplyScore: safeNumber(row.supplyScore, 1, 0, 10),
    speculationScore: safeNumber(row.speculationScore, 0, 0, 2)
  }]));
  const acpMap = RESOURCE_KEYS.reduce((accumulator, resourceKey) => {
    const rows = priceRows.filter((row) => row.resourceKey === resourceKey);
    if (!rows.length) {
      accumulator[resourceKey] = {
        currentPrice: RESOURCE_MARKET_CONFIG[resourceKey]?.basePrice || 1,
        basePrice: RESOURCE_MARKET_CONFIG[resourceKey]?.basePrice || 1
      };
      return accumulator;
    }
    const currentTotal = rows.reduce((sum, row) => sum + safeNumber(row.currentPrice, 0, 0, 1e9), 0);
    const baseTotal = rows.reduce((sum, row) => sum + safeNumber(row.basePrice, 0, 0, 1e9), 0);
    accumulator[resourceKey] = {
      currentPrice: round2(currentTotal / rows.length),
      basePrice: round2(baseTotal / rows.length)
    };
    return accumulator;
  }, {});
  const upsertPrice = db.prepare(`
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
  const updateDemand = db.prepare(`
    UPDATE sector_resource_demand
    SET demand_score = ?, supply_score = ?, updated_at = ?
    WHERE sector_id = ? AND resource_type = ?
  `);
  let tradeCount = 0;
  let totalValue = 0;
  const soldCompanies = new Set();
  const candidates = [];
  companies.forEach((company) => {
    if (normalizeMarketStatus(company.marketStatus) !== 'tradeable') return;
    const sectorState = sectorStateMap.get(String(company.sectorId || '').trim()) || {};
    if (Number(company.isEmbargoed || sectorState.isEmbargoed || 0)) return;
    if (String(sectorState.controlStatus || '').trim() === 'OPFOR') return;
    const resources = sanitizeResourceBag(company.corporateResourcesJson);
    const resourceType = String(company.resourceKey || '').trim();
    if (!RESOURCE_KEYS.includes(resourceType)) return;
    const inventory = safeNumber(resources[resourceType], 0, 0, 1e9);
    if (!(inventory > 0)) return;
    const demandKey = `${company.sectorId}::${resourceType}`;
    const demandRow = demandMap.get(demandKey);
    if (!demandRow) return;
    const demandScore = safeNumber(demandRow.demandScore, 1, 0, 10);
    const supplyScore = safeNumber(demandRow.supplyScore, 1, 0, 10);
    if (!(demandScore > supplyScore)) return;
    const demandGap = Math.max(0, demandScore - supplyScore);
    const inventoryFactor = clamp(inventory / 1600, 0.2, 3.5);
    const activityScore = round2(demandGap * inventoryFactor * (1 + Math.min(0.4, demandScore / 10)));
    candidates.push({
      company,
      resourceType,
      inventory,
      demandKey,
      demandScore,
      supplyScore,
      demandGap,
      activityScore
    });
  });
  candidates.sort((left, right) => String(left.company.id).localeCompare(String(right.company.id), 'de'));
  const eligibleCount = candidates.length;
  const batchSize = Math.max(1, Math.min(CORPORATE_CIVILIAN_SALE_COMPANY_BATCH, eligibleCount));
  const cursor = eligibleCount > 0 ? (Math.floor(getRuntimeStateNumber(db, 'corporate_civilian_sale_cursor', 0)) % eligibleCount) : 0;
  const selectedCandidates = [];
  for (let index = 0; index < batchSize; index += 1) {
    selectedCandidates.push(candidates[(cursor + index) % eligibleCount]);
  }
  selectedCandidates.sort((left, right) => (
    right.activityScore - left.activityScore
    || right.demandGap - left.demandGap
    || right.inventory - left.inventory
  ));
  selectedCandidates.forEach((candidate) => {
    if (tradeCount >= CORPORATE_CIVILIAN_SALE_MAX_TRADES_PER_TICK) return;
    const { company, resourceType, inventory, demandKey } = candidate;
    const liveDemandRow = demandMap.get(demandKey);
    if (!liveDemandRow) return;
    const demandScore = safeNumber(liveDemandRow.demandScore, candidate.demandScore, 0, 10);
    const supplyScore = safeNumber(liveDemandRow.supplyScore, candidate.supplyScore, 0, 10);
    if (!(demandScore > supplyScore)) return;
    const demandGap = Math.max(0, demandScore - supplyScore);
    const sellRatio = clamp(
      CORPORATE_CIVILIAN_SALE_MIN_RATIO + demandGap * 0.0045,
      CORPORATE_CIVILIAN_SALE_MIN_RATIO,
      CORPORATE_CIVILIAN_SALE_MAX_RATIO
    );
    const inventoryCap = Math.max(1, Math.floor(inventory * sellRatio));
    const demandCap = Math.max(2, Math.min(
      CORPORATE_CIVILIAN_SALE_HARD_CAP,
      Math.floor(demandGap * 18 + demandScore * 4)
    ));
    const quantity = round2(Math.min(inventoryCap, demandCap, inventory, CORPORATE_CIVILIAN_SALE_HARD_CAP));
    if (!(quantity > 0)) return;
    const priceRow = priceMap.get(demandKey) || {};
    const acpPrice = acpMap[resourceType] || {};
    const basePrice = round2(Math.max(
      1,
      safeNumber(priceRow.basePrice, 0, 0, 1e9),
      safeNumber(acpPrice.basePrice, 0, 0, 1e9),
      safeNumber(RESOURCE_MARKET_CONFIG[resourceType]?.basePrice, 1, 1, 1e9)
    ));
    const marketPrice = round2(Math.max(
      basePrice,
      safeNumber(priceRow.currentPrice, basePrice, 1, 1e9),
      safeNumber(acpPrice.currentPrice, basePrice, 1, 1e9)
    ));
    const dynamicUnitPrice = getCorporateTradeUnitPrice(
      db,
      state,
      {
        sectorId: company.sectorId,
        corporateResourcesJson: company.corporateResourcesJson
      },
      null,
      resourceType,
      quantity,
      { sectorId: company.sectorId }
    );
    const unitPrice = round2(Math.max(basePrice, marketPrice, dynamicUnitPrice));
    const trade = executeCorporateResourceTrade(db, state, {
      sellerCompanyId: company.id,
      buyerType: 'civilian_market',
      resourceType,
      quantity,
      unitPrice,
      createdAt: recordedAt,
      reason: `Automatischer Verkauf an zivilen Markt (${sectorResourceLabel(resourceType)})`
    });
    const supplyLift = Math.min(0.09, quantity / 4200);
    const demandRelief = Math.min(0.07, quantity / 6400);
    const nextSupplyScore = round2(clamp(supplyScore + supplyLift, 0.15, 10));
    const nextDemandScore = round2(clamp(Math.max(0.15, demandScore - demandRelief), 0.15, 10));
    const nextPrice = round2(Math.max(
      basePrice,
      marketPrice * (1 - Math.min(0.012, quantity / 22000))
    ));
    const nextSpeculation = round2(clamp(
      safeNumber(priceRow.speculationScore, 0, 0, 2) - Math.min(0.04, quantity / 12000),
      0,
      2
    ));
    updateDemand.run(nextDemandScore, nextSupplyScore, recordedAt, company.sectorId, resourceType);
    upsertPrice.run(
      company.sectorId,
      resourceType,
      basePrice,
      nextPrice,
      marketPrice,
      nextDemandScore,
      nextSupplyScore,
      nextSpeculation,
      recordedAt
    );
    demandMap.set(demandKey, { demandScore: nextDemandScore, supplyScore: nextSupplyScore });
    priceMap.set(demandKey, {
      currentPrice: nextPrice,
      basePrice,
      demandScore: nextDemandScore,
      supplyScore: nextSupplyScore,
      speculationScore: nextSpeculation
    });
    tradeCount += 1;
    totalValue = round2(totalValue + safeNumber(trade.totalPrice, 0, 0, 1e9));
    soldCompanies.add(company.id);
  });
  if (eligibleCount > 0) {
    setRuntimeStateNumber(
      db,
      'corporate_civilian_sale_cursor',
      (cursor + batchSize) % Math.max(eligibleCount, 1),
      recordedAt
    );
  }
  setRuntimeStateNumber(db, 'last_corporate_civilian_sale_tick', now, recordedAt);
  const elapsedMs = Date.now() - tickStartedAt;
  if (tradeCount > 0) {
    console.log('Corporate civilian inventory sale tick', {
      eligibleHoldings: eligibleCount,
      holdings: soldCompanies.size,
      trades: tradeCount,
      totalValue,
      elapsedMs
    });
  } else {
    logTimedPhase('sellCorporateInventoryToCivilianMarket', tickStartedAt, { holdingsScanned: companies.length });
  }
  return {
    holdings: soldCompanies.size,
    trades: tradeCount,
    totalValue
  };
}

function resetLegacyLocalWarehousesInState(state) {
  let changed = false;
  const legacyWarehouseKeys = new Set(['storage_hub', ...RESOURCE_KEYS.map((resourceKey) => `storage_${resourceKey}`)]);
  state.meta = state.meta || {};
  if (Array.isArray(state.meta.planetWarehouses) && state.meta.planetWarehouses.length) {
    state.meta.planetWarehouses = [];
    changed = true;
  }
  const slotMap = state.planetResources && typeof state.planetResources === 'object' ? state.planetResources : {};
  Object.keys(slotMap).forEach((planetId) => {
    const slots = Array.isArray(slotMap[planetId]) ? [...slotMap[planetId]] : [];
    let localChanged = false;
    for (let index = 0; index < slots.length; index += 1) {
      if (!legacyWarehouseKeys.has(String(slots[index] || ''))) continue;
      slots[index] = '';
      localChanged = true;
    }
    if (localChanged) {
      state.planetResources[planetId] = slots;
      changed = true;
    }
  });
  return changed;
}

function pickHoldingWarehousePlanet(state, company, existingAssets = []) {
  const planets = getSectorPlanetsForCompany(state, company);
  const routePlanets = planets.filter((planet) => Number(planet.routeDegree || 0) >= 1);
  return pickCorporateAssetPlanet(routePlanets.length ? routePlanets : planets, `${company.id}:warehouse`, existingAssets, true);
}

function bootstrapHoldingWarehousesAndInventories(db, state, now = Date.now()) {
  const bootstrapVersion = 'holding_warehouse_inventory_seed_v1';
  if (getRuntimeStateJson(db, bootstrapVersion, null)) {
    return { ran: false, reason: 'already-seeded' };
  }
  const companies = db.prepare(`
    SELECT id, sector_id AS sectorId, sector, resource_key AS resourceKey, corporate_resources_json AS corporateResourcesJson
    FROM market_companies
    WHERE id LIKE 'sector_holding_%' AND acquired_by_company_id IS NULL
    ORDER BY id
  `).all();
  if (!companies.length) {
    setRuntimeStateJson(db, bootstrapVersion, { seededAt: new Date(now).toISOString(), companyCount: 0, stateChanged: false });
    return { ran: false, reason: 'no-companies' };
  }
  const createdAt = new Date(now).toISOString();
  const assetRows = db.prepare(`
    SELECT company_id AS companyId, planet_id AS planetId, building_type AS buildingType
    FROM corporate_assets
    WHERE company_id LIKE 'sector_holding_%'
  `).all();
  const assetsByCompanyId = new Map();
  assetRows.forEach((asset) => {
    const companyAssets = assetsByCompanyId.get(asset.companyId) || [];
    companyAssets.push(asset);
    assetsByCompanyId.set(asset.companyId, companyAssets);
  });
  const insertAsset = db.prepare(`
    INSERT INTO corporate_assets (
      id, company_id, sector_id, planet_id, building_type, resource_type,
      production_per_hour, revenue_per_hour, maintenance_cost_per_hour,
      condition_index, risk_index, damage_index, blockade_index, strategic_value,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const updateResources = db.prepare(`
    UPDATE market_companies
    SET corporate_resources_json = ?, updated_at = ?
    WHERE id = ?
  `);
  const rankedCompanies = [...companies].sort((left, right) => (
    stableNoise(`holding-stock-seed:${left.id}`, 0.5) - stableNoise(`holding-stock-seed:${right.id}`, 0.5)
  ));
  const count300 = Math.floor(rankedCompanies.length * 0.2);
  const count150 = Math.floor(rankedCompanies.length * 0.2);
  const count70 = Math.floor(rankedCompanies.length * 0.5);
  const count0 = Math.max(0, rankedCompanies.length - count300 - count150 - count70);
  const stockByCompanyId = new Map();
  rankedCompanies.forEach((company, index) => {
    let amount = 0;
    if (index < count300) amount = 300;
    else if (index < count300 + count150) amount = 150;
    else if (index < count300 + count150 + count70) amount = 70;
    else amount = 0;
    stockByCompanyId.set(company.id, amount);
  });
  const stateChanged = resetLegacyLocalWarehousesInState(state);
  const summaryRefreshIds = [];
  db.transaction(() => {
    companies.forEach((company) => {
      const currentAssets = [...(assetsByCompanyId.get(company.id) || [])];
      const hasWarehouse = currentAssets.some((asset) => asset.buildingType === 'corporate_storage_hub');
      if (!hasWarehouse) {
        const warehousePlanet = pickHoldingWarehousePlanet(state, company, currentAssets);
        if (warehousePlanet) {
          const meta = getCorporateBuildingMeta('corporate_storage_hub');
          insertAsset.run(
            crypto.randomUUID(),
            company.id,
            company.sectorId,
            warehousePlanet.id,
            'corporate_storage_hub',
            company.resourceKey || meta.resourceType,
            0,
            0,
            meta.maintenanceCostPerHour,
            1,
            0.04,
            0,
            0,
            meta.strategicValue,
            createdAt,
            createdAt
          );
          currentAssets.push({
            companyId: company.id,
            planetId: warehousePlanet.id,
            buildingType: 'corporate_storage_hub'
          });
          assetsByCompanyId.set(company.id, currentAssets);
          summaryRefreshIds.push(company.id);
        }
      }
      const seededBag = emptyResourceBag();
      const resourceKey = String(company.resourceKey || '').trim();
      if (RESOURCE_KEYS.includes(resourceKey)) {
        seededBag[resourceKey] = Number(stockByCompanyId.get(company.id) || 0);
      }
      updateResources.run(JSON.stringify(seededBag), createdAt, company.id);
    });
  })();
  refreshCorporateSummaries(db, summaryRefreshIds, now);
  setRuntimeStateJson(db, bootstrapVersion, {
    seededAt: createdAt,
    companyCount: companies.length,
    stockBuckets: { stock300: count300, stock150: count150, stock70: count70, stock0: count0 },
    stateChanged
  }, createdAt);
  return {
    ran: true,
    companyCount: companies.length,
    stockBuckets: { stock300: count300, stock150: count150, stock70: count70, stock0: count0 },
    stateChanged
  };
}

export function warmHoldingInfrastructureBootstrap(db, now = Date.now()) {
  const { state, revision } = readCampaignState(db);
  const corporateSeed = seedCorporateAssetsForHoldings(db, state, now);
  const warehouseSeed = bootstrapHoldingWarehousesAndInventories(db, state, now);
  let updatedAt = null;
  if (warehouseSeed?.stateChanged) {
    updatedAt = writeCampaignState(db, state, revision);
  }
  return {
    corporateSeed,
    warehouseSeed,
    updatedAt
  };
}

function procureResourcesForCorporateBuild(db, state, company, buildCost, options = {}) {
  const buyerCompanyId = String(company?.id || '').trim();
  if (!buyerCompanyId || !buildCost) return { ok: false, reason: 'invalid-build-context', trades: [], touchedCompanyIds: [] };
  const deadlineAt = safeNumber(options.deadlineAt, 0, 0, Number.MAX_SAFE_INTEGER);
  const currentCompany = db.prepare(`
    SELECT id, name, sector_id AS sectorId, market_status AS marketStatus, is_embargoed AS isEmbargoed,
      corporate_cash AS corporateCash, corporate_resources_json AS corporateResourcesJson
    FROM market_companies
    WHERE id = ?
    LIMIT 1
  `).get(buyerCompanyId);
  if (!currentCompany) return { ok: false, reason: 'buyer-not-found', trades: [], touchedCompanyIds: [] };
  const trades = [];
  const touchedCompanyIds = new Set([buyerCompanyId]);
  const buyerResources = sanitizeResourceBag(currentCompany.corporateResourcesJson);
  for (const resourceType of RESOURCE_KEYS) {
    if (deadlineAt && Date.now() >= deadlineAt) return { ok: false, reason: 'time-budget-exceeded', trades, touchedCompanyIds: Array.from(touchedCompanyIds) };
    const needed = round2(Math.max(0, safeNumber(buildCost.costResources?.[resourceType], 0, 0, 1e9) - safeNumber(buyerResources[resourceType], 0, 0, 1e9)));
    if (!(needed > 0)) continue;
    let remaining = needed;
    if (deadlineAt && Date.now() >= deadlineAt) return { ok: false, reason: 'time-budget-exceeded', trades, touchedCompanyIds: Array.from(touchedCompanyIds) };
    const sellers = db.prepare(`
      SELECT c.id, c.name, c.sector_id AS sectorId, c.market_status AS marketStatus, c.is_embargoed AS isEmbargoed,
        c.corporate_cash AS corporateCash, c.corporate_resources_json AS corporateResourcesJson,
        COALESCE(json_extract(c.corporate_resources_json, '$.${resourceType}'), 0) AS availableAmount
      FROM market_companies c
      LEFT JOIN sector_economy_state e ON e.sector_id = c.sector_id
      WHERE c.id LIKE 'sector_holding_%'
        AND c.id <> ?
        AND c.acquired_by_company_id IS NULL
        AND COALESCE(c.is_embargoed, 0) = 0
        AND COALESCE(e.is_embargoed, 0) = 0
        AND COALESCE(e.control_status, 'BLUFOR') <> 'OPFOR'
        AND COALESCE(json_extract(c.corporate_resources_json, '$.${resourceType}'), 0) > 0
      ORDER BY availableAmount DESC
    `).all(buyerCompanyId)
      .map((seller) => ({
        ...seller,
        _distanceModifier: getCorporateTradeDistanceModifier(state, seller.sectorId, currentCompany.sectorId),
        _unitPrice: getCorporateTradeUnitPrice(db, state, seller, currentCompany, resourceType, Math.max(1, remaining))
      }))
      .sort((left, right) => (
        left._distanceModifier - right._distanceModifier
        || left._unitPrice - right._unitPrice
        || safeNumber(right.availableAmount, 0, 0, 1e9) - safeNumber(left.availableAmount, 0, 0, 1e9)
      ))
      .slice(0, CORPORATE_BUILD_SELLER_SCAN_LIMIT);
    sellers.forEach((seller) => {
      if (!(remaining > 0)) return;
      if (deadlineAt && Date.now() >= deadlineAt) return;
      const availableAmount = safeNumber(seller.availableAmount, 0, 0, 1e9);
      if (!(availableAmount > 0)) return;
      const quantity = round2(Math.min(remaining, availableAmount));
      const unitPrice = getCorporateTradeUnitPrice(db, state, seller, currentCompany, resourceType, quantity);
      if (safeNumber(db.prepare('SELECT corporate_cash AS corporateCash FROM market_companies WHERE id = ?').get(buyerCompanyId)?.corporateCash, 0, 0, 1e9) < unitPrice * quantity) return;
      const trade = executeCorporateResourceTrade(db, state, {
        sellerCompanyId: seller.id,
        buyerCompanyId,
        buyerType: 'holding',
        resourceType,
        quantity,
        unitPrice,
        reason: options.reason || `Beschaffung fuer ${buildCost.buildingType || 'Bauprojekt'}`,
        expectedRoi: options.expectedRoi || 0,
        createdAt: options.createdAt,
        skipSummaryRefresh: true
      });
      trades.push(trade);
      touchedCompanyIds.add(seller.id);
      remaining = round2(Math.max(0, remaining - quantity));
    });
    if (remaining > 0) {
      const buyerRow = db.prepare(`
        SELECT id, name, sector_id AS sectorId, corporate_cash AS corporateCash, corporate_resources_json AS corporateResourcesJson
        FROM market_companies
        WHERE id = ?
        LIMIT 1
      `).get(buyerCompanyId);
      const unitPrice = getCorporateTradeUnitPrice(db, state, null, buyerRow, resourceType, remaining, { sectorId: buyerRow?.sectorId });
      const maxAffordable = unitPrice > 0 ? round2(Math.floor(safeNumber(buyerRow?.corporateCash, 0, 0, 1e9) / unitPrice)) : 0;
      const fallbackQuantity = round2(Math.min(remaining, maxAffordable));
      if (fallbackQuantity > 0) {
        const fallbackTrade = executeCorporateResourceTrade(db, state, {
          buyerCompanyId,
          buyerType: 'holding',
          resourceType,
          quantity: fallbackQuantity,
          unitPrice,
          reason: options.reason || `Ziviler Markt-Fallback fuer ${buildCost.buildingType || 'Bauprojekt'}`,
          expectedRoi: options.expectedRoi || 0,
          createdAt: options.createdAt,
          skipSummaryRefresh: true
        });
        trades.push(fallbackTrade);
        remaining = round2(Math.max(0, remaining - fallbackQuantity));
      }
    }
    if (remaining > 0) {
      return {
        ok: false,
        reason: `missing-${resourceType}`,
        missingResource: resourceType,
        missingQuantity: remaining,
        trades,
        touchedCompanyIds: Array.from(touchedCompanyIds)
      };
    }
  }
  return { ok: true, trades, touchedCompanyIds: Array.from(touchedCompanyIds) };
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
  const chainPressure = Number(demandData?.chainImpulse || 0) * 0.018;
  const momentumPressure = Number(demandData?.momentum || 0) * 0.022;
  const trendPressure = Number(demandData?.trend || 0) * 0.08;
  const structuralPressure = Number(demandData?.pressureScore || 0) * 0.006;
  const sentimentPressure = (MARKET_SENTIMENT_EFFECTS[demandData?.marketSentiment] || 0) * 0.08;
  const volatilityDrag = Math.max(0, Number(demandData?.volatility || 0) - 0.18) * -0.025;
  const inflationPressure = Math.min(0.08, Math.max(0, Number(options.inflationRate || 0))) * 0.04;
  const noise = stableNoise(`price:${sectorName}:${resourceType}:${Math.floor(Date.parse(recordedAt) / DEMAND_TICK_MS)}`, 0.018);
  const nextPrice = Math.max(
    25,
    round2(Number(company.currentPrice || company.basePrice || 0) * (
      1
        + demandPressure
        + multiplierPressure
        + chainPressure
        + momentumPressure
        + trendPressure
        + structuralPressure
        + sentimentPressure
        + volatilityDrag
        + inflationPressure
        + noise
    ))
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
  const totalStartedAt = Date.now();
  const latestTrade = db.prepare('SELECT MAX(created_at) AS createdAt FROM institutional_trades').get()?.createdAt;
  if (latestTrade && (now - Date.parse(latestTrade)) < INSTITUTIONAL_TICK_MS) {
    return { ran: false, reason: 'cooldown' };
  }
  const recordedAt = new Date(now).toISOString();
  const demandStartedAt = Date.now();
  const demandRows = db.prepare(`
    SELECT d.sector_id AS sectorId, d.sector_name AS sectorName, d.resource_type AS resourceType,
      d.demand_score AS demandScore, d.supply_score AS supplyScore,
      d.import_dependency AS importDependency, d.export_strength AS exportStrength,
      d.market_multiplier AS marketMultiplier, d.pressure_score AS pressureScore,
      d.momentum, d.trend, d.volatility, d.chain_impulse AS chainImpulse,
      d.chain_source_resource AS chainSourceResource,
      s.market_sentiment AS marketSentiment, s.war_pressure AS warPressure
    FROM sector_resource_demand d
    LEFT JOIN sector_economy_state s ON s.sector_id = d.sector_id
    WHERE COALESCE(s.is_embargoed, 0) = 0
      AND COALESCE(s.control_status, 'Neutral') <> 'OPFOR'
  `).all();
  logTimedPhase('runInstitutionalInvestorTick:demandRows', demandStartedAt, { rowCount: demandRows.length });
  if (!demandRows.length) return { ran: false, reason: 'no-demand' };
  const lookupStartedAt = Date.now();
  const companies = db.prepare(`
    SELECT c.id, c.name, c.sector, c.resource_key AS resourceKey,
      c.current_price AS currentPrice, c.base_price AS basePrice,
      c.bankruptcy_risk AS bankruptcyRisk, c.market_status AS marketStatus
    FROM market_companies c
    WHERE c.id LIKE 'sector_holding_%'
      AND COALESCE(c.is_embargoed, 0) = 0
      AND COALESCE(c.market_status, 'tradeable') = 'tradeable'
      AND c.acquired_by_company_id IS NULL
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
  const policy = getPolicyForEconomy(db);
  logTimedPhase('runInstitutionalInvestorTick:loadLookups', lookupStartedAt, {
    companyCount: companies.length,
    investorCount: investors.length
  });
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
  const transactionStartedAt = Date.now();
  db.transaction(() => {
    investors.forEach((investor, index) => {
      const ranked = demandRows
        .map((row) => {
          const company = companyMap.get(`${row.sectorName}::${row.resourceType}`);
          if (!company) return null;
          const predictionNoise = stableNoise(`inst-predict:${investor.id}:${row.sectorId}:${row.resourceType}:${Math.floor(now / INSTITUTIONAL_TICK_MS)}`, 0.22);
          const sentimentEffect = MARKET_SENTIMENT_EFFECTS[row.marketSentiment] || 0;
          const trendScore = Number(row.marketMultiplier || 1)
            + (Number(row.pressureScore || 0) * 0.12)
            + (Number(row.momentum || 0) * 0.18)
            + (Number(row.trend || 0) * 0.22)
            + (Number(row.chainImpulse || 0) * 0.08)
            + (Number(row.exportStrength || 0) * 0.14)
            - (Number(row.importDependency || 0) * 0.04)
            - (Number(row.volatility || 0) * 0.06)
            + sentimentEffect
            + predictionNoise * Number(investor.riskTolerance || 0.5);
          return { ...row, company, trendScore };
        })
        .filter(Boolean)
        .sort((left, right) => right.trendScore - left.trendScore);
      const pick = ranked[index % Math.max(1, ranked.length)];
      if (!pick) return;
      const priceRatio = Number(pick.company.currentPrice || 0) / Math.max(1, Number(pick.company.basePrice || 1));
      const retailDemand = Number(recentPlayerDemand.get(pick.company.id) || 0);
      const distress = Number(pick.company.bankruptcyRisk || 0);
      let strategyAction = (Number(pick.momentum || 0) > 0.18 || Number(pick.chainImpulse || 0) > 0.22 || pick.marketMultiplier > 1.12)
        ? 'front_run_policy'
        : 'sector_monopoly_building';
      if (retailDemand >= 50 && priceRatio >= 1.08) strategyAction = 'sell_into_retail_hype';
      else if (distress >= 0.72 || normalizeMarketStatus(pick.company.marketStatus) === 'insolvent') strategyAction = 'acquire_distressed_assets';
      else if (pick.marketMultiplier < 0.9 || priceRatio < 0.9 || pick.marketSentiment === 'Panik') strategyAction = 'buy_the_dip';
      else if (Number(pick.importDependency || 0) > 0.5) strategyAction = 'liquidity_trap';
      else if (Number(pick.warPressure || 0) > 0.7 && ['tibannaGas', 'baradium', 'kavamSalz'].includes(pick.resourceType)) strategyAction = 'war_profiteering';
      else if (Number(pick.exportStrength || 0) > 0.55) strategyAction = 'sector_monopoly_building';
      if (investor.strategy === 'hostile_takeover' && (distress >= 0.55 || priceRatio < 0.96)) strategyAction = 'hostile_takeover';
      if (investor.strategy === 'embargo_profiteering' && Number(pick.importDependency || 0) > 0.45) strategyAction = 'embargo_profiteering';
      const wantsToSell = strategyAction === 'sell_into_retail_hype'
        || (pick.marketSentiment === 'Euphorisch' && priceRatio > 1.22 && stableNoise(`inst-sell:${investor.id}:${pick.company.id}:${Math.floor(now / INSTITUTIONAL_TICK_MS)}`, 0.5) > 0.08);
      let quantity = Math.max(1, Math.round(
        (investor.riskTolerance * 35)
          + (Math.abs(pick.marketMultiplier - 1) * 120)
          + (Math.max(0, Number(pick.pressureScore || 0)) * 22)
          + (Math.abs(Number(pick.momentum || 0)) * 28)
          + (retailDemand / 6)
      ));
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
        { subsidy: policy?.subsidy || 'none', activeShipProjects: 1, resourceType: pick.resourceType },
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
  logTimedPhase('runInstitutionalInvestorTick:transaction', transactionStartedAt, {
    demandRows: demandRows.length,
    investors: investors.length
  });
  logTimedPhase('runInstitutionalInvestorTick:total', totalStartedAt, {
    demandRows: demandRows.length,
    investors: investors.length
  });
  return { ran: true, recordedAt };
}

export function readMarketSnapshot(db, investorId = '', userId = '') {
  const portfolio = investorId ? ensureRecentPortfolioSnapshot(db, investorId) : null;
  const companies = db.prepare(`
    SELECT id, symbol, name, faction, base_price AS basePrice,
      sector, sector_id AS sectorId, resource_key AS resourceKey, resource_refs_json AS resourceRefsJson,
      market_status AS marketStatus, bankruptcy_risk AS bankruptcyRisk,
      debt_index AS debtIndex, confidence_index AS confidenceIndex,
      risk_since AS riskSince, suspended_since AS suspendedSince, insolvent_since AS insolventSince,
      is_embargoed AS isEmbargoed, acquired_by_company_id AS acquiredByCompanyId,
      corporate_cash AS corporateCash, corporate_resources_json AS corporateResourcesJson,
      corporate_strategy AS corporateStrategy, expansion_score AS expansionScore,
      monopoly_score AS monopolyScore, corporate_build_cooldown_until AS corporateBuildCooldownUntil,
      last_corporate_build_at AS lastCorporateBuildAt, corporate_builds_48h AS corporateBuilds48h,
      private_asset_value AS privateAssetValue, private_production_json AS privateProductionJson,
      state_contract_revenue_per_hour AS stateContractRevenuePerHour,
      state_contract_output_json AS stateContractOutputJson,
      state_contract_score AS stateContractScore,
      state_backed_slot_count AS stateBackedSlotCount,
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
    corporateResources: sanitizeResourceBag(company.corporateResourcesJson),
    privateProduction: sanitizeResourceBag(company.privateProductionJson),
    stateContractOutput: sanitizeResourceBag(company.stateContractOutputJson),
    marketStatusLabel: displayMarketStatus(company.marketStatus),
    isEmbargoed: Boolean(company.isEmbargoed)
  }));
  const corporateAssetStatsByCompany = new Map(
    db.prepare(`
      SELECT company_id AS companyId, COUNT(*) AS assetCount
      FROM corporate_assets
      GROUP BY company_id
    `).all().map((row) => [row.companyId, Number(row.assetCount || 0)])
  );
  const corporateProjectStatsByCompany = new Map(
    db.prepare(`
      SELECT company_id AS companyId,
        COUNT(*) AS projectCount,
        SUM(CASE WHEN status IN ('planned', 'building') THEN 1 ELSE 0 END) AS activeProjectCount
      FROM corporate_build_projects
      GROUP BY company_id
    `).all().map((row) => [row.companyId, {
      projectCount: Number(row.projectCount || 0),
      activeProjectCount: Number(row.activeProjectCount || 0)
    }])
  );
  companies.forEach((company) => {
    const projectStats = corporateProjectStatsByCompany.get(company.id) || {};
    company.corporateAssetCount = Number(corporateAssetStatsByCompany.get(company.id) || 0);
    company.corporateProjectCount = Number(projectStats.projectCount || 0);
    company.activeCorporateProjectCount = Number(projectStats.activeProjectCount || 0);
  });
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
      market_multiplier AS marketMultiplier, pressure_score AS pressureScore,
      momentum, trend, volatility, chain_impulse AS chainImpulse,
      chain_source_resource AS chainSourceResource, updated_at AS updatedAt
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
  const institutionalInvestors = db.prepare(`
    SELECT i.id, i.name, i.strategy, i.risk_tolerance AS riskTolerance,
      i.corruption_affinity AS corruptionAffinity, i.credit_balance AS creditBalance,
      COALESCE(SUM(h.shares), 0) AS totalShares,
      ROUND(COALESCE(SUM(h.shares * c.current_price), 0), 2) AS holdingsValue,
      ROUND(i.credit_balance + COALESCE(SUM(h.shares * c.current_price), 0), 2) AS totalValue,
      i.updated_at AS updatedAt
    FROM institutional_investors i
    LEFT JOIN institutional_holdings h ON h.investor_id = i.id
    LEFT JOIN market_companies c ON c.id = h.company_id
    GROUP BY i.id
    ORDER BY totalValue DESC, i.name COLLATE NOCASE
  `).all();
  const factionAccounts = Object.fromEntries(db.prepare(`
    SELECT faction, credits, updated_at AS updatedAt
    FROM faction_accounts ORDER BY faction
  `).all().map((account) => [account.faction, account]));
  const acp = buildAcpSnapshot(getAcpPriceRows(db), buildAcpHistoryRows(db, historyCutoff), getAcpCompanyCounts(db));
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
    institutionalInvestors,
    institutionalTrades,
    acp
  };
}

function mapMarketCompanySummaryRow(company, companyStats = null) {
  const stats = companyStats || {};
  return {
    ...company,
    resourceRefs: parseResourceRefs(company),
    majorShareholders: safeJsonParse(company.majorShareholdersJson, []),
    corporateResources: sanitizeResourceBag(company.corporateResourcesJson),
    privateProduction: sanitizeResourceBag(company.privateProductionJson),
    stateContractOutput: sanitizeResourceBag(company.stateContractOutputJson),
    marketStatusLabel: displayMarketStatus(company.marketStatus),
    isEmbargoed: Boolean(company.isEmbargoed),
    corporateAssetCount: Number(stats.corporateAssetCount || company.corporateAssetCount || 0),
    corporateProjectCount: Number(stats.corporateProjectCount || company.corporateProjectCount || 0),
    activeCorporateProjectCount: Number(stats.activeCorporateProjectCount || company.activeCorporateProjectCount || 0)
  };
}

function mapMarketCompanyPreviewRow(company) {
  return {
    id: company.id,
    symbol: company.symbol,
    name: company.name,
    faction: company.faction,
    basePrice: Number(company.basePrice || 0),
    sector: company.sector,
    sectorId: company.sectorId,
    resourceKey: company.resourceKey,
    resourceRefs: parseResourceRefs(company),
    marketStatus: company.marketStatus,
    marketStatusLabel: displayMarketStatus(company.marketStatus),
    bankruptcyRisk: Number(company.bankruptcyRisk || 0),
    isEmbargoed: Boolean(company.isEmbargoed),
    currentPrice: Number(company.currentPrice || 0),
    previousPrice: Number(company.previousPrice || 0),
    totalShares: Number(company.totalShares || 0),
    freeFloatShares: Number(company.freeFloatShares || 0),
    marketCap: Number(company.marketCap || 0),
    updatedAt: company.updatedAt || null
  };
}

function readMarketCompanyStatsMap(db) {
  const assetStats = new Map(
    db.prepare(`
      SELECT company_id AS companyId, COUNT(*) AS assetCount
      FROM corporate_assets
      GROUP BY company_id
    `).all().map((row) => [row.companyId, Number(row.assetCount || 0)])
  );
  const projectStats = new Map(
    db.prepare(`
      SELECT company_id AS companyId,
        COUNT(*) AS projectCount,
        SUM(CASE WHEN status IN ('planned', 'building') THEN 1 ELSE 0 END) AS activeProjectCount
      FROM corporate_build_projects
      GROUP BY company_id
    `).all().map((row) => [row.companyId, {
      projectCount: Number(row.projectCount || 0),
      activeProjectCount: Number(row.activeProjectCount || 0)
    }])
  );
  const combined = new Map();
  [...assetStats.keys(), ...projectStats.keys()].forEach((companyId) => {
    if (combined.has(companyId)) return;
    const project = projectStats.get(companyId) || {};
    combined.set(companyId, {
      corporateAssetCount: Number(assetStats.get(companyId) || 0),
      corporateProjectCount: Number(project.projectCount || 0),
      activeCorporateProjectCount: Number(project.activeProjectCount || 0)
    });
  });
  return combined;
}

function loadMarketHistoryForCompanyIds(db, companyIds, cutoffIso) {
  const normalizedIds = [...new Set((companyIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!normalizedIds.length) return {};
  const placeholders = normalizedIds.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT company_id AS companyId, price, recorded_at AS recordedAt
    FROM market_history
    WHERE company_id IN (${placeholders}) AND recorded_at >= ?
    ORDER BY recorded_at
  `).all(...normalizedIds, cutoffIso);
  const history = {};
  rows.forEach((row) => {
    if (!history[row.companyId]) history[row.companyId] = [];
    history[row.companyId].push({ price: row.price, recordedAt: row.recordedAt });
  });
  return history;
}

function loadCompactMarketHistoryForCompanyIds(db, companyIds, cutoffIso) {
  const normalizedIds = [...new Set((companyIds || []).map((id) => String(id || '').trim()).filter(Boolean))];
  if (!normalizedIds.length) return {};
  const placeholders = normalizedIds.map(() => '?').join(', ');
  const rows = db.prepare(`
    SELECT company_id AS companyId,
      ROUND(AVG(price), 2) AS price,
      MAX(recorded_at) AS recordedAt
    FROM market_history
    WHERE company_id IN (${placeholders}) AND recorded_at >= ?
    GROUP BY company_id, strftime('%Y-%m-%dT%H', recorded_at)
    ORDER BY recordedAt
  `).all(...normalizedIds, cutoffIso);
  const history = {};
  rows.forEach((row) => {
    if (!history[row.companyId]) history[row.companyId] = [];
    history[row.companyId].push({ price: row.price, recordedAt: row.recordedAt });
  });
  return history;
}

function readMarketCompanySummaryRows(db, whereSql = '', params = []) {
  return db.prepare(`
    SELECT id, symbol, name, faction, base_price AS basePrice,
      sector, sector_id AS sectorId, resource_key AS resourceKey, resource_refs_json AS resourceRefsJson,
      market_status AS marketStatus, bankruptcy_risk AS bankruptcyRisk,
      debt_index AS debtIndex, confidence_index AS confidenceIndex,
      risk_since AS riskSince, suspended_since AS suspendedSince, insolvent_since AS insolventSince,
      is_embargoed AS isEmbargoed, acquired_by_company_id AS acquiredByCompanyId,
      corporate_cash AS corporateCash, corporate_resources_json AS corporateResourcesJson,
      corporate_strategy AS corporateStrategy, expansion_score AS expansionScore,
      monopoly_score AS monopolyScore, corporate_build_cooldown_until AS corporateBuildCooldownUntil,
      last_corporate_build_at AS lastCorporateBuildAt, corporate_builds_48h AS corporateBuilds48h,
      private_asset_value AS privateAssetValue, private_production_json AS privateProductionJson,
      state_contract_revenue_per_hour AS stateContractRevenuePerHour,
      state_contract_output_json AS stateContractOutputJson,
      state_contract_score AS stateContractScore,
      state_backed_slot_count AS stateBackedSlotCount,
      merged_name AS mergedName, current_price AS currentPrice,
      previous_price AS previousPrice, total_shares AS totalShares,
      free_float_shares AS freeFloatShares, locked_institutional_shares AS lockedInstitutionalShares,
      market_cap AS marketCap, major_shareholders_json AS majorShareholdersJson,
      controlling_shareholder AS controllingShareholder, ownership_updated_at AS ownershipUpdatedAt,
      updated_at AS updatedAt
    FROM market_companies
    ${whereSql}
  `).all(...params);
}

function readMarketCompanyPreviewRows(db, whereSql = '', params = []) {
  return db.prepare(`
    SELECT id, symbol, name, faction, base_price AS basePrice,
      sector, sector_id AS sectorId, resource_key AS resourceKey, resource_refs_json AS resourceRefsJson,
      market_status AS marketStatus, bankruptcy_risk AS bankruptcyRisk,
      is_embargoed AS isEmbargoed, current_price AS currentPrice,
      previous_price AS previousPrice, total_shares AS totalShares,
      free_float_shares AS freeFloatShares, market_cap AS marketCap,
      updated_at AS updatedAt
    FROM market_companies
    ${whereSql}
  `).all(...params);
}

function buildMarketTopLastHour(companies, hourHistoryByCompany) {
  return companies.map((company) => {
    const points = hourHistoryByCompany[company.id] || [];
    const referencePrice = Number(points[0]?.price || company.previousPrice || company.currentPrice || 0);
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
}

function buildMarketSummarySnapshot(db, now = Date.now()) {
  const historyCutoff = new Date(now - (48 * 60 * 60 * 1000)).toISOString();
  const oneHourAgoIso = new Date(now - (60 * 60 * 1000)).toISOString();
  const allCompanies = readMarketCompanyPreviewRows(db, 'ORDER BY symbol')
    .map((row) => mapMarketCompanyPreviewRow(row));
  const featuredCompanies = readMarketCompanyPreviewRows(db, 'ORDER BY current_price DESC, symbol LIMIT 50')
    .map((row) => mapMarketCompanyPreviewRow(row));
  const summaryCompanies = featuredCompanies.length ? featuredCompanies : allCompanies.slice(0, 50);
  const hourHistoryRows = db.prepare(`
    SELECT company_id AS companyId, price, recorded_at AS recordedAt
    FROM market_history
    WHERE recorded_at >= ?
    ORDER BY recorded_at ASC
  `).all(oneHourAgoIso);
  const hourHistoryByCompany = {};
  hourHistoryRows.forEach((row) => {
    if (!hourHistoryByCompany[row.companyId]) hourHistoryByCompany[row.companyId] = [];
    hourHistoryByCompany[row.companyId].push({ price: row.price, recordedAt: row.recordedAt });
  });
  const topLastHour = buildMarketTopLastHour(allCompanies, hourHistoryByCompany);
  const historyCompanyIds = [...new Set([
    ...summaryCompanies.map((company) => company.id),
    ...topLastHour.map((company) => company.id)
  ])];
  const companyHistory = loadCompactMarketHistoryForCompanyIds(db, historyCompanyIds, historyCutoff);
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
    LIMIT 10
  `).all();
  const events = db.prepare(`
    SELECT id, event_type AS eventType, title, description, impact,
      started_at AS startedAt, ends_at AS endsAt
    FROM market_events
    ORDER BY started_at DESC LIMIT 8
  `).all();
  const policy = getPolicyForEconomy(db);
  const intelligenceReports = db.prepare(`
    SELECT id, severity, sector_id AS sectorId, resource_type AS resourceType, message, created_at AS createdAt
    FROM market_intelligence_reports
    ORDER BY created_at DESC
    LIMIT 8
  `).all();
  const institutionalTrades = db.prepare(`
    SELECT t.id, i.name AS investorName, t.company_id AS companyId, t.sector_id AS sectorId,
      t.resource_type AS resourceType, t.action, t.quantity, t.price, t.reason,
      t.corruption_opportunity_score AS corruptionOpportunityScore, t.created_at AS createdAt
    FROM institutional_trades t
    LEFT JOIN institutional_investors i ON i.id = t.investor_id
    ORDER BY t.created_at DESC
    LIMIT 12
  `).all();
  const institutionalInvestors = db.prepare(`
    SELECT i.id, i.name, i.strategy, i.risk_tolerance AS riskTolerance,
      i.corruption_affinity AS corruptionAffinity, i.credit_balance AS creditBalance,
      COALESCE(SUM(h.shares), 0) AS totalShares,
      ROUND(COALESCE(SUM(h.shares * c.current_price), 0), 2) AS holdingsValue,
      ROUND(i.credit_balance + COALESCE(SUM(h.shares * c.current_price), 0), 2) AS totalValue,
      i.updated_at AS updatedAt
    FROM institutional_investors i
    LEFT JOIN institutional_holdings h ON h.investor_id = i.id
    LEFT JOIN market_companies c ON c.id = h.company_id
    GROUP BY i.id
    ORDER BY totalValue DESC, i.name COLLATE NOCASE
    LIMIT 8
  `).all();
  const factionAccounts = Object.fromEntries(db.prepare(`
    SELECT faction, credits, updated_at AS updatedAt
    FROM faction_accounts ORDER BY faction
  `).all().map((account) => [account.faction, account]));
  const acp = buildAcpSnapshot(getAcpPriceRows(db), buildAcpHistoryRows(db, historyCutoff), getAcpCompanyCounts(db));
  return {
    snapshotVersion: MARKET_SUMMARY_SNAPSHOT_VERSION,
    generatedAt: new Date(now).toISOString(),
    companies: summaryCompanies,
    history: companyHistory,
    topLastHour,
    leaderboard,
    events,
    policy,
    factionAccounts,
    intelligenceReports,
    institutionalInvestors,
    institutionalTrades,
    acp
  };
}

function readStoredMarketSummarySnapshot(db) {
  const snapshot = getRuntimeStateJson(db, 'market_summary_snapshot', null);
  if (!snapshot || typeof snapshot !== 'object') return null;
  if (Number(snapshot.snapshotVersion || 0) !== MARKET_SUMMARY_SNAPSHOT_VERSION) return null;
  return snapshot;
}

function writeMarketSummarySnapshot(db, now = Date.now()) {
  const snapshot = buildMarketSummarySnapshot(db, now);
  setRuntimeStateJson(db, 'market_summary_snapshot', snapshot, snapshot.generatedAt || new Date(now).toISOString());
  return snapshot;
}

function ensureMarketSummarySnapshot(db, now = Date.now()) {
  const stored = readStoredMarketSummarySnapshot(db);
  if (stored) return stored;
  return writeMarketSummarySnapshot(db, now);
}

export function readMarketSummary(db, investorId = '', userId = '') {
  const snapshot = ensureMarketSummarySnapshot(db, Date.now());
  const historyCutoff = new Date(Date.now() - (48 * 60 * 60 * 1000)).toISOString();
  const investor = investorId ? getOrCreateMarketInvestor(db, investorId, userId) : null;
  const holdings = investorId ? db.prepare(`
    SELECT company_id AS companyId, shares
    FROM market_holdings WHERE investor_id = ?
  `).all(investorId) : [];
  const heldIds = holdings.map((entry) => entry.companyId);
  const heldCompaniesRaw = heldIds.length
    ? readMarketCompanyPreviewRows(db, `WHERE id IN (${heldIds.map(() => '?').join(', ')})`, heldIds)
    : [];
  const combinedMap = new Map();
  (Array.isArray(snapshot.companies) ? snapshot.companies : []).forEach((company) => {
    if (!company?.id || combinedMap.has(company.id)) return;
    combinedMap.set(company.id, company);
  });
  heldCompaniesRaw.forEach((row) => {
    const company = mapMarketCompanyPreviewRow(row);
    if (!combinedMap.has(company.id)) combinedMap.set(company.id, company);
  });
  const companies = [...combinedMap.values()].sort((left, right) => String(left.symbol || '').localeCompare(String(right.symbol || ''), 'de'));
  const snapshotHistory = snapshot.history && typeof snapshot.history === 'object' ? snapshot.history : {};
  const missingHistoryIds = companies
    .map((company) => company.id)
    .filter((companyId) => !snapshotHistory[companyId]);
  const history = {
    ...snapshotHistory,
    ...(missingHistoryIds.length ? loadCompactMarketHistoryForCompanyIds(db, missingHistoryIds, historyCutoff) : {})
  };
  const portfolio = investorId ? readPortfolio(db, investorId, userId) : null;
  const purchaseOrders = investorId ? db.prepare(`
    SELECT id, company_id AS companyId, quantity, unit_price AS unitPrice,
      total_value AS totalValue, remaining_quantity AS remainingQuantity,
      realized_profit AS realizedProfit, closed_at AS closedAt, created_at AS createdAt
    FROM market_orders
    WHERE investor_id = ?
    ORDER BY created_at ASC
  `).all(investorId) : [];
  return {
    companies,
    history,
    topLastHour: Array.isArray(snapshot.topLastHour) ? snapshot.topLastHour : [],
    holdings,
    purchaseOrders,
    portfolio,
    portfolioHistory: [],
    investor,
    leaderboard: Array.isArray(snapshot.leaderboard) ? snapshot.leaderboard : [],
    events: Array.isArray(snapshot.events) ? snapshot.events : [],
    policy: snapshot.policy || getPolicyForEconomy(db),
    factionAccounts: snapshot.factionAccounts || {},
    intelligenceReports: Array.isArray(snapshot.intelligenceReports) ? snapshot.intelligenceReports : [],
    institutionalInvestors: Array.isArray(snapshot.institutionalInvestors) ? snapshot.institutionalInvestors : [],
    institutionalTrades: Array.isArray(snapshot.institutionalTrades) ? snapshot.institutionalTrades : [],
    acp: snapshot.acp || { current: [], history: {} },
    generatedAt: snapshot.generatedAt || null
  };
}

export function searchMarketCompanies(db, options = {}) {
  const query = String(options.query || '').trim().toLocaleLowerCase('de');
  const resourceFilter = String(options.resourceFilter || 'all').trim();
  const limit = clamp(Number(options.limit || 60), 1, 100);
  const historyCutoff = new Date(Date.now() - (48 * 60 * 60 * 1000)).toISOString();
  const whereParts = [];
  const params = [];
  if (resourceFilter !== 'all') {
    whereParts.push('(resource_key = ? OR resource_refs_json LIKE ?)');
    params.push(resourceFilter, `%${resourceFilter}%`);
  }
  if (query) {
    whereParts.push(`LOWER(COALESCE(sector, '') || ' ' || COALESCE(name, '') || ' ' || COALESCE(symbol, '')) LIKE ?`);
    params.push(`%${query}%`);
  }
  const whereSql = whereParts.length ? `WHERE ${whereParts.join(' AND ')}` : '';
  const rows = readMarketCompanyPreviewRows(db, `${whereSql} ORDER BY symbol COLLATE NOCASE LIMIT ${limit}`, params);
  const companies = rows.map((row) => mapMarketCompanyPreviewRow(row));
  return {
    companies,
    history: loadCompactMarketHistoryForCompanyIds(db, companies.map((company) => company.id), historyCutoff)
  };
}

export function readMarketCompanyDetail(db, companyId) {
  const normalizedCompanyId = String(companyId || '').trim();
  if (!normalizedCompanyId) {
    const error = new Error('Holding nicht gefunden.');
    error.status = 404;
    throw error;
  }
  const state = readCampaignState(db).state;
  const row = db.prepare(`
    SELECT id, symbol, name, faction, base_price AS basePrice,
      sector, sector_id AS sectorId, resource_key AS resourceKey, resource_refs_json AS resourceRefsJson,
      market_status AS marketStatus, bankruptcy_risk AS bankruptcyRisk,
      debt_index AS debtIndex, confidence_index AS confidenceIndex,
      risk_since AS riskSince, suspended_since AS suspendedSince, insolvent_since AS insolventSince,
      is_embargoed AS isEmbargoed, acquired_by_company_id AS acquiredByCompanyId,
      corporate_cash AS corporateCash, corporate_resources_json AS corporateResourcesJson,
      corporate_strategy AS corporateStrategy, expansion_score AS expansionScore,
      monopoly_score AS monopolyScore, corporate_build_cooldown_until AS corporateBuildCooldownUntil,
      last_corporate_build_at AS lastCorporateBuildAt, corporate_builds_48h AS corporateBuilds48h,
      private_asset_value AS privateAssetValue, private_production_json AS privateProductionJson,
      state_contract_revenue_per_hour AS stateContractRevenuePerHour,
      state_contract_output_json AS stateContractOutputJson,
      state_contract_score AS stateContractScore,
      state_backed_slot_count AS stateBackedSlotCount,
      merged_name AS mergedName, current_price AS currentPrice,
      previous_price AS previousPrice, total_shares AS totalShares,
      free_float_shares AS freeFloatShares, locked_institutional_shares AS lockedInstitutionalShares,
      market_cap AS marketCap, major_shareholders_json AS majorShareholdersJson,
      controlling_shareholder AS controllingShareholder, ownership_updated_at AS ownershipUpdatedAt,
      updated_at AS updatedAt
    FROM market_companies
    WHERE id = ?
    LIMIT 1
  `).get(normalizedCompanyId);
  if (!row) {
    const error = new Error('Holding nicht gefunden.');
    error.status = 404;
    throw error;
  }
  const economy = row.sectorId ? normalizeSectorEconomyRow(db, { id: row.sectorId, name: row.sector }) : null;
  const rawStatus = normalizeMarketStatus(row.marketStatus);
  const marketStatus = economy?.isEmbargoed || Number(row.isEmbargoed || 0) ? 'embargo' : rawStatus;
  const inventory = sanitizeResourceBag(row.corporateResourcesJson);
  const inventoryValue = getCompanyInventoryValue(db, row.sectorId, inventory);
  const hourCutoff = new Date(Date.now() - (60 * 60 * 1000)).toISOString();
  const dayCutoff = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
  const projectStats = db.prepare(`
    SELECT COUNT(*) AS projectCount,
      SUM(CASE WHEN status IN ('planned', 'building') THEN 1 ELSE 0 END) AS activeProjectCount
    FROM corporate_build_projects
    WHERE company_id = ?
  `).get(normalizedCompanyId) || {};
  return {
    ...row,
    name: row.mergedName || row.name,
    resourceRefs: parseResourceRefs(row),
    majorShareholders: safeJsonParse(row.majorShareholdersJson, []),
    corporateResources: inventory,
    inventoryValue,
    realizedRevenueLastHour: getTradeWindowRevenue(db, normalizedCompanyId, hourCutoff),
    realizedRevenueLast24h: getTradeWindowRevenue(db, normalizedCompanyId, dayCutoff),
    purchaseSpendLast24h: getTradeWindowPurchases(db, normalizedCompanyId, dayCutoff),
    privateProduction: sanitizeResourceBag(row.privateProductionJson),
    stateContractOutput: sanitizeResourceBag(row.stateContractOutputJson),
    marketStatus,
    marketStatusLabel: displayMarketStatus(marketStatus),
    isEmbargoed: marketStatus === 'embargo',
    corporateAssetCount: Number(db.prepare('SELECT COUNT(*) AS count FROM corporate_assets WHERE company_id = ?').get(normalizedCompanyId)?.count || 0),
    corporateProjectCount: Number(projectStats.projectCount || 0),
    activeCorporateProjectCount: Number(projectStats.activeProjectCount || 0),
    corporateAssets: readCompanyCorporateAssets(db, state, normalizedCompanyId),
    corporateProjects: readCompanyCorporateProjects(db, normalizedCompanyId, state),
    recentCorporateSales: readRecentCorporateTrades(db, normalizedCompanyId, 'sales', 10),
    recentCorporatePurchases: readRecentCorporateTrades(db, normalizedCompanyId, 'purchases', 10),
    solvencyDiagnosis: diagnoseHoldingSolvency(db, normalizedCompanyId)
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
      black_market_pressure AS blackMarketPressure, market_sentiment AS marketSentiment,
      stockpile_metals AS stockpileMetals, stockpile_fuel AS stockpileFuel,
      stockpile_supplies AS stockpileSupplies, stockpile_technology AS stockpileTechnology,
      stockpile_chemicals AS stockpileChemicals,
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
    marketSentiment: row?.marketSentiment || 'Neutral',
    consumerStrength: toMetric(row?.consumerConfidence || row?.populationIndex || 1),
    industryStrength: toMetric(row?.industrialIndex || 1),
    logisticsStrength: toMetric(row?.logisticsIndex || 1),
    warPressure: toMetric(row?.warPressure || 0),
    importDependency: toMetric(averageImport),
    exportStrength: toMetric(averageExport),
    importDependencyByResource: importDependency,
    exportStrengthByResource: exportStrength,
    stockpiles: {
      quadraniumErz: round2(Number(row?.stockpileMetals || 0)),
      tibannaGas: round2(Number(row?.stockpileFuel || 0)),
      kavamSalz: round2(Number(row?.stockpileSupplies || 0)),
      agrinium: round2(Number(row?.stockpileTechnology || 0)),
      baradium: round2(Number(row?.stockpileChemicals || 0))
    },
    blackMarketPressure: toMetric(row?.blackMarketPressure || (isEmbargoed ? 1.2 : 0.15)),
    logisticsHubCount: Number(sector.logisticsHubCount || 0),
    routePlanetCount: Number(sector.routePlanetCount || 0),
    logisticsHubBonus: round2(clamp(Number(sector.logisticsHubCount || 0) * 0.15, 0, 0.5)),
    lastUpdated: row?.lastUpdated || row?.lastDemandTick || null
  };
}

function sectorResourceLabel(resourceKey) {
  return RESOURCE_MARKET_CONFIG[resourceKey]?.label || resourceKey;
}

function getSectorResourcePrices(db, sectorId) {
  const rows = db.prepare(`
    SELECT p.sector_id AS sectorId, p.resource_type AS resourceType, p.base_price AS basePrice,
      p.current_price AS currentPrice, p.previous_price AS previousPrice,
      p.demand_score AS demandScore, p.supply_score AS supplyScore,
      p.speculation_score AS speculationScore, p.updated_at AS updatedAt,
      d.pressure_score AS pressureScore, d.momentum, d.trend, d.volatility,
      d.chain_impulse AS chainImpulse, d.chain_source_resource AS chainSourceResource
    FROM sector_resource_prices p
    LEFT JOIN sector_resource_demand d ON d.sector_id = p.sector_id AND d.resource_type = p.resource_type
    WHERE p.sector_id = ?
    ORDER BY p.resource_type
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
      pressureScore: round2(Number(row?.pressureScore || 0)),
      momentum: round2(Number(row?.momentum || 0)),
      trend: round2(Number(row?.trend || 0)),
      volatility: round2(Number(row?.volatility || 0.08)),
      chainImpulse: round2(Number(row?.chainImpulse || 0)),
      chainSourceResource: row?.chainSourceResource || '',
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

function getSectorInfrastructure(db, state, sector, economy) {
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
  const output = { civilian: [], military: [], infrastructure: [], private: [] };
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
  db.prepare(`
    SELECT a.id, c.name AS companyName, a.planet_id AS planetId, a.resource_type AS resourceType,
      a.production_per_hour AS productionPerHour, a.building_type AS buildingType,
      a.condition_index AS conditionIndex, a.damage_index AS damageIndex, a.blockade_index AS blockadeIndex
    FROM corporate_assets a
    LEFT JOIN market_companies c ON c.id = a.company_id
    WHERE a.sector_id = ?
    ORDER BY a.created_at DESC
  `).all(sector.id).forEach((asset) => {
    const planet = sector.planets.find((entry) => entry.id === asset.planetId);
    const meta = getCorporateBuildingMeta(asset.buildingType);
    output.private.push({
      id: asset.id,
      name: meta?.label || asset.buildingType,
      planetName: planet?.name || '',
      resourceType: asset.resourceType,
      resourceLabel: asset.resourceType ? sectorResourceLabel(asset.resourceType) : 'Privat',
      owner: asset.companyName || 'Holding',
      productionRatePerHour: round2(safeNumber(asset.productionPerHour, 0, 0, 1e6)),
      status: safeNumber(asset.damageIndex, 0, 0, 1) > 0.3 ? 'Beschaedigt' : (safeNumber(asset.blockadeIndex, 0, 0, 1) > 0.3 ? 'Blockiert' : 'Aktiv'),
      yieldType: 'Private Holding-Produktion',
      conditionIndex: round2(asset.conditionIndex),
      damageIndex: round2(asset.damageIndex),
      blockadeIndex: round2(asset.blockadeIndex)
    });
  });
  return output;
}

function getSectorHoldings(db, state, sectorId, economy) {
  const dayCutoff = new Date(Date.now() - (24 * 60 * 60 * 1000)).toISOString();
  const rows = db.prepare(`
    SELECT id, symbol, name, faction, sector, sector_id AS sectorId,
      resource_key AS resourceKey, resource_refs_json AS resourceRefsJson,
      base_price AS basePrice, current_price AS currentPrice, previous_price AS previousPrice,
      market_status AS marketStatus, bankruptcy_risk AS bankruptcyRisk,
      debt_index AS debtIndex, confidence_index AS confidenceIndex,
      corporate_cash AS corporateCash, corporate_strategy AS corporateStrategy,
      expansion_score AS expansionScore, monopoly_score AS monopolyScore,
      private_asset_value AS privateAssetValue, private_production_json AS privateProductionJson,
      corporate_resources_json AS corporateResourcesJson,
      state_contract_revenue_per_hour AS stateContractRevenuePerHour,
      state_contract_output_json AS stateContractOutputJson,
      state_contract_score AS stateContractScore,
      state_backed_slot_count AS stateBackedSlotCount,
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
      corporateCash: round2(company.corporateCash),
      corporateStrategy: company.corporateStrategy || 'conservative',
      expansionScore: round2(company.expansionScore),
      monopolyScore: round2(company.monopolyScore),
      privateAssetValue: round2(company.privateAssetValue),
      corporateResources: sanitizeResourceBag(company.corporateResourcesJson),
      inventoryValue: getCompanyInventoryValue(db, company.sectorId, company.corporateResourcesJson),
      privateProduction: sanitizeResourceBag(company.privateProductionJson),
      stateContractRevenuePerHour: round2(company.stateContractRevenuePerHour),
      stateContractOutput: sanitizeResourceBag(company.stateContractOutputJson),
      stateContractScore: round2(company.stateContractScore),
      stateBackedSlotCount: Number(company.stateBackedSlotCount || 0),
      totalShares: roundShares(company.totalShares),
      freeFloatShares: roundShares(company.freeFloatShares),
      lockedInstitutionalShares: roundShares(company.lockedInstitutionalShares),
      marketCap: round2(company.marketCap),
      majorShareholders: safeJsonParse(company.majorShareholdersJson, []),
      controllingShareholder: company.controllingShareholder || '',
      corporateAssets: readCompanyCorporateAssets(db, state, company.id),
      corporateProjects: readCompanyCorporateProjects(db, company.id, state),
      solvencyDiagnosis: diagnoseHoldingSolvency(db, company.id),
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
      planetCount: sector.planets.length,
      routePlanetCount: Number(sector.routePlanetCount || 0),
      logisticsHubCount: Number(sector.logisticsHubCount || 0),
      logisticsHubBonus: economy.logisticsHubBonus
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
      routePlanetCount: Number(sector.routePlanetCount || 0),
      logisticsHubCount: Number(sector.logisticsHubCount || 0),
      logisticsHubBonus: economy.logisticsHubBonus,
      mines: { civilian: [], military: [], infrastructure: [] },
      privateAssets: [],
      corporateProjects: [],
      holdings: [],
      resourcePrices: [],
      purchases: []
    };
  }
  const infrastructure = getSectorInfrastructure(db, state, sector, economy);
  return {
    id: sector.id,
    name: sector.name,
    isEconomyExcluded: false,
    economy,
    routePlanetCount: Number(sector.routePlanetCount || 0),
    logisticsHubCount: Number(sector.logisticsHubCount || 0),
    logisticsHubBonus: economy.logisticsHubBonus,
    mines: {
      civilian: infrastructure.civilian,
      military: infrastructure.military
    },
    infrastructure: infrastructure.infrastructure,
    privateAssets: infrastructure.private,
    corporateProjects: db.prepare(`
      SELECT p.id, p.company_id AS companyId, c.name AS companyName, p.planet_id AS planetId,
        p.building_type AS buildingType, p.resource_type AS resourceType, p.status,
        p.started_at AS startedAt, p.completes_at AS completesAt, p.expected_roi AS expectedRoi, p.reason
      FROM corporate_build_projects p
      LEFT JOIN market_companies c ON c.id = p.company_id
      WHERE p.sector_id = ? AND p.status IN ('planned', 'building')
      ORDER BY p.created_at DESC
    `).all(sector.id).map((project) => ({
      ...project,
      label: getCorporateBuildingMeta(project.buildingType)?.label || project.buildingType,
      planetName: sector.planets.find((entry) => entry.id === project.planetId)?.name || ''
    })),
    holdings: getSectorHoldings(db, state, sector.id, economy),
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
      s.pressure_score AS pressureScore, s.momentum, s.trend, s.volatility,
      s.chain_impulse AS chainImpulse, e.economy_state AS economyState,
      e.market_sentiment AS marketSentiment, e.war_pressure AS warPressure
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
      const sentimentPressure = company.marketSentiment === 'Panik' ? 0.16
        : company.marketSentiment === 'Negativ' ? 0.07
          : company.marketSentiment === 'Euphorisch' ? -0.05
            : company.marketSentiment === 'Positiv' ? -0.03
              : 0;
      const cyclePressure = clamp(
        Number(company.pressureScore || 0) * 0.035
          - Number(company.momentum || 0) * 0.045
          - Number(company.trend || 0) * 0.06
          + Math.max(0, Number(company.volatility || 0) - 0.22) * 0.09
          + Number(company.warPressure || 0) * 0.035
          - Math.max(0, Number(company.chainImpulse || 0)) * 0.025,
        -0.12,
        0.22
      );
      const nextRisk = clamp(
        Number(company.bankruptcyRisk || 0) * 0.78
          + pricePressure * 0.14
          + demandPressure * 0.18
          + embargoPressure
          + recessionPressure
          + sentimentPressure
          + cyclePressure,
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

function buildHoldingSolvencyDiagnosticsV2(db, company) {
  const assetSummary = db.prepare(`
    SELECT
      COALESCE(SUM(production_per_hour * condition_index * (1 - damage_index * 0.35) * (1 - blockade_index * 0.2)), 0) AS production,
      COALESCE(SUM(revenue_per_hour * condition_index * (1 - damage_index * 0.3) * (1 - blockade_index * 0.2)), 0) AS revenue,
      COALESCE(SUM(maintenance_cost_per_hour * (1 + damage_index * 0.4 + blockade_index * 0.25)), 0) AS maintenance
    FROM corporate_assets
    WHERE company_id = ?
  `).get(company.id) || {};
  const pricePressure = clamp(1 - (safeNumber(company.currentPrice, 0) / Math.max(1, safeNumber(company.basePrice, 1))), -0.4, 0.8);
  const demandPressure = clamp(1 - safeNumber(company.marketMultiplier, 1), -0.35, 0.75);
  const embargoPressure = Number(company.sectorEmbargoed || company.isEmbargoed || 0) ? 0.25 : 0;
  const recessionPressure = company.economyState === 'Rezession' ? 0.14 : company.economyState === 'Abschwung' ? 0.08 : -0.04;
  const financeRelief = Math.min(0.18, safeNumber(company.corporateCash, 0, 0, 1e9) / 50000)
    + Math.min(0.14, safeNumber(company.privateAssetValue, 0, 0, 1e9) / 90000)
    + Math.min(0.08, safeNumber(company.stateContractRevenuePerHour, 0, 0, 1e9) / 1200)
    + Math.min(0.06, safeNumber(company.stateContractScore, 0, 0, 2) * 0.12)
    + Math.min(0.1, safeNumber(assetSummary.revenue, 0, 0, 1e9) / 1600)
    - Math.min(0.12, safeNumber(assetSummary.maintenance, 0, 0, 1e9) / 900);
  const sentimentPressure = (
    company.marketSentiment === 'Panik' ? 0.16
      : company.marketSentiment === 'Negativ' ? 0.07
        : company.marketSentiment === 'Euphorisch' ? -0.05
          : company.marketSentiment === 'Positiv' ? -0.03
            : 0
  ) - Math.min(0.08, financeRelief * 0.45);
  const cyclePressure = clamp(
    safeNumber(company.pressureScore, 0) * 0.035
      - safeNumber(company.momentum, 0) * 0.045
      - safeNumber(company.trend, 0) * 0.06
      + Math.max(0, safeNumber(company.volatility, 0.08) - 0.22) * 0.09
      + safeNumber(company.warPressure, 0) * 0.035
      - Math.max(0, safeNumber(company.chainImpulse, 0)) * 0.025
      + safeNumber(company.debtIndex, 0.1, 0, 1) * 0.08
      - Math.min(0.12, financeRelief),
    -0.12,
    0.22
  );
  const computedPressure = clamp(pricePressure * 0.14 + demandPressure * 0.18 + embargoPressure + recessionPressure + sentimentPressure + cyclePressure, 0, 1);
  const nextRisk = clamp(safeNumber(company.bankruptcyRisk, 0, 0, 1) * 0.92 + computedPressure * 0.08, 0, 1);
  return {
    currentPrice: round2(company.currentPrice),
    basePrice: round2(company.basePrice),
    pricePressure: round2(pricePressure),
    marketMultiplier: round2(company.marketMultiplier),
    demandPressure: round2(demandPressure),
    recessionPressure: round2(recessionPressure),
    sentimentPressure: round2(sentimentPressure),
    cyclePressure: round2(cyclePressure),
    oldRisk: round2(company.bankruptcyRisk),
    computedPressure: round2(computedPressure),
    nextRisk: round2(nextRisk),
    debtIndex: round2(company.debtIndex),
    confidenceIndex: round2(company.confidenceIndex),
    marketStatus: normalizeMarketStatus(company.marketStatus)
  };
}

export function diagnoseHoldingSolvency(db, symbolOrId) {
  const company = db.prepare(`
    SELECT c.id, c.current_price AS currentPrice, c.base_price AS basePrice,
      c.bankruptcy_risk AS bankruptcyRisk, c.debt_index AS debtIndex, c.confidence_index AS confidenceIndex,
      c.market_status AS marketStatus, c.is_embargoed AS isEmbargoed, c.corporate_cash AS corporateCash,
      c.private_asset_value AS privateAssetValue, c.state_contract_revenue_per_hour AS stateContractRevenuePerHour,
      c.state_contract_score AS stateContractScore,
      s.market_multiplier AS marketMultiplier, e.is_embargoed AS sectorEmbargoed,
      s.pressure_score AS pressureScore, s.momentum, s.trend, s.volatility,
      s.chain_impulse AS chainImpulse, e.economy_state AS economyState,
      e.market_sentiment AS marketSentiment, e.war_pressure AS warPressure
    FROM market_companies c
    LEFT JOIN sector_resource_demand s ON s.sector_id = c.sector_id AND s.resource_type = c.resource_key
    LEFT JOIN sector_economy_state e ON e.sector_id = c.sector_id
    WHERE c.id = ? OR c.symbol = ?
    LIMIT 1
  `).get(symbolOrId, symbolOrId);
  if (!company) return null;
  return buildHoldingSolvencyDiagnosticsV2(db, company);
}

function runHoldingSolvencyTick(db, now = Date.now()) {
  if (!canRunCadence(db, 'last_solvency_tick', SOLVENCY_TICK_MS, now)) {
    return { ran: false, reason: 'cooldown' };
  }
  const totalStartedAt = Date.now();
  const recordedAt = new Date(now).toISOString();
  const loadStartedAt = Date.now();
  const rows = db.prepare(`
    SELECT c.id, c.name, c.sector, c.sector_id AS sectorId, c.resource_key AS resourceKey,
      c.resource_refs_json AS resourceRefsJson, c.current_price AS currentPrice, c.base_price AS basePrice,
      c.bankruptcy_risk AS bankruptcyRisk, c.debt_index AS debtIndex, c.confidence_index AS confidenceIndex,
      c.market_status AS marketStatus, c.is_embargoed AS isEmbargoed,
      c.risk_since AS riskSince, c.suspended_since AS suspendedSince, c.insolvent_since AS insolventSince,
      c.corporate_cash AS corporateCash, c.private_asset_value AS privateAssetValue,
      c.state_contract_revenue_per_hour AS stateContractRevenuePerHour,
      c.state_contract_score AS stateContractScore,
      s.market_multiplier AS marketMultiplier, e.is_embargoed AS sectorEmbargoed,
      s.pressure_score AS pressureScore, s.momentum, s.trend, s.volatility,
      s.chain_impulse AS chainImpulse, e.economy_state AS economyState,
      e.market_sentiment AS marketSentiment, e.war_pressure AS warPressure
    FROM market_companies c
    LEFT JOIN sector_resource_demand s ON s.sector_id = c.sector_id AND s.resource_type = c.resource_key
      LEFT JOIN sector_economy_state e ON e.sector_id = c.sector_id
    WHERE c.id LIKE 'sector_holding_%' AND c.acquired_by_company_id IS NULL
  `).all();
  logTimedPhase('runHoldingSolvencyTick:loadRows', loadStartedAt, { companyCount: rows.length });
  const updateRisk = db.prepare(`
    UPDATE market_companies
    SET bankruptcy_risk = ?, debt_index = ?, confidence_index = ?, market_status = ?, is_embargoed = ?,
      risk_since = ?, suspended_since = ?, insolvent_since = ?, updated_at = ?
    WHERE id = ?
  `);
  const transactionStartedAt = Date.now();
  try {
    db.transaction(() => {
      const decisions = rows.map((company) => {
        const diagnostics = buildHoldingSolvencyDiagnosticsV2(db, company);
        const nextRisk = safeNumber(diagnostics.nextRisk, 0, 0, 1);
        const nextDebt = clamp(safeNumber(company.debtIndex, 0.1, 0, 1) + (nextRisk > 0.62 ? 0.006 : -0.004), 0, 1);
        const nextConfidence = clamp(safeNumber(company.confidenceIndex, 1, 0, 1) + (nextRisk > 0.65 ? -0.006 : 0.004), 0, 1);
        const embargoed = Number(company.sectorEmbargoed || company.isEmbargoed || 0) ? 1 : 0;
        const previousStatus = normalizeMarketStatus(company.marketStatus);
        let riskSince = safeNumber(company.riskSince, 0, 0, Number.MAX_SAFE_INTEGER);
        let suspendedSince = safeNumber(company.suspendedSince, 0, 0, Number.MAX_SAFE_INTEGER);
        let insolventSince = safeNumber(company.insolventSince, 0, 0, Number.MAX_SAFE_INTEGER);
        if (nextRisk >= 0.8) riskSince = riskSince || now;
        if (nextRisk < 0.7) {
          riskSince = 0;
          suspendedSince = 0;
        }
        let nextStatus = previousStatus;
        let wantsInsolvent = false;
        let recovered = false;
        if (embargoed) nextStatus = 'embargo';
        else if (previousStatus === 'insolvent' || previousStatus === 'takeover') nextStatus = previousStatus;
        else if (nextRisk > 0.92) {
          insolventSince = insolventSince || now;
          suspendedSince = suspendedSince || now;
          wantsInsolvent = (now - insolventSince) >= (45 * 60 * 1000);
          nextStatus = wantsInsolvent ? 'insolvent' : 'suspended';
        } else if (nextRisk > 0.8) {
          suspendedSince = suspendedSince || now;
          nextStatus = (now - riskSince) >= (20 * 60 * 1000) ? 'suspended' : previousStatus;
        } else if (previousStatus === 'suspended' && nextRisk < 0.7) {
          nextStatus = 'tradeable';
          recovered = true;
          suspendedSince = 0;
        } else if (nextRisk < 0.7 && previousStatus !== 'embargo') nextStatus = 'tradeable';
        if (nextStatus !== 'insolvent' && nextRisk <= 0.92) insolventSince = 0;
        return { company, nextRisk, nextDebt, nextConfidence, embargoed, nextStatus, wantsInsolvent, recovered, riskSince, suspendedSince, insolventSince };
      });
      const bySector = new Map();
      decisions.forEach((decision) => {
        if (!bySector.has(decision.company.sectorId)) bySector.set(decision.company.sectorId, []);
        bySector.get(decision.company.sectorId).push(decision);
      });
      bySector.forEach((sectorDecisions, sectorId) => {
        const total = sectorDecisions.length;
        const newInsolvent = sectorDecisions.filter((decision) => decision.wantsInsolvent && normalizeMarketStatus(decision.company.marketStatus) !== 'insolvent');
        if (!total || (newInsolvent.length / total) <= 0.15) return;
        writeMarketIntegrityLog(db, {
          issueType: 'mass_insolvency_guard',
          severity: 'warning',
          before: { sectorId, proposedNewInsolvent: newInsolvent.length, total },
          after: { action: 'downgraded_to_suspended' },
          actionTaken: 'mass_insolvency_guard_applied',
          createdAt: recordedAt
        });
        insertMarketEvent(db, {
          eventType: 'mass_insolvency_guard',
          title: 'Automatische Insolvenzwelle ausgesetzt',
          description: 'Galaktische Boersenaufsicht setzt automatische Insolvenzwelle aus.',
          impact: -0.01,
          startedAt: recordedAt
        });
        newInsolvent.forEach((decision) => {
          decision.nextStatus = 'suspended';
          decision.wantsInsolvent = false;
          decision.suspendedSince = decision.suspendedSince || now;
          decision.insolventSince = 0;
        });
      });
      decisions.forEach((decision) => {
        updateRisk.run(round2(decision.nextRisk), round2(decision.nextDebt), round2(decision.nextConfidence), decision.nextStatus, decision.embargoed, decision.riskSince || null, decision.suspendedSince || null, decision.insolventSince || null, recordedAt, decision.company.id);
        if (decision.nextStatus === 'insolvent' && normalizeMarketStatus(decision.company.marketStatus) !== 'insolvent') {
          insertMarketEvent(db, {
            eventType: 'holding_bankruptcy',
            title: 'Holding-Insolvenz',
            description: `${decision.company.name} meldet nach anhaltender Schwaeche im Sektor ${decision.company.sector} Insolvenz an; Handel wird ausgesetzt.`,
            impact: -0.12,
            startedAt: recordedAt
          });
        }
        if (decision.recovered && normalizeMarketStatus(decision.company.marketStatus) === 'suspended') {
          insertMarketEvent(db, {
            eventType: 'holding_recovery',
            title: 'Handel wieder aufgenommen',
            description: `${decision.company.name}: Handel wieder aufgenommen nach Stabilisierung.`,
            impact: 0.03,
            startedAt: recordedAt
          });
        }
      });
      const takeoverBySector = new Map();
      db.prepare(`
      SELECT id, name, sector_id AS sectorId, resource_refs_json AS resourceRefsJson,
        current_price AS currentPrice, base_price AS basePrice, bankruptcy_risk AS bankruptcyRisk,
        market_status AS marketStatus, private_asset_value AS privateAssetValue, corporate_cash AS corporateCash
      FROM market_companies
      WHERE id LIKE 'sector_holding_%' AND acquired_by_company_id IS NULL
    `).all().forEach((company) => {
      if (!takeoverBySector.has(company.sectorId)) takeoverBySector.set(company.sectorId, []);
      takeoverBySector.get(company.sectorId).push(company);
    });
    takeoverBySector.forEach((sectorCompanies, sectorId) => {
      const weak = sectorCompanies.find((company) => normalizeMarketStatus(company.marketStatus) === 'insolvent' || safeNumber(company.bankruptcyRisk, 0, 0, 1) >= 0.96);
      const strong = sectorCompanies.filter((company) => company.id !== weak?.id && normalizeMarketStatus(company.marketStatus) === 'tradeable').sort((left, right) => getCompanyStrengthScore(right) - getCompanyStrengthScore(left))[0];
      if (!weak || !strong) return;
      const mergerExists = db.prepare(`SELECT 1 FROM holding_mergers WHERE acquiring_company_id = ? AND acquired_company_id = ? LIMIT 1`).get(strong.id, weak.id);
      if (mergerExists) return;
      const combinedResources = [...new Set([...parseResourceRefs(strong), ...parseResourceRefs(weak)])];
      const newName = combinedResources.length > 2 ? `${strong.name.split(' ')[0]} Industrial Holdings` : `${strong.name} & ${weak.name.replace(strong.name.split(' ')[0], '').trim()}`;
      db.prepare(`
        UPDATE market_companies
        SET name = ?, merged_name = ?, resource_refs_json = ?, market_status = 'tradeable',
          bankruptcy_risk = MAX(0, bankruptcy_risk - 0.12), confidence_index = confidence_index + 0.08,
          corporate_cash = corporate_cash + ?, private_asset_value = private_asset_value + ?, updated_at = ?
        WHERE id = ?
      `).run(newName, newName, JSON.stringify(combinedResources), safeNumber(weak.corporateCash, 0, 0, 1e9), safeNumber(weak.privateAssetValue, 0, 0, 1e9), recordedAt, strong.id);
      db.prepare(`UPDATE market_companies SET acquired_by_company_id = ?, market_status = 'takeover', updated_at = ? WHERE id = ?`).run(strong.id, recordedAt, weak.id);
      db.prepare(`UPDATE corporate_assets SET company_id = ?, updated_at = ? WHERE company_id = ?`).run(strong.id, recordedAt, weak.id);
      db.prepare(`UPDATE corporate_build_projects SET company_id = ?, updated_at = ? WHERE company_id = ? AND status IN ('planned', 'building')`).run(strong.id, recordedAt, weak.id);
      updateCompanyCorporateSummary(db, strong.id, now);
      db.prepare(`
        INSERT INTO holding_mergers (
          id, acquiring_company_id, acquired_company_id, sector_id, old_name, new_name,
          acquired_resources_json, reason, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), strong.id, weak.id, sectorId, `${strong.name} / ${weak.name}`, newName, JSON.stringify(combinedResources), 'Insolvenz / Konsolidierung', recordedAt);
      insertMarketEvent(db, {
        eventType: 'holding_merger',
        title: 'Holding-Uebernahme',
        description: `${strong.name} uebernimmt ${weak.name} nach anhaltender Rezession.`,
        impact: 0.04,
        startedAt: recordedAt
      });
    });
      setRuntimeStateNumber(db, 'last_solvency_tick', now, recordedAt);
    })();
  } catch (error) {
    if (error?.code === 'SQLITE_BUSY') {
      console.warn('runHoldingSolvencyTick skipped because the database is busy.');
      return { ran: false, reason: 'busy' };
    }
    throw error;
  }
  logTimedPhase('runHoldingSolvencyTick:transaction', transactionStartedAt, { companyCount: rows.length });
  logTimedPhase('runHoldingSolvencyTick:total', totalStartedAt, { companyCount: rows.length });
  return { ran: true, recordedAt };
}

export function purchaseMarketShare(db, investorId, companyId, now = Date.now()) {
  const createdAt = new Date(now).toISOString();
  const execute = db.transaction(() => {
    const investor = getOrCreateMarketInvestor(db, investorId);
    const lastPurchaseAt = investor.last_purchase_at ? Date.parse(investor.last_purchase_at) : 0;
    const cooldownMs = 60 * 60 * 1000;
    if (lastPurchaseAt && now - lastPurchaseAt < cooldownMs) {
      const error = new Error('Der nächste Aktienkauf ist erst nach Ablauf der 60 Minuten möglich.');
      error.status = 429;
      error.nextPurchaseAt = new Date(lastPurchaseAt + cooldownMs).toISOString();
      throw error;
    }
    const company = db.prepare('SELECT * FROM market_companies WHERE id = ? OR symbol = ?').get(companyId, companyId);
    if (!company) {
      const error = new Error('Unternehmen nicht gefunden.');
      error.status = 404;
      throw error;
    }
    if (normalizeMarketStatus(company.market_status) !== 'tradeable' || Number(company.is_embargoed || 0)) {
      const error = new Error('Diese Holding ist aktuell nicht normal handelbar.');
      error.status = 409;
      throw error;
    }
    reconcileInvestorCompanyHolding(db, investorId, company.id, { createdAt });
    const availableShares = getAvailableFreeFloatShares(db, company.id);
    if (availableShares < 1) {
      const error = new Error('Nicht genuegend frei handelbare Aktien verfuegbar.');
      error.status = 409;
      throw error;
    }
    const pricing = calculateBoundedTradePricing(db, company, 1, 'buy', { investorId, createdAt });
    assertRecentPriceWindowHealthy(db, company, pricing.nextPrice, { investorId, createdAt });
    if (Number(investor.balance || 0) < pricing.executionPrice) {
      const error = new Error('Nicht genug Credits im persoenlichen Portfolio.');
      error.status = 409;
      throw error;
    }
    db.prepare('UPDATE market_investors SET balance = balance - ?, last_purchase_at = ? WHERE id = ?')
      .run(pricing.executionPrice, createdAt, investorId);
    db.prepare(`
      INSERT INTO market_orders (
        id, investor_id, company_id, quantity, unit_price, total_value,
        remaining_quantity, realized_profit, created_at
      ) VALUES (?, ?, ?, 1, ?, ?, 1, 0, ?)
    `).run(crypto.randomUUID(), investorId, company.id, pricing.executionPrice, pricing.executionPrice, createdAt);
    setHoldingCache(db, investorId, company.id, getSellableLotQuantity(db, investorId, company.id));
    db.prepare(`
      UPDATE market_companies
      SET previous_price = current_price, current_price = ?, updated_at = ?
      WHERE id = ?
    `).run(pricing.nextPrice, createdAt, company.id);
    db.prepare(`
      INSERT INTO market_history (id, company_id, price, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), company.id, pricing.nextPrice, createdAt);
    updateOwnershipStructure(db, company.id, now);
    writePortfolioSnapshot(db, investorId, createdAt);
    return { companyId: company.id, price: pricing.executionPrice, quantity: 1, totalCost: pricing.executionPrice, purchasedAt: createdAt, nextPurchaseAt: new Date(now + cooldownMs).toISOString() };
  });
  try {
    return execute();
  } catch (error) {
    writeMarketIntegrityLog(db, {
      investorId,
      companyId,
      issueType: 'transaction_rollback',
      severity: 'warning',
      before: { action: 'legacy_buy', quantity: 1 },
      after: { error: error.message },
      actionTaken: 'buy_transaction_rolled_back',
      createdAt
    });
    throw error;
  }
}

export function purchaseMarketDemand(db, { investorId, userId, consumerKey, companyId, quantity = 1 }, now = Date.now()) {
  return db.transaction(() => {
    const company = db.prepare('SELECT * FROM market_companies WHERE id = ? OR symbol = ?').get(companyId, companyId);
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
    if (!Number.isInteger(effectiveQuantity) || effectiveQuantity < 1 || effectiveQuantity > MAX_PORTFOLIO_TRADE_QUANTITY) {
      const error = new Error('Ungültige Aktienmenge.');
      error.status = 400;
      throw error;
    }

    const pricing = calculateBoundedTradePricing(db, company, effectiveQuantity, 'buy', { investorId, createdAt: purchasedAt });
    assertRecentPriceWindowHealthy(db, company, pricing.nextPrice, { investorId, createdAt: purchasedAt });

    if (investorId) {
      const investor = getOrCreateMarketInvestor(db, investorId, userId);
      reconcileInvestorCompanyHolding(db, investorId, company.id, { createdAt: purchasedAt });
      const totalCost = round2(pricing.executionPrice * effectiveQuantity);
      const availableShares = getAvailableFreeFloatShares(db, company.id);
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
      `).run(investorId, company.id, effectiveQuantity);
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
      `).run(crypto.randomUUID(), investorId, company.id, effectiveQuantity, pricing.executionPrice, totalCost, effectiveQuantity, purchasedAt);
      setHoldingCache(db, investorId, company.id, getSellableLotQuantity(db, investorId, company.id));
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

    db.prepare(`
      UPDATE market_companies
      SET previous_price = current_price, current_price = ?, updated_at = ?
      WHERE id = ?
    `).run(pricing.nextPrice, purchasedAt, company.id);
    db.prepare(`
      INSERT INTO market_history (id, company_id, price, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), company.id, pricing.nextPrice, purchasedAt);
    updateOwnershipStructure(db, company.id, now);
    if (investorId) writePortfolioSnapshot(db, investorId, purchasedAt);

    return {
      companyId: company.id,
      price: pricing.executionPrice,
      quantity: effectiveQuantity,
      totalCost: investorId ? round2(pricing.executionPrice * effectiveQuantity) : 0,
      availableShares: investorId ? getAvailableFreeFloatShares(db, company.id) : null,
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
  const transactionStartedAt = new Date(now).toISOString();
  const execute = db.transaction(() => {
    const company = db.prepare('SELECT * FROM market_companies WHERE id = ? OR symbol = ?').get(companyId, companyId);
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
    const holding = db.prepare(`
      SELECT shares FROM market_holdings
      WHERE investor_id = ? AND company_id = ?
    `).get(investorId, company.id);
    const requestedQuantity = Math.floor(Number(quantity || 1));
    if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1 || requestedQuantity > MAX_PORTFOLIO_TRADE_QUANTITY) {
      const error = new Error('Ungültige Aktienmenge.');
      error.status = 400;
      throw error;
    }
    const soldAt = new Date(now).toISOString();
    const reconciliation = reconcileInvestorCompanyHolding(db, investorId, company.id, { createdAt: soldAt });
    if (reconciliation.sellableQuantity < requestedQuantity) {
      writeMarketIntegrityLog(db, {
        investorId,
        companyId: company.id,
        issueType: 'sell_more_than_lots',
        severity: 'warning',
        before: { requestedQuantity, cachedQuantity: holding?.shares || 0, sellableQuantity: reconciliation.sellableQuantity },
        after: { blocked: true },
        actionTaken: 'sell_blocked_insufficient_fifo_lots',
        createdAt: soldAt
      });
      const error = new Error(reconciliation.repaired
        ? 'Bestand wurde korrigiert. Nicht genug verkaufbare Aktien vorhanden.'
        : 'Nicht genug verkaufbare Aktien vorhanden.');
      error.status = 409;
      error.issueType = 'sell_more_than_lots';
      throw error;
    }

    const pricing = calculateBoundedTradePricing(db, company, requestedQuantity, 'sell', { investorId, createdAt: soldAt });
    assertRecentPriceWindowHealthy(db, company, pricing.nextPrice, { investorId, createdAt: soldAt });
    const grossProceeds = round2(pricing.executionPrice * requestedQuantity);
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
    `).all(investorId, company.id);
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
      const lotGross = round2(closedQuantity * pricing.executionPrice);
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
      writeMarketIntegrityLog(db, {
        investorId,
        companyId: company.id,
        issueType: 'sell_more_than_lots',
        severity: 'critical',
        before: { requestedQuantity, remainingToClose },
        after: { blocked: true },
        actionTaken: 'transaction_rollback_fifo_lots_exhausted',
        createdAt: soldAt
      });
      const error = new Error('Bestand wurde korrigiert. Nicht genug verkaufbare Aktien vorhanden.');
      error.status = 409;
      error.issueType = 'sell_more_than_lots';
      throw error;
    }
    const realizedProfit = round2(netProceeds - soldCostBasis);
    setHoldingCache(db, investorId, company.id, getSellableLotQuantity(db, investorId, company.id));
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
      company.id,
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

    db.prepare(`
      UPDATE market_companies
      SET previous_price = current_price, current_price = ?, updated_at = ?
      WHERE id = ?
    `).run(pricing.nextPrice, soldAt, company.id);
    db.prepare(`
      INSERT INTO market_history (id, company_id, price, recorded_at)
      VALUES (?, ?, ?, ?)
    `).run(crypto.randomUUID(), company.id, pricing.nextPrice, soldAt);
    updateOwnershipStructure(db, company.id, now);
    writePortfolioSnapshot(db, investorId, soldAt);

    return {
      companyId: company.id,
      price: pricing.executionPrice,
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
  });
  try {
    return execute();
  } catch (error) {
    writeMarketIntegrityLog(db, {
      investorId,
      companyId,
      issueType: error.issueType || 'transaction_rollback',
      severity: error.issueType === 'sell_more_than_lots' ? 'warning' : 'critical',
      before: { action: 'sell', quantity },
      after: { error: error.message },
      actionTaken: 'sell_transaction_rolled_back',
      createdAt: transactionStartedAt
    });
    throw error;
  }
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
  if (!canRunCadence(db, 'last_market_tick', DEMAND_TICK_MS, now)) {
    return false;
  }
  const tickStartedAt = Date.now();
  if (state) {
    let phaseStartedAt = Date.now();
    runCivilianDemandTick(state, { db, now });
    logTimedPhase('runMarketTick:runCivilianDemandTick', phaseStartedAt);
    phaseStartedAt = Date.now();
    runInstitutionalInvestorTick(state, { db, now, inflationRate });
    logTimedPhase('runMarketTick:runInstitutionalInvestorTick', phaseStartedAt);
    phaseStartedAt = Date.now();
    completeCorporateBuildProjects(db, state, now);
    logTimedPhase('runMarketTick:completeCorporateBuildProjects', phaseStartedAt);
    phaseStartedAt = Date.now();
    runCorporateProductionTick(db, state, now);
    logTimedPhase('runMarketTick:runCorporateProductionTick', phaseStartedAt);
    phaseStartedAt = Date.now();
    sellCorporateInventoryToCivilianMarket(db, state, now);
    logTimedPhase('runMarketTick:sellCorporateInventoryToCivilianMarket', phaseStartedAt);
    phaseStartedAt = Date.now();
    runCorporateFinanceTick(db, state, now);
    logTimedPhase('runMarketTick:runCorporateFinanceTick', phaseStartedAt);
    phaseStartedAt = Date.now();
    runCorporateBuildTick(db, state, now);
    logTimedPhase('runMarketTick:runCorporateBuildTick', phaseStartedAt);
    phaseStartedAt = Date.now();
    runHoldingSolvencyTick(db, now);
    logTimedPhase('runMarketTick:runHoldingSolvencyTick', phaseStartedAt);
  }
  const loadCompaniesStartedAt = Date.now();
  const companies = db.prepare(`
    SELECT id, base_price, current_price, is_embargoed, market_status, acquired_by_company_id,
      sector, resource_key, state_contract_score, state_contract_revenue_per_hour
    FROM market_companies
    WHERE COALESCE(is_embargoed, 0) = 0
      AND COALESCE(acquired_by_company_id, '') = ''
  `).all();
  logTimedPhase('runMarketTick:loadCompanies', loadCompaniesStartedAt, { companyCount: companies.length });
  if (!companies.length) {
    setRuntimeStateNumber(db, 'last_market_tick', now, new Date(now).toISOString());
    return false;
  }
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
    SELECT d.sector_name AS sectorName, d.resource_type AS resourceType,
      d.demand_score AS demandScore, d.supply_score AS supplyScore,
      d.market_multiplier AS marketMultiplier, d.import_dependency AS importDependency,
      d.export_strength AS exportStrength, d.pressure_score AS pressureScore,
      d.momentum, d.trend, d.volatility, d.chain_impulse AS chainImpulse,
      e.market_sentiment AS marketSentiment
    FROM sector_resource_demand d
    LEFT JOIN sector_economy_state e ON e.sector_id = d.sector_id
  `).all().map((row) => [`${row.sectorName}::${row.resourceType}`, row]));
  const priceLoopStartedAt = Date.now();
  db.transaction(() => {
    companies.forEach((company) => {
      if (
        Number(company.is_embargoed || 0)
        || ['embargo', 'suspended', 'insolvent', 'takeover'].includes(normalizeMarketStatus(company.market_status))
        || company.acquired_by_company_id
      ) {
        return;
      }
      const demandData = company.sector && company.resource_key
        ? demandMap.get(`${company.sector}::${company.resource_key}`)
        : null;
      const pullToBase = (company.base_price - company.current_price) / company.base_price * 0.04;
      const noise = (Math.random() - 0.5) * 0.04;
      const eventImpact = Number(activeEvent?.impact || 0);
      const inflationImpact = Math.min(0.08, Math.max(0, inflationRate)) * 0.25;
      const stateContractImpact = Math.min(0.05,
        (safeNumber(company.state_contract_score, 0, 0, 2) * 0.018)
        + Math.min(0.022, safeNumber(company.state_contract_revenue_per_hour, 0, 0, 1e9) / 12000)
      );
      const demandImpact = demandData
        ? ((Number(demandData.marketMultiplier || 1) - 1) * 0.14)
          + ((Number(demandData.demandScore || 1) - Number(demandData.supplyScore || 1)) * 0.015)
          + (Number(demandData.pressureScore || 0) * 0.006)
          + (Number(demandData.momentum || 0) * 0.018)
          + (Number(demandData.trend || 0) * 0.07)
          + (Number(demandData.chainImpulse || 0) * 0.012)
          + ((MARKET_SENTIMENT_EFFECTS[demandData.marketSentiment] || 0) * 0.06)
          - (Math.max(0, Number(demandData.volatility || 0) - 0.2) * 0.012)
        : 0;
      const rawMove = pullToBase + noise + eventImpact + inflationImpact + demandImpact + stateContractImpact;
      const boundedMove = clamp(rawMove, -MAX_SINGLE_TRADE_MOVE, MAX_SINGLE_TRADE_MOVE);
      const nextPrice = Math.max(25, Math.round(company.current_price * (1 + boundedMove) * 100) / 100);
      assertPriceIsFinite(db, company.id, nextPrice, { createdAt: recordedAt, currentPrice: company.current_price, rawMove, boundedMove, source: 'market_tick' });
      updateCompany.run(nextPrice, recordedAt, company.id);
      insertHistory.run(crypto.randomUUID(), company.id, nextPrice, recordedAt);
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
  logTimedPhase('runMarketTick:priceLoopTransaction', priceLoopStartedAt, { companyCount: companies.length });
  if (canRunCadence(db, 'last_portfolio_snapshot_tick', PORTFOLIO_SNAPSHOT_TICK_MS, now)) {
    const portfolioStartedAt = Date.now();
    db.prepare('SELECT id FROM market_investors WHERE portfolio_enabled = 1').all()
      .forEach((investor) => writePortfolioSnapshot(db, investor.id, recordedAt));
    setRuntimeStateNumber(db, 'last_portfolio_snapshot_tick', now, recordedAt);
    logTimedPhase('runMarketTick:portfolioSnapshots', portfolioStartedAt);
  }
  if (canRunCadence(db, 'last_acp_history_snapshot_tick', ACP_HISTORY_SNAPSHOT_TICK_MS, now)) {
    const acpHistoryStartedAt = Date.now();
    writeSectorResourcePriceHistorySnapshot(db, recordedAt);
    setRuntimeStateNumber(db, 'last_acp_history_snapshot_tick', now, recordedAt);
    logTimedPhase('runMarketTick:acpHistorySnapshot', acpHistoryStartedAt);
  }
  if (canRunCadence(db, 'last_market_summary_snapshot_tick', MARKET_SUMMARY_SNAPSHOT_TICK_MS, now)) {
    const marketSummaryStartedAt = Date.now();
    writeMarketSummarySnapshot(db, now);
    setRuntimeStateNumber(db, 'last_market_summary_snapshot_tick', now, recordedAt);
    logTimedPhase('runMarketTick:marketSummarySnapshot', marketSummaryStartedAt);
  }
  setRuntimeStateNumber(db, 'last_market_tick', now, recordedAt);
  logTimedPhase('runMarketTick:total', tickStartedAt, { companyCount: companies.length });
  return true;
}

function normalizeAcpResourceType(value) {
  const normalized = String(value || '').trim();
  const lookup = {
    METALLE: 'quadraniumErz',
    TECHNOLOGIEN: 'agrinium',
    TREIBSTOFFE: 'tibannaGas',
    CHEMIKALIEN: 'baradium',
    VERSORGUNGSGUETER: 'kavamSalz',
    quadraniumErz: 'quadraniumErz',
    agrinium: 'agrinium',
    tibannaGas: 'tibannaGas',
    baradium: 'baradium',
    kavamSalz: 'kavamSalz'
  };
  return lookup[normalized] || lookup[normalized.toUpperCase()] || '';
}

function getAcpRankingMarketStatus(row) {
  if (Number(row.isEmbargoed || 0)) return 'Embargo';
  if (String(row.controlStatus || '').trim().toUpperCase() === 'OPFOR') return 'OPFOR blockiert';
  const priceFactor = Number(row.currentPrice || 0) / Math.max(1, Number(row.basePrice || 1));
  const surplusRatio = Number(row.surplusRatio || 1);
  if (surplusRatio < 0.6) return 'Krise';
  if (surplusRatio < 0.9) return 'Knappheit';
  if (priceFactor >= 1.45) return 'Überhitzt';
  if (priceFactor >= 1.15) return 'Boom';
  return 'Normal';
}

function getAcpBalanceLabel(surplusRatio) {
  if (surplusRatio > 1.5) return 'Starker Überschuss';
  if (surplusRatio > 1.1) return 'Überschuss';
  if (surplusRatio >= 0.9) return 'Ausgeglichen';
  if (surplusRatio >= 0.6) return 'Knappheit';
  return 'Krise';
}

export function readAcpSectorRanking(db, options = {}) {
  const resourceKey = normalizeAcpResourceType(options.resourceType || 'METALLE') || 'quadraniumErz';
  const sort = String(options.sort || 'cheap').trim();
  const rows = db.prepare(`
    SELECT p.sector_id AS sectorId,
      COALESCE(e.sector_name, p.sector_id) AS sectorName,
      COALESCE(e.control_status, 'Neutral') AS controlStatus,
      COALESCE(e.is_embargoed, 0) AS isEmbargoed,
      p.resource_type AS resourceType,
      p.current_price AS currentPrice,
      p.base_price AS basePrice,
      p.previous_price AS previousPrice,
      p.demand_score AS demandScore,
      p.supply_score AS supplyScore,
      COALESCE(d.import_dependency, 0) AS importDependency,
      COALESCE(d.export_strength, 0) AS exportStrength,
      COALESCE(p.speculation_score, 0) AS speculationScore,
      p.updated_at AS updatedAt
    FROM sector_resource_prices p
    LEFT JOIN sector_economy_state e ON e.sector_id = p.sector_id
    LEFT JOIN sector_resource_demand d ON d.sector_id = p.sector_id AND d.resource_type = p.resource_type
    WHERE p.resource_type = ?
    ORDER BY p.current_price ASC, sectorName COLLATE NOCASE
  `).all(resourceKey).map((row) => {
    const currentPrice = round2(Number(row.currentPrice || 0));
    const basePrice = round2(Math.max(1, Number(row.basePrice || RESOURCE_MARKET_CONFIG[resourceKey]?.basePrice || 1)));
    const previousPrice = round2(Number(row.previousPrice || basePrice));
    const demandScore = round2(Math.max(0, Number(row.demandScore || 0)));
    const supplyScore = round2(Math.max(0, Number(row.supplyScore || 0)));
    const change = round2(currentPrice - previousPrice);
    const changePercent = previousPrice > 0 ? round2((change / previousPrice) * 100) : 0;
    const surplusRatio = round2(supplyScore / Math.max(demandScore, 1));
    const mapped = {
      sectorId: row.sectorId,
      sectorName: row.sectorName,
      controlStatus: row.controlStatus,
      isEmbargoed: Boolean(row.isEmbargoed),
      currentPrice,
      basePrice,
      previousPrice,
      change,
      changePercent,
      demandScore,
      supplyScore,
      surplusRatio,
      importDependency: round2(Number(row.importDependency || 0)),
      exportStrength: round2(Number(row.exportStrength || 0)),
      speculationScore: round2(Number(row.speculationScore || 0)),
      balanceLabel: getAcpBalanceLabel(surplusRatio),
      marketStatusLabel: '',
      updatedAt: row.updatedAt || null
    };
    mapped.marketStatusLabel = getAcpRankingMarketStatus(mapped);
    return mapped;
  });
  const comparators = {
    cheap: (left, right) => left.currentPrice - right.currentPrice || left.sectorName.localeCompare(right.sectorName, 'de'),
    expensive: (left, right) => right.currentPrice - left.currentPrice || left.sectorName.localeCompare(right.sectorName, 'de'),
    scarcity: (left, right) => left.surplusRatio - right.surplusRatio || right.currentPrice - left.currentPrice,
    surplus: (left, right) => right.surplusRatio - left.surplusRatio || left.currentPrice - right.currentPrice,
    change_up: (left, right) => right.changePercent - left.changePercent || right.currentPrice - left.currentPrice,
    change_down: (left, right) => left.changePercent - right.changePercent || left.currentPrice - right.currentPrice
  };
  const ordered = [...rows].sort(comparators[sort] || comparators.cheap).map((row, index) => ({
    rank: index + 1,
    ...row
  }));
  return {
    resourceType: resourceKey,
    resourceLabel: RESOURCE_MARKET_CONFIG[resourceKey]?.label || resourceKey,
    sort: comparators[sort] ? sort : 'cheap',
    updatedAt: ordered[0]?.updatedAt || null,
    sectors: ordered
  };
}
