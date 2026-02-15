import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import { useTimezone } from '../context/TimezoneContext'
import { api } from '../services/api'
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from 'recharts'
import { formatDateOnly } from '../utils/dateFormatter'
import './PortfolioSection.css'

export default function PortfolioSection() {
  const [portfolio, setPortfolio] = useState([])
  const [transactions, setTransactions] = useState([])
  const [stockPrices, setStockPrices] = useState({})
  const [loading, setLoading] = useState(true)
  const [pricesLoading, setPricesLoading] = useState(false)
  const [showAddTransaction, setShowAddTransaction] = useState(false)
  const [showTransactionHistory, setShowTransactionHistory] = useState(false)
  const [selectedSymbol, setSelectedSymbol] = useState(null)
  const [formData, setFormData] = useState({
    symbol: '',
    transactionType: 'buy',
    shares: '',
    pricePerShare: '',
    transactionDate: new Date().toISOString().split('T')[0], // Default to today
  })
  const [error, setError] = useState('')
  const [fetchingPrice, setFetchingPrice] = useState(false)
  const [generatingSnapshots, setGeneratingSnapshots] = useState(false)

  const { token } = useAuth()
  const { timezone } = useTimezone()

  useEffect(() => {
    loadPortfolio()
    loadTransactions()
  }, [token])

  useEffect(() => {
    if (portfolio.length > 0) {
      fetchStockPrices()
    }
  }, [portfolio])

  // Save portfolio snapshot when prices are updated
  useEffect(() => {
    if (portfolio.length > 0 && Object.keys(stockPrices).length > 0) {
      saveSnapshot()
    }
  }, [stockPrices])

  const saveSnapshot = async () => {
    try {
      const totalValue = totalPortfolioValue
      const totalCost = totalCostBasis
      const dailyReturn = totalGainLoss

      const portfolioData = portfolio.map((holding) => ({
        symbol: holding.symbol,
        shares: holding.shares,
        averageCost: holding.averageCost,
        currentPrice: stockPrices[holding.symbol] || 0,
      }))

      await api.savePortfolioSnapshot(token, totalValue, totalCost, dailyReturn, portfolioData)
      console.log('Portfolio snapshot saved successfully')
    } catch (err) {
      console.error('Error saving portfolio snapshot:', err)
    }
  }

  const loadPortfolio = async () => {
    try {
      setLoading(true)
      const data = await api.getPortfolioSummary(token)
      setPortfolio(data)
    } catch (err) {
      console.error('Error loading portfolio:', err)
    } finally {
      setLoading(false)
    }
  }

  const loadTransactions = async () => {
    try {
      const data = await api.getPortfolioTransactions(token)
      setTransactions(data)
    } catch (err) {
      console.error('Error loading transactions:', err)
    }
  }

  const fetchStockPrices = async () => {
    setPricesLoading(true)
    const prices = {}

    // Fetch prices for all symbols in parallel using backend proxy
    const pricePromises = portfolio.map(async (holding) => {
      try {
        console.log(`Fetching price for ${holding.symbol}...`)

        const data = await api.getStockPrice(holding.symbol)
        console.log(`Response for ${holding.symbol}:`, data)

        if (data.price) {
          prices[holding.symbol] = data.price
          console.log(`Price for ${holding.symbol}: $${data.price}`)
        } else if (data.error) {
          console.warn(`Error for ${holding.symbol}:`, data.error)
        }
      } catch (err) {
        console.error(`Error fetching price for ${holding.symbol}:`, err)
      }
    })

    await Promise.all(pricePromises)
    console.log('All prices fetched:', prices)
    setStockPrices(prices)
    setPricesLoading(false)
  }

  const fetchPriceForSymbol = async (symbol) => {
    if (!symbol || symbol.length === 0) return

    setFetchingPrice(true)
    setError('')

    try {
      console.log(`Fetching current price for ${symbol}...`)
      const data = await api.getStockPrice(symbol)

      if (data.price) {
        setFormData((prev) => ({
          ...prev,
          pricePerShare: data.price.toFixed(2),
        }))
        console.log(`Auto-filled price for ${symbol}: $${data.price}`)
      } else if (data.error) {
        setError(`Could not fetch price for ${symbol}. Please enter manually.`)
      }
    } catch (err) {
      console.error(`Error fetching price for ${symbol}:`, err)
      setError('Could not fetch stock price. Please enter manually.')
    } finally {
      setFetchingPrice(false)
    }
  }

  const handleSymbolChange = (value) => {
    const upperValue = value.toUpperCase()
    setFormData({ ...formData, symbol: upperValue })

    // Auto-fetch price when symbol is valid (1-5 uppercase letters)
    if (/^[A-Z]{1,5}$/.test(upperValue)) {
      fetchPriceForSymbol(upperValue)
    }
  }

  const handleAddTransaction = async (e) => {
    e.preventDefault()
    setError('')

    try {
      const response = await api.createTransaction(
        token,
        formData.symbol.toUpperCase(),
        formData.transactionType,
        formData.shares,
        formData.pricePerShare,
        formData.transactionDate
      )

      if (response.error) {
        setError(response.error)
      } else {
        setShowAddTransaction(false)
        setFormData({
          symbol: '',
          transactionType: 'buy',
          shares: '',
          pricePerShare: '',
          transactionDate: new Date().toISOString().split('T')[0],
        })
        setError('')
        loadPortfolio()
        loadTransactions()
      }
    } catch (err) {
      setError('Failed to add transaction')
    }
  }

  const handleDeleteTransaction = async (transactionId) => {
    if (window.confirm('Are you sure you want to delete this transaction?')) {
      try {
        await api.deleteTransaction(token, transactionId)
        loadPortfolio()
        loadTransactions()
      } catch (err) {
        console.error('Error deleting transaction:', err)
      }
    }
  }

  const handleGenerateHistoricalSnapshots = async () => {
    if (
      !window.confirm(
        'This will generate snapshots for all your historical transactions. Continue?'
      )
    ) {
      return
    }

    try {
      setGeneratingSnapshots(true)
      const result = await api.generateHistoricalSnapshots(token)
      console.log('Historical snapshots generated:', result)
      alert(`Successfully generated ${result.snapshots_created} historical snapshots!`)
    } catch (err) {
      console.error('Error generating historical snapshots:', err)
      alert('Failed to generate historical snapshots. Please try again.')
    } finally {
      setGeneratingSnapshots(false)
    }
  }

  const calculateGainLoss = (holding) => {
    const currentPrice = stockPrices[holding.symbol]
    if (!currentPrice) return { amount: 0, percentage: 0 }

    const currentValue = holding.shares * currentPrice
    const costBasis = holding.shares * holding.averageCost
    const gainLoss = currentValue - costBasis
    const gainLossPercentage = (gainLoss / costBasis) * 100

    return {
      amount: gainLoss,
      percentage: gainLossPercentage,
    }
  }

  const totalPortfolioValue = portfolio.reduce((total, holding) => {
    const currentPrice = stockPrices[holding.symbol] || 0
    return total + holding.shares * currentPrice
  }, 0)

  const totalCostBasis = portfolio.reduce((total, holding) => {
    return total + holding.shares * holding.averageCost
  }, 0)

  const totalGainLoss = totalPortfolioValue - totalCostBasis
  const totalGainLossPercentage = totalCostBasis > 0 ? (totalGainLoss / totalCostBasis) * 100 : 0

  // Filter transactions by selected symbol
  const filteredTransactions = selectedSymbol
    ? transactions.filter((tx) => tx.symbol === selectedSymbol)
    : transactions

  const handleSymbolClick = (symbol) => {
    setSelectedSymbol(symbol)
    setShowTransactionHistory(true)
  }

  // Prepare pie chart data
  const pieChartData = portfolio.map((holding) => {
    const currentPrice = stockPrices[holding.symbol] || 0
    const marketValue = holding.shares * currentPrice
    return {
      name: holding.symbol,
      value: marketValue,
      percentage: (marketValue / totalPortfolioValue) * 100,
    }
  })

  // Colors for pie chart
  const COLORS = [
    '#71e6ff',
    '#7b5cff',
    '#9ef0ff',
    '#c3b6ff',
    '#71ffc3',
    '#ff9da7',
    '#ffd280',
    '#8df0ff',
  ]

  const renderLabel = ({ name, percent }) =>
    `${name}: ${(percent * 100).toFixed(1)}%`

  return (
    <div className="portfolio-section">
      <div className="portfolio-header">
        <h3>Investment Portfolio</h3>
        <div className="portfolio-actions">
          {portfolio.length > 0 && (
            <button onClick={fetchStockPrices} className="refresh-btn" disabled={pricesLoading}>
              {pricesLoading ? 'Refreshing...' : '🔄 Refresh Prices'}
            </button>
          )}
          <button
            onClick={() => setShowTransactionHistory(!showTransactionHistory)}
            className="history-btn"
          >
            {showTransactionHistory ? 'Hide' : 'Show'} Table
          </button>
          <button onClick={() => setShowAddTransaction(true)} className="add-transaction-btn">
            Add Transaction
          </button>
        </div>
      </div>

      {loading ? (
        <div className="loading">Loading portfolio...</div>
      ) : portfolio.length === 0 ? (
        <div className="no-portfolio">
          <p>You haven't added any investments yet.</p>
          <button onClick={() => setShowAddTransaction(true)} className="start-investing-btn">
            Start Tracking Your Portfolio
          </button>
        </div>
      ) : (
        <>
          <div className="portfolio-summary">
            <div className="summary-card">
              <div className="summary-label">Total Value</div>
              <div className="summary-value">${totalPortfolioValue.toFixed(2)}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Total Cost</div>
              <div className="summary-value">${totalCostBasis.toFixed(2)}</div>
            </div>
            <div className="summary-card">
              <div className="summary-label">Total Gain/Loss</div>
              <div className={`summary-value ${totalGainLoss >= 0 ? 'positive' : 'negative'}`}>
                ${totalGainLoss.toFixed(2)} ({totalGainLossPercentage >= 0 ? '+' : ''}
                {totalGainLossPercentage.toFixed(2)}%)
              </div>
            </div>
          </div>

          {showTransactionHistory && transactions.length > 0 && (
            <div className="transaction-history">
              <div className="transaction-history-header">
                <h4>
                  Transaction History
                  {selectedSymbol && (
                    <span className="filter-indicator"> for {selectedSymbol}</span>
                  )}
                </h4>
                {selectedSymbol && (
                  <button onClick={() => setSelectedSymbol(null)} className="clear-filter-btn">
                    Show All
                  </button>
                )}
              </div>
              <div className="transactions-table">
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Symbol</th>
                      <th>Type</th>
                      <th>Shares</th>
                      <th>Price</th>
                      <th>Total</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTransactions.map((tx) => (
                      <tr key={tx.id}>
                        <td>{formatDateOnly(tx.transaction_date, timezone)}</td>
                        <td>{tx.symbol}</td>
                        <td className={tx.transaction_type === 'buy' ? 'buy-type' : 'sell-type'}>
                          {tx.transaction_type.toUpperCase()}
                        </td>
                        <td>{tx.shares}</td>
                        <td>${tx.price_per_share.toFixed(2)}</td>
                        <td>${(tx.shares * tx.price_per_share).toFixed(2)}</td>
                        <td>
                          <button
                            onClick={() => handleDeleteTransaction(tx.id)}
                            className="delete-tx-btn"
                          >
                            Delete
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Pie Chart */}
          <div className="pie-chart-section">
            <h4>Portfolio Allocation</h4>

            <div className="pie-chart-container">
              <ResponsiveContainer width="100%" height={400}>
                <PieChart>
                  <Pie
                    data={pieChartData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={renderLabel}
                    outerRadius={120}
                    fill="var(--accent)"
                    stroke="var(--stroke)"
                    strokeWidth={1}
                    dataKey="value"
                  >
                    {pieChartData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={COLORS[index % COLORS.length]}
                        stroke="var(--stroke)"
                        strokeWidth={1}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => `$${value.toFixed(2)}`}
                    contentStyle={{
                      background: 'rgba(10, 18, 38, 0.9)',
                      border: '1px solid var(--stroke)',
                      borderRadius: '10px',
                      color: 'var(--text)',
                    }}
                    labelStyle={{ color: 'var(--muted)' }}
                    itemStyle={{ color: 'var(--text)' }}
                  />
                  <Legend
                    wrapperStyle={{ color: 'var(--text)' }}
                    iconType="circle"
                    iconSize={10}
                    formatter={(value) => <span style={{ color: 'var(--text)' }}>{value}</span>}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </>
      )}

      {showAddTransaction && (
        <div className="modal-overlay" onClick={() => setShowAddTransaction(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <h3>Add Transaction</h3>
            <form onSubmit={handleAddTransaction}>
              <div className="form-group">
                <label>Stock Symbol *</label>
                <input
                  type="text"
                  value={formData.symbol}
                  onChange={(e) => handleSymbolChange(e.target.value)}
                  placeholder="e.g., AAPL"
                  required
                  maxLength="5"
                />
                <small className="form-hint">
                  Enter a valid stock symbol (1-5 letters) to auto-fetch current price
                </small>
              </div>

              <div className="form-group">
                <label>Transaction Date *</label>
                <input
                  type="date"
                  value={formData.transactionDate}
                  onChange={(e) => setFormData({ ...formData, transactionDate: e.target.value })}
                  max={new Date().toISOString().split('T')[0]}
                  required
                />
                <small className="form-hint">
                  Date when this transaction occurred (cannot be in the future)
                </small>
              </div>

              <div className="form-group">
                <label>Transaction Type *</label>
                <select
                  value={formData.transactionType}
                  onChange={(e) => setFormData({ ...formData, transactionType: e.target.value })}
                  required
                >
                  <option value="buy">Buy</option>
                  <option value="sell">Sell</option>
                </select>
              </div>

              <div className="form-group">
                <label>Number of Shares *</label>
                <input
                  type="number"
                  step="0.001"
                  min="0.001"
                  value={formData.shares}
                  onChange={(e) => setFormData({ ...formData, shares: e.target.value })}
                  placeholder="e.g., 10"
                  required
                />
              </div>

              <div className="form-group">
                <label>
                  Price Per Share *
                  {fetchingPrice && <span className="fetching-indicator"> (Fetching...)</span>}
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.pricePerShare}
                  onChange={(e) => setFormData({ ...formData, pricePerShare: e.target.value })}
                  placeholder="e.g., 150.50"
                  required
                  disabled={fetchingPrice}
                />
                <small className="form-hint">
                  Auto-filled with current market price. You can edit for historical transactions.
                </small>
              </div>

              {error && <div className="error-message">{error}</div>}

              <div className="modal-actions">
                <button type="submit" className="submit-btn" disabled={fetchingPrice}>
                  Add Transaction
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAddTransaction(false)
                    setError('')
                    setFormData({
                      symbol: '',
                      transactionType: 'buy',
                      shares: '',
                      pricePerShare: '',
                      transactionDate: new Date().toISOString().split('T')[0],
                    })
                  }}
                  className="cancel-btn"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
