import express from "express";
import cors from "cors";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import "dotenv/config";
import db from "./database.js";
import {
  recordActivity,
  recordLogin,
  getUserActivitySummary,
  getUserBadges,
  getUserLevelBadge,
  getActivityLeaderboard,
  checkAndAwardBadges,
} from "./activityHelper.js";
import { ingestNewsForTickers } from "./newsService.js";
import {
  chatWithAI,
  extractTickers,
  analyzeNewsSentiment,
} from "./aiService.js";

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET =
  process.env.JWT_SECRET || "your-secret-key-change-in-production";

// CORS configuration for production
const corsOptions = {
  origin: process.env.FRONTEND_URL || "*",
  credentials: true,
};

app.use(cors(corsOptions));
app.use(express.json());

// Middleware to verify JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    return res.status(401).json({ error: "Access token required" });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      console.error("JWT verification failed:", err.message);
      return res.status(403).json({ error: "Invalid or expired token" });
    }
    req.user = user;
    next();
  });
};

// ============== Authentication Routes ==============

// Sign up
app.post("/api/auth/signup", async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "All fields are required" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const stmt = db.prepare(
      "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
    );
    const result = stmt.run(username, email, hashedPassword);

    const token = jwt.sign(
      { id: result.lastInsertRowid, username },
      JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    // Get the created user with created_at
    const newUser = db
      .prepare("SELECT id, username, email, created_at FROM users WHERE id = ?")
      .get(result.lastInsertRowid);

    res.status(201).json({
      message: "User created successfully",
      token,
      user: newUser,
    });
  } catch (error) {
    if (error.message.includes("UNIQUE constraint failed")) {
      res.status(409).json({ error: "Username or email already exists" });
    } else {
      res.status(500).json({ error: "Server error" });
    }
  }
});

// Login
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = db
      .prepare("SELECT * FROM users WHERE username = ?")
      .get(username);

    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      {
        expiresIn: "7d",
      },
    );

    // Record login and update streak
    const loginResult = recordLogin(user.id);

    // Auto-sync historical activity if user has 0 points but has posts/comments/transactions
    if (user.activity_points === 0) {
      const posts = db
        .prepare("SELECT COUNT(*) as count FROM posts WHERE user_id = ?")
        .get(user.id);
      const comments = db
        .prepare("SELECT COUNT(*) as count FROM comments WHERE user_id = ?")
        .get(user.id);
      const transactions = db
        .prepare(
          "SELECT COUNT(*) as count FROM portfolio_transactions WHERE user_id = ?",
        )
        .get(user.id);

      const hasActivity =
        posts.count > 0 || comments.count > 0 || transactions.count > 0;

      if (hasActivity) {
        // Sync historical activity
        try {
          const allPosts = db
            .prepare(
              "SELECT id, title, created_at FROM posts WHERE user_id = ?",
            )
            .all(user.id);
          const allComments = db
            .prepare("SELECT id, created_at FROM comments WHERE user_id = ?")
            .all(user.id);
          const allTransactions = db
            .prepare(
              "SELECT id, symbol, transaction_type, shares, created_at FROM portfolio_transactions WHERE user_id = ?",
            )
            .all(user.id);

          let pointsAdded = 0;

          // Add activity logs for posts
          allPosts.forEach((post) => {
            const insertLog = db.prepare(`
              INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
              VALUES (?, 'post', 10, ?, ?, ?)
            `);
            insertLog.run(
              user.id,
              post.id,
              `Created post: ${post.title}`,
              post.created_at,
            );
            pointsAdded += 10;
          });

          // Add activity logs for comments
          allComments.forEach((comment) => {
            const insertLog = db.prepare(`
              INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
              VALUES (?, 'comment', 5, ?, 'Posted a comment', ?)
            `);
            insertLog.run(user.id, comment.id, comment.created_at);
            pointsAdded += 5;
          });

          // Add activity logs for transactions
          allTransactions.forEach((tx) => {
            const insertLog = db.prepare(`
              INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
              VALUES (?, 'transaction', 3, ?, ?, ?)
            `);
            insertLog.run(
              user.id,
              tx.id,
              `${tx.transaction_type} ${tx.shares} shares of ${tx.symbol}`,
              tx.created_at,
            );
            pointsAdded += 3;
          });

          // Update user's total activity points
          db.prepare(
            "UPDATE users SET activity_points = activity_points + ? WHERE id = ?",
          ).run(pointsAdded, user.id);

          // Check and award badges
          checkAndAwardBadges(user.id);

          console.log(
            `Auto-synced ${pointsAdded} points for user ${user.username}`,
          );
        } catch (syncError) {
          console.error("Error auto-syncing activity:", syncError);
        }
      }
    }

    // Get updated user data
    const updatedUser = db
      .prepare(
        "SELECT id, username, email, created_at, activity_points, login_streak FROM users WHERE id = ?",
      )
      .get(user.id);

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
    });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// ============== Posts Routes ==============

// Return allowed tags for posts (could be moved to DB later)
app.get("/api/tags", (req, res) => {
  try {
    const tags = [
      "#AAPL",
      "#MSFT",
      "#TSLA",
      "#GOOG",
      "#AMZN",
      "#NVDA",
      "#META",
      "#NFLX",
      "#BRK.A",
      "#BABA",
      "#INTC",
      "#AMD",
      "#SQ",
      "#PYPL",
      "#UBER",
      "#LYFT",
      "#earnings",
      "#tech",
      "#energy",
      "#dividends",
      "#finance",
      "#growth",
      "#value",
      "#income",
      "#options",
      "#ETF",
      "#crypto",
      "#AI",
      "#IPO",
      "#healthcare",
      "#banking",
      "#retail",

      // --- User-requested topic tags (60) ---
      "#Stocks",
      "#Options",
      "#Crypto",
      "#Forex",
      "#ETFs",
      "#Futures",
      "#Commodities",
      "#Indices",

      "#TechnicalAnalysis",
      "#FundamentalAnalysis",
      "#QuantitativeAnalysis",
      "#SentimentAnalysis",
      "#MacroAnalysis",
      "#Valuation",
      "#PriceAction",
      "#VolumeAnalysis",

      "#RSI",
      "#MACD",
      "#MovingAverage",
      "#VWAP",
      "#BollingerBands",
      "#SupportAndResistance",
      "#Trendlines",
      "#Momentum",

      "#DayTrading",
      "#SwingTrading",
      "#Scalping",
      "#PositionTrading",
      "#LongTermInvesting",
      "#MomentumTrading",
      "#BreakoutTrading",
      "#TrendFollowing",
      "#MeanReversion",
      "#OptionsStrategy",

      "#RiskManagement",
      "#PortfolioManagement",
      "#PositionSizing",
      "#StopLoss",
      "#TakeProfit",
      "#Diversification",
      "#Hedging",
      "#Leverage",

      "#Bullish",
      "#Bearish",
      "#Volatility",
      "#MarketNews",
      "#MarketAnalysis",
      "#TradeIdea",
      "#Prediction",
      "#EarningsTopic",

      "#GrowthInvesting",
      "#ValueInvesting",
      "#DividendInvesting",

      "#Beginner",
      "#Intermediate",
      "#Advanced",
      "#Educational",
      "#Question",
      "#Discussion",
    ];
    res.json(tags);
  } catch (err) {
    console.error("Failed to fetch tags", err);
    res.status(500).json({ error: "Failed to fetch tags" });
  }
});

// ============== User Settings Routes ==============
// Get user settings (optionally pass ?key=dashboard_visible_tiles)
app.get("/api/user/settings", authenticateToken, (req, res) => {
  try {
    const { key } = req.query;
    if (!key) {
      const rows = db
        .prepare("SELECT key, value FROM user_settings WHERE user_id = ?")
        .all(req.user.id);
      const out = {};
      rows.forEach((r) => {
        try {
          out[r.key] = JSON.parse(r.value);
        } catch (e) {
          out[r.key] = r.value;
        }
      });
      return res.json(out);
    }

    const row = db
      .prepare("SELECT value FROM user_settings WHERE user_id = ? AND key = ?")
      .get(req.user.id, String(key));

    if (!row) return res.json({ key, value: null });

    try {
      return res.json({ key, value: JSON.parse(row.value) });
    } catch (e) {
      return res.json({ key, value: row.value });
    }
  } catch (error) {
    console.error("Failed to fetch user settings", error);
    res.status(500).json({ error: "Failed to fetch settings" });
  }
});

// Save or update a user setting
app.post("/api/user/settings", authenticateToken, (req, res) => {
  try {
    const { key, value } = req.body;
    if (!key) return res.status(400).json({ error: "key is required" });

    const valueStr = typeof value === "string" ? value : JSON.stringify(value);

    db.prepare(
      `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
    ).run(req.user.id, key, valueStr);

    res.json({ message: "ok" });
  } catch (error) {
    console.error("Failed to save user setting", error);
    res.status(500).json({ error: "Failed to save setting" });
  }
});

// ============== User Watchlist Routes ==============
// Get current user's watchlist symbols
app.get("/api/watchlist", authenticateToken, (req, res) => {
  try {
    const rows = db
      .prepare("SELECT symbol FROM user_watchlist WHERE user_id = ? ORDER BY created_at DESC")
      .all(req.user.id);
    const symbols = rows.map((r) => r.symbol);
    res.json(symbols);
  } catch (err) {
    console.error("Failed to fetch watchlist", err);
    res.status(500).json({ error: "Failed to fetch watchlist" });
  }
});

// Add a symbol to the current user's watchlist
app.post("/api/watchlist", authenticateToken, (req, res) => {
  try {
    const { symbol } = req.body;
    if (!symbol || typeof symbol !== "string") {
      return res.status(400).json({ error: "symbol is required" });
    }
    const s = String(symbol).toUpperCase().trim();
    db.prepare(
      "INSERT OR IGNORE INTO user_watchlist (user_id, symbol) VALUES (?, ?)",
    ).run(req.user.id, s);

    res.json({ message: "ok", symbol: s });
  } catch (err) {
    console.error("Failed to add watchlist item", err);
    res.status(500).json({ error: "Failed to add watchlist item" });
  }
});

// Remove a symbol from the current user's watchlist
app.delete("/api/watchlist/:symbol", authenticateToken, (req, res) => {
  try {
    const symbol = String(req.params.symbol || "").toUpperCase().trim();
    if (!symbol) return res.status(400).json({ error: "symbol required" });
    db.prepare("DELETE FROM user_watchlist WHERE user_id = ? AND symbol = ?").run(
      req.user.id,
      symbol,
    );
    res.json({ message: "ok", symbol });
  } catch (err) {
    console.error("Failed to remove watchlist item", err);
    res.status(500).json({ error: "Failed to remove watchlist item" });
  }
});

// Get all posts
app.get("/api/posts", (req, res) => {
  try {
    const { stock_ticker } = req.query;

    let query = `
      SELECT posts.*, users.username,
        (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) as comment_count
      FROM posts
      JOIN users ON posts.user_id = users.id
    `;

    if (stock_ticker) {
      query += " WHERE posts.stock_ticker = ?";
      const posts = db
        .prepare(query + " ORDER BY posts.created_at DESC")
        .all(stock_ticker);
      return res.json(posts);
    }

    const posts = db.prepare(query + " ORDER BY posts.created_at DESC").all();
    res.json(posts);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Fetch news-only posts
app.get("/api/news", (req, res) => {
  try {
    const { stock_ticker, limit } = req.query;
    const limitNum = Math.min(parseInt(limit, 10) || 10, 20);

    let query = `
      SELECT posts.*, users.username,
        (SELECT COUNT(*) FROM comments WHERE comments.post_id = posts.id) as comment_count
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.is_news = 1
    `;

    if (stock_ticker) {
      query += " AND posts.stock_ticker = ?";
      const newsPosts = db
        .prepare(
          query +
            " ORDER BY posts.news_published_at DESC, posts.created_at DESC LIMIT ?",
        )
        .all(stock_ticker, limitNum);
      return res.json(newsPosts);
    }

    const newsPosts = db
      .prepare(
        query +
          " ORDER BY posts.news_published_at DESC, posts.created_at DESC LIMIT ?",
      )
      .all(limitNum);
    res.json(newsPosts);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Get trending topics (top stock tickers by post count)
app.get("/api/trending_topics", (req, res) => {
  try {
    const rows = db
      .prepare(
        `
      SELECT stock_ticker as topic, COUNT(*) as posts
      FROM posts
      WHERE stock_ticker IS NOT NULL AND TRIM(stock_ticker) != ''
        AND COALESCE(is_news, 0) = 0
      GROUP BY stock_ticker
      ORDER BY posts DESC
      LIMIT 4
    `,
      )
      .all();

    // If there are fewer than 4 topics, return what we have
    const out = rows.map((r) => ({ topic: r.topic, posts: r.posts }));
    res.json(out);
  } catch (err) {
    console.error("Failed to compute trending topics", err);
    res.status(500).json({ error: "Failed to compute trending topics" });
  }
});

// Ingest external news for watchlist tickers and store as news posts
app.post("/api/news/ingest", authenticateToken, async (req, res) => {
  try {
    const { tickers } = req.body;
    if (!Array.isArray(tickers) || tickers.length === 0) {
      return res.status(400).json({ error: "Provide at least one ticker" });
    }

    const {
      inserted,
      skipped,
      tickers: normalizedTickers,
    } = await ingestNewsForTickers(tickers);

    res.json({
      message: "News synced",
      tickers: normalizedTickers,
      inserted_count: inserted.length,
      skipped_count: skipped.length,
      posts: inserted,
    });
  } catch (error) {
    console.error("Error ingesting news:", error);
    res.status(500).json({ error: "Failed to fetch news" });
  }
});

// Re-analyze sentiment for existing news articles using user's API key
app.post("/api/news/update-sentiment", authenticateToken, async (req, res) => {
  try {
    const { apiKey } = req.body;

    if (!apiKey) {
      return res.status(400).json({ error: "API key is required" });
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
      `,
      )
      .all();

    if (newsToUpdate.length === 0) {
      return res.json({
        message: "All news articles already have sentiment",
        updated: 0,
        total: 0,
      });
    }

    const updateStmt = db.prepare(
      "UPDATE posts SET sentiment = ?, sentiment_confidence = ? WHERE id = ?",
    );

    let updatedCount = 0;
    let processedCount = 0;
    const results = [];

    console.log(
      `Starting sentiment analysis for ${newsToUpdate.length} news articles...`,
    );

    for (const news of newsToUpdate) {
      try {
        processedCount++;
        console.log(
          `[${processedCount}/${newsToUpdate.length}] Analyzing: ${news.title.substring(0, 40)}...`,
        );

        const analysis = await analyzeNewsSentiment(
          news.title,
          news.content,
          news.stock_ticker,
          apiKey,
        );

        // Update database with sentiment (even if neutral)
        updateStmt.run(analysis.sentiment, analysis.confidence, news.id);

        if (analysis.sentiment && analysis.sentiment !== "neutral") {
          updatedCount++;
        }

        results.push({
          id: news.id,
          ticker: news.stock_ticker,
          title: news.title.substring(0, 50) + "...",
          sentiment: analysis.sentiment,
          confidence: analysis.confidence,
        });

        console.log(
          `  -> ${analysis.sentiment} (${(analysis.confidence * 100).toFixed(0)}%)`,
        );
      } catch (err) {
        console.error(
          `Failed to analyze sentiment for news ${news.id}:`,
          err.message,
        );
      }
    }

    console.log(
      `Sentiment analysis complete: ${updatedCount} bullish/bearish, ${processedCount - updatedCount} neutral`,
    );

    res.json({
      message: `Analyzed ${processedCount} news articles, ${updatedCount} have bullish/bearish sentiment`,
      updated: updatedCount,
      total: processedCount,
      results,
    });
  } catch (error) {
    console.error("Error updating news sentiment:", error);
    res.status(500).json({ error: "Failed to update sentiment" });
  }
});

// Get single post
app.get("/api/posts/:id", (req, res) => {
  try {
    const post = db
      .prepare(
        `
      SELECT posts.*, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.id = ?
    `,
      )
      .get(req.params.id);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    res.json(post);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Create post (requires authentication)
app.post("/api/posts", authenticateToken, (req, res) => {
  try {
    const { stock_ticker, title, content } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    // Validate stock ticker format only if provided (basic validation)
    if (stock_ticker && !/^[A-Z]{1,5}$/.test(stock_ticker)) {
      return res.status(400).json({
        error:
          "Invalid stock ticker format (use uppercase letters, 1-5 characters)",
      });
    }

    const stmt = db.prepare(
      "INSERT INTO posts (user_id, stock_ticker, title, content) VALUES (?, ?, ?, ?)",
    );
    const result = stmt.run(req.user.id, stock_ticker || null, title, content);

    // Record activity
    recordActivity(
      req.user.id,
      "post",
      result.lastInsertRowid,
      `Created post: ${title}`,
    );

    const newPost = db
      .prepare(
        `
      SELECT posts.*, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.id = ?
    `,
      )
      .get(result.lastInsertRowid);

    res.status(201).json(newPost);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Update post (requires authentication)
app.put("/api/posts/:id", authenticateToken, (req, res) => {
  try {
    const { title, content } = req.body;
    const postId = req.params.id;

    const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.user_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to edit this post" });
    }

    const stmt = db.prepare(
      "UPDATE posts SET title = ?, content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    );
    stmt.run(title, content, postId);

    const updatedPost = db
      .prepare(
        `
      SELECT posts.*, users.username
      FROM posts
      JOIN users ON posts.user_id = users.id
      WHERE posts.id = ?
    `,
      )
      .get(postId);

    res.json(updatedPost);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Delete post (requires authentication)
app.delete("/api/posts/:id", authenticateToken, (req, res) => {
  try {
    const postId = req.params.id;

    const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    if (post.user_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this post" });
    }

    db.prepare("DELETE FROM posts WHERE id = ?").run(postId);

    res.json({ message: "Post deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// ============== Theses Routes ==============
// Get theses for authenticated user
app.get("/api/theses", authenticateToken, (req, res) => {
  try {
    const rows = db
      .prepare(
        "SELECT id, symbol, name, thesis, entry, target, stop, tags, status, last_updated, created_at FROM theses WHERE user_id = ? ORDER BY symbol",
      )
      .all(req.user.id);

    const out = rows.map((r) => ({
      ...r,
      tags: r.tags ? JSON.parse(r.tags) : [],
    }));

    res.json(out);
  } catch (err) {
    console.error("Failed to fetch theses", err);
    res.status(500).json({ error: "Failed to fetch theses" });
  }
});

// Create a thesis
app.post("/api/theses", authenticateToken, (req, res) => {
  try {
    const {
      symbol,
      name,
      thesis,
      entry,
      target,
      stop,
      tags = [],
      status = "on-track",
    } = req.body;
    if (!symbol) return res.status(400).json({ error: "symbol is required" });

    const insert = db.prepare(`
        INSERT INTO theses (user_id, symbol, name, thesis, entry, target, stop, tags, status, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `);

    const result = insert.run(
      req.user.id,
      symbol,
      name || null,
      thesis || null,
      entry || null,
      target || null,
      stop || null,
      JSON.stringify(tags),
      status,
    );

    const row = db
      .prepare(
        "SELECT id, symbol, name, thesis, entry, target, stop, tags, status, last_updated, created_at FROM theses WHERE id = ?",
      )
      .get(result.lastInsertRowid);
    row.tags = row.tags ? JSON.parse(row.tags) : [];
    res.status(201).json(row);
  } catch (err) {
    console.error("Failed to create thesis", err);
    res.status(500).json({ error: "Failed to create thesis" });
  }
});

// Update thesis
app.put("/api/theses/:id", authenticateToken, (req, res) => {
  try {
    const id = req.params.id;
    const existing = db.prepare("SELECT * FROM theses WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Thesis not found" });
    if (existing.user_id !== req.user.id)
      return res.status(403).json({ error: "Not authorized" });

    const { symbol, name, thesis, entry, target, stop, tags, status } =
      req.body;

    db.prepare(
      `
        UPDATE theses SET symbol = ?, name = ?, thesis = ?, entry = ?, target = ?, stop = ?, tags = ?, status = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?
      `,
    ).run(
      symbol || existing.symbol,
      name || existing.name,
      thesis || existing.thesis,
      entry ?? existing.entry,
      target ?? existing.target,
      stop ?? existing.stop,
      tags ? JSON.stringify(tags) : existing.tags,
      status || existing.status,
      id,
    );

    const row = db
      .prepare(
        "SELECT id, symbol, name, thesis, entry, target, stop, tags, status, last_updated, created_at FROM theses WHERE id = ?",
      )
      .get(id);
    row.tags = row.tags ? JSON.parse(row.tags) : [];
    res.json(row);
  } catch (err) {
    console.error("Failed to update thesis", err);
    res.status(500).json({ error: "Failed to update thesis" });
  }
});

// Delete thesis
app.delete("/api/theses/:id", authenticateToken, (req, res) => {
  try {
    const id = req.params.id;
    const existing = db.prepare("SELECT * FROM theses WHERE id = ?").get(id);
    if (!existing) return res.status(404).json({ error: "Thesis not found" });
    if (existing.user_id !== req.user.id)
      return res.status(403).json({ error: "Not authorized" });

    db.prepare("DELETE FROM theses WHERE id = ?").run(id);
    res.json({ message: "Deleted" });
  } catch (err) {
    console.error("Failed to delete thesis", err);
    res.status(500).json({ error: "Failed to delete thesis" });
  }
});

// ============== Comments Routes ==============

// Get comments for a post
app.get("/api/posts/:postId/comments", (req, res) => {
  try {
    const comments = db
      .prepare(
        `
      SELECT comments.*, users.username
      FROM comments
      JOIN users ON comments.user_id = users.id
      WHERE comments.post_id = ?
      ORDER BY comments.created_at ASC
    `,
      )
      .all(req.params.postId);

    res.json(comments);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Search symbols using Yahoo Finance autocomplete
app.get("/api/stock/search", async (req, res) => {
  try {
    const q = String(req.query.q || "").trim();
    if (!q) return res.json([]);

    // Yahoo search endpoint
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0`;

    const fetchRes = await fetch(url, {
      headers: { "User-Agent": "TradingAgent/1.0" },
    });
    if (!fetchRes.ok) {
      // return empty list on failure
      return res.json([]);
    }

    const body = await fetchRes.json();
    const quotes = body.quotes || [];
    const out = quotes.map((q) => ({
      symbol: q.symbol,
      name: q.shortname || q.longname || q.name || "",
      exchange: q.exchange || "",
    }));
    res.json(out);
  } catch (err) {
    console.error("Stock search failed", err);
    res.status(500).json({ error: "Stock search failed" });
  }
});

// Create comment (requires authentication)
app.post("/api/posts/:postId/comments", authenticateToken, (req, res) => {
  try {
    const { content, parent_comment_id } = req.body;
    const postId = req.params.postId;

    if (!content) {
      return res.status(400).json({ error: "Content is required" });
    }

    // Check if post exists
    const post = db.prepare("SELECT * FROM posts WHERE id = ?").get(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    // If parent_comment_id is provided, verify it exists and belongs to the same post
    if (parent_comment_id) {
      const parentComment = db
        .prepare("SELECT * FROM comments WHERE id = ? AND post_id = ?")
        .get(parent_comment_id, postId);
      if (!parentComment) {
        return res.status(404).json({ error: "Parent comment not found" });
      }
    }

    const stmt = db.prepare(
      "INSERT INTO comments (post_id, user_id, parent_comment_id, content) VALUES (?, ?, ?, ?)",
    );
    const result = stmt.run(
      postId,
      req.user.id,
      parent_comment_id || null,
      content,
    );

    // Record activity
    recordActivity(
      req.user.id,
      "comment",
      result.lastInsertRowid,
      `Commented on post #${postId}`,
    );

    const newComment = db
      .prepare(
        `
      SELECT comments.*, users.username
      FROM comments
      JOIN users ON comments.user_id = users.id
      WHERE comments.id = ?
    `,
      )
      .get(result.lastInsertRowid);

    res.status(201).json(newComment);
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// Delete comment (requires authentication)
app.delete("/api/comments/:id", authenticateToken, (req, res) => {
  try {
    const commentId = req.params.id;

    const comment = db
      .prepare("SELECT * FROM comments WHERE id = ?")
      .get(commentId);

    if (!comment) {
      return res.status(404).json({ error: "Comment not found" });
    }

    if (comment.user_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this comment" });
    }

    db.prepare("DELETE FROM comments WHERE id = ?").run(commentId);

    res.json({ message: "Comment deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Server error" });
  }
});

// ============== Portfolio Routes ==============

// Get all portfolio transactions for a user
app.get("/api/portfolio/transactions", authenticateToken, (req, res) => {
  try {
    const transactions = db
      .prepare(
        `
      SELECT *
      FROM portfolio_transactions
      WHERE user_id = ?
      ORDER BY transaction_date DESC
    `,
      )
      .all(req.user.id);

    res.json(transactions);
  } catch (error) {
    console.error("Error fetching transactions:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get portfolio summary (grouped by symbol)
app.get("/api/portfolio/summary", authenticateToken, (req, res) => {
  try {
    const transactions = db
      .prepare(
        `
      SELECT symbol, transaction_type, shares, price_per_share
      FROM portfolio_transactions
      WHERE user_id = ?
      ORDER BY symbol, transaction_date
    `,
      )
      .all(req.user.id);

    // Calculate holdings for each symbol
    const holdings = {};

    transactions.forEach((tx) => {
      if (!holdings[tx.symbol]) {
        holdings[tx.symbol] = {
          symbol: tx.symbol,
          totalShares: 0,
          totalCost: 0,
        };
      }

      if (tx.transaction_type === "buy") {
        holdings[tx.symbol].totalShares += tx.shares;
        holdings[tx.symbol].totalCost += tx.shares * tx.price_per_share;
      } else if (tx.transaction_type === "sell") {
        // Calculate average cost before selling
        const avgCost =
          holdings[tx.symbol].totalShares > 0
            ? holdings[tx.symbol].totalCost / holdings[tx.symbol].totalShares
            : 0;

        holdings[tx.symbol].totalShares -= tx.shares;
        holdings[tx.symbol].totalCost -= tx.shares * avgCost;
      }
    });

    // Filter out symbols with zero or negative shares
    const portfolio = Object.values(holdings)
      .filter((holding) => holding.totalShares > 0)
      .map((holding) => ({
        symbol: holding.symbol,
        shares: holding.totalShares,
        averageCost: holding.totalCost / holding.totalShares,
      }));

    res.json(portfolio);
  } catch (error) {
    console.error("Error calculating portfolio summary:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Add a new transaction
app.post("/api/portfolio/transactions", authenticateToken, (req, res) => {
  try {
    const {
      symbol,
      transaction_type,
      shares,
      price_per_share,
      transaction_date,
    } = req.body;

    if (!symbol || !transaction_type || !shares || !price_per_share) {
      return res.status(400).json({ error: "All fields are required" });
    }

    if (transaction_type !== "buy" && transaction_type !== "sell") {
      return res
        .status(400)
        .json({ error: 'Transaction type must be "buy" or "sell"' });
    }

    if (shares <= 0 || price_per_share <= 0) {
      return res
        .status(400)
        .json({ error: "Shares and price must be positive numbers" });
    }

    // Validate stock symbol format
    if (!/^[A-Z]{1,5}$/.test(symbol)) {
      return res.status(400).json({
        error:
          "Invalid stock symbol format (use uppercase letters, 1-5 characters)",
      });
    }

    // Validate transaction_date if provided
    let finalTransactionDate = null;
    if (transaction_date) {
      const date = new Date(transaction_date);
      if (isNaN(date.getTime())) {
        return res.status(400).json({ error: "Invalid date format" });
      }
      // Check if date is not in the future
      if (date > new Date()) {
        return res
          .status(400)
          .json({ error: "Transaction date cannot be in the future" });
      }
      finalTransactionDate = transaction_date;
    }

    const stmt = db.prepare(`
      INSERT INTO portfolio_transactions (user_id, symbol, transaction_type, shares, price_per_share, transaction_date)
      VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))
    `);
    const result = stmt.run(
      req.user.id,
      symbol,
      transaction_type,
      shares,
      price_per_share,
      finalTransactionDate,
    );

    // Record activity
    recordActivity(
      req.user.id,
      "transaction",
      result.lastInsertRowid,
      `${transaction_type} ${shares} shares of ${symbol}`,
    );

    const newTransaction = db
      .prepare(
        `
      SELECT * FROM portfolio_transactions WHERE id = ?
    `,
      )
      .get(result.lastInsertRowid);

    res.status(201).json(newTransaction);
  } catch (error) {
    console.error("Error creating transaction:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Delete a transaction
app.delete("/api/portfolio/transactions/:id", authenticateToken, (req, res) => {
  try {
    const transactionId = req.params.id;

    const transaction = db
      .prepare("SELECT * FROM portfolio_transactions WHERE id = ?")
      .get(transactionId);

    if (!transaction) {
      return res.status(404).json({ error: "Transaction not found" });
    }

    if (transaction.user_id !== req.user.id) {
      return res
        .status(403)
        .json({ error: "Not authorized to delete this transaction" });
    }

    db.prepare("DELETE FROM portfolio_transactions WHERE id = ?").run(
      transactionId,
    );

    res.json({ message: "Transaction deleted successfully" });
  } catch (error) {
    console.error("Error deleting transaction:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ============== Stock Price API ==============

// Get current stock price (proxy to avoid CORS issues)
app.get("/api/stock/price/:symbol", async (req, res) => {
  try {
    let { symbol } = req.params;

    // Normalize symbol: decode URL, strip exchange/share suffixes like ":1" or any / separators
    try {
      symbol = decodeURIComponent(symbol);
    } catch (e) {
      /* ignore decode errors */
    }
    // If symbol contains ':' or '/' (e.g., 'SQ:1'), take the left-most part which is the actual ticker
    if (symbol.includes(":") || symbol.includes("/")) {
      symbol = symbol.split(/[:/]/)[0];
    }
    symbol = String(symbol).trim().toUpperCase();

    // Using Yahoo Finance API
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=1d`,
    );

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: "Failed to fetch stock price" });
    }

    const data = await response.json();

    if (data.chart && data.chart.result && data.chart.result[0]) {
      const result = data.chart.result[0];
      const price = result.meta.regularMarketPrice;

      if (price) {
        return res.json({
          symbol,
          price,
          currency: result.meta.currency,
          marketState: result.meta.marketState,
          previousClose: result.meta.previousClose,
        });
      }
    }

    // If v8/chart didn't return a usable price, try the v7 quote endpoint as a fallback
    try {
      const qResp = await fetch(
        `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}`,
      );
      if (qResp.ok) {
        const qjson = await qResp.json();
        const quote = qjson?.quoteResponse?.result?.[0];
        if (quote && (typeof quote.regularMarketPrice === 'number' || typeof quote.regularMarketPreviousClose === 'number')) {
          const price = typeof quote.regularMarketPrice === 'number' ? quote.regularMarketPrice : quote.regularMarketPreviousClose;
          return res.json({
            symbol,
            price,
            currency: quote.currency || null,
            marketState: quote.marketState || null,
            previousClose: typeof quote.regularMarketPreviousClose === 'number' ? quote.regularMarketPreviousClose : null,
          });
        }
      }
    } catch (err) {
      console.warn('v7 quote fallback failed for', symbol, err);
    }

    res.status(404).json({ error: "Price not found" });
  } catch (error) {
    console.error("Error fetching stock price:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ============== Competition/Leaderboard Routes ==============

// Update user's sharing preferences
app.put("/api/user/sharing-preferences", authenticateToken, (req, res) => {
  try {
    const { share_daily_returns, share_full_portfolio } = req.body;

    const stmt = db.prepare(`
      UPDATE users
      SET share_daily_returns = ?, share_full_portfolio = ?
      WHERE id = ?
    `);
    stmt.run(
      share_daily_returns ? 1 : 0,
      share_full_portfolio ? 1 : 0,
      req.user.id,
    );

    res.json({
      message: "Sharing preferences updated",
      share_daily_returns,
      share_full_portfolio,
    });
  } catch (error) {
    console.error("Error updating sharing preferences:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get user's sharing preferences
app.get("/api/user/sharing-preferences", authenticateToken, (req, res) => {
  try {
    const user = db
      .prepare(
        `
      SELECT share_daily_returns, share_full_portfolio
      FROM users
      WHERE id = ?
    `,
      )
      .get(req.user.id);

    res.json({
      share_daily_returns: Boolean(user.share_daily_returns),
      share_full_portfolio: Boolean(user.share_full_portfolio),
    });
  } catch (error) {
    console.error("Error fetching sharing preferences:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Save daily portfolio snapshot
app.post("/api/portfolio/snapshot", authenticateToken, (req, res) => {
  try {
    const { total_value, total_cost, daily_return, portfolio_data } = req.body;
    const today = new Date().toISOString().split("T")[0];

    // Delete existing snapshot for today if any
    db.prepare(
      "DELETE FROM daily_portfolio_snapshots WHERE user_id = ? AND snapshot_date = ?",
    ).run(req.user.id, today);

    // Insert new snapshot
    const stmt = db.prepare(`
      INSERT INTO daily_portfolio_snapshots
      (user_id, snapshot_date, total_value, total_cost, daily_return, portfolio_data)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      req.user.id,
      today,
      total_value,
      total_cost,
      daily_return,
      JSON.stringify(portfolio_data),
    );

    res.status(201).json({
      message: "Snapshot saved",
      id: result.lastInsertRowid,
    });
  } catch (error) {
    console.error("Error saving snapshot:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Generate historical snapshots based on transactions
app.post(
  "/api/portfolio/generate-historical-snapshots",
  authenticateToken,
  async (req, res) => {
    try {
      // Get all transactions for this user
      const transactions = db
        .prepare(
          `
      SELECT symbol, transaction_type, shares, price_per_share, transaction_date
      FROM portfolio_transactions
      WHERE user_id = ?
      ORDER BY transaction_date ASC
    `,
        )
        .all(req.user.id);

      if (transactions.length === 0) {
        return res.json({
          message: "No transactions found",
          snapshots_created: 0,
        });
      }

      // Get unique dates
      const uniqueDates = [
        ...new Set(transactions.map((t) => t.transaction_date.split(" ")[0])),
      ];

      // Sort dates
      uniqueDates.sort();

      let snapshotsCreated = 0;

      // For each date, calculate portfolio state at end of that day
      for (const date of uniqueDates) {
        // Get all transactions up to and including this date
        const txUpToDate = transactions.filter((tx) => {
          const txDate = tx.transaction_date.split(" ")[0];
          return txDate <= date;
        });

        // Calculate holdings
        const holdings = {};
        txUpToDate.forEach((tx) => {
          if (!holdings[tx.symbol]) {
            holdings[tx.symbol] = { totalShares: 0, totalCost: 0 };
          }

          if (tx.transaction_type === "buy") {
            holdings[tx.symbol].totalShares += tx.shares;
            holdings[tx.symbol].totalCost += tx.shares * tx.price_per_share;
          } else if (tx.transaction_type === "sell") {
            const avgCost =
              holdings[tx.symbol].totalShares > 0
                ? holdings[tx.symbol].totalCost /
                  holdings[tx.symbol].totalShares
                : 0;
            holdings[tx.symbol].totalShares -= tx.shares;
            holdings[tx.symbol].totalCost -= tx.shares * avgCost;
          }
        });

        // Filter positive holdings
        const portfolio = Object.entries(holdings)
          .filter(([_, h]) => h.totalShares > 0)
          .map(([symbol, h]) => ({
            symbol,
            shares: h.totalShares,
            averageCost: h.totalCost / h.totalShares,
          }));

        if (portfolio.length === 0) continue;

        // Fetch current prices for all symbols
        let totalValue = 0;
        let totalCost = 0;

        const portfolioData = [];

        for (const holding of portfolio) {
          try {
            // Fetch price
            const response = await fetch(
              `https://query1.finance.yahoo.com/v8/finance/chart/${holding.symbol}?interval=1d&range=1d`,
            );
            const data = await response.json();

            let currentPrice = holding.averageCost; // fallback to avg cost

            if (data.chart && data.chart.result && data.chart.result[0]) {
              const result = data.chart.result[0];
              currentPrice =
                result.meta.regularMarketPrice || holding.averageCost;
            }

            const value = holding.shares * currentPrice;
            const cost = holding.shares * holding.averageCost;

            totalValue += value;
            totalCost += cost;

            portfolioData.push({
              symbol: holding.symbol,
              shares: holding.shares,
              averageCost: holding.averageCost,
              currentPrice: currentPrice,
            });
          } catch (err) {
            console.error(`Error fetching price for ${holding.symbol}:`, err);
            // Use average cost as fallback
            const cost = holding.shares * holding.averageCost;
            totalValue += cost;
            totalCost += cost;

            portfolioData.push({
              symbol: holding.symbol,
              shares: holding.shares,
              averageCost: holding.averageCost,
              currentPrice: holding.averageCost,
            });
          }
        }

        const dailyReturn = totalValue - totalCost;

        // Delete existing snapshot for this date
        db.prepare(
          "DELETE FROM daily_portfolio_snapshots WHERE user_id = ? AND snapshot_date = ?",
        ).run(req.user.id, date);

        // Insert snapshot
        const stmt = db.prepare(`
        INSERT INTO daily_portfolio_snapshots
        (user_id, snapshot_date, total_value, total_cost, daily_return, portfolio_data)
        VALUES (?, ?, ?, ?, ?, ?)
      `);

        stmt.run(
          req.user.id,
          date,
          totalValue,
          totalCost,
          dailyReturn,
          JSON.stringify(portfolioData),
        );

        snapshotsCreated++;
      }

      res.json({
        message: "Historical snapshots generated",
        snapshots_created: snapshotsCreated,
        dates: uniqueDates,
      });
    } catch (error) {
      console.error("Error generating historical snapshots:", error);
      res.status(500).json({ error: "Server error" });
    }
  },
);

// Get leaderboard data (only users who opted in) - Calculate on the fly
app.get("/api/leaderboard", async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - parseInt(days));
    const cutoffDateStr = cutoffDate.toISOString().split("T")[0];
    const todayStr = new Date().toISOString().split("T")[0];

    // Get users who opted in to share daily returns
    const users = db
      .prepare(
        `
      SELECT id, username, share_full_portfolio
      FROM users
      WHERE share_daily_returns = 1
    `,
      )
      .all();

    const leaderboardData = [];

    for (const user of users) {
      // Get all transactions for this user
      const transactions = db
        .prepare(
          `
        SELECT symbol, transaction_type, shares, price_per_share, transaction_date
        FROM portfolio_transactions
        WHERE user_id = ?
        ORDER BY transaction_date ASC
      `,
        )
        .all(user.id);

      if (transactions.length === 0) continue;

      // Get earliest transaction date
      const firstTxDate = transactions[0].transaction_date.split(" ")[0];
      const startDate =
        firstTxDate > cutoffDateStr ? firstTxDate : cutoffDateStr;

      // Get all unique symbols
      const symbols = [...new Set(transactions.map((t) => t.symbol))];

      // Fetch historical prices for all symbols
      await fetchHistoricalPrices(symbols, startDate, todayStr);

      // Generate daily performance data
      const performanceData = [];
      const currentDate = new Date(startDate);
      const endDate = new Date(todayStr);

      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split("T")[0];

        // Calculate portfolio value on this date (including weekends)
        const portfolioValue = calculatePortfolioValue(
          transactions,
          dateStr,
          user.id,
        );

        // Always add a data point, even if portfolio is empty
        let returnPct = 0;
        if (portfolioValue.totalCost > 0) {
          returnPct =
            ((portfolioValue.totalValue - portfolioValue.totalCost) /
              portfolioValue.totalCost) *
            100;
        }

        performanceData.push({
          date: dateStr,
          value: portfolioValue.totalValue,
          return: returnPct,
          portfolio: user.share_full_portfolio ? portfolioValue.holdings : null,
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      if (performanceData.length > 0) {
        const currentReturn =
          performanceData[performanceData.length - 1].return;

        leaderboardData.push({
          username: user.username,
          currentReturn,
          shareFullPortfolio: Boolean(user.share_full_portfolio),
          performanceData,
        });
      }
    }

    // Sort by current return (highest first)
    leaderboardData.sort((a, b) => b.currentReturn - a.currentReturn);

    res.json(leaderboardData);
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Helper function to fetch and cache historical prices
async function fetchHistoricalPrices(symbols, startDate, endDate) {
  for (const symbol of symbols) {
    // Check if we already have prices for this symbol in the date range
    const existingPrices = db
      .prepare(
        `
      SELECT COUNT(*) as count
      FROM historical_stock_prices
      WHERE symbol = ? AND price_date >= ? AND price_date <= ?
    `,
      )
      .get(symbol, startDate, endDate);

    // If we don't have all the prices, fetch them
    if (existingPrices.count < 1) {
      try {
        // Calculate days between start and end
        const start = new Date(startDate);
        const end = new Date(endDate);
        const daysDiff = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        const range = Math.max(daysDiff + 5, 30); // Add buffer

        const response = await fetch(
          `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}d`,
        );

        if (!response.ok) continue;

        const data = await response.json();

        if (data.chart && data.chart.result && data.chart.result[0]) {
          const result = data.chart.result[0];
          const timestamps = result.timestamp || [];
          const quotes = result.indicators.quote[0];

          for (let i = 0; i < timestamps.length; i++) {
            const priceDate = new Date(timestamps[i] * 1000)
              .toISOString()
              .split("T")[0];
            const closePrice = quotes.close[i];
            const openPrice = quotes.open[i];
            const highPrice = quotes.high[i];
            const lowPrice = quotes.low[i];
            const volume = quotes.volume[i];

            if (closePrice && priceDate >= startDate && priceDate <= endDate) {
              // Insert or ignore if already exists
              try {
                db.prepare(
                  `
                  INSERT OR IGNORE INTO historical_stock_prices
                  (symbol, price_date, open_price, close_price, high_price, low_price, volume)
                  VALUES (?, ?, ?, ?, ?, ?, ?)
                `,
                ).run(
                  symbol,
                  priceDate,
                  openPrice,
                  closePrice,
                  highPrice,
                  lowPrice,
                  volume,
                );
              } catch (err) {
                // Ignore duplicate errors
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching prices for ${symbol}:`, err);
      }
    }
  }
}

// Helper function to calculate portfolio value on a specific date
function calculatePortfolioValue(transactions, targetDate, userId) {
  // Get all transactions up to target date
  const txUpToDate = transactions.filter((tx) => {
    const txDate = tx.transaction_date.split(" ")[0];
    return txDate <= targetDate;
  });

  if (txUpToDate.length === 0) {
    return { totalValue: 0, totalCost: 0, holdings: [] };
  }

  // Calculate holdings
  const holdings = {};
  txUpToDate.forEach((tx) => {
    if (!holdings[tx.symbol]) {
      holdings[tx.symbol] = { totalShares: 0, totalCost: 0 };
    }

    if (tx.transaction_type === "buy") {
      holdings[tx.symbol].totalShares += tx.shares;
      holdings[tx.symbol].totalCost += tx.shares * tx.price_per_share;
    } else if (tx.transaction_type === "sell") {
      const avgCost =
        holdings[tx.symbol].totalShares > 0
          ? holdings[tx.symbol].totalCost / holdings[tx.symbol].totalShares
          : 0;
      holdings[tx.symbol].totalShares -= tx.shares;
      holdings[tx.symbol].totalCost -= tx.shares * avgCost;
    }
  });

  let totalValue = 0;
  let totalCost = 0;
  const portfolioHoldings = [];

  for (const [symbol, holding] of Object.entries(holdings)) {
    if (holding.totalShares <= 0) continue;

    const avgCost = holding.totalCost / holding.totalShares;

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
    `,
      )
      .get(symbol, targetDate);

    const price = priceData ? priceData.close_price : avgCost;

    totalValue += holding.totalShares * price;
    totalCost += holding.totalCost;

    portfolioHoldings.push({
      symbol,
      shares: holding.totalShares,
      averageCost: avgCost,
      currentPrice: price,
    });
  }

  return {
    totalValue,
    totalCost,
    holdings: portfolioHoldings,
  };
}

// Get market index data (S&P 500 as benchmark)
app.get("/api/market/benchmark", async (req, res) => {
  try {
    const { days = 30 } = req.query;

    // Calculate date range
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - parseInt(days));

    const symbol = "^GSPC"; // S&P 500 symbol

    // Fetch historical data from Yahoo Finance
    const range = Math.max(parseInt(days) + 10, 30);
    const response = await fetch(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?interval=1d&range=${range}d`,
    );

    if (!response.ok) {
      return res
        .status(response.status)
        .json({ error: "Failed to fetch benchmark data" });
    }

    const data = await response.json();

    if (data.chart && data.chart.result && data.chart.result[0]) {
      const result = data.chart.result[0];
      const timestamps = result.timestamp;
      const prices = result.indicators.quote[0].close;

      // Create a map of date -> price
      const priceMap = {};
      for (let i = 0; i < timestamps.length; i++) {
        if (prices[i]) {
          const date = new Date(timestamps[i] * 1000)
            .toISOString()
            .split("T")[0];
          priceMap[date] = prices[i];
        }
      }

      // Find base price (first available price)
      const basePrice = prices.find((p) => p != null);

      if (!basePrice) {
        return res.status(404).json({ error: "Benchmark data not found" });
      }

      // Generate continuous daily data (including weekends)
      const benchmarkData = [];
      const currentDate = new Date(startDate);
      let lastKnownPrice = basePrice;

      while (currentDate <= endDate) {
        const dateStr = currentDate.toISOString().split("T")[0];

        // Use actual price if available, otherwise use last known price
        const price = priceMap[dateStr] || lastKnownPrice;
        if (priceMap[dateStr]) {
          lastKnownPrice = price;
        }

        const returnPct = ((price - basePrice) / basePrice) * 100;

        benchmarkData.push({
          date: dateStr,
          return: returnPct,
        });

        currentDate.setDate(currentDate.getDate() + 1);
      }

      res.json(benchmarkData);
    } else {
      res.status(404).json({ error: "Benchmark data not found" });
    }
  } catch (error) {
    console.error("Error fetching benchmark:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ============== Activity & Badge Routes ==============

// Get user's activity summary
app.get("/api/user/activity", authenticateToken, (req, res) => {
  try {
    const summary = getUserActivitySummary(req.user.id);
    res.json(summary);
  } catch (error) {
    console.error("Error fetching activity summary:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get user's activity log/history
app.get("/api/user/activity/log", authenticateToken, (req, res) => {
  try {
    const { limit = 50, offset = 0 } = req.query;

    const activityLog = db
      .prepare(
        `
      SELECT * FROM user_activity_log
      WHERE user_id = ?
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `,
      )
      .all(req.user.id, parseInt(limit), parseInt(offset));

    res.json(activityLog);
  } catch (error) {
    console.error("Error fetching activity log:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get user's badges
app.get("/api/user/badges", authenticateToken, (req, res) => {
  try {
    const badges = getUserBadges(req.user.id);
    res.json(badges);
  } catch (error) {
    console.error("Error fetching badges:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get another user's badges (public)
app.get("/api/user/:userId/badges", (req, res) => {
  try {
    const badges = getUserBadges(parseInt(req.params.userId));
    res.json(badges);
  } catch (error) {
    console.error("Error fetching user badges:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get user's level badge
app.get("/api/user/level-badge", authenticateToken, (req, res) => {
  try {
    const levelBadge = getUserLevelBadge(req.user.id);
    res.json(levelBadge);
  } catch (error) {
    console.error("Error fetching level badge:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get all available badges
app.get("/api/badges", (req, res) => {
  try {
    const badges = db
      .prepare("SELECT * FROM badges ORDER BY display_order")
      .all();
    res.json(badges);
  } catch (error) {
    console.error("Error fetching badges:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Get activity leaderboard
app.get("/api/leaderboard/activity", (req, res) => {
  try {
    const { limit = 10 } = req.query;
    const leaderboard = getActivityLeaderboard(parseInt(limit));
    res.json(leaderboard);
  } catch (error) {
    console.error("Error fetching activity leaderboard:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Manually trigger badge check (useful for testing)
app.post("/api/user/check-badges", authenticateToken, (req, res) => {
  try {
    const newBadges = checkAndAwardBadges(req.user.id);
    res.json({
      message: "Badge check completed",
      newBadges: newBadges.length,
      badges: newBadges,
    });
  } catch (error) {
    console.error("Error checking badges:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// Sync historical activity (backfill points for existing data)
app.post("/api/user/sync-activity", authenticateToken, (req, res) => {
  try {
    // Get user's existing posts, comments, and transactions
    const posts = db
      .prepare("SELECT id, title, created_at FROM posts WHERE user_id = ?")
      .all(req.user.id);
    const comments = db
      .prepare("SELECT id, created_at FROM comments WHERE user_id = ?")
      .all(req.user.id);
    const transactions = db
      .prepare(
        "SELECT id, symbol, transaction_type, shares, created_at FROM portfolio_transactions WHERE user_id = ?",
      )
      .all(req.user.id);

    // Check if activity log already exists for these items
    const existingPostLogs = db
      .prepare(
        'SELECT reference_id FROM user_activity_log WHERE user_id = ? AND activity_type = "post"',
      )
      .all(req.user.id)
      .map((r) => r.reference_id);
    const existingCommentLogs = db
      .prepare(
        'SELECT reference_id FROM user_activity_log WHERE user_id = ? AND activity_type = "comment"',
      )
      .all(req.user.id)
      .map((r) => r.reference_id);
    const existingTransactionLogs = db
      .prepare(
        'SELECT reference_id FROM user_activity_log WHERE user_id = ? AND activity_type = "transaction"',
      )
      .all(req.user.id)
      .map((r) => r.reference_id);

    let pointsAdded = 0;

    // Add activity logs for posts that don't have logs yet
    posts.forEach((post) => {
      if (!existingPostLogs.includes(post.id)) {
        const insertLog = db.prepare(`
          INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
          VALUES (?, 'post', 10, ?, ?, ?)
        `);
        insertLog.run(
          req.user.id,
          post.id,
          `Created post: ${post.title}`,
          post.created_at,
        );
        pointsAdded += 10;
      }
    });

    // Add activity logs for comments
    comments.forEach((comment) => {
      if (!existingCommentLogs.includes(comment.id)) {
        const insertLog = db.prepare(`
          INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
          VALUES (?, 'comment', 5, ?, 'Posted a comment', ?)
        `);
        insertLog.run(req.user.id, comment.id, comment.created_at);
        pointsAdded += 5;
      }
    });

    // Add activity logs for transactions
    transactions.forEach((tx) => {
      if (!existingTransactionLogs.includes(tx.id)) {
        const insertLog = db.prepare(`
          INSERT INTO user_activity_log (user_id, activity_type, points, reference_id, description, created_at)
          VALUES (?, 'transaction', 3, ?, ?, ?)
        `);
        insertLog.run(
          req.user.id,
          tx.id,
          `${tx.transaction_type} ${tx.shares} shares of ${tx.symbol}`,
          tx.created_at,
        );
        pointsAdded += 3;
      }
    });

    // Update user's total activity points
    db.prepare(
      "UPDATE users SET activity_points = activity_points + ? WHERE id = ?",
    ).run(pointsAdded, req.user.id);

    // Check and award badges
    const newBadges = checkAndAwardBadges(req.user.id);

    res.json({
      message: "Activity synced successfully",
      pointsAdded,
      postsProcessed: posts.length,
      commentsProcessed: comments.length,
      transactionsProcessed: transactions.length,
      newBadges: newBadges.length,
      badges: newBadges,
    });
  } catch (error) {
    console.error("Error syncing activity:", error);
    res.status(500).json({ error: "Server error" });
  }
});

// ============== AI Chat Routes ==============

// Chat with AI trading assistant
app.post("/api/ai/chat", authenticateToken, async (req, res) => {
  try {
    const { messages, apiKey } = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: "Messages array is required" });
    }

    if (!apiKey) {
      return res.status(400).json({
        success: false,
        error: "API key is required",
        message:
          "Please set your Gemini API key in Settings to use the AI Assistant.",
      });
    }

    // Validate message format
    const validMessages = messages.every(
      (msg) =>
        msg.role && msg.content && ["user", "assistant"].includes(msg.role),
    );

    if (!validMessages) {
      return res.status(400).json({
        error:
          "Invalid message format. Each message must have role (user/assistant) and content.",
      });
    }

    // Get the latest user message to extract tickers
    const latestUserMessage = messages.filter((m) => m.role === "user").pop();
    const detectedTickers = latestUserMessage
      ? extractTickers(latestUserMessage.content)
      : [];

    // Fetch relevant news for detected tickers from database
    let relevantNews = [];
    if (detectedTickers.length > 0) {
      try {
        const placeholders = detectedTickers.map(() => "?").join(",");
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
          `,
          )
          .all(...detectedTickers);

        console.log(
          `Found ${relevantNews.length} news articles for tickers: ${detectedTickers.join(", ")}`,
        );

        // Analyze sentiment for news that doesn't have it yet (using user's API key)
        const updateSentimentStmt = db.prepare(
          "UPDATE posts SET sentiment = ?, sentiment_confidence = ? WHERE id = ?",
        );

        for (let i = 0; i < relevantNews.length; i++) {
          const news = relevantNews[i];
          if (
            !news.sentiment ||
            news.sentiment === "neutral" ||
            news.sentiment === ""
          ) {
            try {
              console.log(
                `Analyzing sentiment for: ${news.title.substring(0, 40)}...`,
              );
              const analysis = await analyzeNewsSentiment(
                news.title,
                news.content,
                news.stock_ticker,
                apiKey,
              );

              // Update in database
              updateSentimentStmt.run(
                analysis.sentiment,
                analysis.confidence,
                news.id,
              );

              // Update in current array for response
              relevantNews[i].sentiment = analysis.sentiment;
              relevantNews[i].sentiment_confidence = analysis.confidence;

              console.log(
                `  -> ${analysis.sentiment} (${(analysis.confidence * 100).toFixed(0)}%)`,
              );
            } catch (err) {
              console.error(
                `Failed to analyze sentiment for news ${news.id}:`,
                err.message,
              );
            }
          }
        }
      } catch (err) {
        console.error("Error fetching news for AI context:", err);
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
    `,
      )
      .all(req.user.id);

    // Calculate current holdings
    const holdings = {};
    transactions.forEach((tx) => {
      if (!holdings[tx.symbol]) {
        holdings[tx.symbol] = { totalShares: 0, totalCost: 0 };
      }
      if (tx.transaction_type === "buy") {
        holdings[tx.symbol].totalShares += tx.shares;
        holdings[tx.symbol].totalCost += tx.shares * tx.price_per_share;
      } else if (tx.transaction_type === "sell") {
        const avgCost =
          holdings[tx.symbol].totalShares > 0
            ? holdings[tx.symbol].totalCost / holdings[tx.symbol].totalShares
            : 0;
        holdings[tx.symbol].totalShares -= tx.shares;
        holdings[tx.symbol].totalCost -= tx.shares * avgCost;
      }
    });

    const portfolio = Object.entries(holdings)
      .filter(([_, h]) => h.totalShares > 0)
      .map(([symbol, h]) => ({
        symbol,
        shares: h.totalShares,
        averageCost: h.totalCost / h.totalShares,
      }));

    // Build context object with news
    const context = {
      user: { username: req.user.username },
      portfolio,
      news: relevantNews,
      detectedTickers,
    };

    // Call AI service with user-provided API key
    const result = await chatWithAI({ messages, context, apiKey });

    // Include detected tickers and news count in response for frontend
    res.json({
      ...result,
      detectedTickers,
      newsCount: relevantNews.length,
      newsUsed: relevantNews.map((n) => ({
        ticker: n.stock_ticker,
        title: n.title,
        source: n.news_source,
        url: n.news_url,
        sentiment: n.sentiment,
      })),
    });
  } catch (error) {
    console.error("AI chat error:", error);
    res.status(500).json({
      success: false,
      error: "Failed to process chat request",
      message: "Sorry, I encountered an error. Please try again.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
