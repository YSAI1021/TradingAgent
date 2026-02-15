/**
 * Single source of truth for portfolio holdings.
 * All pages (Dashboard, Portfolio, Stocks) reference this data.
 */

export const PORTFOLIO_SYMBOLS = ["NVDA", "TSLA", "MSFT", "GOOGL", "META", "AAPL", "JPM"] as const;

export type HoldingBase = {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  sector: string;
};

export const BASE_HOLDINGS: HoldingBase[] = [
  { symbol: "NVDA", name: "NVIDIA Corp.", shares: 16, avgCost: 520, sector: "Technology" },
  { symbol: "TSLA", name: "Tesla Inc.", shares: 40, avgCost: 215, sector: "Auto" },
  { symbol: "MSFT", name: "Microsoft Corp.", shares: 21, avgCost: 380, sector: "Technology" },
  { symbol: "GOOGL", name: "Alphabet Inc.", shares: 40, avgCost: 138, sector: "Technology" },
  { symbol: "META", name: "Meta Platforms", shares: 7, avgCost: 570, sector: "Technology" },
  { symbol: "AAPL", name: "Apple Inc.", shares: 31, avgCost: 253, sector: "Technology" },
  { symbol: "JPM", name: "JPMorgan Chase", shares: 16, avgCost: 200, sector: "Finance" },
];
