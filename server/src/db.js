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
