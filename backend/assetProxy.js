const ASSET_PROXY_MAP = {
  GOLD: 'GLD',
  BULLION: 'GLD',
  XAU: 'GLD',
  REIT: 'VNQ',
  REAL: 'VNQ',
  REALESTATE: 'VNQ',
  PROPERTY: 'VNQ',
  REALTY: 'VNQ',
  BOND: 'BND',
  BONDS: 'BND',
  TREASURY: 'IEF',
  CASH: 'BIL',
  COMMODITY: 'DBC',
  COMMODITIES: 'DBC',
  OIL: 'USO',
  NATGAS: 'UNG',
  CRYPTO: 'BTC-USD',
  BTC: 'BTC-USD',
  BITCOIN: 'BTC-USD',
  ETH: 'ETH-USD',
  ETHEREUM: 'ETH-USD',
  SOL: 'SOL-USD',
  SOLANA: 'SOL-USD',
}

export function normalizeAssetSymbol(symbol = '') {
  return String(symbol)
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
}

export function resolveMarketDataSymbol(symbol = '') {
  const requestedSymbol = String(symbol).trim().toUpperCase()
  const normalized = normalizeAssetSymbol(symbol)
  if (!normalized) return requestedSymbol
  return ASSET_PROXY_MAP[normalized] || requestedSymbol
}

export function getAssetProxyContext(symbol = '') {
  const requestedSymbol = String(symbol).trim().toUpperCase()
  const marketSymbol = resolveMarketDataSymbol(symbol)
  return {
    requestedSymbol,
    marketSymbol,
    proxyUsed: Boolean(requestedSymbol && marketSymbol && marketSymbol !== requestedSymbol),
  }
}
