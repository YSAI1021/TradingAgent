import Database from 'better-sqlite3'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const defaultDbPath = path.join(__dirname, 'trading_platform.db')
const configuredDbPath = typeof process.env.DB_PATH === 'string' ? process.env.DB_PATH.trim() : ''
const dbPath = configuredDbPath ? path.resolve(configuredDbPath) : defaultDbPath

if (configuredDbPath) {
  const targetDir = path.dirname(dbPath)
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true })
  }

  // First-run bootstrap on persistent volume: copy bundled DB schema/data.
  if (!fs.existsSync(dbPath) && fs.existsSync(defaultDbPath) && dbPath !== defaultDbPath) {
    fs.copyFileSync(defaultDbPath, dbPath)
  }
}

const db = new Database(dbPath)

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    share_daily_returns BOOLEAN DEFAULT 0,
    share_full_portfolio BOOLEAN DEFAULT 0,
    activity_points INTEGER DEFAULT 0,
    last_login_date DATE,
    login_streak INTEGER DEFAULT 0
  );

  -- Enforce case-insensitive uniqueness for usernames (allows login/signup without case sensitivity)
  CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_nocase ON users(username COLLATE NOCASE);

  CREATE TABLE IF NOT EXISTS user_ai_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    gemini_api_key TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_user_ai_settings_user_id ON user_ai_settings(user_id);

  CREATE TABLE IF NOT EXISTS user_onboarding_profiles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL UNIQUE,
    investor_type TEXT,
    asset_types TEXT DEFAULT '[]',
    risk_tolerance TEXT,
    decision_horizon TEXT,
    market_focus TEXT,
    baseline_flags TEXT DEFAULT '[]',
    investment_anchor TEXT,
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_onboarding_profiles_user_id ON user_onboarding_profiles(user_id);

  CREATE TABLE IF NOT EXISTS thesis_equities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    bucket TEXT NOT NULL,
    symbol TEXT NOT NULL,
    company TEXT NOT NULL,
    allocation TEXT NOT NULL,
    thesis TEXT NOT NULL,
    validity TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    UNIQUE (user_id, bucket, symbol)
  );

  CREATE INDEX IF NOT EXISTS idx_thesis_equities_user_bucket ON thesis_equities(user_id, bucket);
  CREATE INDEX IF NOT EXISTS idx_thesis_equities_user_symbol ON thesis_equities(user_id, symbol);

  CREATE TABLE IF NOT EXISTS posts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    stock_ticker TEXT,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    is_news BOOLEAN DEFAULT 0,
    news_url TEXT,
    news_source TEXT,
    news_published_at DATETIME,
    news_image_url TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_posts_stock_ticker ON posts(stock_ticker);
  CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts(created_at DESC);

  CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    post_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    parent_comment_id INTEGER,
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (post_id) REFERENCES posts(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (parent_comment_id) REFERENCES comments(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_comments_post_id ON comments(post_id);
  CREATE INDEX IF NOT EXISTS idx_comments_parent_id ON comments(parent_comment_id);
  CREATE INDEX IF NOT EXISTS idx_comments_created_at ON comments(created_at DESC);

  CREATE TABLE IF NOT EXISTS portfolio_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    symbol TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN ('buy', 'sell')),
    shares REAL NOT NULL,
    price_per_share REAL NOT NULL,
    transaction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_portfolio_user_id ON portfolio_transactions(user_id);
  CREATE INDEX IF NOT EXISTS idx_portfolio_symbol ON portfolio_transactions(symbol);
  CREATE INDEX IF NOT EXISTS idx_portfolio_date ON portfolio_transactions(transaction_date DESC);

  CREATE TABLE IF NOT EXISTS daily_portfolio_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    snapshot_date DATE NOT NULL,
    total_value REAL NOT NULL,
    total_cost REAL NOT NULL,
    daily_return REAL NOT NULL,
    portfolio_data TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, snapshot_date)
  );

  CREATE INDEX IF NOT EXISTS idx_snapshots_user_date ON daily_portfolio_snapshots(user_id, snapshot_date DESC);
  CREATE INDEX IF NOT EXISTS idx_snapshots_date ON daily_portfolio_snapshots(snapshot_date DESC);

  CREATE TABLE IF NOT EXISTS historical_stock_prices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    symbol TEXT NOT NULL,
    price_date DATE NOT NULL,
    open_price REAL,
    close_price REAL NOT NULL,
    high_price REAL,
    low_price REAL,
    volume INTEGER,
    fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(symbol, price_date)
  );

  CREATE INDEX IF NOT EXISTS idx_stock_prices_symbol_date ON historical_stock_prices(symbol, price_date DESC);

  CREATE TABLE IF NOT EXISTS badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT NOT NULL,
    icon TEXT NOT NULL,
    badge_type TEXT NOT NULL CHECK(badge_type IN ('level', 'achievement')),
    requirement_type TEXT NOT NULL,
    requirement_value INTEGER NOT NULL,
    color TEXT DEFAULT '#3b82f6',
    display_order INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS user_badges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    badge_id INTEGER NOT NULL,
    earned_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    is_displayed BOOLEAN DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (badge_id) REFERENCES badges(id),
    UNIQUE(user_id, badge_id)
  );

  CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
  CREATE INDEX IF NOT EXISTS idx_user_badges_displayed ON user_badges(user_id, is_displayed);

  CREATE TABLE IF NOT EXISTS user_activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    activity_type TEXT NOT NULL CHECK(activity_type IN ('post', 'comment', 'login', 'transaction')),
    points INTEGER NOT NULL,
    reference_id INTEGER,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE INDEX IF NOT EXISTS idx_activity_log_user_id ON user_activity_log(user_id);
  CREATE INDEX IF NOT EXISTS idx_activity_log_created_at ON user_activity_log(created_at DESC);

  CREATE TABLE IF NOT EXISTS thesis_decision_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    event_type TEXT NOT NULL CHECK(event_type IN ('rule_honored', 'rule_override', 'panic_pause')),
    rule_id INTEGER,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_decision_events_user ON thesis_decision_events(user_id);
  CREATE INDEX IF NOT EXISTS idx_decision_events_type ON thesis_decision_events(user_id, event_type);
  CREATE INDEX IF NOT EXISTS idx_decision_events_date ON thesis_decision_events(created_at DESC);
`)

// Migrate existing tables - add new columns if they don't exist
const migrateDatabase = () => {
  try {
    // Check if activity_points column exists in users table
    const userColumns = db.prepare('PRAGMA table_info(users)').all()
    const hasActivityPoints = userColumns.some((col) => col.name === 'activity_points')
    const hasLastLoginDate = userColumns.some((col) => col.name === 'last_login_date')
    const hasLoginStreak = userColumns.some((col) => col.name === 'login_streak')

    if (!hasActivityPoints) {
      console.log('Adding activity_points column to users table...')
      db.exec('ALTER TABLE users ADD COLUMN activity_points INTEGER DEFAULT 0')
    }

    if (!hasLastLoginDate) {
      console.log('Adding last_login_date column to users table...')
      db.exec('ALTER TABLE users ADD COLUMN last_login_date DATE')
    }

    if (!hasLoginStreak) {
      console.log('Adding login_streak column to users table...')
      db.exec('ALTER TABLE users ADD COLUMN login_streak INTEGER DEFAULT 0')
    }

    // Add news support columns to posts table when missing
    const postColumns = db.prepare('PRAGMA table_info(posts)').all()
    const addPostColumnIfMissing = (name, type) => {
      const hasColumn = postColumns.some((col) => col.name === name)
      if (!hasColumn) {
        console.log(`Adding ${name} column to posts table...`)
        db.exec(`ALTER TABLE posts ADD COLUMN ${name} ${type}`)
      }
    }

    addPostColumnIfMissing('is_news', 'BOOLEAN DEFAULT 0')
    addPostColumnIfMissing('news_url', 'TEXT')
    addPostColumnIfMissing('news_source', 'TEXT')
    addPostColumnIfMissing('news_published_at', 'DATETIME')
    addPostColumnIfMissing('news_image_url', 'TEXT')
    addPostColumnIfMissing('sentiment', 'TEXT DEFAULT "neutral"')
    addPostColumnIfMissing('sentiment_confidence', 'REAL DEFAULT 0')

    // Ensure new tables exist for onboarding and thesis persistence in older DBs.
    db.exec(`
      CREATE TABLE IF NOT EXISTS user_onboarding_profiles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL UNIQUE,
        investor_type TEXT,
        asset_types TEXT DEFAULT '[]',
        risk_tolerance TEXT,
        decision_horizon TEXT,
        market_focus TEXT,
        baseline_flags TEXT DEFAULT '[]',
        investment_anchor TEXT,
        completed_at DATETIME,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS thesis_equities (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id INTEGER NOT NULL,
        bucket TEXT NOT NULL,
        symbol TEXT NOT NULL,
        company TEXT NOT NULL,
        allocation TEXT NOT NULL,
        thesis TEXT NOT NULL,
        validity TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (user_id, bucket, symbol)
      );
    `)

    console.log('✓ Database migration completed')
  } catch (error) {
    console.error('Error during database migration:', error)
  }
}

migrateDatabase()

// Initialize default badges if they don't exist
const initializeBadges = () => {
  const badgeCount = db.prepare('SELECT COUNT(*) as count FROM badges').get()

  if (badgeCount.count === 0) {
    const insertBadge = db.prepare(`
      INSERT INTO badges (name, description, icon, badge_type, requirement_type, requirement_value, color, display_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `)

    // Level badges based on activity points
    insertBadge.run(
      'Member',
      'Active community member',
      '★',
      'level',
      'activity_points',
      0,
      '#94a3b8',
      1
    )
    insertBadge.run(
      'Regular',
      'Regular contributor',
      '★★',
      'level',
      'activity_points',
      50,
      '#3b82f6',
      2
    )
    insertBadge.run(
      'Veteran',
      'Veteran trader',
      '★★★',
      'level',
      'activity_points',
      200,
      '#8b5cf6',
      3
    )
    insertBadge.run('Elite', 'Elite member', '★★★★', 'level', 'activity_points', 500, '#f59e0b', 4)

    // Achievement badges - simplified and professional
    insertBadge.run(
      'First Post',
      'Published first post',
      '✓',
      'achievement',
      'post_count',
      1,
      '#3b82f6',
      10
    )
    insertBadge.run(
      'Active Commenter',
      'Posted 100 comments',
      '✓✓',
      'achievement',
      'comment_count',
      100,
      '#8b5cf6',
      11
    )
    insertBadge.run(
      'Portfolio Tracker',
      'Recorded 50 transactions',
      '✓✓',
      'achievement',
      'transaction_count',
      50,
      '#10b981',
      12
    )
    insertBadge.run(
      '7-Day Streak',
      '7 consecutive logins',
      '✓',
      'achievement',
      'login_streak',
      7,
      '#ef4444',
      13
    )
    insertBadge.run(
      '30-Day Streak',
      '30 consecutive logins',
      '✓✓',
      'achievement',
      'login_streak',
      30,
      '#f59e0b',
      14
    )
    insertBadge.run(
      'Diversified',
      '5+ different stocks',
      '✓',
      'achievement',
      'unique_stocks',
      5,
      '#06b6d4',
      15
    )

    console.log('✓ Default badges initialized')
  }
}

initializeBadges()

export default db
