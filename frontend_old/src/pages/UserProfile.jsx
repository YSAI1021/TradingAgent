import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTimezone } from '../context/TimezoneContext'
import { api } from '../services/api'
import PortfolioSection from '../components/PortfolioSection'
import TimezoneToggle from '../components/TimezoneToggle'
import { formatDateOnly, formatRelativeTime } from '../utils/dateFormatter'
import './UserProfile.css'

export default function UserProfile() {
  const [userPosts, setUserPosts] = useState([])
  const [loading, setLoading] = useState(true)
  const [badges, setBadges] = useState([])
  const [activitySummary, setActivitySummary] = useState(null)
  const [activityLog, setActivityLog] = useState([])
  const [activeSection, setActiveSection] = useState('community')
  const [showActivityDetails, setShowActivityDetails] = useState(false)
  const [showStocksDetails, setShowStocksDetails] = useState(false)
  const [sharingPreferences, setSharingPreferences] = useState({
    share_daily_returns: false,
    share_full_portfolio: false,
  })
  // API Key settings state
  const [apiKey, setApiKey] = useState('')
  const [showApiKey, setShowApiKey] = useState(false)
  const [apiKeySaveStatus, setApiKeySaveStatus] = useState('')
  const [hasApiKey, setHasApiKey] = useState(false)
  const [isAnalyzingSentiment, setIsAnalyzingSentiment] = useState(false)
  const [sentimentAnalysisResult, setSentimentAnalysisResult] = useState(null)

  const { user, token, logout } = useAuth()
  const { timezone } = useTimezone()
  const navigate = useNavigate()

  const navItems = [
    {
      id: 'community',
      label: 'Community',
      iconClass: 'fa-solid fa-comments',
    },
    {
      id: 'portfolio',
      label: 'Portfolio',
      iconClass: 'fa-solid fa-briefcase',
    },
    {
      id: 'badges',
      label: 'Badges',
      iconClass: 'fa-solid fa-award',
    },
    {
      id: 'settings',
      label: 'Settings',
      iconClass: 'fa-solid fa-sliders',
    },
  ]

  const getBadgeToneClass = (badge) => {
    if (!badge) return 'badge-tone-default'
    if (badge.name === 'Admin') return 'badge-tone-admin'
    if (badge.badge_type === 'level') return 'badge-tone-level'

    const slug = (badge.badge_type || badge.name || 'default')
      .toString()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '')

    return slug ? `badge-tone-${slug}` : 'badge-tone-default'
  }

  useEffect(() => {
    loadUserPosts()
    loadSharingPreferences()
    loadBadges()
    loadActivitySummary()
    loadActivityLog()
    loadApiKeyStatus()
  }, [user])

  // Load API key status from localStorage
  const loadApiKeyStatus = () => {
    const storedKey = localStorage.getItem('geminiApiKey')
    setHasApiKey(!!storedKey)
  }

  const handleSaveApiKey = async () => {
    if (apiKey.trim()) {
      const savedKey = apiKey.trim()
      localStorage.setItem('geminiApiKey', savedKey)
      setApiKeySaveStatus('API Key saved! Analyzing news sentiment...')
      setHasApiKey(true)
      setApiKey('')
      setIsAnalyzingSentiment(true)
      setSentimentAnalysisResult(null)

      // Trigger sentiment analysis in background
      try {
        const result = await api.updateNewsSentiment(token, savedKey)
        setSentimentAnalysisResult(result)
        setApiKeySaveStatus(`API Key saved! Analyzed ${result.total || 0} news articles.`)
      } catch (err) {
        console.error('Sentiment analysis error:', err)
        setApiKeySaveStatus('API Key saved! (Sentiment analysis failed)')
      } finally {
        setIsAnalyzingSentiment(false)
        setTimeout(() => {
          setApiKeySaveStatus('')
          setSentimentAnalysisResult(null)
        }, 5000)
      }
    }
  }

  const handleClearApiKey = () => {
    localStorage.removeItem('geminiApiKey')
    setApiKey('')
    setHasApiKey(false)
    setApiKeySaveStatus('API Key removed')
    setTimeout(() => setApiKeySaveStatus(''), 3000)
  }

  const loadSharingPreferences = async () => {
    try {
      const prefs = await api.getSharingPreferences(token)
      setSharingPreferences(prefs)
    } catch (err) {
      console.error('Error loading sharing preferences:', err)
    }
  }

  const loadBadges = async () => {
    try {
      const data = await api.getUserBadges(token)
      setBadges(data)
    } catch (err) {
      console.error('Error loading badges:', err)
    }
  }

  const loadActivitySummary = async () => {
    try {
      const data = await api.getUserActivity(token)
      setActivitySummary(data)
    } catch (err) {
      console.error('Error loading activity summary:', err)
    }
  }

  const loadActivityLog = async () => {
    try {
      const data = await api.getUserActivityLog(token, 20) // Get last 20 activities
      setActivityLog(data)
    } catch (err) {
      console.error('Error loading activity log:', err)
    }
  }

  const getActivityIcon = (activityType) => {
    const icons = {
      post: '📝',
      comment: '💬',
      login: '🔑',
      transaction: '📊',
    }
    return icons[activityType] || '•'
  }

  const getActivityLabel = (activityType) => {
    const labels = {
      post: 'Post',
      comment: 'Comment',
      login: 'Login',
      transaction: 'Transaction',
    }
    return labels[activityType] || activityType
  }

  const formatDate = (dateString) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now - date
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    const diffDays = Math.floor(diffMs / 86400000)

    if (diffMins < 1) return 'Just now'
    if (diffMins < 60) return `${diffMins}m ago`
    if (diffHours < 24) return `${diffHours}h ago`
    if (diffDays < 7) return `${diffDays}d ago`
    return date.toLocaleDateString()
  }

  const handleSharingToggle = async (field) => {
    const newPrefs = {
      ...sharingPreferences,
      [field]: !sharingPreferences[field],
    }

    try {
      await api.updateSharingPreferences(
        token,
        newPrefs.share_daily_returns,
        newPrefs.share_full_portfolio
      )
      setSharingPreferences(newPrefs)
    } catch (err) {
      console.error('Error updating sharing preferences:', err)
    }
  }

  const loadUserPosts = async () => {
    try {
      setLoading(true)
      const allPosts = await api.getPosts()
      // Filter posts by current user
      const myPosts = allPosts.filter((post) => post.user_id === user.id)
      setUserPosts(myPosts)
    } catch (err) {
      console.error('Error loading user posts:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleDeletePost = async (postId) => {
    if (window.confirm('Are you sure you want to delete this post?')) {
      try {
        await api.deletePost(token, postId)
        loadUserPosts()
      } catch (err) {
        console.error('Error deleting post:', err)
      }
    }
  }

  // Calculate user statistics
  const postCount = userPosts.length
  const uniqueStocks = [
    ...new Set(userPosts.filter((post) => post.stock_ticker).map((post) => post.stock_ticker)),
  ]
  const mostDiscussedStock =
    userPosts.filter((post) => post.stock_ticker).length > 0
      ? userPosts
          .filter((post) => post.stock_ticker)
          .reduce((acc, post) => {
            acc[post.stock_ticker] = (acc[post.stock_ticker] || 0) + 1
            return acc
          }, {})
      : {}
  const topStock =
    Object.keys(mostDiscussedStock).length > 0
      ? Object.entries(mostDiscussedStock).sort((a, b) => b[1] - a[1])[0][0]
      : 'N/A'

  return (
    <div className="page-shell">
      <div className="bg-grid" />
      <div className="bg-lines" />
      <div className="bg-glow glow-1" />
      <div className="bg-glow glow-2" />
      <div className="bg-glow glow-3" />

      <div className="profile-container">
        <header className="header">
          <h1>AstraTrade</h1>
          <div className="header-actions">
            <TimezoneToggle />
            <button onClick={() => navigate('/')} className="back-btn">
              Back to Home
            </button>
            <button onClick={logout} className="logout-btn">
              Logout
            </button>
          </div>
        </header>

      <div className="profile-content">
        <div className="profile-header profile-card">
          <div className="profile-avatar">{user.username.charAt(0).toUpperCase()}</div>
          <div className="profile-info">
            <h2>{user.username}</h2>
            <p className="profile-email">{user.email}</p>
            <p className="profile-joined">
              Joined {formatDateOnly(user.created_at, timezone)}
            </p>
            <div className="profile-meta-chips">
              <span className="meta-chip">
                <span className="pulse-dot" />
                {postCount} posts
              </span>
              <span className="meta-chip muted">{uniqueStocks.length} tickers</span>
              <span className="meta-chip">{activitySummary?.activityPoints || 0} pts</span>
            </div>
          </div>
          {badges.length > 0 && (
            <div className="header-badges">
              {badges.slice(0, 3).map((badge) => {
                const isAdmin = badge.name === 'Admin'
                const isLevel = badge.badge_type === 'level'
                const toneClass = getBadgeToneClass(badge)
                return (
                  <div
                    key={badge.id}
                    className={`badge-mini ${toneClass} ${isAdmin ? 'admin' : ''} ${
                      isLevel ? 'level' : ''
                    }`}
                    title={badge.description}
                  >
                    <span className="badge-mini-icon">{badge.icon}</span>
                    <span className="badge-mini-name">{badge.name}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="profile-layout">
          <aside className="profile-sidebar profile-card">
            <nav className="sidebar-nav">
              {navItems.map((item) => (
                <button
                  key={item.id}
                  className={`nav-item ${activeSection === item.id ? 'active' : ''}`}
                  onClick={() => setActiveSection(item.id)}
                  aria-current={activeSection === item.id ? 'page' : undefined}
                >
                  <span className="nav-icon" aria-hidden="true">
                    <i className={item.iconClass} />
                  </span>
                  <span className="nav-label">{item.label}</span>
                </button>
              ))}
            </nav>
          </aside>

          <main className="profile-main">
            {activeSection === 'community' && (
              <div className="section-content profile-card">
                <div className="stats-summary-card profile-card">
                  <div className="stat-item">
                    <div className="stat-value-small">{postCount}</div>
                    <div className="stat-label-small">Total Posts</div>
                  </div>
                  <div className="stat-divider"></div>
                  <div className="stat-item">
                    <div className="stat-value-small">
                      {uniqueStocks.length}
                      <span
                        className="activity-info-icon"
                        onClick={() => setShowStocksDetails(!showStocksDetails)}
                        title={showStocksDetails ? 'Hide Details' : 'Show Details'}
                      >
                        {showStocksDetails ? '✕' : '?'}
                      </span>
                    </div>
                    <div className="stat-label-small">Stocks Discussed</div>
                  </div>
                  <div className="stat-divider"></div>
                  <div className="stat-item">
                    <div className="stat-value-small">{topStock}</div>
                    <div className="stat-label-small">Most Discussed</div>
                  </div>
                  <div className="stat-divider"></div>
                  <div className="stat-item">
                    <div className="stat-value-small">
                      {activitySummary?.activityPoints || 0}
                      <span
                        className="activity-info-icon"
                        onClick={() => setShowActivityDetails(!showActivityDetails)}
                        title={showActivityDetails ? 'Hide Details' : 'Show Details'}
                      >
                        {showActivityDetails ? '✕' : '?'}
                      </span>
                    </div>
                    <div className="stat-label-small">Activity Score</div>
                  </div>
                </div>

                {showStocksDetails && uniqueStocks.length > 0 && (
                  <div className="stocks-details-section profile-card">
                    <div className="profile-list">
                      {uniqueStocks.map((stock, index) => {
                        const stockPostCount = userPosts.filter(
                          (p) => p.stock_ticker === stock
                        ).length
                        return (
                          <div key={index} className="stock-item-compact">
                            <span className="stock-ticker-compact">${stock}</span>
                            <span className="stock-posts-count">
                              {stockPostCount} {stockPostCount === 1 ? 'post' : 'posts'}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {showActivityDetails && activityLog.length > 0 && (
                  <div className="activity-history-section profile-card">
                    <div className="profile-list">
                      {activityLog.map((activity) => (
                        <div key={activity.id} className="activity-item-compact">
                          <span className="activity-type-compact">
                            {getActivityLabel(activity.activity_type).toLowerCase()}
                          </span>
                          {activity.description && (
                            <span className="activity-desc-compact"> {activity.description}</span>
                          )}
                          <span className="activity-time-compact">
                            {formatDate(activity.created_at)}
                          </span>
                          <span className="activity-points-compact">+{activity.points}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="profile-posts-section profile-card">
                  <h3>My Posts ({postCount})</h3>

                  {loading ? (
                    <div className="loading">Loading posts...</div>
                  ) : userPosts.length === 0 ? (
                    <div className="no-posts">
                      <p>You haven't created any posts yet.</p>
                      <button onClick={() => navigate('/')} className="create-first-post-btn">
                        Create Your First Post
                      </button>
                    </div>
                  ) : (
                    <div className="posts-list">
                      {userPosts.map((post) => (
                        <div key={post.id} className="post-card">
                          <div className="post-single-line">
                            <span className={post.stock_ticker ? 'stock-ticker' : 'chitchat-tag'}>
                              {post.stock_ticker ? `$${post.stock_ticker}` : 'Random'}
                            </span>
                            <h4 className="post-title" onClick={() => navigate(`/post/${post.id}`)}>
                              {post.title}
                            </h4>
                            <p className="post-content-inline">{post.content}</p>
                            <span className="post-date">
                              {formatDateOnly(post.created_at, timezone)}
                            </span>
                            <button
                              onClick={() => handleDeletePost(post.id)}
                              className="delete-btn-inline"
                              title="Delete post"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeSection === 'portfolio' && (
                <div className="section-content profile-card">
                  <div className="section-header">
                    <div>
                      <h3>Portfolio Overview</h3>
                    <p className="section-description">
                      Track holdings and simulate strategies with your shared preferences.
                    </p>
                    <div className="section-chips">
                      <span className="meta-chip">
                        <span className="pulse-dot" />
                        {sharingPreferences.share_daily_returns ? 'Sharing live returns' : 'Private'}
                      </span>
                      <span className="meta-chip muted">
                        {sharingPreferences.share_full_portfolio ? 'Full portfolio visible' : 'Allocations hidden'}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="card-surface">
                  <PortfolioSection sharingPreferences={sharingPreferences} />
                </div>
              </div>
            )}

            {activeSection === 'badges' && badges.length > 0 && (
              <div className="section-content profile-card">
                <div className="badges-section">
                  <h3>Badges & Achievements</h3>
                  <div className="badges-grid">
                    {badges.map((badge) => {
                      const isAdmin = badge.name === 'Admin'
                      const toneClass = getBadgeToneClass(badge)
                      return (
                        <div
                          key={badge.id}
                          className={`badge-card ${badge.badge_type} ${toneClass} ${
                            isAdmin ? 'admin' : ''
                          }`}
                        >
                          <div className="badge-icon">{badge.icon}</div>
                          <div className="badge-info">
                            <div className="badge-name">{badge.name}</div>
                            <div className="badge-description">{badge.description}</div>
                            <div className="badge-earned">
                              Earned {formatDateOnly(badge.earned_at, timezone)}
                            </div>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'settings' && (
              <div className="section-content profile-card">
                {/* API Key Settings Section */}
                <div className="api-key-section">
                  <div className="section-header">
                    <div>
                      <h3>AI Assistant Settings</h3>
                      <p className="section-description">
                        Configure your Gemini API key to unlock the AI Trading Assistant.
                      </p>
                    </div>
                    <div className="section-chips">
                      <span className={`meta-chip ${hasApiKey ? '' : 'warning'}`}>
                        <span className={hasApiKey ? 'pulse-dot' : ''} />
                        {hasApiKey ? 'API Key configured' : 'API Key required'}
                      </span>
                    </div>
                  </div>

                  <div className="preference-card profile-card-soft api-key-card">
                    <div className="preference-info">
                      <label htmlFor="api-key-input">
                        <strong>Gemini API Key</strong>
                      </label>
                      <p className="preference-description">
                        Get your free API key from{' '}
                        <a
                          href="https://makersuite.google.com/app/apikey"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="api-key-link"
                        >
                          Google AI Studio
                        </a>
                      </p>
                    </div>

                    {hasApiKey ? (
                      <div className="api-key-configured">
                        <span className="api-key-status">API Key is configured</span>
                        <button onClick={handleClearApiKey} className="clear-api-key-btn">
                          Remove Key
                        </button>
                      </div>
                    ) : (
                      <div className="api-key-input-group">
                        <div className="input-with-toggle">
                          <input
                            type={showApiKey ? 'text' : 'password'}
                            id="api-key-input"
                            value={apiKey}
                            onChange={(e) => setApiKey(e.target.value)}
                            placeholder="Enter your Gemini API key"
                            className="api-key-input"
                          />
                          <button
                            type="button"
                            onClick={() => setShowApiKey(!showApiKey)}
                            className="toggle-visibility-btn"
                          >
                            {showApiKey ? '🙈' : '👁️'}
                          </button>
                        </div>
                        <button
                          onClick={handleSaveApiKey}
                          disabled={!apiKey.trim()}
                          className="save-api-key-btn"
                        >
                          Save Key
                        </button>
                      </div>
                    )}
                  </div>

                  {(apiKeySaveStatus || isAnalyzingSentiment) && (
                    <div className={`api-key-notice ${hasApiKey ? 'success' : ''} ${isAnalyzingSentiment ? 'analyzing' : ''}`}>
                      <span className="notice-icon">
                        {isAnalyzingSentiment ? '🔄' : hasApiKey ? '✅' : 'ℹ️'}
                      </span>
                      <span>{apiKeySaveStatus}</span>
                      {sentimentAnalysisResult && sentimentAnalysisResult.updated > 0 && (
                        <span className="sentiment-result">
                          ({sentimentAnalysisResult.updated} bullish/bearish found)
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* Competition Sharing Settings Section */}
                <div className="sharing-preferences-section">
                  <div className="section-header">
                    <div>
                      <h3>Competition Sharing Settings</h3>
                      <p className="section-description">
                        Control how much of your performance is visible on the leaderboard.
                      </p>
                    </div>
                    <div className="section-chips">
                      <span className="meta-chip">
                        <span className="pulse-dot" />
                        {sharingPreferences.share_daily_returns ? 'Live sharing on' : 'Sharing off'}
                      </span>
                      <span className="meta-chip muted">
                        {sharingPreferences.share_full_portfolio ? 'Full portfolio visible' : 'Only returns visible'}
                      </span>
                    </div>
                  </div>

                  <div className="preference-grid">
                    <div className="preference-card profile-card-soft">
                      <div className="preference-info">
                        <label htmlFor="share-daily-returns">
                          <strong>Share Daily Returns</strong>
                        </label>
                        <p className="preference-description">
                          Show your portfolio's daily performance on the public leaderboard.
                        </p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          id="share-daily-returns"
                          checked={sharingPreferences.share_daily_returns}
                          onChange={() => handleSharingToggle('share_daily_returns')}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>

                    <div className="preference-card profile-card-soft">
                      <div className="preference-info">
                        <label htmlFor="share-full-portfolio">
                          <strong>Share Full Portfolio</strong>
                        </label>
                        <p className="preference-description">
                          Allow others to see your complete holdings (requires sharing daily returns).
                        </p>
                      </div>
                      <label className="toggle-switch">
                        <input
                          type="checkbox"
                          id="share-full-portfolio"
                          checked={sharingPreferences.share_full_portfolio}
                          onChange={() => handleSharingToggle('share_full_portfolio')}
                          disabled={!sharingPreferences.share_daily_returns}
                        />
                        <span className="toggle-slider"></span>
                      </label>
                    </div>
                  </div>

                  {sharingPreferences.share_daily_returns && (
                    <div className="sharing-notice">
                      <span className="notice-icon">ℹ️</span>
                      <span>
                        Your performance is now visible on the leaderboard. Visit the Competition
                        page to see how you rank!
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
      </div>
    </div>
  )
}
