import db from '../database.js'
import crypto from 'crypto'

const CONFIG = {
  numUsers: 100,
  sessionsPerUser: 5,
  clickRateA: 0.60,
  clickRateB: 0.45,
}

const getVariation = (userId, testId) => {
  const hash = crypto.createHash('md5').update(`${userId}-${testId}`).digest('hex')
  const hashInt = parseInt(hash.substring(0, 8), 16)
  return hashInt % 2 === 0 ? 'A' : 'B'
}

const generateTimestamp = (daysAgo = 0, addMinutes = 0) => {
  const date = new Date()
  date.setDate(date.getDate() - daysAgo)
  date.setMinutes(date.getMinutes() + addMinutes)
  return date.toISOString()
}

const createTestUsers = () => {
  console.log('Creating test users...')
  let created = 0

  for (let i = 1; i <= CONFIG.numUsers; i++) {
    const username = `test_user_${i}`
    const email = `test_user_${i}@example.com`
    const password_hash = '$2a$10$abcdefghijklmnopqrstuvwxyz123456'

    try {
      const stmt = db.prepare(`
        INSERT OR IGNORE INTO users (username, email, password_hash)
        VALUES (?, ?, ?)
      `)
      const result = stmt.run(username, email, password_hash)
      if (result.changes > 0) created++
    } catch (error) {
      console.error(`Error creating user ${username}:`, error.message)
    }
  }

  console.log(`Created ${created} new users`)
}

const generateTestData = () => {
  console.log('Generating test data...')

  const users = db.prepare("SELECT id FROM users WHERE username LIKE 'test_user_%'").all()

  let totalImpressions = 0
  let totalConversionsA = 0
  let totalConversionsB = 0

  const tests = [
    {
      id: 'button_color_test',
      targetAction: 'button_click',
    },
    {
      id: 'homepage_layout_test',
      targetAction: 'explore_stocks',
    },
  ]

  const userIds = users.map((u) => u.id).join(',')
  if (userIds) {
    db.prepare(`DELETE FROM ab_test_impressions WHERE user_id IN (${userIds})`).run()
    db.prepare(`DELETE FROM ab_test_events WHERE user_id IN (${userIds})`).run()
  }

  tests.forEach((test) => {
    users.forEach((user) => {
      const variation = getVariation(user.id, test.id)
      const clickRate = variation === 'A' ? CONFIG.clickRateA : CONFIG.clickRateB

      for (let session = 0; session < CONFIG.sessionsPerUser; session++) {
        const daysAgo = Math.floor(Math.random() * 7)
        const minutesOffset = Math.floor(Math.random() * 1440)
        const timestamp = generateTimestamp(daysAgo, minutesOffset)

        try {
          const stmt = db.prepare(`
            INSERT INTO ab_test_impressions (user_id, test_id, variation, timestamp)
            VALUES (?, ?, ?, ?)
          `)
          stmt.run(user.id, test.id, variation, timestamp)
          totalImpressions++
        } catch (error) {
          console.error('Error inserting impression:', error.message)
        }

        if (Math.random() < clickRate) {
          try {
            const eventTimestamp = generateTimestamp(daysAgo, minutesOffset + 1)
            const stmt = db.prepare(`
              INSERT INTO ab_test_events (user_id, test_id, variation, event_type, timestamp)
              VALUES (?, ?, ?, ?, ?)
            `)
            stmt.run(user.id, test.id, variation, test.targetAction, eventTimestamp)

            if (variation === 'A') totalConversionsA++
            else totalConversionsB++
          } catch (error) {
            console.error('Error inserting event:', error.message)
          }
        }
      }
    })
  })

  console.log('Data generation complete')
  console.log(`Total impressions: ${totalImpressions}`)
  console.log(`Conversions A: ${totalConversionsA}`)
  console.log(`Conversions B: ${totalConversionsB}`)
}

const displayAnalytics = () => {
  console.log('\nAnalytics:')
  console.log('-------------------')

  const tests = ['button_color_test', 'homepage_layout_test']

  tests.forEach((testId) => {
    console.log(`\n${testId}:`)

    ;['A', 'B'].forEach((variation) => {
      const impressions = db
        .prepare(
          'SELECT COUNT(*) as count FROM ab_test_impressions WHERE test_id = ? AND variation = ?'
        )
        .get(testId, variation)

      const events = db
        .prepare(
          'SELECT COUNT(*) as count FROM ab_test_events WHERE test_id = ? AND variation = ?'
        )
        .get(testId, variation)

      const impressionCount = impressions?.count || 0
      const eventCount = events?.count || 0
      const conversionRate =
        impressionCount > 0 ? ((eventCount / impressionCount) * 100).toFixed(2) : 0

      console.log(
        `  Variation ${variation}: ${impressionCount} impressions, ${eventCount} conversions (${conversionRate}%)`
      )
    })
  })
}

try {
  createTestUsers()
  generateTestData()
  displayAnalytics()
  console.log('\nDone')
} catch (error) {
  console.error('Error:', error)
  process.exit(1)
}
