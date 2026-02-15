const API_URL = import.meta.env.VITE_API_URL || '/api'

export const api = {
  // Auth endpoints
  signup: async (username, email, password) => {
    const response = await fetch(`${API_URL}/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    })
    return response.json()
  },

  login: async (username, password) => {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    })
    return response.json()
  },

  // Posts endpoints
  getPosts: async (stockTicker = null) => {
    const url = stockTicker ? `${API_URL}/posts?stock_ticker=${stockTicker}` : `${API_URL}/posts`
    const response = await fetch(url)
    return response.json()
  },

  getPost: async (id) => {
    const response = await fetch(`${API_URL}/posts/${id}`)
    return response.json()
  },

  createPost: async (token, stockTicker, title, content) => {
    const response = await fetch(`${API_URL}/posts`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ stock_ticker: stockTicker, title, content }),
    })
    return response.json()
  },

  updatePost: async (token, id, title, content) => {
    const response = await fetch(`${API_URL}/posts/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ title, content }),
    })
    return response.json()
  },

  deletePost: async (token, id) => {
    const response = await fetch(`${API_URL}/posts/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.json()
  },

  // News ingestion endpoints
  ingestNews: async (token, tickers = []) => {
    const response = await fetch(`${API_URL}/news/ingest`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tickers }),
    })
    return response.json()
  },

  getNews: async (stockTicker = null, limit = 3) => {
    const url = stockTicker
      ? `${API_URL}/news?stock_ticker=${stockTicker}&limit=${limit}`
      : `${API_URL}/news?limit=${limit}`
    const response = await fetch(url)
    return response.json()
  },

  // Comments endpoints
  getComments: async (postId) => {
    const response = await fetch(`${API_URL}/posts/${postId}/comments`)
    return response.json()
  },

  createComment: async (token, postId, content, parentCommentId = null) => {
    const response = await fetch(`${API_URL}/posts/${postId}/comments`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ content, parent_comment_id: parentCommentId }),
    })
    return response.json()
  },

  deleteComment: async (token, id) => {
    const response = await fetch(`${API_URL}/comments/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.json()
  },

  // Portfolio endpoints
  getPortfolioTransactions: async (token) => {
    const response = await fetch(`${API_URL}/portfolio/transactions`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.json()
  },

  getPortfolioSummary: async (token) => {
    const response = await fetch(`${API_URL}/portfolio/summary`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.json()
  },

  createTransaction: async (
    token,
    symbol,
    transactionType,
    shares,
    pricePerShare,
    transactionDate = null
  ) => {
    const response = await fetch(`${API_URL}/portfolio/transactions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        symbol,
        transaction_type: transactionType,
        shares: parseFloat(shares),
        price_per_share: parseFloat(pricePerShare),
        transaction_date: transactionDate,
      }),
    })
    return response.json()
  },

  deleteTransaction: async (token, id) => {
    const response = await fetch(`${API_URL}/portfolio/transactions/${id}`, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.json()
  },

  // Stock price endpoint
  getStockPrice: async (symbol) => {
    const response = await fetch(`${API_URL}/stock/price/${symbol}`)
    return response.json()
  },

  // Competition/Leaderboard endpoints
  getSharingPreferences: async (token) => {
    const response = await fetch(`${API_URL}/user/sharing-preferences`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.json()
  },

  updateSharingPreferences: async (token, shareDailyReturns, shareFullPortfolio) => {
    const response = await fetch(`${API_URL}/user/sharing-preferences`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        share_daily_returns: shareDailyReturns,
        share_full_portfolio: shareFullPortfolio,
      }),
    })
    return response.json()
  },

  savePortfolioSnapshot: async (token, totalValue, totalCost, dailyReturn, portfolioData) => {
    const response = await fetch(`${API_URL}/portfolio/snapshot`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        total_value: totalValue,
        total_cost: totalCost,
        daily_return: dailyReturn,
        portfolio_data: portfolioData,
      }),
    })
    return response.json()
  },

  generateHistoricalSnapshots: async (token) => {
    const response = await fetch(`${API_URL}/portfolio/generate-historical-snapshots`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.json()
  },

  getLeaderboard: async (days = 30) => {
    const response = await fetch(`${API_URL}/leaderboard?days=${days}`)
    return response.json()
  },

  getMarketBenchmark: async (days = 30) => {
    const response = await fetch(`${API_URL}/market/benchmark?days=${days}`)
    return response.json()
  },

  // Activity & Badge endpoints
  getUserActivity: async (token) => {
    const response = await fetch(`${API_URL}/user/activity`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.json()
  },

  getUserActivityLog: async (token, limit = 50, offset = 0) => {
    const response = await fetch(`${API_URL}/user/activity/log?limit=${limit}&offset=${offset}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.json()
  },

  getUserBadges: async (token) => {
    const response = await fetch(`${API_URL}/user/badges`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.json()
  },

  getUserBadgesById: async (token, userId) => {
    const response = await fetch(`${API_URL}/user/${userId}/badges`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    })
    return response.json()
  },

  getAllBadges: async () => {
    const response = await fetch(`${API_URL}/badges`)
    return response.json()
  },

  getActivityLeaderboard: async (limit = 10) => {
    const response = await fetch(`${API_URL}/leaderboard/activity?limit=${limit}`)
    return response.json()
  },

  // AI Chat endpoint
  chatWithAI: async (token, messages, apiKey) => {
    const response = await fetch(`${API_URL}/ai/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ messages, apiKey }),
    })
    return response.json()
  },

  // Update news sentiment using user's API key
  updateNewsSentiment: async (token, apiKey) => {
    const response = await fetch(`${API_URL}/news/update-sentiment`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ apiKey }),
    })
    return response.json()
  },
}
