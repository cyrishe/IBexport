/**
 * AI投行专家 — 数据库层
 * 
 * 使用 SQLite（本地开发），迁移到 MySQL 时只需：
 * 1. 安装 mysql2 驱动
 * 2. 修改本文件中的连接方式
 * 3. 微调数据类型（见注释）
 * 
 * @see MIGRATION.md 迁移指南
 */

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, 'data', 'aib_ib_expert.db');

// 确保 data 目录存在
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

let db;

/**
 * 获取数据库连接（单例）
 */
function getDb() {
  if (!db) {
    db = new Database(DB_PATH);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
  }
  return db;
}

/**
 * 执行数据库迁移
 * 
 * 迁移到 MySQL 时，需要替换的数据类型：
 * - TEXT     → TEXT / VARCHAR
 * - INTEGER  → INT / BIGINT
 * - REAL     → DOUBLE / DECIMAL
 * - DATETIME → DATETIME / TIMESTAMP
 */
function migrate() {
  const db = getDb();

  db.exec(`
    -- ============================================================
    -- 用户表
    -- ============================================================
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      phone         TEXT    NOT NULL UNIQUE,
      username      TEXT    NOT NULL,
      password      TEXT    NOT NULL DEFAULT '',
      avatar        TEXT    DEFAULT '',
      level         TEXT    NOT NULL DEFAULT 'bronze',
      streak        INTEGER NOT NULL DEFAULT 0,
      last_checkin  TEXT    DEFAULT NULL,
      total_checkins INTEGER NOT NULL DEFAULT 0,
      is_guest      INTEGER NOT NULL DEFAULT 0,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- MySQL: CREATE INDEX idx_users_phone ON users(phone);
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

    -- ============================================================
    -- 签到记录表
    -- ============================================================
    CREATE TABLE IF NOT EXISTS checkins (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      checkin_date TEXT   NOT NULL,
      streak      INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_checkins_user_date ON checkins(user_id, checkin_date);

    -- ============================================================
    -- 债权投行 — 行业新闻表
    -- ============================================================
    CREATE TABLE IF NOT EXISTS debt_news (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      summary     TEXT    DEFAULT '',
      source      TEXT    DEFAULT '',
      date        TEXT    DEFAULT '',
      category    TEXT    DEFAULT 'debt',
      url         TEXT    DEFAULT '',
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ============================================================
    -- 债权投行 — 业务机会表
    -- ============================================================
    CREATE TABLE IF NOT EXISTS debt_opportunities (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      title         TEXT    NOT NULL,
      description   TEXT    DEFAULT '',
      type          TEXT    DEFAULT '',
      amount        TEXT    DEFAULT '',
      region        TEXT    DEFAULT '',
      status        TEXT    DEFAULT '进行中',
      is_active     INTEGER NOT NULL DEFAULT 1,
      created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ============================================================
    -- 债权投行 — 发行指引表
    -- ============================================================
    CREATE TABLE IF NOT EXISTS debt_guidelines (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      title       TEXT    NOT NULL,
      description TEXT    DEFAULT '',
      authority   TEXT    DEFAULT '',
      category    TEXT    DEFAULT '',
      url         TEXT    DEFAULT '',
      is_active   INTEGER NOT NULL DEFAULT 1,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- ============================================================
    -- 尽调报告表
    -- ============================================================
    CREATE TABLE IF NOT EXISTS due_diligence_reports (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER,
      type        TEXT    NOT NULL DEFAULT 'debt',
      company     TEXT    NOT NULL,
      content     TEXT    DEFAULT '',
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  console.log('[DB] 数据库迁移完成');
}

/**
 * 关闭数据库连接
 */
function closeDb() {
  if (db) {
    db.close();
    db = null;
  }
}

module.exports = {
  getDb,
  migrate,
  closeDb,
  DB_PATH
};
