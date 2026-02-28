import express from 'express'
import cors from 'cors'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import 'dotenv/config'
import db from './database.js'
import { getAssetProxyContext, resolveMarketDataSymbol } from './assetProxy.js'
import {
  recordActivity,
  recordLogin,
  getUserActivitySummary,
  getUserBadges,
  getUserLevelBadge,
  getActivityLeaderboard,
  checkAndAwardBadges,
} from './activityHelper.js'

// Node 18 compatibility for dependencies that expect a global File implementation.
if (typeof globalThis.File === 'undefined') {
  globalThis.File = class File {
    constructor(parts = [], name = '', options = {}) {
      this.parts = parts
      this.name = name
      this.lastModified = options.lastModified || Date.now()
      this.type = options.type || ''
    }
  }
}

const { ingestNewsForTickers } = await import('./newsService.js')
const { chatWithAI, extractTickers, analyzeNewsSentiment } = await import('./aiService.js')

const app = express()
const PORT = process.env.PORT || 3000
const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production'
const THESIS_BUCKETS = new Set(['Equities', 'Real Estate', 'Crypto'])
const NEWS_AUTO_SYNC_TTL_MS = 30 * 60 * 1000
const NEWS_STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000
const newsAutoSyncState = new Map()

const USER_RULE_MAX_CHARS = 200
const USER_RULE_CATEGORIES = new Set(['Macro', 'Earnings', 'Risk', 'Behavior'])
const USER_RULE_STATUSES = new Set(['Active', 'Triggered'])

const classifyUserRuleCategory = (condition, action) => {
  const text = `${condition} ${action}`.toLowerCase()
  if (/earnings|guidance|quarter|q[1-4]|report/.test(text)) return 'Earnings'
  if (/panic|emotion|discipline|override|fomo|hesitat/.test(text)) return 'Behavior'
  if (/vix|inflation|macro|fed|rate|yield|oil|dollar/.test(text)) return 'Macro'
  return 'Risk'
}

const safeParseJsonArray = (value) => {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

const normalizeNewsTicker = (value) => {
  const raw = String(value || '').trim().toUpperCase()
  if (!raw) return ''
  const marketSymbol = resolveMarketDataSymbol(raw)
  const base = String(marketSymbol || raw)
    .toUpperCase()
    .split('-')[0]
  const cleaned = base.replace(/[^A-Z0-9]/g, '')
  if (/^[A-Z]{1,6}$/.test(cleaned)) return cleaned

  const fallback = raw.replace(/[^A-Z0-9]/g, '')
  return /^[A-Z]{1,6}$/.test(fallback) ? fallback : ''
}

const shouldAutoSyncNews = (ticker) => {
  const now = Date.now()
  const last = newsAutoSyncState.get(ticker) || 0
  if (now - last < NEWS_AUTO_SYNC_TTL_MS) return false
  newsAutoSyncState.set(ticker, now)
  return true
}

// CORS configuration (supports comma-separated origins in FRONTEND_URL)
const allowedOrigins = (process.env.FRONTEND_URL || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean)

const matchesAllowedOrigin = (origin) => {
  return allowedOrigins.some((allowedOrigin) => {
    if (allowedOrigin === '*') return true
    if (allowedOrigin === origin) return true

    // Support simple wildcard patterns like https://*.vercel.app
    if (allowedOrigin.includes('*')) {
      const pattern = `^${allowedOrigin.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`
      return new RegExp(pattern).test(origin)
    }

    return false
  })
}

const corsOptions = {
  origin: (origin, callback) => {
    // Allow server-to-server requests and non-browser clients (no Origin header)
    if (!origin) return callback(null, true)

    // If no allowlist is configured, allow all origins by default
    if (allowedOrigins.length === 0) return callback(null, true)

    if (matchesAllowedOrigin(origin)) return callback(null, true)

    return callback(new Error(`CORS blocked for origin: ${origin}`))
  },
  credentials: true,
}

app.use(cors(corsOptions))
app.use(express.json())

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization']
  const token = authHeader && authHeader.split(' ')[1]

  if (!token) {
    return res.status(401).json({ error: 'Access token required' })
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error('JWT verification failed:', err.message)
      return res.status(403).json({ error: 'Invalid or expired token' })
    }

    let existingUser = db
      .prepare('SELECT id, username FROM users WHERE id = ?')
      .get(user.id)

    // Recovery path: token id may become stale if database was reset/restored,
    // but username still exists. Remap to preserve user session continuity.
    if (!existingUser && typeof user.username === 'string' && user.username.trim()) {
      existingUser = db
        .prepare('SELECT id, username FROM users WHERE username = ? COLLATE NOCASE')
        .get(user.username.trim())
      if (existingUser) {
        console.warn(
          `Recovered session by username mapping: token id ${user.id} -> db id ${existingUser.id} (${existingUser.username})`
        )
      }
    }

    if (!existingUser) {
      console.warn('JWT user not found in database:', user.id)
      return res.status(401).json({ error: 'User account not found. Please log in again.' })
    }

    req.user = { id: existingUser.id, username: existingUser.username }
    next()
  })
}

// ============== Authentication Routes ==============

// Sign up
app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, email, password } = req.body

    if (!username || !email || !password) {
      return res.status(400).json({ error: 'All fields are required' })
    }

    const normalizedUsername = String(username).trim().toLowerCase()
    const normalizedEmail = String(email).trim()

    if (!normalizedUsername) {
      return res.status(400).json({ error: 'Username is required' })
    }

    // Case-insensitive username uniqueness check for a clearer error message
    const existing = db
      .prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE LIMIT 1')
      .get(normalizedUsername)
    if (existing) {
      return res.status(409).json({ error: 'Username already exists' })
    }

    const hashedPassword = await bcrypt.hash(password, 10)

    const stmt = db.prepare('INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)')
    const result = stmt.run(normalizedUsername, normalizedEmail, hashedPassword)

    const token = jwt.sign({ id: result.lastInsertRowid, username: normalizedUsername }, JWT_SECRET, {
      expiresIn: '7d',
    })

    // Get the created user with created_at
    const newUser = db
      .prepare('SELECT id, username, email, created_at FROM users WHERE id = ?')
      .get(result.lastInsertRowid)

    res.status(201).json({
      message: 'User created successfully',
      token,
      user: newUser,
    })
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json({ error: 'Username or email already exists' })
    } else {
      res.status(500).json({ error: 'Server error' })
    }
  }
})

// Login
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body

    const normalizedUsername = String(username || '').trim()
    const user = db
      .prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE')
      .get(normalizedUsername)

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' })
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, {
      expiresIn: '7d',
    })

    // Record login and update streak
    const loginResult = recordLogin(user.id)

    // Auto-sync historical activity if user has 0 points but has posts/comments/transactions
    if (user.activity_points === 0) {
      const posts = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(user.id)
      const comments = db
        .prepare('SELECT COUNT(*) as count FROM comments WHERE user_id = ?')
        .get(user.id)
      const transactions = db
        .prepare('SELECT COUNT(*) as count FROM portfolio_transactions WHERE user_id = ?')
        .get(user.id)

      const hasActivity = posts.count > 0 || comments.count > 0 || transactions.count > 0

      if (hasActivity) {
        // Sync historical activity
        try {
          const allPosts = db
            .prepare('SELECT id, title, created_at FROM posts WHERE user_id = ?')
            .all(user.id)
          const allComments = db
            .prepare('SELECT id, created_at FROM comments WHERE user_id = ?')
            .all(user.id)
          const allTransactions = db
            .prepare(
              'SELECT id, symbol, transaction_type, shares, created_at FROM portfolio_transactions WHERE user_id = ?'
            )
            .all(user.id)

          let pointsAdded = 0

          // Add activity logs for posts
          allPosts.forEach((post) => {
            const insertLog = db.prepare(`
              INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
              VALUES (?, 'post', 10, ?, ?, ?)
            `)
            insertLog.run(user.id, post.id, `Created post: ${post.title}`, post.created_at)
            pointsAdded += 10
          })

          // Add activity logs for comments
          allComments.forEach((comment) => {
            const insertLog = db.prepare(`
              INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
              VALUES (?, 'comment', 5, ?, 'Posted a comment', ?)
            `)
            insertLog.run(user.id, comment.id, comment.created_at)
            pointsAdded += 5
          })

          // Add activity logs for transactions
          allTransactions.forEach((tx) => {
            const insertLog = db.prepare(`
              INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
              VALUES (?, 'transaction', 3, ?, ?, ?)
            `)
            insertLog.run(
              user.id,
              tx.id,
              `${tx.transaction_type} ${tx.shares} shares of ${tx.symbol}`,
              tx.created_at
            )
            pointsAdded += 3
          })

          // Update user's total activity points
          db.prepare('UPDATE users SET activity_points = activity_points + ? WHERE id = ?').run(
            pointsAdded,
            user.id
          )

          // Check and award badges
          checkAndAwardBadges(user.id)

          console.log(`Auto-synced ${pointsAdded} points for user ${user.username}`)
        } catch (syncError) {
          console.error('Error auto-syncing activity:', syncError)
        }
      }
    }

    // Get updated user data
    const updatedUser = db
      .prepare(
        'SELECT id, username, email, created_at, activity_points, login_streak FROM users WHERE id = ?'
      )
      .get(user.id)

    res.json({
      token,
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        created_at: updatedUser.created_at,
        activity_points: updatedUser.activity_points,
        login_streak: loginResult?.streak || updatedUser.login_streak,
      },
      loginBonus: loginResult,
    })
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ============== Posts Routes ==============

// Get all posts
app.get('/api/posts', (req, res) => {
  try {
    const { stock_ticker } = req.query

    let query = `
      SELECT posts.*, users.username,
        (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) as comment_count
      FROM posts
      JOIN users ON posts.user_id = users.id
    `

    if (stock_ticker) {
      query += ' WHERE posts.stock_ticker = ?'
      const posts = db.prepare(query + ' ORDER BY posts.created_at DESC').all(stock_ticker)
      return res.json(posts)
    }

    const posts = db.prepare(query + ' ORDER BY posts.created_at DESC').all()
    res.json(posts)
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
})

// Fetch news-only posts (auto-sync per ticker when empty/stale)
app.get('/api/news', async (req, res) => {
  try {
    const { stock_ticker, ticker, limit } = req.query
    const selectedTickerRaw = stock_ticker || ticker
    const limitNum = Math.min(parseInt(limit, 10) || 10, 20)

    let query = `
      SELECT posts.*, users.username,
        (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) as comment_count
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.is_news = 1
    `

    if (selectedTickerRaw) {
      const selectedTicker = normalizeNewsTicker(selectedTickerRaw)
      if (!selectedTicker) {
        return res.status(400).json({ error: 'Invalid ticker' })
      }

      query += ' AND posts.stock_ticker = ?'
      const statement = db.prepare(query + ' ORDER BY posts.news_published_at DESC, posts.created_at DESC LIMIT ?')

      let newsPosts = statement.all(selectedTicker, limitNum)
      const latestPublishedAt = newsPosts[0]?.news_published_at || newsPosts[0]?.created_at
      const latestTs = latestPublishedAt ? new Date(latestPublishedAt).getTime() : 0
      const stale = !latestTs || Number.isNaN(latestTs) || Date.now() - latestTs > NEWS_STALE_THRESHOLD_MS
      const needSync = newsPosts.length === 0 || stale

      if (needSync && shouldAutoSyncNews(selectedTicker)) {
        try {
          await ingestNewsForTickers([selectedTicker])
          newsPosts = statement.all(selectedTicker, limitNum)
        } catch (ingestError) {
          console.error(`Auto ingest failed for ${selectedTicker}:`, ingestError.message)
        }
      }

      return res.json(newsPosts)
    }

    const newsPosts = db
      .prepare(query + ' ORDER BY posts.news_published_at DESC, posts.created_at DESC LIMIT ?')
      .all(limitNum)
    res.json(newsPosts)
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
})

// Ingest external news for watchlist tickers and store as news posts
app.post('/api/news/ingest', authenticateToken, async (req, res) => {
  try {
    const { tickers } = req.body
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: 'Provide at least one ticker' })
    }

    const { inserted, skipped, tickers: normalizedTickers } = await ingestNewsForTickers(tickers)

    res.json({
      message: 'News synced',
      tickers: normalizedTickers,
      inserted_count: inserted.length,
      skipped_count: skipped.length,
      posts: inserted,
    })
  } catch (error) {
    console.error('Error ingesting news:', error)
    res.status(500).json({ error: 'Failed to fetch news' })
  }
})

// Re-analyze sentiment for existing news articles using user's API key
app.post('/api/news/update-sentiment', authenticateToken, async (req, res) => {
  try {
    const { apiKey } = req.body

    if (!apiKey) {
      return res.status(400).json({ error: 'API key is required' })
    }

    // Get news articles with neutral or null sentiment
    const newsToUpdate = db
      .prepare(
        `
        SELECT id, stock_ticker, title, content
        FROM posts
        WHERE is_news = 1
          AND (sentiment IS NULL OR sentiment = 'neutral' OR sentiment = '')
        ORDER BY created_at DESC
        LIMIT 100
      `
      )
      .all()

    if (newsToUpdate.length === 0) {
      return res.json({ message: 'All news articles already have sentiment', updated: 0, total: 0 })
    }

    const updateStmt = db.prepare(
      'UPDATE posts SET sentiment = ?, sentiment_confidence = ? WHERE id = ?'
    )

    let updatedCount = 0
    let processedCount = 0
    const results = []

    console.log(`Starting sentiment analysis for ${newsToUpdate.length} news articles...`)

    for (const news of newsToUpdate) {
      try {
        processedCount++
        console.log(`[${processedCount}/${newsToUpdate.length}] Analyzing: ${news.title.substring(0, 40)}...`)

        const analysis = await analyzeNewsSentiment(news.title, news.content, news.stock_ticker, apiKey)

        // Update database with sentiment (even if neutral)
        updateStmt.run(analysis.sentiment, analysis.confidence, news.id)

        if (analysis.sentiment && analysis.sentiment !== 'neutral') {
          updatedCount++
        }

        results.push({
          id: news.id,
          ticker: news.stock_ticker,
          title: news.title.substring(0, 50) + '...',
          sentiment: analysis.sentiment,
          confidence: analysis.confidence,
        })

        console.log(`  -> ${analysis.sentiment} (${(analysis.confidence * 100).toFixed(0)}%)`)
      } catch (err) {
        console.error(`Failed to analyze sentiment for news ${news.id}:`, err.message)
      }
    }

    console.log(`Sentiment analysis complete: ${updatedCount} bullish/bearish, ${processedCount - updatedCount} neutral`)

    res.json({
      message: `Analyzed ${processedCount} news articles, ${updatedCount} have bullish/bearish sentiment`,
      updated: updatedCount,
      total: processedCount,
      results,
    })
  } catch (error) {
    console.error('Error updating news sentiment:', error)
    res.status(500).json({ error: 'Failed to update sentiment' })
  }
})

// Get single post
app.get('/api/posts/:id', (req, res) => {
  try {
    const post = db
      .prepare(
        `
      SELECT posts.*, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.id = ?
    `
      )
      .get(req.params.id)

    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    res.json(post)
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
})

// Create post (requires authentication)
app.post('/api/posts', authenticateToken, (req, res) => {
  try {
    const { stock_ticker, title, content } = req.body

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' })
    }

    // Validate stock ticker format only if provided (basic validation)
    if (stock_ticker && !/^[A-Z]{1,5}$/.test(stock_ticker)) {
      return res
        .status(400)
        .json({ error: 'Invalid stock ticker format (use uppercase letters, 1-5 characters)' })
    }

    const stmt = db.prepare(
      'INSERT INTO posts (user_id, stock_ticker, title, content) VALUES (?, ?, ?, ?)'
    )
    const result = stmt.run(req.user.id, stock_ticker || null, title, content)

    // Record activity
    recordActivity(req.user.id, 'post', result.lastInsertRowid, `Created post: ${title}`)

    const newPost = db
      .prepare(
        `
      SELECT posts.*, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.id = ?
    `
      )
      .get(result.lastInsertRowid)

    res.status(201).json(newPost)
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
})

// Update post (requires authentication)
app.put('/api/posts/:id', authenticateToken, (req, res) => {
  try {
    const { title, content, stock_ticker } = req.body
    const postId = req.params.id

    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId)

    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    if (post.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to edit this post' })
    }

    const stmt = db.prepare(
      'UPDATE posts SET title = ?, content = ?, stock_ticker = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?'
    )
    stmt.run(title, content, stock_ticker || null, postId)

    const updatedPost = db
      .prepare(
        `
      SELECT posts.*, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.id = ?
    `
      )
      .get(postId)

    res.json(updatedPost)
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
})

// Delete post (requires authentication)
app.delete('/api/posts/:id', authenticateToken, (req, res) => {
  try {
    const postId = req.params.id

    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId)

    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    if (post.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this post' })
    }

    db.prepare('DELETE FROM posts WHERE id = ?').run(postId)

    res.json({ message: 'Post deleted successfully' })
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ============== Comments Routes ==============

// Get comments for a post
app.get('/api/posts/:postId/comments', (req, res) => {
  try {
    const comments = db
      .prepare(
        `
      SELECT comments.*, users.username
      FROM comments
      JOIN users ON comments.user_id = users.id
      WHERE comments.post_id = ?
      ORDER BY comments.created_at ASC
    `
      )
      .all(req.params.postId)

    res.json(comments)
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
})

// Create comment (requires authentication)
app.post('/api/posts/:postId/comments', authenticateToken, (req, res) => {
  try {
    const { content, parent_comment_id } = req.body
    const postId = req.params.postId

    if (!content) {
      return res.status(400).json({ error: 'Content is required' })
    }

    // Check if post exists
    const post = db.prepare('SELECT * FROM posts WHERE id = ?').get(postId)
    if (!post) {
      return res.status(404).json({ error: 'Post not found' })
    }

    // If parent_comment_id is provided, verify it exists and belongs to the same post
    if (parent_comment_id) {
      const parentComment = db
        .prepare('SELECT * FROM comments WHERE id = ? AND post_id = ?')
        .get(parent_comment_id, postId)
      if (!parentComment) {
        return res.status(404).json({ error: 'Parent comment not found' })
      }
    }

    const stmt = db.prepare(
      'INSERT INTO comments (post_id, user_id, parent_comment_id, content) VALUES (?, ?, ?, ?)'
    )
    const result = stmt.run(postId, req.user.id, parent_comment_id || null, content)

    // Record activity
    recordActivity(req.user.id, 'comment', result.lastInsertRowid, `Commented on post #${postId}`)

    const newComment = db
      .prepare(
        `
      SELECT comments.*, users.username
      FROM comments
      JOIN users ON comments.user_id = users.id
      WHERE comments.id = ?
    `
      )
      .get(result.lastInsertRowid)

    res.status(201).json(newComment)
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
})

// Delete comment (requires authentication)
app.delete('/api/comments/:id', authenticateToken, (req, res) => {
  try {
    const commentId = req.params.id

    const comment = db.prepare('SELECT * FROM comments WHERE id = ?').get(commentId)

    if (!comment) {
      return res.status(404).json({ error: 'Comment not found' })
    }

    if (comment.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this comment' })
    }

    db.prepare('DELETE FROM comments WHERE id = ?').run(commentId)

    res.json({ message: 'Comment deleted successfully' })
  } catch (error) {
    res.status(500).json({ error: 'Server error' })
  }
})

// ============== Portfolio Routes ==============

// Get all portfolio transactions for a user
app.get('/api/portfolio/transactions', authenticateToken, (req, res) => {
  try {
    const transactions = db
      .prepare(
        `
      SELECT *
      FROM portfolio_transactions
      WHERE user_id = ?
      ORDER BY transaction_date DESC
    `
      )
      .all(req.user.id)

    res.json(transactions)
  } catch (error) {
    console.error('Error fetching transactions:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get portfolio summary (grouped by symbol)
app.get('/api/portfolio/summary', authenticateToken, (req, res) => {
  try {
    const transactions = db
      .prepare(
        `
      SELECT symbol, transaction_type, shares, price_per_share
      FROM portfolio_transactions
      WHERE user_id = ?
      ORDER BY symbol, transaction_date
    `
      )
      .all(req.user.id)

    // Calculate holdings for each symbol
    const holdings = {}

    transactions.forEach((tx) => {
      if (!holdings[tx.symbol]) {
        holdings[tx.symbol] = {
          symbol: tx.symbol,
          totalShares: 0,
          totalCost: 0,
        }
      }

      if (tx.transaction_type === 'buy') {
        holdings[tx.symbol].totalShares += tx.shares
        holdings[tx.symbol].totalCost += tx.shares * tx.price_per_share
      } else if (tx.transaction_type === 'sell') {
        // Calculate average cost before selling
        const avgCost =
          holdings[tx.symbol].totalShares > 0
            ? holdings[tx.symbol].totalCost / holdings[tx.symbol].totalShares
            : 0

        holdings[tx.symbol].totalShares -= tx.shares
        holdings[tx.symbol].totalCost -= tx.shares * avgCost
      }
    })

    // Filter out symbols with zero or negative shares
    const portfolio = Object.values(holdings)
      .filter((holding) => holding.totalShares > 0)
      .map((holding) => ({
        symbol: holding.symbol,
        shares: holding.totalShares,
        averageCost: holding.totalCost / holding.totalShares,
      }))

    res.json(portfolio)
  } catch (error) {
    console.error('Error calculating portfolio summary:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Add a new transaction
app.post('/api/portfolio/transactions', authenticateToken, (req, res) => {
  try {
    const { symbol, transaction_type, shares, price_per_share, transaction_date } = req.body

    if (!symbol || !transaction_type || !shares || !price_per_share) {
      return res.status(400).json({ error: 'All fields are required' })
    }

    if (transaction_type !== 'buy' && transaction_type !== 'sell') {
      return res.status(400).json({ error: 'Transaction type must be "buy" or "sell"' })
    }

    if (shares <= 0 || price_per_share <= 0) {
      return res.status(400).json({ error: 'Shares and price must be positive numbers' })
    }

    // Validate stock symbol format
    if (!/^[A-Z]{1,5}$/.test(symbol)) {
      return res
        .status(400)
        .json({ error: 'Invalid stock symbol format (use uppercase letters, 1-5 characters)' })
    }

    // Validate transaction_date if provided
    let finalTransactionDate = null
    if (transaction_date) {
      const date = new Date(transaction_date)
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' })
      }
      // Check if date is not in the future
      if (date > new Date()) {
        return res.status(400).json({ error: 'Transaction date cannot be in the future' })
      }
      finalTransactionDate = transaction_date
    }

    const stmt = db.prepare(`
      INSERT INTO portfolio_transactions (user_id, symbol, transaction_type, shares, price_per_share, transaction_date)
      VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `)
    const result = stmt.run(
      req.user.id,
      symbol,
      transaction_type,
      shares,
      price_per_share,
      finalTransactionDate
    )

    // Record activity
    recordActivity(
      req.user.id,
      'transaction',
      result.lastInsertRowid,
      `${transaction_type} ${shares} shares of ${symbol}`
    )

    const newTransaction = db
      .prepare(
        `
      SELECT * FROM portfolio_transactions WHERE id = ?
    `
      )
      .get(result.lastInsertRowid)

    res.status(201).json(newTransaction)
  } catch (error) {
    console.error('Error creating transaction:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Delete a transaction
app.delete('/api/portfolio/transactions/:id', authenticateToken, (req, res) => {
  try {
    const transactionId = req.params.id

    const transaction = db
      .prepare('SELECT * FROM portfolio_transactions WHERE id = ?')
      .get(transactionId)

    if (!transaction) {
      return res.status(404).json({ error: 'Transaction not found' })
    }

    if (transaction.user_id !== req.user.id) {
      return res.status(403).json({ error: 'Not authorized to delete this transaction' })
    }

    db.prepare('DELETE FROM portfolio_transactions WHERE id = ?').run(transactionId)

    res.json({ message: 'Transaction deleted successfully' })
  } catch (error) {
    console.error('Error deleting transaction:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// ============== Stock Price API ==============

function toUnixSeconds(dateInput) {
  return Math.floor(new Date(dateInput).getTime() / 1000)
}

function parseCloseSeries(result) {
  const timestamps = result?.timestamp || []
  const closes = result?.indicators?.quote?.[0]?.close || []
  const series = []
  for (let i = 0; i < timestamps.length; i++) {
    if (closes[i] == null) continue
    series.push({ timestamp: timestamps[i], close: closes[i] })
  }
  return series
}

async function fetchYahooChart(symbol, query) {
  const response = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?${query}`)
  if (!response.ok) {
    throw new Error(`Yahoo chart fetch failed: ${response.status}`)
  }
  return response.json()
}

// Proxy chart data (frontend chart can call this and avoid CORS/reliability issues)
app.get('/api/stock/chart/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params
    const { marketSymbol } = getAssetProxyContext(symbol)
    const range = req.query.range || '1mo'
    const interval = req.query.interval || '1d'
    const params = new URLSearchParams({
      range: String(range),
      interval: String(interval),
    })

    const data = await fetchYahooChart(marketSymbol, params.toString())
    res.json(data)
  } catch (error) {
    console.error('Error fetching stock chart:', error)
    res.status(500).json({ error: 'Failed to fetch stock chart' })
  }
})

// Get current (or historical close) stock price
app.get('/api/stock/price/:symbol', async (req, res) => {
  try {
    const { symbol } = req.params
    const { requestedSymbol, marketSymbol, proxyUsed } = getAssetProxyContext(symbol)
    const { date } = req.query

    if (date) {
      const target = new Date(String(date))
      if (Number.isNaN(target.getTime())) {
        return res.status(400).json({ error: 'Invalid date format' })
      }

      const dayStart = new Date(target)
      dayStart.setUTCHours(0, 0, 0, 0)
      const dayEnd = new Date(target)
      dayEnd.setUTCHours(23, 59, 59, 999)
      const period1 = toUnixSeconds(new Date(dayStart.getTime() - 3 * 24 * 60 * 60 * 1000))
      const period2 = toUnixSeconds(new Date(dayEnd.getTime() + 3 * 24 * 60 * 60 * 1000))

      const params = new URLSearchParams({
        interval: '1d',
        period1: String(period1),
        period2: String(period2),
      })
      const data = await fetchYahooChart(marketSymbol, params.toString())
      const result = data?.chart?.result?.[0]
      if (!result) return res.status(404).json({ error: 'Price not found' })

      const series = parseCloseSeries(result)
      const targetDateStr = dayStart.toISOString().slice(0, 10)
      let match = series.find((p) => new Date(p.timestamp * 1000).toISOString().slice(0, 10) === targetDateStr)

      if (!match) {
        // fallback to latest close before selected date
        match = series
          .filter((p) => p.timestamp <= toUnixSeconds(dayEnd))
          .sort((a, b) => b.timestamp - a.timestamp)[0]
      }

      if (!match) return res.status(404).json({ error: 'Historical price not found' })

      return res.json({
        symbol: requestedSymbol,
        marketSymbol,
        proxyUsed,
        price: match.close,
        currency: result?.meta?.currency || 'USD',
        marketState: 'HISTORICAL',
        previousClose: result?.meta?.previousClose || match.close,
        requestedDate: String(date),
        priceDate: new Date(match.timestamp * 1000).toISOString().slice(0, 10),
      })
    }

    const params = new URLSearchParams({
      interval: '1d',
      range: '1d',
    })
    const data = await fetchYahooChart(marketSymbol, params.toString())
    const result = data?.chart?.result?.[0]
    const price = result?.meta?.regularMarketPrice
    if (!result || !price) {
      return res.status(404).json({ error: 'Price not found' })
    }

    res.json({
      symbol: requestedSymbol,
      marketSymbol,
      proxyUsed,
      price,
      currency: result?.meta?.currency,
      marketState: result?.meta?.marketState,
      previousClose: result?.meta?.previousClose,
    })
  } catch (error) {
    console.error('Error fetching stock price:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// ============== Competition/Leaderboard Routes ==============

// Update user's sharing preferences
app.put('/api/user/sharing-preferences', authenticateToken, (req, res) => {
  try {
    const { share_daily_returns, share_full_portfolio } = req.body

    const stmt = db.prepare(`
      UPDATE users
      SET share_daily_returns = ?, share_full_portfolio = ?
      WHERE id = ?
    `)
    stmt.run(share_daily_returns ? 1 : 0, share_full_portfolio ? 1 : 0, req.user.id)

    res.json({
      message: 'Sharing preferences updated',
      share_daily_returns,
      share_full_portfolio,
    })
  } catch (error) {
    console.error('Error updating sharing preferences:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get user's sharing preferences
app.get('/api/user/sharing-preferences', authenticateToken, (req, res) => {
  try {
    const user = db
      .prepare(
        `
      SELECT share_daily_returns, share_full_portfolio
      FROM users
      WHERE id = ?
    `
      )
      .get(req.user.id)

    if (!user) {
      return res.status(404).json({ error: 'User not found' })
    }

    res.json({
      share_daily_returns: Boolean(user.share_daily_returns),
      share_full_portfolio: Boolean(user.share_full_portfolio),
    })
  } catch (error) {
    console.error('Error fetching sharing preferences:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Save daily portfolio snapshot
app.post('/api/portfolio/snapshot', authenticateToken, (req, res) => {
  try {
    const { total_value, total_cost, daily_return, portfolio_data } = req.body
    const today = new Date().toISOString().split('T')[0]

    // Upsert snapshot for today (atomic - avoids race condition with delete+insert)
    const stmt = db.prepare(`
      INSERT INTO daily_portfolio_snapshots
      (user_id, snapshot_date, total_value, total_cost, daily_return, portfolio_data)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id, snapshot_date) DO UPDATE SET
        total_value = excluded.total_value,
        total_cost = excluded.total_cost,
        daily_return = excluded.daily_return,
        portfolio_data = excluded.portfolio_data
    `)

    const result = stmt.run(
      req.user.id,
      today,
      total_value,
      total_cost,
      daily_return,
      JSON.stringify(portfolio_data)
    )

    res.status(201).json({
      message: 'Snapshot saved',
      id: result.lastInsertRowid,
    })
  } catch (error) {
    console.error('Error saving snapshot:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get portfolio snapshots for charting
app.get('/api/portfolio/snapshots', authenticateToken, (req, res) => {
  try {
    const { days } = req.query
    const daysNum = Math.max(1, Math.min(parseInt(days, 10) || 3650, 3650))
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - daysNum)
    const cutoffDate = cutoff.toISOString().split('T')[0]

    const snapshots = db
      .prepare(
        `
      SELECT id, snapshot_date, total_value, total_cost, daily_return, portfolio_data
      FROM daily_portfolio_snapshots
      WHERE user_id = ? AND snapshot_date >= ?
      ORDER BY snapshot_date ASC
    `
      )
      .all(req.user.id, cutoffDate)

    res.json(snapshots)
  } catch (error) {
    console.error('Error fetching portfolio snapshots:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Generate historical snapshots based on transactions
app.post('/api/portfolio/generate-historical-snapshots', authenticateToken, async (req, res) => {
  try {
    // Get all transactions for this user
    const transactions = db
      .prepare(
        `
      SELECT symbol, transaction_type, shares, price_per_share, transaction_date
      FROM portfolio_transactions
      WHERE user_id = ?
      ORDER BY transaction_date ASC
    `
      )
      .all(req.user.id)

    if (transactions.length === 0) {
      return res.json({ message: 'No transactions found', snapshots_created: 0 })
    }

    // Get unique dates
    const uniqueDates = [...new Set(transactions.map((t) => t.transaction_date.split(' ')[0]))]

    // Sort dates
    uniqueDates.sort()

    let snapshotsCreated = 0

    // For each date, calculate portfolio state at end of that day
    for (const date of uniqueDates) {
      // Get all transactions up to and including this date
      const txUpToDate = transactions.filter((tx) => {
        const txDate = tx.transaction_date.split(' ')[0]
        return txDate <= date
      })

      // Calculate holdings
      const holdings = {}
      txUpToDate.forEach((tx) => {
        if (!holdings[tx.symbol]) {
          holdings[tx.symbol] = { totalShares: 0, totalCost: 0 }
        }

        if (tx.transaction_type === 'buy') {
          holdings[tx.symbol].totalShares += tx.shares
          holdings[tx.symbol].totalCost += tx.shares * tx.price_per_share
        } else if (tx.transaction_type === 'sell') {
          const avgCost =
            holdings[tx.symbol].totalShares > 0
              ? holdings[tx.symbol].totalCost / holdings[tx.symbol].totalShares
              : 0
          holdings[tx.symbol].totalShares -= tx.shares
          holdings[tx.symbol].totalCost -= tx.shares * avgCost
        }
      })

      // Filter positive holdings
      const portfolio = Object.entries(holdings)
        .filter(([_, h]) => h.totalShares > 0)
        .map(([symbol, h]) => ({
          symbol,
          shares: h.totalShares,
          averageCost: h.totalCost / h.totalShares,
        }))

      if (portfolio.length === 0) continue

      // Fetch current prices for all symbols
      let totalValue = 0
      let totalCost = 0

      const portfolioData = []

      for (const holding of portfolio) {
        try {
          const marketSymbol = resolveMarketDataSymbol(holding.symbol)
          // Fetch price
          const response = await fetch(
            `https://query1.finance.yahoo.com/v8/finance/chart/${marketSymbol}?interval=1d&range=1d`
          )
          const data = await response.json()

          let currentPrice = holding.averageCost // fallback to avg cost

          if (data.chart && data.chart.result && data.chart.result[0]) {
            const result = data.chart.result[0]
            currentPrice = result.meta.regularMarketPrice || holding.averageCost
          }

          const value = holding.shares * currentPrice
          const cost = holding.shares * holding.averageCost

          totalValue += value
          totalCost += cost

          portfolioData.push({
            symbol: holding.symbol,
            shares: holding.shares,
            averageCost: holding.averageCost,
            currentPrice: currentPrice,
          })
        } catch (err) {
          console.error(`Error fetching price for ${holding.symbol}:`, err)
          // Use average cost as fallback
          const cost = holding.shares * holding.averageCost
          totalValue += cost
          totalCost += cost

          portfolioData.push({
            symbol: holding.symbol,
            shares: holding.shares,
            averageCost: holding.averageCost,
            currentPrice: holding.averageCost,
          })
        }
      }

      const dailyReturn = totalValue - totalCost

      // Delete existing snapshot for this date
      db.prepare(
        'DELETE FROM daily_portfolio_snapshots WHERE user_id = ? AND snapshot_date = ?'
      ).run(req.user.id, date)

      // Insert snapshot
      const stmt = db.prepare(`
        INSERT INTO daily_portfolio_snapshots
        (user_id, snapshot_date, total_value, total_cost, daily_return, portfolio_data)
        VALUES (?, ?, ?, ?, ?, ?)
      `)

      stmt.run(req.user.id, date, totalValue, totalCost, dailyReturn, JSON.stringify(portfolioData))

      snapshotsCreated++
    }

    res.json({
      message: 'Historical snapshots generated',
      snapshots_created: snapshotsCreated,
      dates: uniqueDates,
    })
  } catch (error) {
    console.error('Error generating historical snapshots:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get leaderboard data (only users who opted in) - Calculate on the fly
app.get('/api/leaderboard', async (req, res) => {
  try {
    const { days = 30 } = req.query
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days))
    const cutoffDateStr = cutoffDate.toISOString().split('T')[0]
    const todayStr = new Date().toISOString().split('T')[0]

    // Get users who opted in to share daily returns
    const users = db
      .prepare(
        `
      SELECT id, username, share_full_portfolio
      FROM users
      WHERE share_daily_returns = 1
    `
      )
      .all()

    const leaderboardData = []

    for (const user of users) {
      // Get all transactions for this user
      const transactions = db
        .prepare(
          `
        SELECT symbol, transaction_type, shares, price_per_share, transaction_date
        FROM portfolio_transactions
        WHERE user_id = ?
        ORDER BY transaction_date ASC
      `
        )
        .all(user.id)

      if (transactions.length === 0) continue

      // Get earliest transaction date
      const firstTxDate = transactions[0].transaction_date.split(' ')[0]
      const startDate = firstTxDate > cutoffDateStr ? firstTxDate : cutoffDateStr

      // Get all unique symbols
      const symbols = [...new Set(transactions.map((t) => t.symbol))]

      // Fetch historical prices for all symbols
      await fetchHistoricalPrices(symbols, startDate, todayStr)

      // Generate daily performance data
      const performanceData = []
      const currentDate = new Date(startDate)
      const endDate = new Date(todayStr)

      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0]

        // Calculate portfolio value on this date (including weekends)
        const portfolioValue = calculatePortfolioValue(transactions, dateStr, user.id)

        // Always add a data point, even if portfolio is empty
        let returnPct = 0
        if (portfolioValue.totalCost > 0) {
          returnPct =
            ((portfolioValue.totalValue - portfolioValue.totalCost) / portfolioValue.totalCost) *
            100
        }

        performanceData.push({
          date: dateStr,
          value: portfolioValue.totalValue,
          return: returnPct,
          portfolio: user.share_full_portfolio ? portfolioValue.holdings : null,
        })

        currentDate.setDate(currentDate.getDate() + 1)
      }

      if (performanceData.length > 0) {
        const currentReturn = performanceData[performanceData.length - 1].return

        leaderboardData.push({
          username: user.username,
          currentReturn,
          shareFullPortfolio: Boolean(user.share_full_portfolio),
          performanceData,
        })
      }
    }

    // Sort by current return (highest first)
    leaderboardData.sort((a, b) => b.currentReturn - a.currentReturn)

    res.json(leaderboardData)
  } catch (error) {
    console.error('Error fetching leaderboard:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Helper function to fetch and cache historical prices
async function fetchHistoricalPrices(symbols, startDate, endDate) {
  for (const symbol of symbols) {
    const marketSymbol = resolveMarketDataSymbol(symbol)

    // Check if we already have prices for this symbol in the date range
    const existingPrices = db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM historical_stock_prices
      WHERE symbol = ? AND price_date >= ? AND price_date <= ?
    `
      )
      .get(symbol, startDate, endDate)

    // If we don't have all the prices, fetch them
    if (existingPrices.count < 1) {
      try {
        // Calculate days between start and end
        const start = new Date(startDate)
        const end = new Date(endDate)
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24))
        const range = Math.max(daysDiff + 5, 30) // Add buffer

        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${marketSymbol}?interval=1d&range=${range}d`
        )

        if (!response.ok) continue

        const data = await response.json()

        if (data.chart && data.chart.result && data.chart.result[0]) {
          const result = data.chart.result[0]
          const timestamps = result.timestamp || []
          const quotes = result.indicators.quote[0]

          for (let i = 0; i < timestamps.length; i++) {
            const priceDate = new Date(timestamps[i] * 1000).toISOString().split('T')[0]
            const closePrice = quotes.close[i]
            const openPrice = quotes.open[i]
            const highPrice = quotes.high[i]
            const lowPrice = quotes.low[i]
            const volume = quotes.volume[i]

            if (closePrice && priceDate >= startDate && priceDate <= endDate) {
              // Insert or ignore if already exists
              try {
                db.prepare(
                  `
                  INSERT OR IGNORE INTO historical_stock_prices
                  (symbol, price_date, open_price, close_price, high_price, low_price, volume)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `
                ).run(symbol, priceDate, openPrice, closePrice, highPrice, lowPrice, volume)
              } catch (err) {
                // Ignore duplicate errors
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching prices for ${symbol} (market ${marketSymbol}):`, err)
      }
    }
  }
}

// Helper function to calculate portfolio value on a specific date
function calculatePortfolioValue(transactions, targetDate, userId) {
  // Get all transactions up to target date
  const txUpToDate = transactions.filter((tx) => {
    const txDate = tx.transaction_date.split(' ')[0]
    return txDate <= targetDate
  })

  if (txUpToDate.length === 0) {
    return { totalValue: 0, totalCost: 0, holdings: [] }
  }

  // Calculate holdings
  const holdings = {}
  txUpToDate.forEach((tx) => {
    if (!holdings[tx.symbol]) {
      holdings[tx.symbol] = { totalShares: 0, totalCost: 0 }
    }

    if (tx.transaction_type === 'buy') {
      holdings[tx.symbol].totalShares += tx.shares
      holdings[tx.symbol].totalCost += tx.shares * tx.price_per_share
    } else if (tx.transaction_type === 'sell') {
      const avgCost =
        holdings[tx.symbol].totalShares > 0
          ? holdings[tx.symbol].totalCost / holdings[tx.symbol].totalShares
          : 0
      holdings[tx.symbol].totalShares -= tx.shares
      holdings[tx.symbol].totalCost -= tx.shares * avgCost
    }
  })

  let totalValue = 0
  let totalCost = 0
  const portfolioHoldings = []

  for (const [symbol, holding] of Object.entries(holdings)) {
    if (holding.totalShares <= 0) continue

    const avgCost = holding.totalCost / holding.totalShares

    // Get historical price for this date (or most recent price before this date)
    // This ensures weekends use Friday's closing price
    const priceData = db
      .prepare(
        `
      SELECT close_price
      FROM historical_stock_prices
      WHERE symbol = ? AND price_date <= ?
      ORDER BY price_date DESC
      LIMIT 1
    `
      )
      .get(symbol, targetDate)

    const price = priceData ? priceData.close_price : avgCost

    totalValue += holding.totalShares * price
    totalCost += holding.totalCost

    portfolioHoldings.push({
      symbol,
      shares: holding.totalShares,
      averageCost: avgCost,
      currentPrice: price,
    })
  }

  return {
    totalValue,
    totalCost,
    holdings: portfolioHoldings,
  }
}

// Get market index data (S&P 500 as benchmark)
app.get('/api/market/benchmark', async (req, res) => {
  try {
    const { days = 30 } = req.query

    // Calculate date range
    const endDate = new Date()
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(days))

    const symbol = '^GSPC' // S&P 500 symbol

    // Fetch historical data from Yahoo Finance
    const range = Math.max(parseInt(days) + 10, 30)
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}d`
    )

    if (!response.ok) {
      return res.status(response.status).json({ error: 'Failed to fetch benchmark data' })
    }

    const data = await response.json()

    if (data.chart && data.chart.result && data.chart.result[0]) {
      const result = data.chart.result[0]
      const timestamps = result.timestamp
      const prices = result.indicators.quote[0].close

      // Create a map of date -> price
      const priceMap = {}
      for (let i = 0; i < timestamps.length; i++) {
        if (prices[i]) {
          const date = new Date(timestamps[i] * 1000).toISOString().split('T')[0]
          priceMap[date] = prices[i]
        }
      }

      // Find base price (first available price)
      const basePrice = prices.find((p) => p != null)

      if (!basePrice) {
        return res.status(404).json({ error: 'Benchmark data not found' })
      }

      // Generate continuous daily data (including weekends)
      const benchmarkData = []
      const currentDate = new Date(startDate)
      let lastKnownPrice = basePrice

      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split('T')[0]

        // Use actual price if available, otherwise use last known price
        const price = priceMap[dateStr] || lastKnownPrice
        if (priceMap[dateStr]) {
          lastKnownPrice = price
        }

        const returnPct = ((price - basePrice) / basePrice) * 100

        benchmarkData.push({
          date: dateStr,
          return: returnPct,
        })

        currentDate.setDate(currentDate.getDate() + 1)
      }

      res.json(benchmarkData)
    } else {
      res.status(404).json({ error: 'Benchmark data not found' })
    }
  } catch (error) {
    console.error('Error fetching benchmark:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// ============== Activity & Badge Routes ==============

// Get user's activity summary
app.get('/api/user/activity', authenticateToken, (req, res) => {
  try {
    const summary = getUserActivitySummary(req.user.id)
    res.json(summary)
  } catch (error) {
    console.error('Error fetching activity summary:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get user's activity log/history
app.get('/api/user/activity/log', authenticateToken, (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query

    const activityLog = db
      .prepare(
        `
      SELECT * FROM user_activity_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `
      )
      .all(req.user.id, parseInt(limit), parseInt(offset))

    res.json(activityLog)
  } catch (error) {
    console.error('Error fetching activity log:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get user's badges
app.get('/api/user/badges', authenticateToken, (req, res) => {
  try {
    const badges = getUserBadges(req.user.id)
    res.json(badges)
  } catch (error) {
    console.error('Error fetching badges:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get another user's badges (public)
app.get('/api/user/:userId/badges', (req, res) => {
  try {
    const badges = getUserBadges(parseInt(req.params.userId))
    res.json(badges)
  } catch (error) {
    console.error('Error fetching user badges:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get user's level badge
app.get('/api/user/level-badge', authenticateToken, (req, res) => {
  try {
    const levelBadge = getUserLevelBadge(req.user.id)
    res.json(levelBadge)
  } catch (error) {
    console.error('Error fetching level badge:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get all available badges
app.get('/api/badges', (req, res) => {
  try {
    const badges = db.prepare('SELECT * FROM badges ORDER BY display_order').all()
    res.json(badges)
  } catch (error) {
    console.error('Error fetching badges:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Get activity leaderboard
app.get('/api/leaderboard/activity', (req, res) => {
  try {
    const { limit = 10 } = req.query
    const leaderboard = getActivityLeaderboard(parseInt(limit))
    res.json(leaderboard)
  } catch (error) {
    console.error('Error fetching activity leaderboard:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Manually trigger badge check (useful for testing)
app.post('/api/user/check-badges', authenticateToken, (req, res) => {
  try {
    const newBadges = checkAndAwardBadges(req.user.id)
    res.json({
      message: 'Badge check completed',
      newBadges: newBadges.length,
      badges: newBadges,
    })
  } catch (error) {
    console.error('Error checking badges:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// Sync historical activity (backfill points for existing data)
app.post('/api/user/sync-activity', authenticateToken, (req, res) => {
  try {
    // Get user's existing posts, comments, and transactions
    const posts = db
      .prepare('SELECT id, title, created_at FROM posts WHERE user_id = ?')
      .all(req.user.id)
    const comments = db
      .prepare('SELECT id, created_at FROM comments WHERE user_id = ?')
      .all(req.user.id)
    const transactions = db
      .prepare(
        'SELECT id, symbol, transaction_type, shares, created_at FROM portfolio_transactions WHERE user_id = ?'
      )
      .all(req.user.id)

    // Check if activity log already exists for these items
    const existingPostLogs = db
      .prepare(
        'SELECT reference_id FROM user_activity_log WHERE user_id = ? AND activity_type = "post"'
      )
      .all(req.user.id)
      .map((r) => r.reference_id)
    const existingCommentLogs = db
      .prepare(
        'SELECT reference_id FROM user_activity_log WHERE user_id = ? AND activity_type = "comment"'
      )
      .all(req.user.id)
      .map((r) => r.reference_id)
    const existingTransactionLogs = db
      .prepare(
        'SELECT reference_id FROM user_activity_log WHERE user_id = ? AND activity_type = "transaction"'
      )
      .all(req.user.id)
      .map((r) => r.reference_id)

    let pointsAdded = 0

    // Add activity logs for posts that don't have logs yet
    posts.forEach((post) => {
      if (!existingPostLogs.includes(post.id)) {
        const insertLog = db.prepare(`
          INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
          VALUES (?, 'post', 10, ?, ?, ?)
        `)
        insertLog.run(req.user.id, post.id, `Created post: ${post.title}`, post.created_at)
        pointsAdded += 10
      }
    })

    // Add activity logs for comments
    comments.forEach((comment) => {
      if (!existingCommentLogs.includes(comment.id)) {
        const insertLog = db.prepare(`
          INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
          VALUES (?, 'comment', 5, ?, 'Posted a comment', ?)
        `)
        insertLog.run(req.user.id, comment.id, comment.created_at)
        pointsAdded += 5
      }
    })

    // Add activity logs for transactions
    transactions.forEach((tx) => {
      if (!existingTransactionLogs.includes(tx.id)) {
        const insertLog = db.prepare(`
          INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
          VALUES (?, 'transaction', 3, ?, ?, ?)
        `)
        insertLog.run(
          req.user.id,
          tx.id,
          `${tx.transaction_type} ${tx.shares} shares of ${tx.symbol}`,
          tx.created_at
        )
        pointsAdded += 3
      }
    })

    // Update user's total activity points
    db.prepare('UPDATE users SET activity_points = activity_points + ? WHERE id = ?').run(
      pointsAdded,
      req.user.id
    )

    // Check and award badges
    const newBadges = checkAndAwardBadges(req.user.id)

    res.json({
      message: 'Activity synced successfully',
      pointsAdded,
      postsProcessed: posts.length,
      commentsProcessed: comments.length,
      transactionsProcessed: transactions.length,
      newBadges: newBadges.length,
      badges: newBadges,
    })
  } catch (error) {
    console.error('Error syncing activity:', error)
    res.status(500).json({ error: 'Server error' })
  }
})

// ============== Onboarding & Thesis Routes ==============

app.get('/api/user/onboarding', authenticateToken, (req, res) => {
  try {
    const profile = db
      .prepare(
        `
      SELECT investor_type, asset_types, risk_tolerance, decision_horizon, market_focus,
             baseline_flags, investment_anchor, completed_at, updated_at
      FROM user_onboarding_profiles
      WHERE user_id = ?
    `
      )
      .get(req.user.id)

    if (!profile) {
      return res.json({
        investorType: '',
        assetTypes: [],
        riskTolerance: '',
        decisionHorizon: '',
        marketFocus: '',
        baselineFlags: [],
        investmentAnchor: '',
        completedAt: null,
      })
    }

    res.json({
      investorType: profile.investor_type || '',
      assetTypes: safeParseJsonArray(profile.asset_types),
      riskTolerance: profile.risk_tolerance || '',
      decisionHorizon: profile.decision_horizon || '',
      marketFocus: profile.market_focus || '',
      baselineFlags: safeParseJsonArray(profile.baseline_flags),
      investmentAnchor: profile.investment_anchor || '',
      completedAt: profile.completed_at || null,
      updatedAt: profile.updated_at || null,
    })
  } catch (error) {
    console.error('Error fetching onboarding profile:', error)
    res.status(500).json({ error: 'Failed to fetch onboarding profile' })
  }
})

app.put('/api/user/onboarding', authenticateToken, (req, res) => {
  try {
    const investorType = typeof req.body.investorType === 'string' ? req.body.investorType.trim() : ''
    const assetTypes = Array.isArray(req.body.assetTypes)
      ? req.body.assetTypes.map((item) => String(item || '').trim()).filter(Boolean)
      : []
    const riskTolerance =
      typeof req.body.riskTolerance === 'string' ? req.body.riskTolerance.trim() : ''
    const decisionHorizon =
      typeof req.body.decisionHorizon === 'string' ? req.body.decisionHorizon.trim() : ''
    const marketFocus = typeof req.body.marketFocus === 'string' ? req.body.marketFocus.trim() : ''
    const baselineFlags = Array.isArray(req.body.baselineFlags)
      ? req.body.baselineFlags.map((item) => String(item || '').trim()).filter(Boolean)
      : []
    const investmentAnchor =
      typeof req.body.investmentAnchor === 'string' ? req.body.investmentAnchor.trim() : ''
    const completedAt = typeof req.body.completedAt === 'string' ? req.body.completedAt : null

    db.prepare(
      `
      INSERT INTO user_onboarding_profiles (
        user_id, investor_type, asset_types, risk_tolerance, decision_horizon, market_focus,
        baseline_flags, investment_anchor, completed_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id)
      DO UPDATE SET
        investor_type = excluded.investor_type,
        asset_types = excluded.asset_types,
        risk_tolerance = excluded.risk_tolerance,
        decision_horizon = excluded.decision_horizon,
        market_focus = excluded.market_focus,
        baseline_flags = excluded.baseline_flags,
        investment_anchor = excluded.investment_anchor,
        completed_at = excluded.completed_at,
        updated_at = CURRENT_TIMESTAMP
    `
    ).run(
      req.user.id,
      investorType,
      JSON.stringify(assetTypes),
      riskTolerance,
      decisionHorizon,
      marketFocus,
      JSON.stringify(baselineFlags),
      investmentAnchor,
      completedAt
    )

    res.json({
      message: 'Onboarding profile saved',
      profile: {
        investorType,
        assetTypes,
        riskTolerance,
        decisionHorizon,
        marketFocus,
        baselineFlags,
        investmentAnchor,
        completedAt,
      },
    })
  } catch (error) {
    console.error('Error saving onboarding profile:', error)
    res.status(500).json({ error: 'Failed to save onboarding profile' })
  }
})

app.get('/api/thesis/equities', authenticateToken, (req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT id, bucket, symbol, company, allocation, thesis, validity, created_at, updated_at
      FROM thesis_equities
      WHERE user_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(req.user.id)

    res.json(rows)
  } catch (error) {
    console.error('Error fetching thesis equities:', error)
    res.status(500).json({ error: 'Failed to fetch thesis equities' })
  }
})

app.post('/api/thesis/equities', authenticateToken, (req, res) => {
  try {
    const bucket = typeof req.body.bucket === 'string' ? req.body.bucket.trim() : ''
    const symbol = typeof req.body.symbol === 'string' ? req.body.symbol.trim().toUpperCase() : ''
    const company = typeof req.body.company === 'string' ? req.body.company.trim() : ''
    const allocation = typeof req.body.allocation === 'string' ? req.body.allocation.trim() : ''
    const thesis = typeof req.body.thesis === 'string' ? req.body.thesis.trim() : ''
    const validity = typeof req.body.validity === 'string' ? req.body.validity.trim() : ''

    if (!THESIS_BUCKETS.has(bucket)) {
      return res.status(400).json({ error: 'Invalid bucket' })
    }
    if (!symbol || !company || !allocation || !thesis || !validity) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    const existing = db
      .prepare(
        `
      SELECT id
      FROM thesis_equities
      WHERE user_id = ? AND bucket = ? AND symbol = ?
    `
      )
      .get(req.user.id, bucket, symbol)

    let rowId = existing?.id
    if (existing) {
      db.prepare(
        `
        UPDATE thesis_equities
        SET company = ?, allocation = ?, thesis = ?, validity = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND user_id = ?
      `
      ).run(company, allocation, thesis, validity, existing.id, req.user.id)
    } else {
      const insertResult = db
        .prepare(
          `
        INSERT INTO thesis_equities (user_id, bucket, symbol, company, allocation, thesis, validity)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `
        )
        .run(req.user.id, bucket, symbol, company, allocation, thesis, validity)
      rowId = insertResult.lastInsertRowid
    }

    const saved = db
      .prepare(
        `
      SELECT id, bucket, symbol, company, allocation, thesis, validity, created_at, updated_at
      FROM thesis_equities
      WHERE id = ? AND user_id = ?
    `
      )
      .get(rowId, req.user.id)

    res.status(201).json(saved)
  } catch (error) {
    console.error('Error saving thesis equity:', error)
    if (error?.message?.includes('FOREIGN KEY constraint failed')) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' })
    }
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'This symbol already exists in the selected bucket.' })
    }
    res.status(500).json({ error: 'Failed to save thesis equity' })
  }
})

app.put('/api/thesis/equities/:id', authenticateToken, (req, res) => {
  try {
    const rowId = parseInt(req.params.id)
    if (!Number.isFinite(rowId)) {
      return res.status(400).json({ error: 'Invalid thesis equity id' })
    }

    const existing = db
      .prepare('SELECT id FROM thesis_equities WHERE id = ? AND user_id = ?')
      .get(rowId, req.user.id)
    if (!existing) {
      return res.status(404).json({ error: 'Thesis equity not found' })
    }

    const bucket = typeof req.body.bucket === 'string' ? req.body.bucket.trim() : ''
    const symbol = typeof req.body.symbol === 'string' ? req.body.symbol.trim().toUpperCase() : ''
    const company = typeof req.body.company === 'string' ? req.body.company.trim() : ''
    const allocation = typeof req.body.allocation === 'string' ? req.body.allocation.trim() : ''
    const thesis = typeof req.body.thesis === 'string' ? req.body.thesis.trim() : ''
    const validity = typeof req.body.validity === 'string' ? req.body.validity.trim() : ''

    if (!THESIS_BUCKETS.has(bucket)) {
      return res.status(400).json({ error: 'Invalid bucket' })
    }
    if (!symbol || !company || !allocation || !thesis || !validity) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    db.prepare(
      `
      UPDATE thesis_equities
      SET bucket = ?, symbol = ?, company = ?, allocation = ?, thesis = ?, validity = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `
    ).run(bucket, symbol, company, allocation, thesis, validity, rowId, req.user.id)

    const updated = db
      .prepare(
        `
      SELECT id, bucket, symbol, company, allocation, thesis, validity, created_at, updated_at
      FROM thesis_equities
      WHERE id = ? AND user_id = ?
    `
      )
      .get(rowId, req.user.id)

    res.json(updated)
  } catch (error) {
    console.error('Error updating thesis equity:', error)
    if (error?.message?.includes('FOREIGN KEY constraint failed')) {
      return res.status(401).json({ error: 'Session expired. Please log in again.' })
    }
    if (error?.message?.includes('UNIQUE constraint failed')) {
      return res.status(409).json({ error: 'This symbol already exists in the selected bucket.' })
    }
    res.status(500).json({ error: 'Failed to update thesis equity' })
  }
})

app.delete('/api/thesis/equities/:id', authenticateToken, (req, res) => {
  try {
    const rowId = parseInt(req.params.id)
    if (!Number.isFinite(rowId)) {
      return res.status(400).json({ error: 'Invalid thesis equity id' })
    }

    const existing = db
      .prepare('SELECT id FROM thesis_equities WHERE id = ? AND user_id = ?')
      .get(rowId, req.user.id)
    if (!existing) {
      return res.status(404).json({ error: 'Thesis equity not found' })
    }

    db.prepare('DELETE FROM thesis_equities WHERE id = ? AND user_id = ?').run(rowId, req.user.id)
    res.json({ message: 'Thesis equity deleted' })
  } catch (error) {
    console.error('Error deleting thesis equity:', error)
    res.status(500).json({ error: 'Failed to delete thesis equity' })
  }
})

// ============== User Rules (Thesis) Routes ==============

app.get('/api/user/rules', authenticateToken, (req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT id, category, condition, action, status, created_at, updated_at
      FROM user_rules
      WHERE user_id = ?
      ORDER BY created_at DESC
    `
      )
      .all(req.user.id)
    res.json(rows)
  } catch (error) {
    console.error('Error fetching user rules:', error)
    res.status(500).json({ error: 'Failed to fetch rules' })
  }
})

app.post('/api/user/rules', authenticateToken, (req, res) => {
  try {
    const condition = typeof req.body.condition === 'string' ? req.body.condition.trim() : ''
    const action = typeof req.body.action === 'string' ? req.body.action.trim() : ''
    const status = typeof req.body.status === 'string' ? req.body.status.trim() : 'Active'

    if (!condition || !action) {
      return res.status(400).json({ error: 'condition and action are required' })
    }
    if (condition.length > USER_RULE_MAX_CHARS || action.length > USER_RULE_MAX_CHARS) {
      return res
        .status(400)
        .json({ error: `condition and action must be <= ${USER_RULE_MAX_CHARS} characters` })
    }
    if (!USER_RULE_STATUSES.has(status)) {
      return res.status(400).json({ error: `status must be one of: ${Array.from(USER_RULE_STATUSES).join(', ')}` })
    }

    const category = classifyUserRuleCategory(condition, action)
    if (!USER_RULE_CATEGORIES.has(category)) {
      return res.status(400).json({ error: 'Invalid category' })
    }

    const result = db
      .prepare(
        `
      INSERT INTO user_rules (user_id, category, condition, action, status)
      VALUES (?, ?, ?, ?, ?)
    `
      )
      .run(req.user.id, category, condition, action, status)

    const saved = db
      .prepare(
        `
      SELECT id, category, condition, action, status, created_at, updated_at
      FROM user_rules
      WHERE id = ? AND user_id = ?
    `
      )
      .get(result.lastInsertRowid, req.user.id)

    res.status(201).json(saved)
  } catch (error) {
    console.error('Error creating user rule:', error)
    res.status(500).json({ error: 'Failed to create rule' })
  }
})

app.put('/api/user/rules/:id', authenticateToken, (req, res) => {
  try {
    const rowId = parseInt(req.params.id)
    if (!Number.isFinite(rowId)) {
      return res.status(400).json({ error: 'Invalid rule id' })
    }

    const existing = db
      .prepare('SELECT id FROM user_rules WHERE id = ? AND user_id = ?')
      .get(rowId, req.user.id)
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' })
    }

    const condition = typeof req.body.condition === 'string' ? req.body.condition.trim() : ''
    const action = typeof req.body.action === 'string' ? req.body.action.trim() : ''
    const status = typeof req.body.status === 'string' ? req.body.status.trim() : 'Active'

    if (!condition || !action) {
      return res.status(400).json({ error: 'condition and action are required' })
    }
    if (condition.length > USER_RULE_MAX_CHARS || action.length > USER_RULE_MAX_CHARS) {
      return res
        .status(400)
        .json({ error: `condition and action must be <= ${USER_RULE_MAX_CHARS} characters` })
    }
    if (!USER_RULE_STATUSES.has(status)) {
      return res.status(400).json({ error: `status must be one of: ${Array.from(USER_RULE_STATUSES).join(', ')}` })
    }

    const category = classifyUserRuleCategory(condition, action)

    db.prepare(
      `
      UPDATE user_rules
      SET category = ?, condition = ?, action = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND user_id = ?
    `
    ).run(category, condition, action, status, rowId, req.user.id)

    const saved = db
      .prepare(
        `
      SELECT id, category, condition, action, status, created_at, updated_at
      FROM user_rules
      WHERE id = ? AND user_id = ?
    `
      )
      .get(rowId, req.user.id)

    res.json(saved)
  } catch (error) {
    console.error('Error updating user rule:', error)
    res.status(500).json({ error: 'Failed to update rule' })
  }
})

app.delete('/api/user/rules/:id', authenticateToken, (req, res) => {
  try {
    const rowId = parseInt(req.params.id)
    if (!Number.isFinite(rowId)) {
      return res.status(400).json({ error: 'Invalid rule id' })
    }

    const existing = db
      .prepare('SELECT id FROM user_rules WHERE id = ? AND user_id = ?')
      .get(rowId, req.user.id)
    if (!existing) {
      return res.status(404).json({ error: 'Rule not found' })
    }

    db.prepare('DELETE FROM user_rules WHERE id = ? AND user_id = ?').run(rowId, req.user.id)
    res.json({ message: 'Rule deleted' })
  } catch (error) {
    console.error('Error deleting user rule:', error)
    res.status(500).json({ error: 'Failed to delete rule' })
  }
})

// ============== Thesis Decision Events Routes ==============

// GET /api/thesis/decision-events — list recent decision events for the current user
app.get('/api/thesis/decision-events', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id
    const limitRaw = Number(req.query.limit)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, limitRaw)) : 50

    const rows = db
      .prepare(
        `SELECT id, event_type, rule_id, description, created_at
         FROM thesis_decision_events
         WHERE user_id = ?
         ORDER BY created_at DESC
         LIMIT ?`
      )
      .all(userId, limit)

    res.json(rows)
  } catch (error) {
    console.error('Error fetching decision events:', error)
    res.status(500).json({ error: 'Failed to fetch decision events' })
  }
})

// GET /api/thesis/dashboard-stats — aggregated review dashboard stats (last 90 days)
app.get('/api/thesis/dashboard-stats', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id

    const since = new Date()
    since.setDate(since.getDate() - 90)
    const sinceStr = since.toISOString()

    const counts = db
      .prepare(
        `SELECT event_type, COUNT(*) as cnt
         FROM thesis_decision_events
         WHERE user_id = ? AND created_at >= ?
         GROUP BY event_type`
      )
      .all(userId, sinceStr)

    const countMap = {}
    counts.forEach((row) => {
      countMap[row.event_type] = row.cnt
    })

    const honored = countMap['rule_honored'] || 0
    const overrides = countMap['rule_override'] || 0
    const panicPauses = countMap['panic_pause'] || 0
    const totalDecisions = honored + overrides

    // Average cooling-off period for panic pauses (hours between pause and next event)
    const panicPauseEvents = db
      .prepare(
        `SELECT created_at FROM thesis_decision_events
         WHERE user_id = ? AND event_type = 'panic_pause' AND created_at >= ?
         ORDER BY created_at DESC`
      )
      .all(userId, sinceStr)

    let avgCoolingHours = 0
    if (panicPauseEvents.length > 0) {
      // Estimate cooling period as average gap between panic_pause events (or 24h default)
      if (panicPauseEvents.length >= 2) {
        let totalGap = 0
        for (let i = 0; i < panicPauseEvents.length - 1; i++) {
          const gap =
            new Date(panicPauseEvents[i].created_at).getTime() -
            new Date(panicPauseEvents[i + 1].created_at).getTime()
          totalGap += gap
        }
        avgCoolingHours = Math.round(totalGap / (panicPauseEvents.length - 1) / (1000 * 60 * 60))
      } else {
        avgCoolingHours = 24
      }
    }

    res.json({
      ruleAdherence: totalDecisions > 0 ? Math.round((honored / totalDecisions) * 100) : 0,
      totalDecisions,
      honored,
      overrides,
      panicPauses,
      avgCoolingHours,
    })
  } catch (error) {
    console.error('Error fetching dashboard stats:', error)
    res.status(500).json({ error: 'Failed to fetch dashboard stats' })
  }
})

// POST /api/thesis/decision-events — log a decision event
app.post('/api/thesis/decision-events', authenticateToken, (req, res) => {
  try {
    const { eventType, ruleId, description } = req.body
    const validTypes = ['rule_honored', 'rule_override', 'panic_pause']
    if (!eventType || !validTypes.includes(eventType)) {
      return res.status(400).json({ error: `eventType must be one of: ${validTypes.join(', ')}` })
    }

    const result = db
      .prepare(
        `INSERT INTO thesis_decision_events (user_id, event_type, rule_id, description)
         VALUES (?, ?, ?, ?)`
      )
      .run(req.user.id, eventType, ruleId || null, description || null)

    res.json({
      id: result.lastInsertRowid,
      eventType,
      ruleId: ruleId || null,
      description: description || null,
    })
  } catch (error) {
    console.error('Error logging decision event:', error)
    res.status(500).json({ error: 'Failed to log decision event' })
  }
})

// POST /api/thesis/decision-events/seed — seed demo data for the current user
app.post('/api/thesis/decision-events/seed', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id

    // Check if user already has events
    const existing = db
      .prepare('SELECT COUNT(*) as cnt FROM thesis_decision_events WHERE user_id = ?')
      .get(userId)

    if (existing.cnt > 0) {
      return res.json({ message: 'Demo data already exists', seeded: false })
    }

    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000

    const events = [
      { type: 'rule_honored', desc: 'Held position through volatility per Rule #1', daysAgo: 2 },
      { type: 'rule_honored', desc: 'Rebalanced tech allocation below 60% threshold', daysAgo: 5 },
      { type: 'rule_honored', desc: 'Waited 24h before buying during VIX spike', daysAgo: 8 },
      { type: 'rule_honored', desc: 'Trimmed concentrated position to target weight', daysAgo: 12 },
      { type: 'rule_honored', desc: 'Logged rationale before executing trade', daysAgo: 15 },
      { type: 'rule_honored', desc: 'Paused new buys during elevated macro risk', daysAgo: 20 },
      { type: 'rule_honored', desc: 'Held through earnings despite pre-announcement anxiety', daysAgo: 25 },
      { type: 'rule_honored', desc: 'Reduced correlated positions per concentration rule', daysAgo: 30 },
      { type: 'rule_honored', desc: 'Followed stop-loss discipline on losing position', daysAgo: 35 },
      { type: 'rule_honored', desc: 'Reviewed thesis before adding to winner', daysAgo: 40 },
      { type: 'rule_honored', desc: 'Maintained cash buffer during drawdown', daysAgo: 50 },
      { type: 'rule_override', desc: 'Sold high-beta position before stop trigger during sharp drawdown', daysAgo: 24 },
      { type: 'rule_override', desc: 'Added to position during VIX > 20 despite pause rule', daysAgo: 45 },
      { type: 'panic_pause', desc: 'Market dropped 6.2% — paused for 48h', daysAgo: 14 },
      { type: 'panic_pause', desc: 'Flash crash scare — activated cooling-off period', daysAgo: 28 },
      { type: 'panic_pause', desc: 'Earnings miss triggered anxiety — paused trading', daysAgo: 42 },
      { type: 'panic_pause', desc: 'Portfolio drawdown 4% — took 24h break', daysAgo: 60 },
    ]

    const insert = db.prepare(
      `INSERT INTO thesis_decision_events (user_id, event_type, description, created_at)
       VALUES (?, ?, ?, ?)`
    )

    const insertMany = db.transaction((evts) => {
      for (const evt of evts) {
        const ts = new Date(now - evt.daysAgo * DAY).toISOString()
        insert.run(userId, evt.type, evt.desc, ts)
      }
    })

    insertMany(events)

    res.json({ message: 'Demo data seeded', seeded: true, count: events.length })
  } catch (error) {
    console.error('Error seeding decision events:', error)
    res.status(500).json({ error: 'Failed to seed decision events' })
  }
})

// ============== AI Settings Routes ==============

app.get('/api/user/settings/ai', authenticateToken, (req, res) => {
  try {
    const settings = db
      .prepare(
        `
      SELECT gemini_api_key, updated_at
      FROM user_ai_settings
      WHERE user_id = ?
    `
      )
      .get(req.user.id)

    res.json({
      hasGeminiApiKey: Boolean(settings?.gemini_api_key),
      updatedAt: settings?.updated_at || null,
    })
  } catch (error) {
    console.error('Error fetching AI settings:', error)
    res.status(500).json({ error: 'Failed to fetch AI settings' })
  }
})

app.put('/api/user/settings/ai', authenticateToken, (req, res) => {
  try {
    const { geminiApiKey } = req.body
    const cleanedKey = typeof geminiApiKey === 'string' ? geminiApiKey.trim() : ''

    if (!cleanedKey) {
      return res.status(400).json({ error: 'geminiApiKey is required' })
    }

    db.prepare(
      `
      INSERT INTO user_ai_settings (user_id, gemini_api_key, updated_at)
      VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(user_id)
      DO UPDATE SET gemini_api_key = excluded.gemini_api_key, updated_at = CURRENT_TIMESTAMP
    `
    ).run(req.user.id, cleanedKey)

    res.json({
      message: 'AI settings updated',
      hasGeminiApiKey: true,
      updatedAt: new Date().toISOString(),
    })
  } catch (error) {
    console.error('Error updating AI settings:', error)
    res.status(500).json({ error: 'Failed to update AI settings' })
  }
})

// ============== AI Chat Routes ==============

// Chat with AI trading assistant
app.post('/api/ai/chat', authenticateToken, async (req, res) => {
  try {
    const { messages, apiKey } = req.body

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'Messages array is required' })
    }

    let resolvedApiKey = typeof apiKey === 'string' ? apiKey.trim() : ''

    if (!resolvedApiKey) {
      const storedSettings = db
        .prepare('SELECT gemini_api_key FROM user_ai_settings WHERE user_id = ?')
        .get(req.user.id)
      resolvedApiKey = storedSettings?.gemini_api_key || ''
    }

    if (!resolvedApiKey) {
      return res.status(400).json({
        success: false,
        error: 'API key is required',
        message: 'Please set your Gemini API key in Add Key to use the AI Assistant.'
      })
    }

    // Validate message format
    const validMessages = messages.every(
      (msg) => msg.role && msg.content && ['user', 'assistant'].includes(msg.role)
    )

    if (!validMessages) {
      return res.status(400).json({
        error: 'Invalid message format. Each message must have role (user/assistant) and content.',
      })
    }

    // Get the latest user message to extract tickers
    const latestUserMessage = messages.filter(m => m.role === 'user').pop()
    const detectedTickers = latestUserMessage ? extractTickers(latestUserMessage.content) : []

    // Fetch relevant news for detected tickers from database
    let relevantNews = []
    if (detectedTickers.length > 0) {
      try {
        const placeholders = detectedTickers.map(() => '?').join(',')
        relevantNews = db
          .prepare(
            `
            SELECT DISTINCT p.id, p.stock_ticker, p.title, p.content, p.news_url, p.news_source,
                   p.news_published_at, p.sentiment, p.sentiment_confidence
            FROM posts p
            WHERE p.is_news = 1
              AND p.stock_ticker IN (${placeholders})
            ORDER BY p.news_published_at DESC, p.created_at DESC
            LIMIT 6
          `
          )
          .all(...detectedTickers)

        console.log(`Found ${relevantNews.length} news articles for tickers: ${detectedTickers.join(', ')}`)

        // Analyze sentiment for news that doesn't have it yet (using user's API key)
        const updateSentimentStmt = db.prepare(
          'UPDATE posts SET sentiment = ?, sentiment_confidence = ? WHERE id = ?'
        )

        for (let i = 0; i < relevantNews.length; i++) {
          const news = relevantNews[i]
          if (!news.sentiment || news.sentiment === 'neutral' || news.sentiment === '') {
            try {
              console.log(`Analyzing sentiment for: ${news.title.substring(0, 40)}...`)
              const analysis = await analyzeNewsSentiment(
                news.title,
                news.content,
                news.stock_ticker,
                resolvedApiKey
              )

              // Update in database
              updateSentimentStmt.run(analysis.sentiment, analysis.confidence, news.id)

              // Update in current array for response
              relevantNews[i].sentiment = analysis.sentiment
              relevantNews[i].sentiment_confidence = analysis.confidence

              console.log(`  -> ${analysis.sentiment} (${(analysis.confidence * 100).toFixed(0)}%)`)
            } catch (err) {
              console.error(`Failed to analyze sentiment for news ${news.id}:`, err.message)
            }
          }
        }
      } catch (err) {
        console.error('Error fetching news for AI context:', err)
      }
    }

    // Get user's portfolio for context
    const transactions = db
      .prepare(
        `
      SELECT symbol, transaction_type, shares, price_per_share
      FROM portfolio_transactions
      WHERE user_id = ?
      ORDER BY symbol, transaction_date
    `
      )
      .all(req.user.id)

    // Calculate current holdings
    const holdings = {}
    transactions.forEach((tx) => {
      if (!holdings[tx.symbol]) {
        holdings[tx.symbol] = { totalShares: 0, totalCost: 0 }
      }
      if (tx.transaction_type === 'buy') {
        holdings[tx.symbol].totalShares += tx.shares
        holdings[tx.symbol].totalCost += tx.shares * tx.price_per_share
      } else if (tx.transaction_type === 'sell') {
        const avgCost =
          holdings[tx.symbol].totalShares > 0
            ? holdings[tx.symbol].totalCost / holdings[tx.symbol].totalShares
            : 0
        holdings[tx.symbol].totalShares -= tx.shares
        holdings[tx.symbol].totalCost -= tx.shares * avgCost
      }
    })

    const portfolio = Object.entries(holdings)
      .filter(([_, h]) => h.totalShares > 0)
      .map(([symbol, h]) => ({
        symbol,
        shares: h.totalShares,
        averageCost: h.totalCost / h.totalShares,
      }))

    // Build context object with news
    const context = {
      user: { username: req.user.username },
      portfolio,
      news: relevantNews,
      detectedTickers,
    }

    // Call AI service with user-provided API key
    const result = await chatWithAI({ messages, context, apiKey: resolvedApiKey })

    // Include detected tickers and news count in response for frontend
    res.json({
      ...result,
      detectedTickers,
      newsCount: relevantNews.length,
      newsUsed: relevantNews.map(n => ({
        ticker: n.stock_ticker,
        title: n.title,
        source: n.news_source,
        url: n.news_url,
        sentiment: n.sentiment,
      })),
    })
  } catch (error) {
    console.error('AI chat error:', error)
    res.status(500).json({
      success: false,
      error: 'Failed to process chat request',
      message: 'Sorry, I encountered an error. Please try again.',
    })
  }
})

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`)
})
