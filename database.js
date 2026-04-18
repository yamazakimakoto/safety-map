const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// PostgreSQL用: ? を $1, $2, ... に変換
function convertPlaceholders(sql) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

// --- SQLite ラッパー ---
class SqliteDatabase {
  constructor(db) { this.db = db; }
  async get(sql, params = []) { return this.db.prepare(sql).get(...params); }
  async all(sql, params = []) { return this.db.prepare(sql).all(...params); }
  async run(sql, params = []) { return this.db.prepare(sql).run(...params); }
  async exec(sql) { return this.db.exec(sql); }
  async close() { this.db.close(); }
}

// --- PostgreSQL ラッパー ---
class PgDatabase {
  constructor(pool) { this.pool = pool; }
  async get(sql, params = []) {
    const result = await this.pool.query(convertPlaceholders(sql), params);
    return result.rows[0] || undefined;
  }
  async all(sql, params = []) {
    const result = await this.pool.query(convertPlaceholders(sql), params);
    return result.rows;
  }
  async run(sql, params = []) {
    await this.pool.query(convertPlaceholders(sql), params);
  }
  async exec(sql) {
    await this.pool.query(sql);
  }
  async close() { await this.pool.end(); }
}

const CREATE_TABLES = `
  CREATE TABLE IF NOT EXISTS sm_users (
    id TEXT PRIMARY KEY,
    email_hash TEXT NOT NULL UNIQUE,
    email_encrypted TEXT NOT NULL,
    display_name TEXT NOT NULL,
    password_hash TEXT DEFAULT '',
    real_name TEXT DEFAULT '',
    address TEXT DEFAULT '',
    phone TEXT DEFAULT '',
    session_token TEXT,
    is_admin INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS sm_reports (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    latitude REAL NOT NULL,
    longitude REAL NOT NULL,
    category TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT DEFAULT '',
    address TEXT DEFAULT '',
    photo1_url TEXT DEFAULT '',
    photo2_url TEXT DEFAULT '',
    status TEXT DEFAULT 'published',
    admin_status TEXT DEFAULT '投稿',
    admin_memo TEXT DEFAULT '',
    public_memo TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES sm_users(id)
  );

  CREATE TABLE IF NOT EXISTS sm_admins (
    id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  );
`;

const CREATE_INDEXES = `
  CREATE INDEX IF NOT EXISTS idx_sm_reports_category ON sm_reports(category);
  CREATE INDEX IF NOT EXISTS idx_sm_reports_status ON sm_reports(status);
  CREATE INDEX IF NOT EXISTS idx_sm_reports_created_at ON sm_reports(created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_sm_reports_user_id ON sm_reports(user_id);
`;

async function initDatabase() {
  const isPostgres = !!process.env.DATABASE_URL;
  let db;

  if (isPostgres) {
    // PostgreSQL
    const dns = require('dns');
    dns.setDefaultResultOrder('ipv4first');

    const { Pool } = require('pg');
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
    });
    db = new PgDatabase(pool);

    await db.exec(CREATE_TABLES);

    // インデックスを個別に作成（PostgreSQL互換）
    try { await db.exec("CREATE INDEX IF NOT EXISTS idx_sm_reports_category ON sm_reports(category)"); } catch (e) {}
    try { await db.exec("CREATE INDEX IF NOT EXISTS idx_sm_reports_status ON sm_reports(status)"); } catch (e) {}
    try { await db.exec("CREATE INDEX IF NOT EXISTS idx_sm_reports_created_at ON sm_reports(created_at DESC)"); } catch (e) {}
    try { await db.exec("CREATE INDEX IF NOT EXISTS idx_sm_reports_user_id ON sm_reports(user_id)"); } catch (e) {}

    // マイグレーション
    try { await db.exec("ALTER TABLE sm_reports ADD COLUMN address TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_reports ADD COLUMN admin_status TEXT DEFAULT '投稿'"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_reports ADD COLUMN admin_memo TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_reports ADD COLUMN public_memo TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_users ADD COLUMN password_hash TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_users ADD COLUMN real_name TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_users ADD COLUMN address TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_users ADD COLUMN phone TEXT DEFAULT ''"); } catch (e) {}

    console.log('PostgreSQL に接続しました');

  } else {
    // SQLite
    const Database = require('better-sqlite3');
    const fs = require('fs');
    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const sqliteDb = new Database(path.join(__dirname, 'data', 'safety-map.db'));
    sqliteDb.pragma('journal_mode = WAL');
    sqliteDb.pragma('foreign_keys = ON');
    db = new SqliteDatabase(sqliteDb);

    await db.exec(CREATE_TABLES);
    await db.exec(CREATE_INDEXES);

    // マイグレーション
    try { await db.exec("ALTER TABLE sm_reports ADD COLUMN address TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_reports ADD COLUMN admin_status TEXT DEFAULT '投稿'"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_reports ADD COLUMN admin_memo TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_reports ADD COLUMN public_memo TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_users ADD COLUMN password_hash TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_users ADD COLUMN real_name TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_users ADD COLUMN address TEXT DEFAULT ''"); } catch (e) {}
    try { await db.exec("ALTER TABLE sm_users ADD COLUMN phone TEXT DEFAULT ''"); } catch (e) {}

    console.log('SQLite を使用しています');
  }

  // デフォルト管理者の作成
  const adminExists = await db.get('SELECT COUNT(*) as count FROM sm_admins');
  if (parseInt(adminExists.count) === 0) {
    const passwordHash = bcrypt.hashSync('admin2024!change_me', 10);
    await db.run(
      'INSERT INTO sm_admins (id, username, password_hash, display_name) VALUES (?, ?, ?, ?)',
      [uuidv4(), 'admin', passwordHash, '管理者']
    );
    console.log('デフォルト管理者アカウントを作成しました。');
    console.log('ユーザー名: admin / パスワード: admin2024!change_me');
  }

  return db;
}

module.exports = { initDatabase };
