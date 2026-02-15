import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const db = new Database(path.join(__dirname, 'trading_platform.db'))

console.log('Running database migrations...')

try {
  // Check if columns exist, if not add them
  const userColumns = db.prepare('PRAGMA table_info(users)').all()
  const hasShareDailyReturns = userColumns.some((col) => col.name === 'share_daily_returns')
  const hasShareFullPortfolio = userColumns.some((col) => col.name === 'share_full_portfolio')

  if (!hasShareDailyReturns) {
    console.log('Adding share_daily_returns column to users table...')
    db.exec('ALTER TABLE users ADD COLUMN share_daily_returns BOOLEAN DEFAULT 0')
  }

  if (!hasShareFullPortfolio) {
    console.log('Adding share_full_portfolio column to users table...')
    db.exec('ALTER TABLE users ADD COLUMN share_full_portfolio BOOLEAN DEFAULT 0')
  }

  // Check if daily_portfolio_snapshots table exists
  const tables = db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='daily_portfolio_snapshots'"
    )
    .all()

  if (tables.length === 0) {
    console.log('Creating daily_portfolio_snapshots table...')
    db.exec(`
      CREATE TABLE daily_portfolio_snapshots (
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

      CREATE INDEX idx_snapshots_user_date ON daily_portfolio_snapshots(user_id, snapshot_date DESC);
      CREATE INDEX idx_snapshots_date ON daily_portfolio_snapshots(snapshot_date DESC);
    `)
  }

  console.log('Database migration completed successfully!')
} catch (error) {
  console.error('Migration error:', error)
  process.exit(1)
}

db.close()
