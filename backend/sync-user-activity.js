import db from './database.js'
import { checkAndAwardBadges } from './activityHelper.js'

// Sync activity for user ID 1 (sizhuang)
const userId = 1

const allPosts = db.prepare('SELECT id, title, created_at FROM posts WHERE user_id = ?').all(userId)
const allComments = db.prepare('SELECT id, created_at FROM comments WHERE user_id = ?').all(userId)
const allTransactions = db
  .prepare(
    'SELECT id, symbol, transaction_type, shares, created_at FROM portfolio_transactions WHERE user_id = ?'
  )
  .all(userId)

let pointsAdded = 0

console.log(
  `Found ${allPosts.length} posts, ${allComments.length} comments, ${allTransactions.length} transactions`
)

// Add activity logs for posts
allPosts.forEach((post) => {
  const insertLog = db.prepare(`
    INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
    VALUES (?, 'post', 10, ?, ?, ?)
  `)
  insertLog.run(userId, post.id, `Created post: ${post.title}`, post.created_at)
  pointsAdded += 10
  console.log(`Added post: ${post.title}`)
})

// Add activity logs for comments
allComments.forEach((comment) => {
  const insertLog = db.prepare(`
    INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
    VALUES (?, 'comment', 5, ?, 'Posted a comment', ?)
  `)
  insertLog.run(userId, comment.id, comment.created_at)
  pointsAdded += 5
  console.log(`Added comment`)
})

// Add activity logs for transactions
allTransactions.forEach((tx) => {
  const insertLog = db.prepare(`
    INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
    VALUES (?, 'transaction', 3, ?, ?, ?)
  `)
  insertLog.run(
    userId,
    tx.id,
    `${tx.transaction_type} ${tx.shares} shares of ${tx.symbol}`,
    tx.created_at
  )
  pointsAdded += 3
  console.log(`Added transaction: ${tx.symbol}`)
})

// Update user's total activity points
db.prepare('UPDATE users SET activity_points = activity_points + ? WHERE id = ?').run(
  pointsAdded,
  userId
)

// Check and award badges
const newBadges = checkAndAwardBadges(userId)

console.log(`\n✓ Sync completed!`)
console.log(`  Points added: ${pointsAdded}`)
console.log(`  New badges: ${newBadges.length}`)
newBadges.forEach((badge) => console.log(`    - ${badge.name}: ${badge.description}`))
