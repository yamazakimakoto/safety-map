const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

class SqliteDatabase {
  constructor(db) { this.db = db; }
  async get(sql, params = []) { return this.db.prepare(sql).get(...params); }
  async all(sql, params = []) { return this.db.prepare(sql).all(...params); }
  async run(sql, params = []) { return this.db.prepare(sql).run(...params); }
  async exec(sql) { return this.db.exec(sql); }
  async close() { this.db.close(); }
}

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email_hash TEXT NOT NULL UNIQUE,
    email_encrypted TEXT NOT NULL,
    display_name TEXT NOT NULL,
    real_name TEXT DEFAULT '',
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    session_token TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    photo1_url TEXT DEFAULT '',
    photo2_url TEXT DEFAULT '',
    status TEXT DEFAULT 'published',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS admins (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_reports_category ON reports(category);
  CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status);
  CREATE INDEX IF NOT EXISTS idx_reports_created_at ON reports(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_reports_user_id ON reports(user_id);
`;

async function initDatabase() {
  const Database = require('better-sqlite3');
  const fs = require('fs');
  const dataDir = path.join(__dirname, 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const sqliteDb = new Database(path.join(__dirname, 'data', 'safety-map.db'));
  sqliteDb.pragma('journal_mode = WAL');
  sqliteDb.pragma('foreign_keys = ON');
  const db = new SqliteDatabase(sqliteDb);

  await db.exec(CREATE_TABLES);
  await db.exec(CREATE_INDEXES);

  // マイグレーション: real_name, address, phone カラム追加
  try { await db.exec("ALTER TABLE users ADD COLUMN real_name TEXT DEFAULT ''"); } catch (e) {}
  try { await db.exec("ALTER TABLE users ADD COLUMN address TEXT DEFAULT ''"); } catch (e) {}
  try { await db.exec("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''"); } catch (e) {}

  // デフォルト管理者の作成
  const adminExists = await db.get('SELECT COUNT(*) as count FROM admins');
  if (parseInt(adminExists.count) === 0) {
    const passwordHash = bcrypt.hashSync('admin2024!change_me', 10);
    await db.run(
      'INSERT INTO admins (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)',
      [uuidv4(), 'admin', passwordHash, '管理者']
    );
    console.log('デフォルト管理者アカウントを作成しました。');
    console.log('ユーザー名: admin / パスワード: admin2024!change_me');
  }

  return db;
}

module.exports = { initDatabase };
