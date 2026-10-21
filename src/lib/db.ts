import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  name TEXT,
  refresh_token TEXT,
  access_token TEXT,
  token_expires_at INTEGER,
  last_scan_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('weekly','monthly','quarterly','yearly')),
  next_billing_date TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'Other',
  cancel_url TEXT,
  notes TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','gmail')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled')),
  -- billing date we last sent a reminder for, so each charge is only announced once
  last_reminded_for TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS subscriptions_user ON subscriptions(user_id);

-- Subscriptions found in Gmail, waiting for the user to confirm or ignore them.
CREATE TABLE IF NOT EXISTS detections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  merchant_key TEXT NOT NULL,
  name TEXT NOT NULL,
  amount REAL,
  currency TEXT,
  billing_cycle TEXT NOT NULL,
  next_billing_date TEXT NOT NULL,
  category TEXT NOT NULL,
  cancel_url TEXT,
  is_trial INTEGER NOT NULL DEFAULT 0,
  confidence REAL NOT NULL,
  evidence TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','added','ignored')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, merchant_key)
);
`;

const globalForDb = globalThis as unknown as { __trackerDb?: DatabaseSync };

export function getDb(): DatabaseSync {
  if (!globalForDb.__trackerDb) {
    const file = path.resolve(process.env.DATABASE_PATH || "./data/tracker.db");
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const db = new DatabaseSync(file);
    db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");
    db.exec(SCHEMA);
    globalForDb.__trackerDb = db;
  }
  return globalForDb.__trackerDb;
}
