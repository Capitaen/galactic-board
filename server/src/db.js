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
  `);

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
    SELECT id, username, role, created_at AS createdAt, updated_at AS updatedAt
    FROM users
    ORDER BY username COLLATE NOCASE
  `).all();
}

export function findUserByNormalizedUsername(db, username) {
  return db.prepare(`
    SELECT id, username, role, created_at AS createdAt, updated_at AS updatedAt
    FROM users
    WHERE lower(username) = lower(?)
    LIMIT 1
  `).get(username);
}

export function createUser(db, { username, passwordHash, role }) {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  db.prepare(`
    INSERT INTO users (id, username, password_hash, role, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, username, passwordHash, role, now, now);
  return id;
}

export function updateUser(db, id, { username, passwordHash, role }) {
  const now = new Date().toISOString();
  db.prepare(`
    UPDATE users
    SET username = ?, password_hash = ?, role = ?, updated_at = ?
    WHERE id = ?
  `).run(username, passwordHash, role, now, id);
}

export function deleteUser(db, id) {
  db.prepare(`
    DELETE FROM users
    WHERE id = ?
  `).run(id);
}
