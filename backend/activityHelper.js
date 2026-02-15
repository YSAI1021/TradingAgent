import db from './database.js'

// Activity point values
const ACTIVITY_POINTS = {
  post: 10,
  comment: 5,
  login: 1,
  transaction: 3,
}

/**
 * Record user activity and award points
 * @param {number} userId - User ID
 * @param {string} activityType - Type: 'post', 'comment', 'login', 'transaction'
 * @param {number} referenceId - Optional: ID of related post/comment/transaction
 * @param {string} description - Optional: Description of the activity
 */
export function recordActivity(userId, activityType, referenceId = null, description = null) {
  const points = ACTIVITY_POINTS[activityType] || 0

  if (points === 0) {
    console.warn(`Unknown activity type: ${activityType}`)
    return null
  }

  try {
    // Insert activity log
    const insertLog = db.prepare(`
      INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description)
      VALUES (?, ?, ?, ?, ?)
    `)
    const result = insertLog.run(userId, activityType, points, referenceId, description)

    // Update user's total activity points
    const updatePoints = db.prepare(`
      UPDATE users
      SET activity_points = activity_points + ?
      WHERE id = ?
    `)
    updatePoints.run(points, userId)

    // Check and award badges
    checkAndAwardBadges(userId)

    return {
      id: result.lastInsertRowid,
      points,
      activityType,
    }
  } catch (error) {
    console.error('Error recording activity:', error)
    return null
  }
}

/**
 * Record daily login and update streak
 * @param {number} userId - User ID
 */
export function recordLogin(userId) {
  try {
    const user = db
      .prepare('SELECT last_login_date, login_streak FROM users WHERE id = ?')
      .get(userId)
    const today = new Date().toISOString().split('T')[0]

    if (!user) return null

    // Check if already logged in today
    if (user.last_login_date === today) {
      return { alreadyLoggedToday: true }
    }

    let newStreak = 1
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    const yesterdayStr = yesterday.toISOString().split('T')[0]

    // If logged in yesterday, increment streak
    if (user.last_login_date === yesterdayStr) {
      newStreak = (user.login_streak || 0) + 1
    }

    // Update login info
    const updateLogin = db.prepare(`
      UPDATE users
      SET last_login_date = ?, login_streak = ?
      WHERE id = ?
    `)
    updateLogin.run(today, newStreak, userId)

    // Record activity (awards points)
    const activityResult = recordActivity(
      userId,
      'login',
      null,
      `Login streak: ${newStreak} day${newStreak > 1 ? 's' : ''}`
    )

    // Check for streak-based badges
    checkAndAwardBadges(userId)

    return {
      streak: newStreak,
      points: activityResult?.points || 0,
    }
  } catch (error) {
    console.error('Error recording login:', error)
    return null
  }
}

/**
 * Check user's achievements and award badges
 * @param {number} userId - User ID
 */
export function checkAndAwardBadges(userId) {
  try {
    const user = db
      .prepare('SELECT activity_points, login_streak FROM users WHERE id = ?')
      .get(userId)
    if (!user) return

    // Get user's current badges
    const currentBadges = db
      .prepare(
        `
      SELECT badge_id FROM user_badges WHERE user_id = ?
    `
      )
      .all(userId)
      .map((b) => b.badge_id)

    // Get all badges
    const allBadges = db.prepare('SELECT * FROM badges').all()

    const newBadges = []

    for (const badge of allBadges) {
      // Skip if user already has this badge
      if (currentBadges.includes(badge.id)) continue

      let shouldAward = false

      switch (badge.requirement_type) {
        case 'activity_points':
          shouldAward = user.activity_points >= badge.requirement_value
          break

        case 'post_count': {
          const postCount = db
            .prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?')
            .get(userId)
          shouldAward = postCount.count >= badge.requirement_value
          break
        }

        case 'comment_count': {
          const commentCount = db
            .prepare('SELECT COUNT(*) as count FROM comments WHERE user_id = ?')
            .get(userId)
          shouldAward = commentCount.count >= badge.requirement_value
          break
        }

        case 'transaction_count': {
          const txCount = db
            .prepare('SELECT COUNT(*) as count FROM portfolio_transactions WHERE user_id = ?')
            .get(userId)
          shouldAward = txCount.count >= badge.requirement_value
          break
        }

        case 'login_streak':
          shouldAward = user.login_streak >= badge.requirement_value
          break

        case 'unique_stocks': {
          const uniqueStocks = db
            .prepare(
              `
            SELECT COUNT(DISTINCT symbol) as count
            FROM portfolio_transactions
            WHERE user_id = ? AND transaction_type = 'buy'
          `
            )
            .get(userId)
          shouldAward = uniqueStocks.count >= badge.requirement_value
          break
        }
      }

      if (shouldAward) {
        // Award the badge
        try {
          const insertBadge = db.prepare(`
            INSERT INTO user_badges (user_id, badge_id)
            VALUES (?, ?)
          `)
          insertBadge.run(userId, badge.id)
          newBadges.push(badge)
        } catch (error) {
          // Ignore duplicate badge errors
        }
      }
    }

    return newBadges
  } catch (error) {
    console.error('Error checking badges:', error)
    return []
  }
}

/**
 * Get user's activity summary
 * @param {number} userId - User ID
 */
export function getUserActivitySummary(userId) {
  try {
    const user = db
      .prepare(
        `
      SELECT activity_points, login_streak, last_login_date
      FROM users WHERE id = ?
    `
      )
      .get(userId)

    const activityCounts = {
      posts: db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(userId).count,
      comments: db.prepare('SELECT COUNT(*) as count FROM comments WHERE user_id = ?').get(userId)
        .count,
      transactions: db
        .prepare('SELECT COUNT(*) as count FROM portfolio_transactions WHERE user_id = ?')
        .get(userId).count,
      uniqueStocks: db
        .prepare(
          `
        SELECT COUNT(DISTINCT symbol) as count
        FROM portfolio_transactions
        WHERE user_id = ? AND transaction_type = 'buy'
      `
        )
        .get(userId).count,
    }

    return {
      activityPoints: user.activity_points,
      loginStreak: user.login_streak,
      lastLoginDate: user.last_login_date,
      ...activityCounts,
    }
  } catch (error) {
    console.error('Error getting activity summary:', error)
    return null
  }
}

/**
 * Get user's badges
 * @param {number} userId - User ID
 */
export function getUserBadges(userId) {
  try {
    const badges = db
      .prepare(
        `
      SELECT badges.*, user_badges.earned_at, user_badges.is_displayed
      FROM user_badges
      JOIN badges ON user_badges.badge_id = badges.id
      WHERE user_badges.user_id = ?
      ORDER BY badges.display_order, user_badges.earned_at DESC
    `
      )
      .all(userId)

    return badges
  } catch (error) {
    console.error('Error getting user badges:', error)
    return []
  }
}

/**
 * Get user's current level badge
 * @param {number} userId - User ID
 */
export function getUserLevelBadge(userId) {
  try {
    const user = db.prepare('SELECT activity_points FROM users WHERE id = ?').get(userId)
    if (!user) return null

    // Get the highest level badge the user qualifies for
    const levelBadge = db
      .prepare(
        `
      SELECT * FROM badges
      WHERE badge_type = 'level' AND requirement_value <= ?
      ORDER BY requirement_value DESC
      LIMIT 1
    `
      )
      .get(user.activity_points)

    return levelBadge
  } catch (error) {
    console.error('Error getting level badge:', error)
    return null
  }
}

/**
 * Get activity leaderboard
 * @param {number} limit - Number of users to return
 */
export function getActivityLeaderboard(limit = 10) {
  try {
    const leaderboard = db
      .prepare(
        `
      SELECT
        users.id,
        users.username,
        users.activity_points,
        users.login_streak,
        COUNT(user_badges.id) as badge_count
      FROM users
      LEFT JOIN user_badges ON users.id = user_badges.user_id
      WHERE users.activity_points > 0
      GROUP BY users.id
      ORDER BY users.activity_points DESC, users.login_streak DESC
      LIMIT ?
    `
      )
      .all(limit)

    return leaderboard
  } catch (error) {
    console.error('Error getting leaderboard:', error)
    return []
  }
}
