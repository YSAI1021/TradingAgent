const ASSET_PROXY_MAP: Record<string, string> = {
  GOLD: "GLD",
  BULLION: "GLD",
  XAU: "GLD",
  REIT: "VNQ",
  REAL: "VNQ",
  REALESTATE: "VNQ",
  PROPERTY: "VNQ",
  REALTY: "VNQ",
  BOND: "BND",
  BONDS: "BND",
  TREASURY: "IEF",
  CASH: "BIL",
  COMMODITY: "DBC",
  COMMODITIES: "DBC",
  OIL: "USO",
  NATGAS: "UNG",
  CRYPTO: "BTC-USD",
  BTC: "BTC-USD",
  BITCOIN: "BTC-USD",
  ETH: "ETH-USD",
  ETHEREUM: "ETH-USD",
  SOL: "SOL-USD",
  SOLANA: "SOL-USD",
};

const ASSET_METADATA: Record<string, { name: string; sector: string }> = {
  GLD: { name: "SPDR Gold Shares", sector: "Commodities" },
  GOLD: { name: "Gold (tracked via GLD)", sector: "Commodities" },
  VNQ: { name: "Vanguard Real Estate ETF", sector: "Real Estate" },
  REIT: { name: "Real Estate (tracked via VNQ)", sector: "Real Estate" },
  REAL: { name: "Real Estate (tracked via VNQ)", sector: "Real Estate" },
  BND: { name: "Vanguard Total Bond Market ETF", sector: "Fixed Income" },
  BOND: { name: "Bonds (tracked via BND)", sector: "Fixed Income" },
  CASH: { name: "Cash (tracked via BIL)", sector: "Cash" },
  DBC: { name: "Invesco DB Commodity Index ETF", sector: "Commodities" },
  COMMO: { name: "Commodities (tracked via DBC)", sector: "Commodities" },
  IBIT: { name: "iShares Bitcoin Trust", sector: "Digital Assets" },
  BTC: { name: "Bitcoin", sector: "Digital Assets" },
  ETH: { name: "Ethereum", sector: "Digital Assets" },
  SOL: { name: "Solana", sector: "Digital Assets" },
};

export function normalizeAssetSymbol(symbol: string): string {
  return String(symbol || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

export function resolveMarketDataSymbol(symbol: string): string {
  const requestedSymbol = String(symbol || "").trim().toUpperCase();
  const normalized = normalizeAssetSymbol(symbol);
  if (!normalized) return requestedSymbol;
  return ASSET_PROXY_MAP[normalized] || requestedSymbol;
}

export function getAssetMetadata(symbol: string) {
  const normalized = normalizeAssetSymbol(symbol);
  if (!normalized) return null;
  return ASSET_METADATA[normalized] || null;
}
