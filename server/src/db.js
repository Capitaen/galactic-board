import path from 'node:path';
import crypto from 'node:crypto';
import Database from 'better-sqlite3';
import bcrypt from 'bcryptjs';
import { extractDefaultData } from './extractDefaultData.js';

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

    CREATE UNIQUE INDEX IF NOT EXISTS idx_radio_command_log_unique_target
      ON radio_command_log (discord_message_id, target_fleet_id, target_planet_id, status);

    CREATE INDEX IF NOT EXISTS idx_radio_command_log_created_at
      ON radio_command_log (created_at DESC);
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
  const sectorOwners = new Map();
  const sectorNames = new Set();
  for (const planet of campaignState.planets || []) {
    const sector = String(planet?.sector || '').trim();
    if (!sector) continue;
    sectorNames.add(sector);
    const owner = String(planet?.owner || 'NEUTRAL').trim() || 'NEUTRAL';
    if (!sectorOwners.has(sector)) sectorOwners.set(sector, new Map());
    const ownerCounts = sectorOwners.get(sector);
    ownerCounts.set(owner, (ownerCounts.get(owner) || 0) + 1);
  }
  for (const manualSector of campaignState.meta?.manualSectors || []) {
    const sector = String(manualSector?.name || '').trim();
    if (sector) sectorNames.add(sector);
  }

  const sectorHoldingResources = [
    ['quadraniumErz', 'Metall-Holding', 420],
    ['agrinium', 'Technologie-Holding', 560],
    ['tibannaGas', 'Treibstoff-Holding', 480],
    ['baradium', 'Chemikalien-Holding', 450],
    ['kavamSalz', 'Versorgungsgueter-Holding', 360]
  ];
  const insertSectorHolding = db.prepare(`
    INSERT OR IGNORE INTO market_companies (
      id, symbol, name, faction, sector, resource_key,
      base_price, current_price, previous_price, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const initialHistory = db.prepare(`
    INSERT OR IGNORE INTO market_history (id, company_id, price, recorded_at)
    VALUES (?, ?, ?, ?)
  `);
  const existingHistory = db.prepare('SELECT 1 FROM market_history WHERE company_id = ? LIMIT 1');

  db.transaction(() => {
    [...sectorNames].sort((a, b) => a.localeCompare(b, 'de')).forEach((sector) => {
      const ownerCounts = sectorOwners.get(sector) || new Map();
      const faction = [...ownerCounts.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0] || 'NEUTRAL';
      sectorHoldingResources.forEach(([resourceKey, holdingLabel, price]) => {
        const digest = crypto.createHash('sha1').update(`${sector}:${resourceKey}`).digest('hex');
        const companyId = `sector_holding_${digest.slice(0, 16)}`;
        const symbol = `S${digest.slice(0, 7).toUpperCase()}`;
        insertSectorHolding.run(
          companyId,
          symbol,
          `${sector} ${holdingLabel}`,
          faction,
          sector,
          resourceKey,
          price,
          price,
          price,
          migrationTime
        );
        if (!existingHistory.get(companyId)) {
          initialHistory.run(`seed_${companyId}`, companyId, price, migrationTime);
        }
      });
    });
  })();

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

export function readMarketSnapshot(db, investorId = '', userId = '') {
  const companies = db.prepare(`
    SELECT id, symbol, name, faction, base_price AS basePrice,
      sector, resource_key AS resourceKey,
      current_price AS currentPrice, previous_price AS previousPrice, updated_at AS updatedAt
    FROM market_companies ORDER BY symbol
  `).all();
  const historyCutoff = new Date(Date.now() - (183 * 24 * 60 * 60 * 1000)).toISOString();
  const historyRows = db.prepare(`
    SELECT company_id AS companyId, price, recorded_at AS recordedAt
    FROM market_history
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
      total_value AS totalValue, created_at AS createdAt
    FROM market_orders
    WHERE investor_id = ?
    ORDER BY created_at ASC
  `).all(investorId) : [];
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
  const policy = db.prepare(`
    SELECT faction, tax_rate AS taxRate, subsidy, updated_at AS updatedAt
    FROM economy_policy WHERE faction = 'GAR'
  `).get() || { faction: 'GAR', taxRate: 0.05, subsidy: 'none' };
  const factionAccounts = Object.fromEntries(db.prepare(`
    SELECT faction, credits, updated_at AS updatedAt
    FROM faction_accounts ORDER BY faction
  `).all().map((account) => [account.faction, account]));
  return { companies, history, topLastHour, holdings, purchaseOrders, investor, leaderboard, events, policy, factionAccounts };
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
        INSERT INTO market_orders (id, investor_id, company_id, quantity, unit_price, total_value, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(crypto.randomUUID(), investorId, companyId, effectiveQuantity, company.current_price, totalCost, purchasedAt);
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

    return {
      companyId,
      price: company.current_price,
      quantity: effectiveQuantity,
      totalCost: investorId ? Math.round(company.current_price * effectiveQuantity * 100) / 100 : 0,
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
    const totalCredit = Math.round(Number(company.current_price || 0) * requestedQuantity * 100) / 100;
    db.prepare(`
      UPDATE market_investors
      SET balance = balance + ?
      WHERE id = ?
    `).run(totalCredit, investorId);

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

    return {
      companyId,
      price: company.current_price,
      quantity: requestedQuantity,
      soldAt,
      credited: totalCredit
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

export function runMarketTick(db, inflationRate = 0, now = Date.now()) {
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
  db.transaction(() => {
    companies.forEach((company) => {
      const pullToBase = (company.base_price - company.current_price) / company.base_price * 0.04;
      const noise = (Math.random() - 0.5) * 0.04;
      const eventImpact = Number(activeEvent?.impact || 0);
      const inflationImpact = Math.min(0.08, Math.max(0, inflationRate)) * 0.25;
      const nextPrice = Math.max(25, Math.round(company.current_price * (1 + pullToBase + noise + eventImpact + inflationImpact) * 100) / 100);
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
  return true;
}
