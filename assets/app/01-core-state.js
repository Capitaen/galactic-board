// Generated from app-shell.js: core constants, DOM refs, runtime state

const WORLD_SIZE = 2048;
const ASSET_VERSION_TAG = '20260618c';
const MIN_ZOOM = 0.3;
const MAX_ZOOM = 3.3;
const CLUSTER_MAX_ZOOM = 10.5;
const CLUSTER_ZOOM_ENTRY_THRESHOLD = 3.15;
const CLUSTER_ACTIVATION_RADIUS = 92;
const CLUSTER_PLANET_RADIUS = 118;
const CLUSTER_MIN_PLANETS = 8;
const CLUSTER_RELEASE_ZOOM = 3.15;
const LABEL_ZOOM_THRESHOLD = 0.9;
const STARTUP_LAYERS = {
  planets: true,
  planetLabels: false,
  hyperlanes: false,
  conflictPulse: true,
  garFleets: true,
  kusFleets: true,
  grid: true,
  sectorLabels: true,
  legend: true
};
const GALACTIC_CORE_CENTER = { x: WORLD_SIZE / 2, y: WORLD_SIZE / 2 };
const SECTOR_SNAP_RADII = [0.06, 0.08, 0.1, 0.12, 0.14, 0.17, 0.2, 0.24, 0.28, 0.32, 0.37, 0.42, 0.48, 0.55, 0.63, 0.72, 0.82].map((factor) => WORLD_SIZE * factor * 0.5);
const SECTOR_ANGLE_STEP_DEG = 10;
const AUTO_PLACEMENT_VERSION = 3;
const POSITION_CALIBRATION_VERSION = 3;
const ARCGIS_IMPORT_VERSION = 1;
const CAMPAIGN_PRIORITY_PLANET_KEYS = new Set([
  'coruscant',
  'kuat',
  'anaxes',
  'balmorra',
  'rothana',
  'serenno',
  'kamino',
  'raxus',
  'raxus_secundus',
  'geonosis',
  'muunilinst'
]);
const FLEET_HYPERSPACE_START_DELAY_MS = 4000;
const FLEET_HYPERSPACE_FINISH_LEAD_MS = 1000;
const FLEET_TRAVEL_REFERENCE_DURATION_MS = 5 * 60 * 1000;
const FLEET_TRAVEL_REFERENCE_DISTANCE = WORLD_SIZE;
const IMAGE_MODE_ARCGIS_OFFSET = { x: 70, y: 77 };
const IMAGE_MODE_ARCGIS_WARP_PIVOT = { x: 968, y: 1881 };
const IMAGE_MODE_ARCGIS_WARP = {
  xx: 0.96409,
  xy: -0.00145,
  yx: 0.01115,
  yy: 0.96761
};
const IMAGE_MODE_ARCGIS_FINE_AFFINE = {
  xx: 1.04970243713097,
  xy: 0.00306183204022522,
  yx: -0.0201776215986828,
  yy: 1.07408403531713,
  tx: -49.1006293701747,
  ty: -113.911063908293
};
const POSITION_CALIBRATION_ANCHORS = [
  { id: 'lwhekk', old: { x: 245, y: 1419 }, next: { x: 357, y: 1466 } },
  { id: 'zakuul', old: { x: 325, y: 1193 }, next: { x: 414, y: 1226 } },
  { id: 'rakata_prime', old: { x: 578, y: 1006 }, next: { x: 647, y: 1096 } },
  { id: 'jedha', old: { x: 663, y: 942 }, next: { x: 749, y: 950 } }
];
const SCHEMATIC_POSITION_RECOVERY_ZONES = [
  {
    center: { x: 1188, y: 1042 },
    shift: { x: -169, y: -89 },
    radius: 180
  }
];
const RESOURCE_DEFS = [
  { key: 'quadraniumErz', label: 'METALLE' },
  { key: 'agrinium', label: 'TECHNOLOGIEN' },
  { key: 'tibannaGas', label: 'TREIBSTOFFE' },
  { key: 'baradium', label: 'CHEMIKALIEN' },
  { key: 'kavamSalz', label: 'VERSORGUNGSGÜTER' },
  { key: 'credits', label: 'CREDITS' }
];
const RESOURCE_KEYS = RESOURCE_DEFS.map((entry) => entry.key);
const RESOURCE_LABELS = Object.fromEntries(RESOURCE_DEFS.map((entry) => [entry.key, entry.label]));
const RESOURCE_PRODUCTION_TICK_MS = 60 * 60 * 1000;
const RESOURCE_RESET_VERSION = 'resource_reset_2026_05_01';
const CAPTURE_REWARD_PER_SLOT = 20;
const MINE_BUILD_DURATION_HOURS = 30;
const MAX_CIVILIAN_PRODUCTION_BONUS = 0.30;
const SECTOR_DOMINANCE_THRESHOLD = 0.5;
const WAREHOUSE_BASE_CAPACITY = 10000;
const WAREHOUSE_LEVEL_STEP_CAPACITY = 5000;
const WAREHOUSE_MAX_LEVEL = 10;
const CENTRAL_WAREHOUSE_ID = 'central_coruscant';
const CENTRAL_WAREHOUSE_LABEL = 'Grosslager Coruscant';
const LOCAL_WAREHOUSE_BUILDING_KEY = 'storage_hub';
const CIVILIAN_CREDIT_YIELDS = {
  civilian_quadraniumErz: { resource: 'quadraniumErz', credits: 220 },
  civilian_agrinium: { resource: 'agrinium', credits: 320 },
  civilian_tibannaGas: { resource: 'tibannaGas', credits: 260 },
  civilian_baradium: { resource: 'baradium', credits: 240 },
  civilian_kavamSalz: { resource: 'kavamSalz', credits: 180 }
};
const DEFAULT_SHIPYARD_PLANET_KEYS = ['anaxes', 'kuat', 'rothana'];
const KUS_SHIPYARD_PLANET_KEYS = ['geonosis', 'muunilinst', 'serenno', 'raxus'];
const RESOURCE_FACTIONS = ['GAR', 'KUS'];
const MARKER_COLORS = ['#ffd54d', '#4ecdc4', '#ff6b6b', '#6ea8ff', '#c084fc', '#7ee081'];
const STATION_CLASS_IDS = new Set(['golan_1', 'haven_medistation', 'cardan_station', 'galactic_orbital_station', 'nis_black_site']);
const GAR_SHIP_COST_MULTIPLIER = 70;
const DEBUG_DISABLE_GAR_BUILD_LIMITS = false;
const MINE_PROJECT_DEFS = {
  quadraniumErz: {
    label: 'Metallmine',
    category: 'military',
    productionResource: 'quadraniumErz',
    cost: { quadraniumErz: 980, agrinium: 280, tibannaGas: 140, baradium: 210, kavamSalz: 280 }
  },
  agrinium: {
    label: 'Technologie-Komplex',
    category: 'military',
    productionResource: 'agrinium',
    cost: { quadraniumErz: 420, agrinium: 980, tibannaGas: 280, baradium: 140, kavamSalz: 280 }
  },
  tibannaGas: {
    label: 'Tibanna-Gas-Raffinerie',
    category: 'military',
    productionResource: 'tibannaGas',
    cost: { quadraniumErz: 350, agrinium: 280, tibannaGas: 980, baradium: 210, kavamSalz: 210 }
  },
  baradium: {
    label: 'Chemiewerk / Baradium-Foerderung',
    category: 'military',
    productionResource: 'baradium',
    cost: { quadraniumErz: 420, agrinium: 210, tibannaGas: 210, baradium: 980, kavamSalz: 210 }
  },
  kavamSalz: {
    label: 'Versorgungsgueter-Depot',
    category: 'military',
    productionResource: 'kavamSalz',
    cost: { quadraniumErz: 350, agrinium: 210, tibannaGas: 210, baradium: 140, kavamSalz: 980 }
  },
  civilian_quadraniumErz: {
    label: 'Metallmine',
    category: 'civilian',
    productionResource: 'quadraniumErz',
    cost: { quadraniumErz: 980, agrinium: 280, tibannaGas: 140, baradium: 210, kavamSalz: 280 }
  },
  civilian_agrinium: {
    label: 'Technologie-Komplex',
    category: 'civilian',
    productionResource: 'agrinium',
    cost: { quadraniumErz: 420, agrinium: 980, tibannaGas: 280, baradium: 140, kavamSalz: 280 }
  },
  civilian_tibannaGas: {
    label: 'Tibanna-Gas-Raffinerie',
    category: 'civilian',
    productionResource: 'tibannaGas',
    cost: { quadraniumErz: 350, agrinium: 280, tibannaGas: 980, baradium: 210, kavamSalz: 210 }
  },
  civilian_baradium: {
    label: 'Chemiewerk / Baradium-Foerderung',
    category: 'civilian',
    productionResource: 'baradium',
    cost: { quadraniumErz: 420, agrinium: 210, tibannaGas: 210, baradium: 980, kavamSalz: 210 }
  },
  civilian_kavamSalz: {
    label: 'Versorgungsgueter-Depot',
    category: 'civilian',
    productionResource: 'kavamSalz',
    cost: { quadraniumErz: 350, agrinium: 210, tibannaGas: 210, baradium: 140, kavamSalz: 980 }
  },
  civil_trade_center: {
    label: 'Handelszentrum',
    category: 'development',
    description: '+3 % Produktion auf alle Rohstoffe dieses Planeten',
    bonuses: { quadraniumErz: 0.03, agrinium: 0.03, tibannaGas: 0.03, baradium: 0.03, kavamSalz: 0.03 },
    cost: { quadraniumErz: 560, agrinium: 420, tibannaGas: 280, baradium: 210, kavamSalz: 490 }
  },
  civil_industrial_complex: {
    label: 'Industriekomplex',
    category: 'development',
    description: '+6 % Metalle und +4 % Chemikalien',
    bonuses: { quadraniumErz: 0.06, baradium: 0.04 },
    cost: { quadraniumErz: 840, agrinium: 350, tibannaGas: 350, baradium: 490, kavamSalz: 420 }
  },
  civil_logistics_center: {
    label: 'Logistikzentrum',
    category: 'development',
    description: '+6 % Treibstoffe und +3 % auf alle anderen Rohstoffe',
    bonuses: { quadraniumErz: 0.03, agrinium: 0.03, tibannaGas: 0.06, baradium: 0.03, kavamSalz: 0.03 },
    cost: { quadraniumErz: 630, agrinium: 420, tibannaGas: 700, baradium: 280, kavamSalz: 560 }
  },
  civil_research_academy: {
    label: 'Forschungsakademie',
    category: 'development',
    description: '+8 % Technologien',
    bonuses: { agrinium: 0.08 },
    cost: { quadraniumErz: 490, agrinium: 840, tibannaGas: 350, baradium: 350, kavamSalz: 420 }
  },
  civil_orbital_trade_station: {
    label: 'Orbitale Handelsstation',
    category: 'development',
    description: '+10 % Produktion auf alle Rohstoffe dieses Planeten',
    bonuses: { quadraniumErz: 0.10, agrinium: 0.10, tibannaGas: 0.10, baradium: 0.10, kavamSalz: 0.10 },
    cost: { quadraniumErz: 1400, agrinium: 1120, tibannaGas: 980, baradium: 840, kavamSalz: 1120 }
  }
};
const STORAGE_RESOURCE_KEYS = ['quadraniumErz', 'agrinium', 'tibannaGas', 'baradium', 'kavamSalz'];
const LEGACY_STORAGE_BUILDING_ALIAS_MAP = Object.fromEntries(
  STORAGE_RESOURCE_KEYS.map((resourceKey) => [`storage_${resourceKey}`, LOCAL_WAREHOUSE_BUILDING_KEY])
);
const STORAGE_BUILDING_DEFS = {
  [LOCAL_WAREHOUSE_BUILDING_KEY]: {
    label: 'Universallager',
    category: 'storage',
    cost: {
      quadraniumErz: 320,
      agrinium: 180,
      tibannaGas: 160,
      baradium: 140,
      kavamSalz: 180,
      credits: 1800
    }
  }
};
Object.assign(MINE_PROJECT_DEFS, STORAGE_BUILDING_DEFS);
const INFRASTRUCTURE_KEYS = [...new Set([...Object.keys(MINE_PROJECT_DEFS), ...Object.keys(LEGACY_STORAGE_BUILDING_ALIAS_MAP)])];
Object.values(MINE_PROJECT_DEFS).forEach((project) => {
  const rawCost = Object.entries(project.cost || {})
    .filter(([resourceKey]) => resourceKey !== 'credits')
    .reduce((sum, [, amount]) => sum + Number(amount || 0), 0);
  project.cost.credits = rawCost * 2;
});
const TRELLO_EXCLUDED_LISTS = new Set([
  'informationen',
  'vorlage',
  'kuat-triebwerkswerften',
  'abholbereite schiffe (bei kuat)',
  'strategischer stützpunkt',
  'abteilungsraumstationen',
  'general+',
  'klon kommandanten',
  'klon adjutanten',
  'taskforces',
  'task force ab',
  'ab forschungsschiffe task force co al hector gray'
]);
const SHIP_CLASS_POOL = {
  venator: { displayName: 'Venator-Klasse-Sternzerstörer', asset: 'assets/Venator-Klasse-Sternzerstörer.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 72, cost: { quadraniumErz: 140, agrinium: 90, tibannaGas: 80, baradium: 60, kavamSalz: 60 } },
  acclamator_i: { displayName: 'Acclamator-I-Klasse-Kreuzer / Angriffstransporter', asset: 'assets/Acclamator-I-Klasse-Kreuzer.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 38, cost: { quadraniumErz: 84, agrinium: 48, tibannaGas: 42, baradium: 28, kavamSalz: 24 } },
  acclamator_ii: { displayName: 'Acclamator-II-Klasse-Angriffschiff', asset: 'assets/Acclamator-II-Klasse-Angriffschiff.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 42, cost: { quadraniumErz: 90, agrinium: 52, tibannaGas: 48, baradium: 30, kavamSalz: 26 } },
  arquitens: { displayName: 'Arquitens-Klasse-Kreuzer', asset: 'assets/Arquitens-Klasse-Kreuzer.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 24, cost: { quadraniumErz: 55, agrinium: 34, tibannaGas: 28, baradium: 18, kavamSalz: 16 } },
  carrack: { displayName: 'Carrack-Klasse-Kreuzer', asset: 'assets/Carrack-Klasse-Kreuzer.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 18, cost: { quadraniumErz: 44, agrinium: 24, tibannaGas: 22, baradium: 16, kavamSalz: 14 } },
  consular: { displayName: 'Consular-Klasse-Raumkreuzer', asset: 'assets/Consular-Klasse-Raumkreuzer.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 12, cost: { quadraniumErz: 24, agrinium: 14, tibannaGas: 12, baradium: 8, kavamSalz: 8 } },
  consular_charger_c70: { displayName: 'Charger-C70-Umbau (Consular-Klasse-Raumkreuzer)', asset: 'assets/Consular-Klasse-Raumkreuzer.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 28, cost: { quadraniumErz: 56, agrinium: 34, tibannaGas: 30, baradium: 20, kavamSalz: 20 } },
  cr90: { displayName: 'CR90-Korvette', asset: 'assets/CR90-Korvette.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 10, cost: { quadraniumErz: 20, agrinium: 12, tibannaGas: 10, baradium: 7, kavamSalz: 6 } },
  dp20: { displayName: 'DP20-Kanonenboot', asset: 'assets/DP20-Kanonenboot.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 9, cost: { quadraniumErz: 18, agrinium: 11, tibannaGas: 9, baradium: 6, kavamSalz: 6 } },
  dreadnaught: { displayName: 'Dreadnaught-Klasse-Kreuzer', asset: 'assets/Dreadnaught-Klasse-Kreuzer.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 28, cost: { quadraniumErz: 70, agrinium: 46, tibannaGas: 38, baradium: 26, kavamSalz: 22 } },
  gozanti_frachter: { displayName: 'Gozanti-Klasse-Frachter', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 24, cost: { quadraniumErz: 14, agrinium: 8, tibannaGas: 7, baradium: 5, kavamSalz: 10 } },
  gozanti_kreuzer: { displayName: 'Gozanti-Klasse-Kreuzer', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 24, cost: { quadraniumErz: 18, agrinium: 10, tibannaGas: 9, baradium: 6, kavamSalz: 8 } },
  pelta_fregatte: { displayName: 'Pelta-Klasse-Fregatte', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 72, cost: { quadraniumErz: 48, agrinium: 32, tibannaGas: 26, baradium: 18, kavamSalz: 18 } },
  pelta_blockadebreaker: { displayName: 'Pelta-Klasse-Blockadebrecher', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 72, cost: { quadraniumErz: 54, agrinium: 36, tibannaGas: 30, baradium: 22, kavamSalz: 20 } },
  invincible_kreuzer: { displayName: 'Invincible-Klasse-Kreuzer', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 144, cost: { quadraniumErz: 120, agrinium: 78, tibannaGas: 68, baradium: 48, kavamSalz: 42 } },
  icebreaker_fregatte: { displayName: 'Icebreaker-Klasse-Fregatte', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 72, cost: { quadraniumErz: 52, agrinium: 34, tibannaGas: 28, baradium: 20, kavamSalz: 18 } },
  golan_1: { displayName: 'Golan-1-Kampfstation', asset: 'assets/Golan-1-Kampfstation.svg', faction: 'GAR', canJump: false, buildLocations: 'anyGARPlanet', buildTimeHours: 54, cost: { quadraniumErz: 92, agrinium: 60, tibannaGas: 44, baradium: 48, kavamSalz: 36 } },
  haven_medistation: { displayName: 'Haven-Class-Medistation (Hafen-Klasse)', asset: 'assets/gar.svg', faction: 'GAR', canJump: false, buildLocations: 'anyGARPlanet', buildTimeHours: 120, cost: { quadraniumErz: 130, agrinium: 120, tibannaGas: 70, baradium: 90, kavamSalz: 110 } },
  cardan_station: { displayName: 'Cardan-Klasse Raumstation', asset: 'assets/gar.svg', faction: 'GAR', canJump: false, buildLocations: 'anyGARPlanet', buildTimeHours: 132, cost: { quadraniumErz: 150, agrinium: 110, tibannaGas: 80, baradium: 100, kavamSalz: 90 } },
  galactic_orbital_station: { displayName: 'Galaktische Orbital Station', asset: 'assets/gar.svg', faction: 'GAR', canJump: false, buildLocations: 'anyGARPlanet', buildTimeHours: 168, cost: { quadraniumErz: 210, agrinium: 150, tibannaGas: 120, baradium: 110, kavamSalz: 130 } },
  nis_black_site: { displayName: 'NIS Deep Space Black Site', asset: 'assets/gar.svg', faction: 'GAR', canJump: false, buildLocations: 'anyGARPlanet', buildTimeHours: 180, cost: { quadraniumErz: 260, agrinium: 220, tibannaGas: 160, baradium: 140, kavamSalz: 180 } },
  gladiator_sternzerstoerer: { displayName: 'Gladiator-Klasse-Sternzerstörer', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 168, cost: { quadraniumErz: 115, agrinium: 80, tibannaGas: 70, baradium: 52, kavamSalz: 48 } },
  victory_i_sternzerstoerer: { displayName: 'Victory-I-Klasse Sternzerstörer', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 168, cost: { quadraniumErz: 170, agrinium: 120, tibannaGas: 100, baradium: 80, kavamSalz: 70 } },
  secutor_sternzerstoerer: { displayName: 'Secutor-Klasse-Sternzerstörer', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 240, cost: { quadraniumErz: 240, agrinium: 180, tibannaGas: 160, baradium: 120, kavamSalz: 110 } },
  mandator_sternzerstoerer: { displayName: 'Mandator-Klasse-Sternzerstörer', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 336, cost: { quadraniumErz: 420, agrinium: 320, tibannaGas: 260, baradium: 220, kavamSalz: 180 } },
  praetor_schlachtkreuzer: { displayName: 'Praetor-Klasse-Schlachtkreuzer', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 288, cost: { quadraniumErz: 360, agrinium: 280, tibannaGas: 220, baradium: 180, kavamSalz: 160 } },
  maelstrom_schlachtkreuzer: { displayName: 'Maelstrom-Klasse-Schlachtkreuzer', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 264, cost: { quadraniumErz: 300, agrinium: 230, tibannaGas: 200, baradium: 150, kavamSalz: 140 } },
  ipv_2c_tarnkorvette: { displayName: 'IPV-2C-Tarnkorvette', asset: 'assets/gar.svg', faction: 'GAR', canJump: true, buildLocations: ['Anaxes', 'Kuat', 'Rothana'], buildTimeHours: 48, cost: { quadraniumErz: 30, agrinium: 40, tibannaGas: 20, baradium: 18, kavamSalz: 12 } },
  munificent: { displayName: 'Munificent-class Star Frigate', asset: 'assets/kus.svg', faction: 'KUS', canJump: true, buildLocations: ['Geonosis', 'Muunilinst', 'Serenno', 'Raxus'], buildTimeHours: 12, cost: {} },
  providence: { displayName: 'Providence-class Dreadnought', asset: 'assets/kus.svg', faction: 'KUS', canJump: true, buildLocations: ['Geonosis', 'Muunilinst', 'Serenno', 'Raxus'], buildTimeHours: 24, cost: {} },
  lucrehulk: { displayName: 'Lucrehulk-class Battleship', asset: 'assets/kus.svg', faction: 'KUS', canJump: true, buildLocations: ['Geonosis', 'Muunilinst', 'Serenno', 'Raxus'], buildTimeHours: 36, cost: {} }
};
Object.values(SHIP_CLASS_POOL).forEach((shipMeta) => {
  if (shipMeta?.faction !== 'GAR' || !shipMeta.cost || GAR_SHIP_COST_MULTIPLIER === 1) return;
  shipMeta.cost = Object.fromEntries(
    Object.entries(shipMeta.cost).map(([resourceKey, amount]) => [resourceKey, Math.round((Number(amount) || 0) * GAR_SHIP_COST_MULTIPLIER)])
  );
  shipMeta.cost.credits = Object.values(shipMeta.cost).reduce((sum, amount) => sum + Number(amount || 0), 0) * 2;
});
const SHIP_CLASS_IMPORT_PATTERNS = [
  { classId: 'venator', patterns: ['venator'] },
  { classId: 'acclamator_i', patterns: ['acclamator-i', 'acclamator i', 'acclamator 1', 'angriffstransporter'] },
  { classId: 'acclamator_ii', patterns: ['acclamator-ii', 'acclamator ii', 'acclamator 2'] },
  { classId: 'arquitens', patterns: ['arquitens'] },
  { classId: 'carrack', patterns: ['carrack'] },
  { classId: 'consular', patterns: ['consular'] },
  { classId: 'consular_charger_c70', patterns: ['charger-c70-umbau', 'charger c70 umbau', 'charger-c70', 'charger c70'] },
  { classId: 'cr90', patterns: ['cr90'] },
  { classId: 'dp20', patterns: ['dp20'] },
  { classId: 'dreadnaught', patterns: ['dreadnaught'] },
  { classId: 'gozanti_frachter', patterns: ['gozanti-klasse-frachter', 'gozanti klasse frachter'] },
  { classId: 'gozanti_kreuzer', patterns: ['gozanti-klasse-kreuzer', 'gozanti klasse kreuzer'] },
  { classId: 'pelta_fregatte', patterns: ['pelta-klasse-fregatte', 'pelta klasse fregatte'] },
  { classId: 'pelta_blockadebreaker', patterns: ['pelta-klasse-blockadebrecher', 'blockadebrecher'] },
  { classId: 'invincible_kreuzer', patterns: ['invincible-klasse-kreuzer', 'invincible klasse kreuzer'] },
  { classId: 'icebreaker_fregatte', patterns: ['icebreaker-klasse-fregatte', 'icebreaker klasse fregatte'] },
  { classId: 'golan_1', patterns: ['golan-1', 'golan 1', 'kampfstation'] },
  { classId: 'haven_medistation', patterns: ['haven-class-medistation', 'haven class medistation', 'hafen-klasse-medistation', 'hafen klasse medistation'] },
  { classId: 'cardan_station', patterns: ['cardan-klasse raumstation', 'cardan-klasse-raumstation', 'cardan klasse raumstation'] },
  { classId: 'galactic_orbital_station', patterns: ['galaktische orbital station', 'orbital station'] },
  { classId: 'nis_black_site', patterns: ['nis deep space black site', 'nis deep space black site', 'black site', 'blacksite'] },
  { classId: 'gladiator_sternzerstoerer', patterns: ['gladiator-klasse-sternzerst', 'gladiator klasse sternzerst'] },
  { classId: 'victory_i_sternzerstoerer', patterns: ['victory-i-klasse sternzerst', 'victory i klasse sternzerst'] },
  { classId: 'secutor_sternzerstoerer', patterns: ['secutor-klasse-sternzerst', 'secutor klasse sternzerst'] },
  { classId: 'mandator_sternzerstoerer', patterns: ['mandator-klasse-sternzerst', 'mandator klasse sternzerst'] },
  { classId: 'praetor_schlachtkreuzer', patterns: ['praetor klasse schlachtkreuzer', 'praetor-klasse-schlachtkreuzer'] },
  { classId: 'maelstrom_schlachtkreuzer', patterns: ['maelstrom-klasse-schlachtkreuzer', 'maelstrom klasse schlachtkreuzer'] },
  { classId: 'ipv_2c_tarnkorvette', patterns: ['ipv-2c-tarnkorvette', 'ipv 2c tarnkorvette'] }
];
const LOCAL_STATE_MAX_BYTES = 2.5 * 1024 * 1024;
const LOCAL_STATE_STORAGE_KEY = 'gcb_state_v2';
const LOCAL_STATE_SCHEMA_VERSION = 2;
const APP_ENTRY_SESSION_KEY = 'gcb_app_entry_active';
const DEFAULT_DATA = {
  planets: [],
  fleets: [],
  ships: [],
  buildJobs: [],
  fleetMotions: [],
  resources: {},
  planetResources: {},
  lastResourceTickAt: Date.now(),
  importWarnings: [],
  authUsers: [],
  meta: {}
};
const deferredScriptPromises = new Map();
let deferredFullRenderTimer = null;
function loadDeferredScriptOnce(key, src) {
  if (deferredScriptPromises.has(key)) return deferredScriptPromises.get(key);
  const promise = new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[data-deferred-script="${key}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve(true), { once: true });
      existing.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.defer = true;
    script.dataset.deferredScript = key;
    script.addEventListener('load', () => resolve(true), { once: true });
    script.addEventListener('error', () => reject(new Error(`Failed to load ${src}`)), { once: true });
    document.head.appendChild(script);
  });
  deferredScriptPromises.set(key, promise);
  return promise;
}
function ensureArcgisCompactLoaded() {
  if (window.ARCGIS_COMPACT) return Promise.resolve(true);
  return loadDeferredScriptOnce('arcgis-compact', `assets/arcgis-compact.js?v=${ASSET_VERSION_TAG}`)
    .then(() => {
      arcgisData = null;
      if (typeof renderBaseThenDeferHeavy === 'function' && Array.isArray(state?.planets) && state.planets.length) {
        renderBaseThenDeferHeavy();
      }
      return Boolean(window.ARCGIS_COMPACT);
    })
    .catch((error) => {
      console.warn('ArcGIS compact data could not be loaded lazily.', error);
      return false;
    });
}
function ensurePlanetDemographicsLoaded() {
  if (window.PLANET_DEMOGRAPHICS) {
    PLANET_DEMOGRAPHIC_CATALOG = window.PLANET_DEMOGRAPHICS;
    return Promise.resolve(true);
  }
  return loadDeferredScriptOnce('planet-demographics', `assets/planet-demographics.js?v=${ASSET_VERSION_TAG}`)
    .then(() => {
      PLANET_DEMOGRAPHIC_CATALOG = window.PLANET_DEMOGRAPHICS || {};
      return Object.keys(PLANET_DEMOGRAPHIC_CATALOG).length > 0;
    })
    .catch((error) => {
      console.warn('Planet demographics could not be loaded lazily.', error);
      return false;
    });
}
function warmDeferredCampaignAssets() {
  window.setTimeout(() => {
    void ensureArcgisCompactLoaded();
  }, 1200);
  window.setTimeout(() => {
    void ensurePlanetDemographicsLoaded();
  }, 2500);
}
function setAppEntrySessionActive(active) {
  try {
    if (active) sessionStorage.setItem(APP_ENTRY_SESSION_KEY, '1');
    else sessionStorage.removeItem(APP_ENTRY_SESSION_KEY);
  } catch (error) {
    console.warn('App entry session flag could not be updated.', error);
  }
}
function shouldResumeAppEntryOnStartup() {
  try {
    return sessionStorage.getItem(APP_ENTRY_SESSION_KEY) === '1';
  } catch (error) {
    console.warn('App entry session flag could not be read.', error);
    return false;
  }
}
function sanitizeCampaignMeta(meta) {
  const source = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
  const blockedKeys = new Set([
    'planetInfoCache',
    'planetFetchState',
    'ui',
    'animationState',
    'renderCache',
    'indexCache',
    'domCache'
  ]);
  return Object.fromEntries(
    Object.entries(source).filter(([key]) => !blockedKeys.has(key))
  );
}
function makeServerCampaignPayload(nextState) {
  const payload = {
    planets: Array.isArray(nextState?.planets) ? nextState.planets : [],
    fleets: Array.isArray(nextState?.fleets) ? nextState.fleets : [],
    ships: Array.isArray(nextState?.ships) ? nextState.ships : [],
    buildJobs: Array.isArray(nextState?.buildJobs) ? nextState.buildJobs : [],
    fleetMotions: Array.isArray(nextState?.fleetMotions) ? nextState.fleetMotions : [],
    resources: nextState?.resources && typeof nextState.resources === 'object' ? nextState.resources : {},
    planetResources: nextState?.planetResources && typeof nextState.planetResources === 'object' ? nextState.planetResources : {},
    lastResourceTickAt: Number(nextState?.lastResourceTickAt) || Date.now(),
    importWarnings: Array.isArray(nextState?.importWarnings) ? nextState.importWarnings : [],
    meta: sanitizeCampaignMeta(nextState?.meta)
  };
  return JSON.parse(JSON.stringify(payload));
}
function makeLocalCampaignSnapshot(nextState) {
  const payload = makeServerCampaignPayload(nextState);
  payload.authUsers = Array.isArray(nextState?.authUsers) ? nextState.authUsers : [];
  payload.lastResourceTickAt = Number(nextState?.lastResourceTickAt) || Date.now();
  payload.meta = payload.meta && typeof payload.meta === 'object' ? payload.meta : {};
  payload.meta.clientSnapshotVersion = LOCAL_STATE_SCHEMA_VERSION;
  return JSON.parse(JSON.stringify(payload));
}
function loadInitialCampaignState() {
  try {
    const raw = localStorage.getItem(LOCAL_STATE_STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(DEFAULT_DATA));
    if (raw.length > LOCAL_STATE_MAX_BYTES) {
      console.warn('Stored campaign state too large, ignoring local fallback', { kb: Math.round(raw.length / 1024) });
      localStorage.removeItem(LOCAL_STATE_STORAGE_KEY);
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    const parsed = JSON.parse(raw);
    const snapshotVersion = Number(parsed?.meta?.clientSnapshotVersion || 0);
    if (snapshotVersion !== LOCAL_STATE_SCHEMA_VERSION) {
      console.warn('Stored campaign state snapshot version is outdated, ignoring local fallback', { snapshotVersion, expected: LOCAL_STATE_SCHEMA_VERSION });
      localStorage.removeItem(LOCAL_STATE_STORAGE_KEY);
      return JSON.parse(JSON.stringify(DEFAULT_DATA));
    }
    return {
      ...JSON.parse(JSON.stringify(DEFAULT_DATA)),
      ...makeLocalCampaignSnapshot(parsed)
    };
  } catch (error) {
    console.warn('Campaign state could not be restored; falling back to defaults', error);
    return JSON.parse(JSON.stringify(DEFAULT_DATA));
  }
}
let state = loadInitialCampaignState();
let layers = { ...STARTUP_LAYERS };
let selected = null;
let zoom = 0.56, panX = -590, panY = -520;
let viewMode = 'schematic';
let applyingRemoteState = false;
let serverSyncReady = false;
let serverRevision = 0;
let saveSyncTimer = null;
let isRendering = false;
const world = document.getElementById('world'), viewport = document.getElementById('viewport'), overlay = document.getElementById('overlay'), tacticalOverlay = document.getElementById('tacticalOverlay'), influenceCanvas = document.getElementById('influenceCanvas'), tacticalCanvas = document.getElementById('tacticalCanvas'), mapEl = document.getElementById('map');
const planetLayer = document.getElementById('planetLayer'), markerLayer = document.getElementById('markerLayer'), fleetLayer = document.getElementById('fleetLayer'), fxLayer = document.getElementById('fxLayer');
const influenceCtx = influenceCanvas.getContext('2d');
const tacticalCtx = tacticalCanvas.getContext('2d');
const infoPanel = document.getElementById('infoPanel');
const legendPanel = document.getElementById('legendPanel');
const workspacePanel = document.getElementById('workspacePanel');
const planetSearchInput = document.getElementById('planetSearch');
const planetSearchResults = document.getElementById('planetSearchResults');
const contextMenu = document.getElementById('contextMenu');
const roleSelect = document.getElementById('roleSelect');
const saveBtn = document.getElementById('saveBtn');
const muteBtn = document.getElementById('muteBtn');
const roleFactionBadge = document.getElementById('roleFactionBadge');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const guestContinueBtn = document.getElementById('guestContinueBtn');
const loginModal = document.getElementById('loginModal');
const loginModalUser = document.getElementById('loginUser');
const loginModalPassword = document.getElementById('loginPassword');
const bootScreen = document.getElementById('bootScreen');
const bootProgressFill = document.getElementById('bootProgressFill');
const bootProgressText = document.getElementById('bootProgressText');
const bootStatusLabel = document.getElementById('bootStatusLabel');
const settingsModal = document.getElementById('settingsModal');
const settingsModalContent = document.getElementById('settingsModalContent');
const creditsModal = document.getElementById('creditsModal');
const creditsModalContent = document.getElementById('creditsModalContent');
const tutorialModal = document.getElementById('tutorialModal');
const tutorialModalContent = document.getElementById('tutorialModalContent');
const sessionUserDisplay = document.getElementById('sessionUserDisplay');
const mainNavToggle = document.getElementById('mainNavToggle');
const orientationGuardEl = document.getElementById('orientationGuard');
const orientationLockBtn = document.getElementById('orientationLockBtn');
const orientationDismissBtn = document.getElementById('orientationDismissBtn');
const buildProjectsTabBtn = document.getElementById('buildProjectsTabBtn');
const loginManagerTabBtn = document.getElementById('loginManagerTabBtn');
const radioCommandTabBtn = document.getElementById('radioCommandTabBtn');
const economyViewState = {
  loading: false,
  loaded: false,
  companies: [],
  topLastHour: [],
  history: {},
  holdings: [],
  purchaseOrders: [],
  portfolio: null,
  portfolioHistory: [],
  portfolioHistoryRange: '',
  leaderboard: [],
  events: [],
  acp: { current: [], history: {} },
  acpSelectedResource: 'quadraniumErz',
  acpRankingSort: 'cheap',
  acpRanking: { resourceType: 'quadraniumErz', sectors: [], updatedAt: null },
  acpRankingLoading: false,
  acpRankingError: '',
  intelligenceReports: [],
  institutionalInvestors: [],
  institutionalTrades: [],
  sectorDemand: [],
  economySectors: [],
  selectedEconomySectorId: '',
  selectedEconomySector: null,
  sectorEconomyLoading: false,
  sectorEconomyError: '',
  canBuySectorResources: false,
  canManageSectorEmbargo: false,
  sectorPurchaseResourceType: 'quadraniumErz',
  sectorPurchaseQuantity: 10,
  policy: { taxRate: 0.05, subsidy: 'none' },
  inflationRate: 0,
  nextPurchaseAt: null,
  investor: null,
  factionAccounts: {},
  factionAccountKey: '',
  portfolioEnabled: false,
  consumerMode: true,
  canPurchase: true,
  activeSection: 'overview',
  selectedCompanyId: '',
  featuredCompanies: [],
  searchResults: [],
  companySearchLoading: false,
  companySearchError: '',
  companyDetailById: {},
  companyDetailLoadingId: '',
  companyDetailError: '',
  lastLoadedAt: 0,
  marketRange: 'today',
  sectorQuery: '',
  resourceFilter: 'all',
  error: ''
};
const PLANET_INFO_PLACEHOLDER = 'Keine Informationen gefunden';
const PLANET_INFO_LOCAL_OVERRIDES = {
  kuat: {
    climate: 'Gemäßigt',
    population: '3,6 Milliarden',
    strategic: 'Kritisch',
    image: 'https://static.wikia.nocookie.net/starwars/images/3/38/Kuat-SWCT.png',
    description: 'Kuat ist eine der wichtigsten Werftwelten der Galaxis und das industrielle Herzstück der Republikflotte.'
  },
  coruscant: {
    climate: 'Kontrolliert / urban',
    population: '1 Billion+',
    strategic: 'Galaktische Hauptstadt',
    image: 'https://static.wikia.nocookie.net/starwars/images/2/2d/Coruscant-EotE.jpg',
    description: 'Coruscant ist politisches Zentrum der Republik und Sitz von Senat, Justiz und vielen Kerninstitutionen.'
  },
  kamino: {
    climate: 'Stürmisch / ozeanisch',
    population: 'Unbekannt',
    strategic: 'Klonproduktion',
    image: 'https://static.wikia.nocookie.net/starwars/images/8/81/Kamino-DB.png',
    description: 'Kamino ist eine Wasserwelt mit hochspezialisierter Klontechnologie und strategisch enormer Bedeutung für die GAR.'
  },
  geonosis: {
    climate: 'Heiß / trocken',
    population: '100 Milliarden+',
    strategic: 'Droidenindustrie',
    image: 'https://static.wikia.nocookie.net/starwars/images/6/64/Geonosis_AotC.png',
    description: 'Geonosis ist ein zentrales Industrie- und Waffenproduktionszentrum der KUS.'
  },
  anaxes: {
    climate: 'Gemäßigt',
    population: 'Unbekannt',
    strategic: 'Flottenwerft',
    image: 'https://static.wikia.nocookie.net/starwars/images/1/1e/Anaxes-SWCT.png',
    description: 'Anaxes zählt zu den wichtigsten republikanischen Militärwelten und dient als Flotten- und Ausbildungsstandort.'
  }
};
let PLANET_DEMOGRAPHIC_CATALOG = window.PLANET_DEMOGRAPHICS || {};
const planetInfoCardCache = new Map();
let activePlanetInfoRequestId = 0;
const LOGIN_ROLE_DEFINITIONS = {
  Admin: { label: 'Globaler Admin', baseRole: 'Admin', faction: 'system', level: 'global' },
  'Republic Navy Admin': { label: 'Republic Navy Admin', baseRole: 'Republic Navy / GAR', faction: 'navy', level: 'admin' },
  'Republic Navy / GAR': { label: 'Republic Navy', baseRole: 'Republic Navy / GAR', faction: 'navy', level: 'member' },
  'Galaktischer Senats Admin': { label: 'Galaktischer Senats Admin', baseRole: 'Senat', faction: 'senate', level: 'admin' },
  Senat: { label: 'Galaktischer Senat', baseRole: 'Senat', faction: 'senate', level: 'member' },
  'Eventleiter / KUS Admin': { label: 'Eventleiter / KUS Admin', baseRole: 'Eventleiter / KUS', faction: 'event', level: 'admin' },
  'Eventleiter / KUS': { label: 'Eventleiter / KUS', baseRole: 'Eventleiter / KUS', faction: 'event', level: 'member' },
  'Black Sun Syndikat Admin': { label: 'Black Sun Syndikat Fraktions-Admin', baseRole: 'Black Sun Syndikat', faction: 'blackSun', level: 'faction-admin' },
  'Black Sun Syndikat': { label: 'Black Sun Syndikat', baseRole: 'Black Sun Syndikat', faction: 'blackSun', level: 'member' },
  'Pyke-Syndikat Admin': { label: 'Pyke-Syndikat Fraktions-Admin', baseRole: 'Pyke-Syndikat', faction: 'pyke', level: 'faction-admin' },
  'Pyke-Syndikat': { label: 'Pyke-Syndikat', baseRole: 'Pyke-Syndikat', faction: 'pyke', level: 'member' },
  'Huttenkartell Admin': { label: 'Huttenkartell Fraktions-Admin', baseRole: 'Huttenkartell', faction: 'hutts', level: 'faction-admin' },
  Huttenkartell: { label: 'Huttenkartell', baseRole: 'Huttenkartell', faction: 'hutts', level: 'member' },
  Viewer: { label: 'Viewer', baseRole: 'Viewer', faction: 'system', level: 'viewer' }
};
const LOGIN_ROLES = Object.keys(LOGIN_ROLE_DEFINITIONS);
const LOGIN_FACTIONS = [
  { id: 'navy', label: 'Republic Navy', memberRole: 'Republic Navy / GAR', adminRole: 'Republic Navy Admin' },
  { id: 'senate', label: 'Galaktischer Senat', memberRole: 'Senat', adminRole: 'Galaktischer Senats Admin' },
  { id: 'event', label: 'Eventleiter / KUS', memberRole: 'Eventleiter / KUS', adminRole: 'Eventleiter / KUS Admin' },
  { id: 'blackSun', label: 'Black Sun Syndikat', memberRole: 'Black Sun Syndikat', adminRole: 'Black Sun Syndikat Admin' },
  { id: 'pyke', label: 'Pyke-Syndikat', memberRole: 'Pyke-Syndikat', adminRole: 'Pyke-Syndikat Admin' },
  { id: 'hutts', label: 'Huttenkartell', memberRole: 'Huttenkartell', adminRole: 'Huttenkartell Admin' }
];
const SENATE_POSITIONS = ['Vizekanzler', 'Regierungsdirektor', 'Minister', 'Vizeminister'];
const sectorDrawBtn = document.getElementById('sectorDrawBtn');
const planetIndex = new Map();
const fleetIndex = new Map();
const planetElements = new Map();
const markerElements = new Map();
const fleetElements = new Map();
const fleetRenderPositions = new Map();
let routeCache = [];
let tacticalRouteCache = [];
let tacticalTravelEdges = [];
let clusterZoomState = null;
let renderQueued = false;
let dirtyTransform = true;
let dirtyPositions = true;
let dirtyFrontline = true;
let dirtyInfluence = true;
let dirtyTacticalBase = false;
let dirtyRouteOverlay = false;
let dirtyLayers = true;
let activeInteraction = null;
let activeSnapPlanetId = null;
let hoveredPlanetId = null;
let hoveredMarkerId = null;
let hoveredRouteId = null;
let hoveredZoneInfo = null;
let pendingRouteHoverId = null;
let routeHoverFrame = 0;
let pendingHoverUpdate = null;
let hoverUpdateFrame = 0;
let uiSoundVolume = 75;
let adminModeEnabled = true;
let activeOverlayModalId = '';
let lastFocusedElementBeforeModal = null;
let tutorialCheckPromise = null;
let economySearchTimer = null;
let planetHyperlaneDegreeCache = { signature: '', map: new Map() };
let tutorialFlowState = {
  shouldPrompt: false,
  started: false,
  stepIndex: -1,
  steps: []
};
const SETTINGS_SOUND_VOLUME_KEY = 'gcb_ui_v1.settings.soundVolume';
const SETTINGS_ADMIN_MODE_KEY = 'gcb_ui_v1.settings.adminMode';
const BOOT_MIN_DURATION_MS = 800;
const BOOT_MAX_DURATION_MS = 6000;
const ECONOMY_BOOT_MAX_DURATION_MS = 12000;
const bootLoadState = {
  startedAt: Date.now(),
  progress: 0,
  hidden: true,
  timer: null,
  forceTimer: null,
  mode: 'app',
  tasks: {
    domReady: false,
    mapImageReady: false,
    campaignReady: false,
    authReady: false,
    economyReady: false
  }
};
let mapImageLoaded = false;
let buildProjectsViewTab = 'infrastructure';
let activeMainTab = 'map';
let activeShipyardFactionOverride = 'GAR';
let fleetManagementSearchQuery = '';
let activeFleetManagementHighlightTimer = 0;
let activeFleetManagementHighlightKey = '';
let pendingFleetManifestHighlightShipId = '';
let fleetManagementSearchResultsState = [];
let fleetManagementSearchActiveIndex = -1;
let activeFleetManifestFilterFleetId = '';
let activePlanetSearchHighlightId = '';
let activePlanetSearchHighlightTimer = 0;
let draggedFleetManagementFleetId = '';
let draggedFleetCategoryId = '';
let radioCommandAdminState = {
  permissions: [],
  audit: [],
  users: [],
  fleets: [],
  radioConfig: null,
  fleetSearch: {},
  loading: false
};
let currentAuthenticatedUsername = '';
let viewerModeActive = true;
let pendingLoginAttempt = null;
let navCollapsed = false;
let mobileOrientationDismissed = false;
let audioMuted = false;
let contextMenuState = null;
let activeSectorDraft = null;
const CLIENT_UI_PREFS_KEY = 'gcb_ui_v1';
let fleetCategoryCollapsedIds = new Set();
const serverSync = {
  enabled: window.location.protocol.startsWith('http'),
  socket: null,
  revision: 0,
  clockOffsetMs: 0,
  session: { id: null, username: '', role: 'Viewer' },
  isApplyingRemoteState: false,
  syncQueued: false,
  syncInFlight: false,
  offlineMode: false,
  reconnectTimer: null,
  reconnectAttempt: 0,
  refreshTimer: null,
  refreshInFlight: false,
  transport: ['localhost', '127.0.0.1'].includes(window.location.hostname) ? 'socket' : 'polling'
};
let fleetManagementFactionFilter = 'all';
let searchResultsState = [];
let activeSearchResultIndex = -1;
let fleetJumpSearchState = { fleetId: null, results: [], activeIndex: -1, selectedPlanetId: null };
let mineBuildPlanetSearchState = { results: [], activeIndex: -1 };
const fleetTravelState = new Map();
let fleetTravelFrame = 0;
let gridModel = null;
let mapAnalysis = null;
let arcgisData = null;
let tacticalSectionCanvasCache = new Map();
let tacticalHoverAreas = { regions: [], sectors: [] };
const TACTICAL_DEBUG = false;
let tacticalDebugArcgisLogged = false;
let tacticalDebugRenderCount = 0;
let tacticalBaseReady = false;
let tacticalBuildQueued = false;
let tacticalBuildVersion = 0;
let mapAnalysisUnavailable = false;
const hyperspaceStartAudio = new Audio('assets/Hyperspace Start.ogg');
const hyperspaceFinishAudio = new Audio('assets/Hyperspace Finish.ogg');
const garVictoryAudio = new Audio('assets/GAR Victory.ogg');
const fleetDeleteAudio = new Audio('assets/Fleet Delete.ogg');
const datapadClickAudio = new Audio('assets/Datapad click 2.ogg');
const datapadAcceptAudio = new Audio('assets/Datapad accept.ogg');
const datapadDeleteAudio = new Audio('assets/Datapad delete.ogg');
garVictoryAudio.volume = 0.5;
fleetDeleteAudio.volume = 0.4;

