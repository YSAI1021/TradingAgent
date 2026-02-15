import { useEffect, useRef } from 'react'

export default function MiniStockWidget({ symbol = 'AAPL', isHighlighted = false }) {
  const container = useRef()

  useEffect(() => {
    const script = document.createElement('script')
    script.src =
      'https://s3.tradingview.com/external-embedding/embed-widget-mini-symbol-overview.js'
    script.type = 'text/javascript'
    script.async = true
    script.innerHTML = JSON.stringify({
      symbol: symbol,
      width: '100%',
      height: '220',
      locale: 'en',
      dateRange: '1D',
      colorTheme: 'dark',
      isTransparent: true,
      autosize: false,
      largeChartUrl: '',
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
  }, [symbol])

  return (
    <div className={`mini-stock-widget ${isHighlighted ? 'highlighted' : ''}`} ref={container}>
      <div className="tradingview-widget-container__widget"></div>
    </div>
  )
}
