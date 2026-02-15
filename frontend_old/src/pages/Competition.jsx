import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTimezone } from '../context/TimezoneContext'
import { api } from '../services/api'
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'
import TimezoneToggle from '../components/TimezoneToggle'
import { formatDateOnly, formatShortDate } from '../utils/dateFormatter'
import './Competition.css'

export default function Competition() {
  const [leaderboardData, setLeaderboardData] = useState([])
  const [benchmarkData, setBenchmarkData] = useState([])
  const [loading, setLoading] = useState(true)
  const [timeRange, setTimeRange] = useState(30)
  const [selectedUser, setSelectedUser] = useState(null)
  const { user, logout } = useAuth()
  const { timezone } = useTimezone()
  const navigate = useNavigate()

  useEffect(() => {
    loadData()
  }, [timeRange])

  const loadData = async () => {
    try {
      setLoading(true)
      console.log('Loading competition data...')

      const [leaderboard, benchmark] = await Promise.all([
        api.getLeaderboard(timeRange),
        api.getMarketBenchmark(timeRange),
      ])

      console.log('Leaderboard data:', leaderboard)
      console.log('Benchmark data:', benchmark)

      setLeaderboardData(leaderboard)
      setBenchmarkData(benchmark)
    } catch (err) {
      console.error('Error loading competition data:', err)
      // Set empty arrays on error to show "no data" message
      setLeaderboardData([])
      setBenchmarkData([])
    } finally {
      setLoading(false)
    }
  }

  // Prepare chart data
  const prepareChartData = () => {
    if (leaderboardData.length === 0 && benchmarkData.length === 0) return []

    // Get all unique dates
    const allDates = new Set()
    leaderboardData.forEach((user) => {
      user.performanceData.forEach((point) => allDates.add(point.date))
    })
    benchmarkData.forEach((point) => allDates.add(point.date))

    const sortedDates = Array.from(allDates).sort()

    // Build chart data - include users only when they have data
    return sortedDates.map((date) => {
      const dataPoint = { date }

      // Add benchmark
      const benchmarkPoint = benchmarkData.find((p) => p.date === date)
      if (benchmarkPoint) {
        dataPoint['S&P 500'] = benchmarkPoint.return
      }

      // Add user data - only if user has data for this date
      leaderboardData.forEach((userData) => {
        const userPoint = userData.performanceData.find((p) => p.date === date)
        if (userPoint) {
          dataPoint[userData.username] = userPoint.return
        }
      })

      return dataPoint
    })
  }

  const chartData = prepareChartData()

  // Generate colors for users
  const colors = ['#667eea', '#f093fb', '#4facfe', '#43e97b', '#fa709a', '#fee140', '#30cfd0']

  if (!user) {
    navigate('/auth')
    return null
  }

  const participantCount = leaderboardData.length
  const topReturn = Math.max(
    0,
    ...leaderboardData.map((entry) => entry.performance || entry.current_return || 0)
  )

  return (
    <div className="page-shell">
      <div className="bg-grid" />
      <div className="bg-lines" />
      <div className="bg-glow glow-1" />
      <div className="bg-glow glow-2" />
      <div className="bg-glow glow-3" />

      <div className="competition-container">
        <header className="header">
          <h1>AstraTrade</h1>
          <div className="header-actions">
            <TimezoneToggle />
            <button onClick={() => navigate('/')} className="nav-btn">
              Home
            </button>
            <button onClick={() => navigate('/profile')} className="nav-btn">
              Profile
            </button>
            <span>Welcome, {user.username}</span>
            <button onClick={logout} className="logout-btn">
              Logout
            </button>
          </div>
        </header>

        <div className="competition-content">
          <div className="competition-header">
            <div>
              <h2>Portfolio Competition</h2>
              <p className="competition-subtitle">
                Compare your investment performance with other users and the S&amp;P 500
              </p>
              <div className="competition-meta">
                <span className="meta-chip">
                  <span className="pulse-dot" />
                  {participantCount} active traders
                </span>
                <span className="meta-chip muted">Top return: {topReturn.toFixed(2)}%</span>
              </div>
            </div>
            <div className="time-range-selector">
              <button className={timeRange === 7 ? 'active' : ''} onClick={() => setTimeRange(7)}>
                7 Days
              </button>
              <button
                className={timeRange === 30 ? 'active' : ''}
                onClick={() => setTimeRange(30)}
              >
                30 Days
              </button>
              <button
                className={timeRange === 90 ? 'active' : ''}
                onClick={() => setTimeRange(90)}
              >
                90 Days
              </button>
            </div>
          </div>

        {loading ? (
          <div className="loading">Loading competition data...</div>
        ) : leaderboardData.length === 0 ? (
          <div className="no-data">
            <h3>No Competition Data Yet</h3>
            <p>Be the first to share your portfolio performance!</p>
            <p>Go to your profile and enable "Share Daily Returns" to participate.</p>
            <button onClick={() => navigate('/profile')} className="go-to-profile-btn">
              Go to Profile
            </button>
          </div>
        ) : (
          <>
            {/* Performance Chart */}
            <div className="chart-section">
              <h3>Performance Chart</h3>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={chartData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 12 }}
                    tickFormatter={(date) => formatShortDate(date, timezone)}
                  />
                  <YAxis
                    label={{ value: 'Return (%)', angle: -90, position: 'insideLeft' }}
                    tick={{ fontSize: 12 }}
                  />
                  <Tooltip
                    formatter={(value) => `${value.toFixed(2)}%`}
                    labelFormatter={(date) => formatDateOnly(date, timezone)}
                  />
                  <Legend />

                  {/* Benchmark Line */}
                  <Line
                    type="monotone"
                    dataKey="S&P 500"
                    stroke="#999"
                    strokeWidth={2}
                    dot={false}
                    strokeDasharray="5 5"
                  />

                  {/* User Lines */}
                  {leaderboardData.map((userData, idx) => (
                    <Line
                      key={userData.username}
                      type="monotone"
                      dataKey={userData.username}
                      stroke={colors[idx % colors.length]}
                      strokeWidth={2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            {/* Leaderboard Table */}
            <div className="leaderboard-section">
              <h3>Leaderboard</h3>
              <div className="leaderboard-table">
                <table>
                  <thead>
                    <tr>
                      <th>Rank</th>
                      <th>Username</th>
                      <th>Return</th>
                      <th>Portfolio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaderboardData.map((userData, idx) => (
                      <tr
                        key={userData.username}
                        className={userData.username === user.username ? 'current-user' : ''}
                      >
                        <td className="rank-cell">
                          {idx === 0 && <span className="medal gold">🥇</span>}
                          {idx === 1 && <span className="medal silver">🥈</span>}
                          {idx === 2 && <span className="medal bronze">🥉</span>}
                          {idx > 2 && <span className="rank-number">#{idx + 1}</span>}
                        </td>
                        <td className="username-cell">
                          {userData.username}
                          {userData.username === user.username && (
                            <span className="you-badge">You</span>
                          )}
                        </td>
                        <td
                          className={`return-cell ${userData.currentReturn >= 0 ? 'positive' : 'negative'}`}
                        >
                          {userData.currentReturn >= 0 ? '+' : ''}
                          {userData.currentReturn.toFixed(2)}%
                        </td>
                        <td>
                          {userData.shareFullPortfolio ? (
                            <button
                              onClick={() => setSelectedUser(userData)}
                              className="view-portfolio-btn"
                            >
                              View Portfolio
                            </button>
                          ) : (
                            <span className="private-text">Private</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {/* Portfolio Modal */}
        {selectedUser && (
          <div className="modal-overlay" onClick={() => setSelectedUser(null)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3>{selectedUser.username}'s Portfolio</h3>
              <p className="modal-subtitle">
                Current Return:{' '}
                <span className={selectedUser.currentReturn >= 0 ? 'positive' : 'negative'}>
                  {selectedUser.currentReturn >= 0 ? '+' : ''}
                  {selectedUser.currentReturn.toFixed(2)}%
                </span>
              </p>

              {selectedUser.performanceData.length > 0 &&
              selectedUser.performanceData[selectedUser.performanceData.length - 1].portfolio ? (
                <div className="portfolio-holdings">
                  <p className="portfolio-note">
                    Portfolio allocation by percentage (specific amounts are private)
                  </p>
                  <table>
                    <thead>
                      <tr>
                        <th>Symbol</th>
                        <th>Allocation %</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const portfolio =
                          selectedUser.performanceData[selectedUser.performanceData.length - 1]
                            .portfolio
                        const totalValue = portfolio.reduce(
                          (sum, h) => sum + h.shares * h.currentPrice,
                          0
                        )

                        return portfolio.map((holding) => {
                          const holdingValue = holding.shares * holding.currentPrice
                          const percentage = (holdingValue / totalValue) * 100

                          return (
                            <tr key={holding.symbol}>
                              <td className="symbol-cell">{holding.symbol}</td>
                              <td>{percentage.toFixed(2)}%</td>
                            </tr>
                          )
                        })
                      })()}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p>No portfolio data available</p>
              )}

              <button onClick={() => setSelectedUser(null)} className="close-modal-btn">
                Close
              </button>
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
