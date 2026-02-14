import db from './database.js'

export async function createPostOptimized(userId, title, content, tickers) {
  const stmt = db.prepare(
    'INSERT INTO posts (user_id, title, content, tickers) VALUES (?, ?, ?, ?)'
  )
  const result = stmt.run(userId, title, content, JSON.stringify(tickers))
  const postId = result.lastInsertRowid
  
  Promise.all([
    recordActivityAsync(userId, postId, 10),
    ingestNewsAsync(tickers)
  ]).catch(err => console.error('Background task failed:', err))
  
  return postId
}

async function recordActivityAsync(userId, postId, points) {
  try {
    const stmt = db.prepare(
      'INSERT INTO user_activity_log (user_id, activity_type, points, reference_id) VALUES (?, ?, ?, ?)'
    )
    stmt.run(userId, 'post', points, postId)
    
    const updateStmt = db.prepare('UPDATE users SET activity_points = activity_points + ? WHERE id = ?')
    updateStmt.run(points, userId)
  } catch (err) {
    console.error('Activity logging failed:', err)
  }
}

async function ingestNewsAsync(tickers) {
  if (!tickers || tickers.length === 0) return
  
  try {
    console.log('Ingesting news for:', tickers)
  } catch (err) {
    console.error('News ingestion failed:', err)
  }
}

export async function getUserDashboardOptimized(userId) {
  const queries = {
    user: new Promise((resolve) => {
      try {
        const user = db.prepare(
          'SELECT id, username, email, activity_points FROM users WHERE id = ?'
        ).get(userId)
        resolve(user)
      } catch (err) {
        resolve(null)
      }
    }),
    
    portfolio: new Promise((resolve) => {
      try {
        const portfolio = db.prepare(
          'SELECT symbol, total_shares, average_cost FROM portfolio WHERE user_id = ?'
        ).all(userId)
        resolve(portfolio)
      } catch (err) {
        resolve([])
      }
    }),
    
    posts: new Promise((resolve) => {
      try {
        const posts = db.prepare(
          'SELECT id, title, created_at FROM posts WHERE user_id = ? ORDER BY created_at DESC LIMIT 5'
        ).all(userId)
        resolve(posts)
      } catch (err) {
        resolve([])
      }
    }),
    
    activity: new Promise((resolve) => {
      try {
        const summary = db.prepare(
          'SELECT COUNT(*) as count, SUM(points) as total FROM user_activity_log WHERE user_id = ?'
        ).get(userId)
        resolve(summary)
      } catch (err) {
        resolve({ count: 0, total: 0 })
      }
    })
  }
  
  const [user, portfolio, posts, activity] = await Promise.all(Object.values(queries))
  
  return { user, portfolio, posts, activity }
}
