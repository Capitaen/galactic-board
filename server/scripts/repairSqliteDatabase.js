import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const projectRoot = process.cwd();
const serverDir = path.join(projectRoot, 'server');
const dbPath = path.join(serverDir, 'data.sqlite');
const repairDir = path.join(serverDir, 'db-repair');

function fileExists(filePath) {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function sqliteHeaderInfo(filePath) {
  const buffer = fs.readFileSync(filePath);
  return {
    size: buffer.length,
    headerHex: Array.from(buffer.subarray(0, 20)).map((byte) => byte.toString(16).padStart(2, '0')).join(' '),
    headerAscii: buffer.subarray(0, 16).toString('latin1')
  };
}

function integrityCheck(filePath) {
  try {
    const db = new Database(filePath, { readonly: true, fileMustExist: true });
    const integrity = db.prepare('PRAGMA integrity_check').pluck().all();
    const tableCount = db.prepare("SELECT COUNT(*) FROM sqlite_master WHERE type = 'table'").pluck().get();
    db.close();
    return { ok: integrity.length === 1 && integrity[0] === 'ok', integrity, tableCount };
  } catch (error) {
    return { ok: false, error: error.message, code: error.code };
  }
}

function addColumnIfMissing(db, table, name, ddl) {
  const columns = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name));
  if (!columns.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}

function applyKnownEconomyMigrations(db) {
  addColumnIfMissing(db, 'sector_economy_state', 'market_sentiment', "market_sentiment TEXT NOT NULL DEFAULT 'Neutral'");
  addColumnIfMissing(db, 'sector_economy_state', 'stockpile_metals', 'stockpile_metals REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'sector_economy_state', 'stockpile_fuel', 'stockpile_fuel REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'sector_economy_state', 'stockpile_supplies', 'stockpile_supplies REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'sector_economy_state', 'stockpile_technology', 'stockpile_technology REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'sector_economy_state', 'stockpile_chemicals', 'stockpile_chemicals REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'sector_resource_demand', 'pressure_score', 'pressure_score REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'sector_resource_demand', 'momentum', 'momentum REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'sector_resource_demand', 'trend', 'trend REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'sector_resource_demand', 'volatility', 'volatility REAL NOT NULL DEFAULT 0.08');
  addColumnIfMissing(db, 'sector_resource_demand', 'chain_impulse', 'chain_impulse REAL NOT NULL DEFAULT 0');
  addColumnIfMissing(db, 'sector_resource_demand', 'chain_source_resource', "chain_source_resource TEXT NOT NULL DEFAULT ''");
}

function collectCandidates() {
  const names = [
    'data.sqlite.bak-before-reindex-20260612',
    'data.sqlite.bak-stockreset-20260612-040011',
    'data.sqlite.bak-integrity-20260612-035313',
    'data.sqlite'
  ];
  const candidates = [];
  for (const name of names) {
    candidates.push(path.join(serverDir, name));
    candidates.push(path.join(serverDir, 'db-backups', name));
  }
  return [...new Set(candidates)].filter(fileExists);
}

function repairFromCandidate(candidatePath) {
  fs.mkdirSync(repairDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const workingPath = path.join(repairDir, `candidate-${stamp}.sqlite`);
  fs.copyFileSync(candidatePath, workingPath);
  const db = new Database(workingPath);
  const before = db.prepare('PRAGMA integrity_check').pluck().all();
  db.exec('REINDEX');
  applyKnownEconomyMigrations(db);
  const after = db.prepare('PRAGMA integrity_check').pluck().all();
  db.close();
  return { workingPath, before, after };
}

function main() {
  const candidates = collectCandidates().map((filePath) => ({
    filePath,
    header: sqliteHeaderInfo(filePath),
    check: integrityCheck(filePath)
  }));

  console.log(JSON.stringify({ dbPath, candidates }, null, 2));

  const repairable = candidates.find((candidate) => (
    candidate.header.headerAscii === 'SQLite format 3\u0000'
    && candidate.check.error !== 'file is not a database'
    && candidate.check.error !== 'database disk image is malformed'
  ));

  if (!repairable) {
    console.error('No repairable SQLite backup found. Keep the server stopped and restore a clean data.sqlite manually.');
    process.exit(2);
  }

  const repaired = repairFromCandidate(repairable.filePath);
  if (!(repaired.after.length === 1 && repaired.after[0] === 'ok')) {
    console.error(JSON.stringify({ selected: repairable.filePath, repaired }, null, 2));
    process.exit(3);
  }

  const liveBackupPath = path.join(repairDir, `broken-live-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`);
  if (fileExists(dbPath)) fs.copyFileSync(dbPath, liveBackupPath);
  fs.copyFileSync(repaired.workingPath, dbPath);
  const finalCheck = integrityCheck(dbPath);

  console.log(JSON.stringify({
    selectedBackup: repairable.filePath,
    brokenLiveBackup: liveBackupPath,
    repairedWorkingCopy: repaired.workingPath,
    beforeRepair: repaired.before,
    afterRepair: repaired.after,
    finalCheck
  }, null, 2));
}

main();
