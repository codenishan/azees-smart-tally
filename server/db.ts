import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

const filePath = path.resolve(process.env.DATABASE_PATH || "./data/smart-tally.sqlite");
fs.mkdirSync(path.dirname(filePath), { recursive: true });

export const db: InstanceType<typeof Database> = new Database(filePath);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
CREATE TABLE IF NOT EXISTS ledgers (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, type TEXT NOT NULL CHECK(type IN ('customer','vendor','bank','cash','other')),
  phone TEXT DEFAULT '', email TEXT DEFAULT '', gstin TEXT DEFAULT '', opening_balance REAL NOT NULL DEFAULT 0,
  balance_type TEXT NOT NULL DEFAULT 'receivable', address TEXT DEFAULT '', deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL CHECK(type IN ('sale','purchase','expense','collection','payment')),
  number TEXT NOT NULL UNIQUE, date TEXT NOT NULL, party_id INTEGER REFERENCES ledgers(id) ON DELETE SET NULL,
  party_name TEXT NOT NULL DEFAULT '', category TEXT NOT NULL DEFAULT '', description TEXT DEFAULT '',
  subtotal REAL NOT NULL DEFAULT 0, tax REAL NOT NULL DEFAULT 0, amount REAL NOT NULL,
  payment_mode TEXT NOT NULL DEFAULT 'cash', paid REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'paid',
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, sku TEXT NOT NULL DEFAULT '', category TEXT DEFAULT '',
  barcode TEXT DEFAULT '', quantity REAL NOT NULL DEFAULT 0, low_stock REAL NOT NULL DEFAULT 5,
  unit TEXT NOT NULL DEFAULT 'pcs', purchase_price REAL NOT NULL DEFAULT 0, selling_price REAL NOT NULL DEFAULT 0,
  deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS stock_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT, item_id INTEGER NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  movement TEXT NOT NULL CHECK(movement IN ('in','out','adjustment')), quantity REAL NOT NULL,
  note TEXT DEFAULT '', date TEXT NOT NULL DEFAULT (date('now'))
);
CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, body TEXT NOT NULL DEFAULT '',
  reminder_at TEXT DEFAULT '', done INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, email TEXT NOT NULL, last_activity INTEGER NOT NULL, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL, action TEXT NOT NULL, entity TEXT DEFAULT '',
  entity_id TEXT DEFAULT '', details TEXT DEFAULT '', ip TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_transactions_date_type ON transactions(date, type);
CREATE INDEX IF NOT EXISTS idx_transactions_party ON transactions(party_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
`);

function ensureColumn(table: string, column: string, definition: string) {
  const columns = db.pragma(`table_info(${table})`) as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

ensureColumn("ledgers", "deleted_at", "TEXT");
ensureColumn("transactions", "deleted_at", "TEXT");
ensureColumn("items", "deleted_at", "TEXT");
db.exec(`
CREATE INDEX IF NOT EXISTS idx_transactions_active_date ON transactions(deleted_at, date, type);
CREATE INDEX IF NOT EXISTS idx_ledgers_active_type ON ledgers(deleted_at, type);
CREATE INDEX IF NOT EXISTS idx_items_active_name ON items(deleted_at, name);
`);
