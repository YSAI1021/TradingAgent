import { useEffect, useRef } from 'react'

// Map common tickers to their exchanges
const getExchangePrefix = (ticker) => {
  const nasdaqStocks = ['AAPL', 'MSFT', 'GOOGL', 'GOOG', 'AMZN', 'META', 'NVDA', 'TSLA', 'AMD', 'INTC', 'NFLX', 'PYPL', 'ADBE', 'CSCO', 'CMCSA', 'PEP', 'COST', 'AVGO', 'TXN', 'QCOM', 'SBUX', 'INTU', 'ISRG', 'MDLZ', 'GILD', 'BKNG', 'VRTX', 'REGN', 'ADI', 'ADP', 'LRCX', 'MU', 'KLAC', 'MRVL', 'SNPS', 'CDNS', 'PANW', 'CRWD', 'WDAY', 'ZS', 'DDOG', 'TEAM', 'OKTA', 'MDB', 'NET', 'ABNB', 'RIVN', 'LCID', 'PLTR', 'COIN', 'HOOD']
  const nyseStocks = ['JPM', 'V', 'JNJ', 'WMT', 'PG', 'MA', 'HD', 'DIS', 'BAC', 'XOM', 'CVX', 'KO', 'MRK', 'PFE', 'ABBV', 'TMO', 'ABT', 'NKE', 'MCD', 'CRM', 'ORCL', 'UNH', 'VZ', 'T', 'IBM', 'GS', 'MS', 'C', 'WFC', 'AXP', 'BLK', 'CAT', 'BA', 'GE', 'MMM', 'HON', 'UPS', 'LOW', 'TGT', 'CVS', 'COP', 'SLB', 'OXY', 'F', 'GM', 'LMT', 'RTX', 'NEE', 'DUK', 'SO']

  const upperTicker = ticker.toUpperCase()
  if (nasdaqStocks.includes(upperTicker)) return 'NASDAQ'
  if (nyseStocks.includes(upperTicker)) return 'NYSE'
  // Default to NASDAQ for unknown tickers as most tech stocks are there
  return 'NASDAQ'
}

export default function TradingViewWidget({ symbol = 'AAPL', height = '700' }) {
  const container = useRef()

  useEffect(() => {
    const exchange = getExchangePrefix(symbol)
    const fullSymbol = `${exchange}:${symbol.toUpperCase()}`

    const script = document.createElement('script')
    script.src = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      width: '100%',
      height: height,
      symbol: fullSymbol,
      interval: 'D',
      timezone: 'Etc/UTC',
      theme: 'dark',
      style: '1',
      locale: 'en',
      enable_publishing: false,
      allow_symbol_change: true,
      support_host: 'https://www.tradingview.com',
      backgroundColor: 'rgba(0,0,0,0)',
    })

    if (container.current) {
      container.current.innerHTML = ''
      container.current.appendChild(script)
    }

    return () => {
      if (container.current) {
        container.current.innerHTML = ''
      }
    }
  }, [symbol, height])

  return (
    <div
      className="tradingview-widget-container"
      ref={container}
      style={{
        height: `${height}px`,
        width: '100%',
        background: 'transparent',
      }}
    >
      <div className="tradingview-widget-container__widget"></div>
    </div>
  )
}
