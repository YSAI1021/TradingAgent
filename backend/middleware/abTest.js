import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { fileURLToPath } from 'url'
import db from '../database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let testsConfig = null

const loadTestsConfig = () => {
  try {
    const configPath = path.join(__dirname, '..', 'tests.json')
    const data = fs.readFileSync(configPath, 'utf8')
    testsConfig = JSON.parse(data)
    return testsConfig
  } catch (error) {
    console.error('Error loading tests.json:', error)
    return { tests: [] }
  }
}

loadTestsConfig()

const watchTestsConfig = () => {
  const configPath = path.join(__dirname, '..', 'tests.json')
  fs.watch(configPath, (eventType) => {
    if (eventType === 'change') {
      console.log('tests.json changed, reloading...')
      loadTestsConfig()
    }
  })
}

if (process.env.NODE_ENV !== 'production') {
  watchTestsConfig()
}

const getVariationForUser = (userId, testId, variations) => {
  const hash = crypto.createHash('md5').update(`${userId}-${testId}`).digest('hex')
  const hashInt = parseInt(hash.substring(0, 8), 16)
  const index = hashInt % variations.length
  return variations[index]
}

export const abTestMiddleware = (req, res, next) => {
  if (!req.user || !req.user.id) {
    return next()
  }

  const userId = req.user.id
  const config = testsConfig || loadTestsConfig()
  
  req.abTests = {}

  config.tests
    .filter((test) => test.active)
    .forEach((test) => {
      const variation = getVariationForUser(userId, test.id, test.variations)
      req.abTests[test.id] = {
        testId: test.id,
        variation: variation,
        testName: test.name,
        metadata: test.metadata[`variation${variation}`] || {},
      }
    })

  next()
}

export const abTestLog = (testId) => {
  return (req, res, next) => {
    if (!req.user || !req.abTests || !req.abTests[testId]) {
      return next()
    }

    const userId = req.user.id
    const variation = req.abTests[testId].variation
    const timestamp = new Date().toISOString()

    try {
      const stmt = db.prepare(`
        INSERT INTO ab_test_impressions (user_id, test_id, variation, timestamp)
        VALUES (?, ?, ?, ?)
      `)
      stmt.run(userId, testId, variation, timestamp)
    } catch (error) {
      console.error('Error logging impression:', error)
    }

    next()
  }
}

export const eventLogger = (eventType, testId = null) => {
  return (req, res, next) => {
    if (!req.user) {
      return next()
    }

    const userId = req.user.id
    const timestamp = new Date().toISOString()

    try {
      if (testId && req.abTests && req.abTests[testId]) {
        const variation = req.abTests[testId].variation
        
        const stmt = db.prepare(`
          INSERT INTO ab_test_events (user_id, test_id, variation, event_type, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `)
        stmt.run(userId, testId, variation, eventType, timestamp)
      } else {
        const stmt = db.prepare(`
          INSERT INTO ab_test_events (user_id, test_id, variation, event_type, timestamp)
          VALUES (?, ?, ?, ?, ?)
        `)
        stmt.run(userId, null, null, eventType, timestamp)
      }
    } catch (error) {
      console.error('Error logging event:', error)
    }

    next()
  }
}

export const getUserTestAssignments = (userId) => {
  const config = testsConfig || loadTestsConfig()
  const assignments = {}

  config.tests
    .filter((test) => test.active)
    .forEach((test) => {
      const variation = getVariationForUser(userId, test.id, test.variations)
      assignments[test.id] = {
        testId: test.id,
        testName: test.name,
        variation: variation,
        metadata: test.metadata[`variation${variation}`] || {},
      }
    })

  return assignments
}

export const getTestAnalytics = () => {
  try {
    const config = testsConfig || loadTestsConfig()
    const results = []

    config.tests.forEach((test) => {
      const testResults = {
        testId: test.id,
        testName: test.name,
        description: test.description,
        active: test.active,
        variations: {},
      }

      test.variations.forEach((variation) => {
        const impressions = db
          .prepare(
            'SELECT COUNT(*) as count FROM ab_test_impressions WHERE test_id = ? AND variation = ?'
          )
          .get(test.id, variation)

        const conversions = db
          .prepare(
            'SELECT COUNT(*) as count FROM ab_test_events WHERE test_id = ? AND variation = ? AND event_type = ?'
          )
          .get(test.id, variation, test.targetAction)

        const uniqueUsers = db
          .prepare(
            'SELECT COUNT(DISTINCT user_id) as count FROM ab_test_impressions WHERE test_id = ? AND variation = ?'
          )
          .get(test.id, variation)

        const impressionCount = impressions?.count || 0
        const conversionCount = conversions?.count || 0
        const conversionRate =
          impressionCount > 0 ? ((conversionCount / impressionCount) * 100).toFixed(2) : 0

        testResults.variations[variation] = {
          impressions: impressionCount,
          conversions: conversionCount,
          conversionRate: `${conversionRate}%`,
          uniqueUsers: uniqueUsers?.count || 0,
          metadata: test.metadata[`variation${variation}`] || {},
        }
      })

      results.push(testResults)
    })

    return results
  } catch (error) {
    console.error('Error getting analytics:', error)
    return []
  }
}

export default {
  abTestMiddleware,
  abTestLog,
  eventLogger,
  getUserTestAssignments,
  getTestAnalytics,
}
