import Database from 'better-sqlite3';
import {
  purchaseMarketDemand,
  repairInvestorCompany,
  sellMarketShare
} from '../src/db.js';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function openCheckDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE market_companies (
      id TEXT PRIMARY KEY, symbol TEXT NOT NULL UNIQUE, name TEXT NOT NULL, faction TEXT NOT NULL,
      sector TEXT NOT NULL DEFAULT '', resource_key TEXT NOT NULL DEFAULT '', base_price REAL NOT NULL,
      current_price REAL NOT NULL, previous_price REAL NOT NULL, total_shares INTEGER,
      free_float_shares INTEGER, locked_institutional_shares INTEGER, market_cap REAL,
      major_shareholders_json TEXT, controlling_shareholder TEXT, ownership_updated_at INTEGER,
      resource_refs_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL, market_status TEXT NOT NULL DEFAULT 'tradeable',
      is_embargoed INTEGER NOT NULL DEFAULT 0, acquired_by_company_id TEXT
    );
    CREATE TABLE market_investors (
      id TEXT PRIMARY KEY, alias TEXT NOT NULL, user_id TEXT, balance REAL NOT NULL DEFAULT 5000,
      portfolio_enabled INTEGER NOT NULL DEFAULT 1, last_purchase_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE market_holdings (investor_id TEXT NOT NULL, company_id TEXT NOT NULL, shares INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (investor_id, company_id));
    CREATE TABLE market_orders (
      id TEXT PRIMARY KEY, investor_id TEXT NOT NULL, company_id TEXT NOT NULL, quantity INTEGER NOT NULL,
      unit_price REAL NOT NULL, total_value REAL NOT NULL, remaining_quantity INTEGER,
      realized_profit REAL NOT NULL DEFAULT 0, closed_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE market_taxes (
      id TEXT PRIMARY KEY, investor_id TEXT NOT NULL, company_id TEXT NOT NULL, quantity INTEGER NOT NULL,
      gross_proceeds REAL NOT NULL, tax_amount REAL NOT NULL, net_proceeds REAL NOT NULL,
      tax_rate REAL NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE portfolio_history (
      id TEXT PRIMARY KEY, investor_id TEXT NOT NULL, total_value REAL NOT NULL, cash_balance REAL NOT NULL,
      holdings_value REAL NOT NULL, realized_profit REAL NOT NULL, unrealized_profit REAL NOT NULL,
      taxes_paid REAL NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE market_history (id TEXT PRIMARY KEY, company_id TEXT NOT NULL, price REAL NOT NULL, recorded_at TEXT NOT NULL);
    CREATE TABLE market_events (id TEXT PRIMARY KEY, event_type TEXT NOT NULL, title TEXT NOT NULL, description TEXT NOT NULL, impact REAL NOT NULL, started_at TEXT NOT NULL, ends_at TEXT NOT NULL);
    CREATE TABLE faction_accounts (faction TEXT PRIMARY KEY, credits REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
    CREATE TABLE institutional_investors (id TEXT PRIMARY KEY, name TEXT NOT NULL, strategy TEXT NOT NULL, risk_tolerance REAL NOT NULL DEFAULT 0.5, corruption_affinity REAL NOT NULL DEFAULT 0.5, credit_balance REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL);
    CREATE TABLE institutional_holdings (investor_id TEXT NOT NULL, company_id TEXT NOT NULL, shares INTEGER NOT NULL DEFAULT 0, average_cost REAL NOT NULL DEFAULT 0, updated_at TEXT NOT NULL, PRIMARY KEY (investor_id, company_id));
    CREATE TABLE market_integrity_logs (
      id TEXT PRIMARY KEY, investor_id TEXT, company_id TEXT, issue_type TEXT NOT NULL, severity TEXT NOT NULL,
      before_json TEXT, after_json TEXT, action_taken TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  db.prepare(`
    INSERT INTO market_companies (
      id, symbol, name, faction, sector, resource_key, base_price, current_price, previous_price,
      total_shares, free_float_shares, locked_institutional_shares, market_cap, updated_at
    ) VALUES ('company_a', 'TST', 'Test Holding', 'GAR', 'Test', 'quadraniumErz', 100, 100, 100, 100000, 100000, 0, 10000000, ?)
  `).run(new Date().toISOString());
  db.prepare(`
    INSERT INTO market_investors (id, alias, user_id, balance, portfolio_enabled, created_at)
    VALUES ('investor_a', 'Integrity Tester', 'tester', 10000000, 1, ?)
  `).run(new Date().toISOString());
  return db;
}

function sellable(db) {
  return db.prepare(`
    SELECT COALESCE(SUM(CASE WHEN COALESCE(remaining_quantity, quantity) > 0 THEN COALESCE(remaining_quantity, quantity) ELSE 0 END), 0) AS shares
    FROM market_orders
    WHERE investor_id = 'investor_a' AND company_id = 'company_a'
  `).get().shares;
}

const db = openCheckDb();

purchaseMarketDemand(db, { investorId: 'investor_a', userId: 'tester', companyId: 'company_a', quantity: 100 }, Date.now());
assert(sellable(db) === 100, 'Fall A: Sellable muss 100 sein.');
assert(db.prepare(`SELECT shares FROM market_holdings WHERE investor_id='investor_a' AND company_id='company_a'`).get().shares === 100, 'Fall A: Holding-Cache muss 100 sein.');

sellMarketShare(db, { investorId: 'investor_a', companyId: 'company_a', quantity: 40 }, Date.now() + 1000);
assert(sellable(db) === 60, 'Fall B: Sellable muss 60 sein.');
assert(db.prepare(`SELECT shares FROM market_holdings WHERE investor_id='investor_a' AND company_id='company_a'`).get().shares === 60, 'Fall B: Holding-Cache muss 60 sein.');

db.prepare(`UPDATE market_holdings SET shares = 1 WHERE investor_id='investor_a' AND company_id='company_a'`).run();
repairInvestorCompany(db, 'investor_a', 'company_a');
assert(db.prepare(`SELECT shares FROM market_holdings WHERE investor_id='investor_a' AND company_id='company_a'`).get().shares === 60, 'Fall C: Reconcile muss auf 60 korrigieren.');

let blocked = false;
try {
  sellMarketShare(db, { investorId: 'investor_a', companyId: 'company_a', quantity: 100 }, Date.now() + 2000);
} catch {
  blocked = true;
}
assert(blocked, 'Fall D: Verkauf ueber Sellable muss blockiert werden.');

db.prepare(`UPDATE market_companies SET current_price = 'NaN' WHERE id='company_a'`).run();
let invalidPriceBlocked = false;
try {
  purchaseMarketDemand(db, { investorId: 'investor_a', userId: 'tester', companyId: 'company_a', quantity: 1 }, Date.now() + 3000);
} catch {
  invalidPriceBlocked = true;
}
assert(invalidPriceBlocked, 'Fall E: NaN-Preis muss rollback/blockieren.');

db.prepare(`UPDATE market_companies SET current_price = 100, previous_price = 100 WHERE id='company_a'`).run();
purchaseMarketDemand(db, { investorId: 'investor_a', userId: 'tester', companyId: 'company_a', quantity: 10000 }, Date.now() + 4000);
const cappedPrice = db.prepare(`SELECT current_price AS price FROM market_companies WHERE id='company_a'`).get().price;
assert(cappedPrice <= 118, 'Fall F: +300%-artiger Impact muss auf maximal 18% begrenzt werden.');

console.log('marketIntegrityCheck ok');
