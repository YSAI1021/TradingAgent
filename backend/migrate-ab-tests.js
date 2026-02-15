import db from './database.js'

console.log('Running A/B testing migration...')

try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS ab_test_impressions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      test_id TEXT NOT NULL,
      variation TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  console.log('Created ab_test_impressions table')

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_impressions_user_test 
    ON ab_test_impressions(user_id, test_id)
  `)

  db.exec(`
    CREATE TABLE IF NOT EXISTS ab_test_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      test_id TEXT,
      variation TEXT,
      event_type TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )
  `)
  console.log('Created ab_test_events table')

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_user_test_event 
    ON ab_test_events(user_id, test_id, event_type)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_impressions_test_variation 
    ON ab_test_impressions(test_id, variation)
  `)

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_events_test_variation 
    ON ab_test_events(test_id, variation)
  `)

  console.log('Migration completed successfully')
} catch (error) {
  console.error('Migration failed:', error)
  process.exit(1)
}
