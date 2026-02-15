import { useState, useEffect, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTimezone } from '../context/TimezoneContext'
import { api } from '../services/api'
import MiniStockWidget from '../components/MiniStockWidget'
import TimezoneToggle from '../components/TimezoneToggle'
import { formatDate, formatDateOnly, formatShortDate } from '../utils/dateFormatter'
import './Home.css'

export default function Home() {
  const [posts, setPosts] = useState([])
  const [filteredTicker, setFilteredTicker] = useState('')
  const [showCreatePost, setShowCreatePost] = useState(false)
  const [stockTicker, setStockTicker] = useState('')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [hoveredStock, setHoveredStock] = useState(null)
  const [error, setError] = useState('')
  const [customWatchlist, setCustomWatchlist] = useState([])
  const [showAddStock, setShowAddStock] = useState(false)
  const [newStockTicker, setNewStockTicker] = useState('')
  const [watchlistMode, setWatchlistMode] = useState('auto') // 'auto' or 'custom'
  const [isEditMode, setIsEditMode] = useState(false)
  const [hoverTimeout, setHoverTimeout] = useState(null)
  const [showWatchlistPeek, setShowWatchlistPeek] = useState(false)
  const [isFetchingNews, setIsFetchingNews] = useState(false)
  const [newsStatus, setNewsStatus] = useState('')
  const [newsCache, setNewsCache] = useState({})
  const [hoverNews, setHoverNews] = useState({ ticker: null, items: [] })
  const isHoveringNewsPanelRef = useRef(false)
  const [newsShuffleKey, setNewsShuffleKey] = useState(0)
  const [brokenLogos, setBrokenLogos] = useState({})
  const createPostInputRef = useRef(null)
  const stockRefs = useRef({})

  const { user, token, logout } = useAuth()
  const { timezone } = useTimezone()
  const navigate = useNavigate()

  // Load custom watchlist from localStorage
  useEffect(() => {
    const savedWatchlist = localStorage.getItem('customWatchlist')
    const savedMode = localStorage.getItem('watchlistMode')
    if (savedWatchlist) {
      setCustomWatchlist(JSON.parse(savedWatchlist))
    }
    if (savedMode) {
      setWatchlistMode(savedMode)
    }
  }, [])

  useEffect(() => {
    loadPosts()
  }, [filteredTicker])

  const loadPosts = async () => {
    try {
      const data = await api.getPosts(filteredTicker || null)
      setPosts(data)
    } catch (err) {
      console.error('Error loading posts:', err)
    }
  }

  // Extract unique stock tickers from posts
  const autoStockList = useMemo(() => {
    // Filter out null/empty stock tickers and get unique values
    const uniqueTickers = [
      ...new Set(posts.map((post) => post.stock_ticker).filter((ticker) => ticker)),
    ]
    // Sort by frequency (most discussed stocks first)
    const tickerCounts = posts.reduce((acc, post) => {
      if (post.stock_ticker) {
        acc[post.stock_ticker] = (acc[post.stock_ticker] || 0) + 1
      }
      return acc
    }, {})

    const sortedTickers = uniqueTickers.sort((a, b) => tickerCounts[b] - tickerCounts[a])

    // Default stocks (Magnificent Seven)
    const defaultStocks = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'META', 'TSLA']

    // If no posts, show default stocks
    if (sortedTickers.length === 0) {
      return defaultStocks
    }

    // Combine discussed stocks with default stocks (remove duplicates)
    const combinedList = [...sortedTickers]
    defaultStocks.forEach((stock) => {
      if (!combinedList.includes(stock)) {
        combinedList.push(stock)
      }
    })

    return combinedList.slice(0, 10) // Show top 10 stocks
  }, [posts])

  // Choose which stock list to display
  const stockList = watchlistMode === 'custom' ? customWatchlist : autoStockList

  const featuredTickers = stockList.slice(0, 6)
  const logoUrlForTicker = (ticker) =>
    ticker ? `https://storage.googleapis.com/iex/api/logos/${ticker.toUpperCase()}.png` : null
  const interleaveNews = (postList, newsByTickerCache) => {
    const output = []
    const usedTickerNews = {}
    // Prepare one headline per ticker for potential use
    let availableNews = Object.entries(newsByTickerCache)
      .map(([ticker, items]) => (items && items.length > 0 ? { ...items[0], stock_ticker: ticker } : null))
      .filter(Boolean)

    postList.forEach((post) => {
      output.push(post)
      const ticker = post.stock_ticker
      if (!ticker || usedTickerNews[ticker]) return
      const newsMatchIndex = availableNews.findIndex(
        (item) => item.stock_ticker === ticker || item.ticker === ticker
      )
      if (newsMatchIndex !== -1) {
        const matched = availableNews.splice(newsMatchIndex, 1)[0]
        output.push({
          ...matched,
          is_news: true,
          isInjected: true,
          id: matched.id || `news-${ticker}-${matched.news_url || Math.random()}`,
        })
        usedTickerNews[ticker] = true
      }
    })

    // Randomly sprinkle a couple more news items into the feed
    const extraNews = availableNews.slice(0, 2)
    extraNews.forEach((item, idx) => {
      const seeded = Math.abs(Math.sin(newsShuffleKey + idx * 31)) // deterministic pseudo-random
      const insertAt = Math.max(1, Math.min(output.length, Math.floor(seeded * output.length)))
      output.splice(insertAt, 0, {
        ...item,
        is_news: true,
        isInjected: true,
        id:
          item.id ||
          `news-rand-${item.stock_ticker || item.ticker}-${item.news_url || newsShuffleKey}-${idx}`,
      })
    })

    return output
  }

  // Prefetch recent news for tickers in the current watchlist/auto list
  useEffect(() => {
    const tickersToPrefetch = stockList.slice(0, 6)
    const missing = tickersToPrefetch.filter((t) => !newsCache[t])
    if (missing.length === 0) return

    const fetchNews = async () => {
      try {
        const results = await Promise.all(
          missing.map(async (t) => {
            const items = await api.getNews(t, 3)
            return [t, Array.isArray(items) ? items.slice(0, 3) : []]
          })
        )
        setNewsCache((prev) => {
          const next = { ...prev }
          results.forEach(([t, items]) => {
            next[t] = items
          })
          return next
        })
      } catch (err) {
        console.error('Prefetch news failed', err)
      }
    }

    fetchNews()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stockList])

  // Change shuffle key only when the underlying posts or news cache change,
  // not on hover-driven rerenders.
  useEffect(() => {
    setNewsShuffleKey((key) => key + 1)
  }, [posts, newsCache])

  const interleavedPosts = useMemo(
    () => interleaveNews(posts.filter((p) => !p.is_news), newsCache),
    [posts, newsCache, newsShuffleKey]
  )

  // Add stock to custom watchlist
  const handleAddStock = () => {
    const ticker = newStockTicker.toUpperCase().trim()
    if (!ticker) return

    if (!/^[A-Z]{1,5}$/.test(ticker)) {
      alert('Invalid stock ticker format (1-5 uppercase letters)')
      return
    }

    if (customWatchlist.includes(ticker)) {
      alert('Stock already in your watchlist')
      return
    }

    const updatedWatchlist = [...customWatchlist, ticker]
    setCustomWatchlist(updatedWatchlist)
    localStorage.setItem('customWatchlist', JSON.stringify(updatedWatchlist))
    setNewStockTicker('')
    setShowAddStock(false)
  }

  // Remove stock from custom watchlist
  const handleRemoveStock = (ticker) => {
    const updatedWatchlist = customWatchlist.filter((t) => t !== ticker)
    setCustomWatchlist(updatedWatchlist)
    localStorage.setItem('customWatchlist', JSON.stringify(updatedWatchlist))
  }

  // Toggle watchlist mode
  const handleToggleMode = (mode) => {
    setWatchlistMode(mode)
    localStorage.setItem('watchlistMode', mode)
    // Exit edit mode when switching modes
    setIsEditMode(false)
    setShowAddStock(false)
  }

  // Handle post hover with 0.3 second delay
  const handlePostMouseEnter = (ticker) => {
    // Clear any existing timeout
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
    }
    // Set new timeout
    const timeout = setTimeout(() => {
      setHoveredStock(ticker)
      loadHoverNews(ticker)
    }, 300) // 0.3 second delay
    setHoverTimeout(timeout)
  }

  const handlePostMouseLeave = () => {
    // Clear timeout if mouse leaves before delay
    if (hoverTimeout) {
      clearTimeout(hoverTimeout)
      setHoverTimeout(null)
    }
    // Only clear hover state if not hovering over the news panel
    // Use a small delay to allow mouse to reach the panel
    setTimeout(() => {
      if (!isHoveringNewsPanelRef.current) {
        setHoveredStock(null)
        setHoverNews({ ticker: null, items: [] })
      }
    }, 150)
  }

  const handleNewsPanelMouseEnter = () => {
    isHoveringNewsPanelRef.current = true
  }

  const handleNewsPanelMouseLeave = () => {
    isHoveringNewsPanelRef.current = false
    setHoveredStock(null)
    setHoverNews({ ticker: null, items: [] })
  }

  const handleCreatePost = async (e) => {
    e.preventDefault()
    setError('')

    try {
      const ticker = stockTicker.trim() ? stockTicker.toUpperCase() : ''
      const response = await api.createPost(token, ticker, title, content)
      if (response.error) {
        setError(response.error)
      } else {
        setShowCreatePost(false)
        setStockTicker('')
        setTitle('')
        setContent('')
        loadPosts()
      }
    } catch (err) {
      setError('Failed to create post')
    }
  }

  // Focus the first input when the compose panel opens
  useEffect(() => {
    if (showCreatePost) {
      setTimeout(() => {
        createPostInputRef.current?.focus()
      }, 150)
    }
  }, [showCreatePost])

  const handleDeletePost = async (postId) => {
    if (window.confirm('Are you sure you want to delete this post?')) {
      try {
        await api.deletePost(token, postId)
        loadPosts()
      } catch (err) {
        console.error('Error deleting post:', err)
      }
    }
  }

  const handleSyncNews = async () => {
    if (isFetchingNews) return
    const tickersToSync = stockList.slice(0, 6)

    if (tickersToSync.length === 0) {
      setNewsStatus('No tickers in your watchlist yet.')
      return
    }

    setIsFetchingNews(true)
    setNewsStatus(`Pulling headlines for ${tickersToSync.join(', ')}...`)

    try {
      const response = await api.ingestNews(token, tickersToSync)
      if (response.error) {
        setNewsStatus(response.error)
      } else {
        const { inserted_count = 0, skipped_count = 0 } = response
        const pieces = []
        if (inserted_count > 0)
          pieces.push(`added ${inserted_count} new stor${inserted_count === 1 ? 'y' : 'ies'}`)
        if (skipped_count > 0) pieces.push(`${skipped_count} already on the board`)
        setNewsStatus(pieces.length > 0 ? pieces.join(', ') : 'No new stories right now.')
        await loadPosts()
        // Invalidate cache for these tickers
        setNewsCache((prev) => {
          const next = { ...prev }
          tickersToSync.forEach((t) => delete next[t])
          return next
        })
      }
    } catch (err) {
      setNewsStatus('Failed to fetch news. Please try again.')
    } finally {
      setIsFetchingNews(false)
    }
  }

  const loadHoverNews = async (ticker) => {
    if (!ticker) return
    // Serve cached if present
    if (newsCache[ticker]) {
      setHoverNews({ ticker, items: newsCache[ticker] })
      return
    }
    try {
      const items = await api.getNews(ticker, 3)
      const topThree = Array.isArray(items) ? items.slice(0, 3) : []
      setNewsCache((prev) => ({ ...prev, [ticker]: topThree }))
      setHoverNews({ ticker, items: topThree })
    } catch (err) {
      console.error('Failed to load hover news for', ticker, err)
    }
  }

  if (!user) {
    navigate('/auth')
    return null
  }

  return (
    <>
      <div className="home-shell">
        <div className="bg-grid" />
        <div className="bg-lines" />
        <div className="bg-glow glow-1" />
        <div className="bg-glow glow-2" />
        <div className="bg-glow glow-3" />

        <div className="home-container">
          <header className="header">
            <div className="brand">
              <div className="brand-icon">✦</div>
              <div>
                <h1>AstraTrade</h1>
                <p className="brand-subtitle">Realtime trading desk</p>
              </div>
            </div>
            <div className="header-actions">
              <TimezoneToggle />
              <span className="welcome-chip">
                <span className="pulse-dot" />
                Welcome, {user.username}
              </span>
              <button onClick={() => navigate('/competition')} className="competition-btn">
                Competition
              </button>
              <button onClick={() => navigate('/ai-chat')} className="ai-chat-btn">
                AI Assistant
              </button>
              <button onClick={() => navigate('/profile')} className="profile-btn">
                Profile
              </button>
              <button onClick={logout} className="logout-btn">
                Logout
              </button>
            </div>
          </header>

          <section className="hero-panel">
            <div className="hero-copy">
              <p className="eyebrow">Signal-forward &bullet; Community-powered</p>
              <h2>Ride the tickers with the most heat.</h2>
              <p className="lede">
                Curate your own watchlist or lock onto the stocks with the loudest conversations in
                AstraTrade.
              </p>
              <div className="hero-tickers">
                {featuredTickers.map((ticker) => (
                  <span key={ticker} className="ticker-chip">
                    <span className="pulse-dot" />
                    {ticker}
                  </span>
                ))}
              </div>
            </div>
            <div className="hero-visual">
              <div className="radar">
                <span className="ring ring-1" />
                <span className="ring ring-2" />
                <span className="ring ring-3" />
                <span className="blip" />
              </div>
              <div className="metric-card">
                <span>Active threads</span>
                <strong>{posts.length}</strong>
              </div>
            </div>
          </section>

          <div className="main-content">
            <div className="sidebar">
              <div className="watchlist-header">
                <h2>Stock Watchlist</h2>
                <div className="watchlist-mode-toggle">
                  <button
                    className={`mode-btn ${watchlistMode === 'auto' ? 'active' : ''}`}
                    onClick={() => handleToggleMode('auto')}
                  >
                    Auto
                  </button>
                  <button
                    className={`mode-btn ${watchlistMode === 'custom' ? 'active' : ''}`}
                    onClick={() => handleToggleMode('custom')}
                  >
                    Custom
                  </button>
                </div>
              </div>

              <p className="watchlist-subtitle">
                {watchlistMode === 'custom'
                  ? `Your custom watchlist (${customWatchlist.length} stocks)`
                  : posts.length > 0
                    ? 'Trending stocks from discussions'
                    : 'Magnificent Seven (Default)'}
              </p>

              {watchlistMode === 'custom' && (
                <div className="watchlist-controls">
                  <button
                    onClick={() => setIsEditMode(!isEditMode)}
                    className={`edit-mode-btn ${isEditMode ? 'active' : ''}`}
                  >
                    {isEditMode ? '✓ Done' : '✎ Edit'}
                  </button>
                  {isEditMode && (
                    <button onClick={() => setShowAddStock(true)} className="add-stock-btn">
                      + Add Stock
                    </button>
                  )}
                </div>
              )}

              {showAddStock && (
                <div className="add-stock-form">
                  <input
                    type="text"
                    value={newStockTicker}
                    onChange={(e) => setNewStockTicker(e.target.value.toUpperCase())}
                    placeholder="Enter ticker (e.g., AAPL)"
                    maxLength="5"
                    onKeyPress={(e) => e.key === 'Enter' && handleAddStock()}
                  />
                  <div className="add-stock-actions">
                    <button onClick={handleAddStock} className="confirm-btn">
                      Add
                    </button>
                    <button
                      onClick={() => {
                        setShowAddStock(false)
                        setNewStockTicker('')
                      }}
                      className="cancel-btn-small"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              <div className="stock-watchlist">
                {stockList.length === 0 ? (
                  <p className="no-stocks">
                    {watchlistMode === 'custom'
                      ? 'Click "Add Stock" to build your watchlist'
                      : 'No stocks to display'}
                  </p>
                ) : (
                  stockList.map((ticker, index) => {
                    const isHovered = hoveredStock === ticker
                    const hoveredIndex = hoveredStock ? stockList.indexOf(hoveredStock) : -1

                    // Calculate transform based on position
                    let translateY = 0
                    let zIndex = stockList.length - index

                    if (hoveredStock && stockList.includes(hoveredStock)) {
                      if (ticker === hoveredStock) {
                        // Move hovered stock to top (index 0 position)
                        translateY = -index * 100 // Each widget is approximately 100% height
                        zIndex = stockList.length + 1 // Highest z-index
                      } else if (index < hoveredIndex) {
                        // Stocks above hovered stock move down by 1 position
                        translateY = 100
                      }
                    }

                    return (
                      <div
                        key={ticker}
                        className={`stock-widget-wrapper ${isHovered ? 'highlighted' : ''}`}
                        style={{
                          transform: `translateY(${translateY}%)`,
                          zIndex: zIndex,
                        }}
                      >
                        <MiniStockWidget symbol={ticker} isHighlighted={isHovered} />
                        {watchlistMode === 'custom' && isEditMode && (
                          <button
                            onClick={() => handleRemoveStock(ticker)}
                            className="remove-stock-btn"
                            title="Remove from watchlist"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </div>

            <div className="posts-section">
              <div className="posts-header">
                <h2>Discussion Board</h2>
                <div className="post-header-actions">
                  <button
                    onClick={handleSyncNews}
                    className="sync-news-btn"
                    disabled={isFetchingNews}
                    title="Pull fresh headlines for the tickers shown in your watchlist"
                  >
                    {isFetchingNews ? 'Syncing...' : 'Sync watchlist news'}
                  </button>
                  <button onClick={() => setShowCreatePost(true)} className="create-btn">
                    Create Post
                  </button>
                </div>
              </div>

              {newsStatus && <div className="news-status-chip">{newsStatus}</div>}

              <div className="filter-section">
                <input
                  type="text"
                  placeholder="Filter by stock ticker (e.g., AAPL)"
                  value={filteredTicker}
                  onChange={(e) => setFilteredTicker(e.target.value.toUpperCase())}
                  className="filter-input"
                />
                {filteredTicker && (
                  <button onClick={() => setFilteredTicker('')} className="clear-filter">
                    Clear Filter
                  </button>
                )}
              </div>

              <div className="posts-list">
                {posts.length === 0 ? (
                  <p className="no-posts">No posts yet. Be the first to share!</p>
                ) : (
                  interleavedPosts.map((post) => {
                    const isBadThumb =
                      post.news_image_url &&
                      (post.news_image_url.includes('googleusercontent.com') ||
                        post.news_image_url.includes('news.google.com') ||
                        post.news_image_url.includes('gstatic.com'))
                    const logoUrl =
                      post.stock_ticker && !brokenLogos[post.stock_ticker]
                        ? logoUrlForTicker(post.stock_ticker)
                        : null

                    return (
                      <div
                        key={post.id}
                        className={`post-card ${post.is_news ? 'news-post-card' : ''}`}
                        onClick={() => navigate(`/post/${post.id}`)}
                        onMouseEnter={() =>
                          post.stock_ticker && handlePostMouseEnter(post.stock_ticker)
                        }
                        onMouseLeave={handlePostMouseLeave}
                        style={{ cursor: 'pointer' }}
                      >
                        <div className="post-header">
                          <div className="post-labels">
                            {post.is_news ? (
                              <span className="news-chip">News</span>
                            ) : (
                              <span className={post.stock_ticker ? 'stock-ticker' : 'chitchat-tag'}>
                                {post.stock_ticker ? `$${post.stock_ticker}` : 'Chitchat'}
                              </span>
                            )}
                            {post.is_news ? (
                              post.stock_ticker ? (
                                <span className="ticker-chip subtle">${post.stock_ticker}</span>
                              ) : null
                            ) : null}
                            {post.is_news && post.sentiment && post.sentiment !== 'neutral' && (
                              <span className={`sentiment-chip ${post.sentiment}`}>
                                {post.sentiment === 'bullish' ? '📈 Bullish' : '📉 Bearish'}
                              </span>
                            )}
                          </div>
                          <div className="post-meta-info">
                            <span className="post-date-header">
                              {formatDate(post.news_published_at || post.created_at, timezone)}
                            </span>
                            <span style={{ color: '#999', fontWeight: 'normal' }}>by</span>
                            <span className="post-author">{post.username}</span>
                          </div>
                        </div>
                        <h3 className={post.is_news ? 'news-title' : ''}>{post.title}</h3>
                        {post.is_news ? (
                          <div
                            className={`news-content ${
                              post.news_image_url && !isBadThumb ? 'has-thumb' : ''
                            }`}
                          >
                            {post.news_image_url && !isBadThumb ? (
                              <div className="news-thumb">
                                <img src={post.news_image_url} alt="" loading="lazy" />
                              </div>
                            ) : logoUrl ? (
                              <div className="news-thumb logo-thumb">
                                <img
                                  src={logoUrl}
                                  alt={`${post.stock_ticker} logo`}
                                  loading="lazy"
                                  onError={() =>
                                    setBrokenLogos((prev) => ({
                                      ...prev,
                                      [post.stock_ticker]: true,
                                    }))
                                  }
                                />
                              </div>
                            ) : (
                              <div className="news-thumb placeholder">
                                <div className="news-thumb-initial">
                                  {(post.stock_ticker || post.title || 'N').slice(0, 1)}
                                </div>
                              </div>
                            )}
                            <div className="news-copy">
                              <div className="news-topline">
                                <span className="news-source">
                                  {post.news_source || 'Newswire'}
                                  {post.news_published_at
                                    ? ` • ${formatDateOnly(post.news_published_at, timezone)}`
                                    : ''}
                                </span>
                                {post.news_url && (
                                  <a
                                    className="news-link"
                                    href={post.news_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    Read full article →
                                  </a>
                                )}
                              </div>
                              <p className="post-content">{post.content}</p>
                            </div>
                          </div>
                        ) : null}
                        {!post.is_news && <p className="post-content">{post.content}</p>}
                        <div className="post-footer">
                          <span className="comment-count">
                            {post.comment_count || 0}{' '}
                            {post.comment_count === 1 ? 'comment' : 'comments'}
                          </span>
                          {user.id === post.user_id && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation()
                                handleDeletePost(post.id)
                              }}
                              className="delete-btn"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })
                )}
              </div>
            </div>
          </div>

          {!showCreatePost && (
            <button
              className="floating-create-btn"
              onClick={() => setShowCreatePost(true)}
              aria-label="Create a new discussion post"
            >
              ✦ New Post
            </button>
          )}

          {stockList.length > 0 && (
            <div className={`watchlist-peek ${showWatchlistPeek ? 'open' : ''}`}>
              <button
                className="watchlist-peek-toggle"
                onClick={() => setShowWatchlistPeek((prev) => !prev)}
                aria-label="Toggle watchlist peek"
              >
                {showWatchlistPeek ? 'Hide Watchlist' : 'Quick Watchlist'}
              </button>

              {showWatchlistPeek && (
                <div className="watchlist-peek-body">
                  {stockList.map((ticker) => (
                    <button
                      key={ticker}
                      className={`watchlist-peek-chip ${
                        hoveredStock === ticker ? 'highlighted' : ''
                      }`}
                      onClick={() => setFilteredTicker(ticker)}
                      onMouseEnter={() => handlePostMouseEnter(ticker)}
                      onMouseLeave={handlePostMouseLeave}
                    >
                      <span className="pulse-dot" />
                      {ticker}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {hoverNews.ticker && hoverNews.items.length > 0 && (
            <div
              className="hover-news-panel"
              onMouseEnter={handleNewsPanelMouseEnter}
              onMouseLeave={handleNewsPanelMouseLeave}
            >
              <div className="hover-news-header">
                <span>News for ${hoverNews.ticker}</span>
              </div>
              <div className="hover-news-list">
                {hoverNews.items.map((item) => (
                  <a
                    key={item.id || item.news_url}
                    className={`hover-news-card sentiment-${item.sentiment || 'neutral'}`}
                    href={item.news_url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {item.sentiment && item.sentiment !== 'neutral' && (
                      <span className={`sentiment-badge ${item.sentiment}`}>
                        {item.sentiment === 'bullish' ? '📈 Bullish' : '📉 Bearish'}
                      </span>
                    )}
                    <div className="hover-news-title">{item.title}</div>
                    <div className="hover-news-meta">
                      <span>{item.news_source || 'Newswire'}</span>
                      {item.news_published_at && (
                        <span>
                          {formatShortDate(item.news_published_at, timezone)}
                        </span>
                      )}
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {showCreatePost && (
        <div className="compose-drawer">
          <div className="compose-header">
            <div>
              <p className="compose-label">New Discussion</p>
              <h3>Create Post</h3>
            </div>
            <button className="close-compose-btn" onClick={() => setShowCreatePost(false)}>
              ×
            </button>
          </div>

          <form onSubmit={handleCreatePost} className="compose-form">
            <div className="form-group">
              <label>Stock Ticker (optional)</label>
              <input
                ref={createPostInputRef}
                type="text"
                value={stockTicker}
                onChange={(e) => setStockTicker(e.target.value.toUpperCase())}
                placeholder="e.g., AAPL (leave empty for chitchat)"
                maxLength="5"
              />
            </div>

            <div className="form-group">
              <label>Title *</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label>Content *</label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows="5"
                required
              />
            </div>

            {error && <div className="error-message">{error}</div>}

            <div className="compose-actions">
              <button type="submit" className="submit-btn">
                Create Post
              </button>
              <button
                type="button"
                onClick={() => setShowCreatePost(false)}
                className="cancel-btn"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      )}
    </>
  )
}
