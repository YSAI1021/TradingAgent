/**
 * Mock transaction history for portfolio holdings.
 * In production, this would come from an API.
 */

export type Transaction = {
  id: string;
  date: string;
  type: "Buy" | "Sell";
  shares: number;
  purchasePrice: number;
};

export type TransactionHistoryBySymbol = Record<string, Transaction[]>;

export const TRANSACTION_HISTORY: TransactionHistoryBySymbol = {
  NVDA: [
    { id: "nvda-1", date: "2025-06-15", type: "Buy", shares: 10, purchasePrice: 520 },
    { id: "nvda-2", date: "2025-11-20", type: "Buy", shares: 6, purchasePrice: 680 },
  ],
  TSLA: [
    { id: "tsla-1", date: "2025-01-10", type: "Buy", shares: 25, purchasePrice: 210 },
    { id: "tsla-2", date: "2025-08-05", type: "Buy", shares: 15, purchasePrice: 225 },
  ],
  MSFT: [
    { id: "msft-1", date: "2025-02-18", type: "Buy", shares: 12, purchasePrice: 375 },
    { id: "msft-2", date: "2025-10-12", type: "Buy", shares: 9, purchasePrice: 395 },
  ],
  GOOGL: [
    { id: "googl-1", date: "2025-03-22", type: "Buy", shares: 25, purchasePrice: 135 },
    { id: "googl-2", date: "2025-09-08", type: "Buy", shares: 15, purchasePrice: 145 },
  ],
  META: [
    { id: "meta-1", date: "2025-04-14", type: "Buy", shares: 4, purchasePrice: 565 },
    { id: "meta-2", date: "2025-12-01", type: "Buy", shares: 3, purchasePrice: 595 },
  ],
  AAPL: [
    { id: "aapl-1", date: "2025-01-15", type: "Buy", shares: 20, purchasePrice: 245.3 },
    { id: "aapl-2", date: "2025-12-10", type: "Buy", shares: 11, purchasePrice: 268.5 },
  ],
  JPM: [
    { id: "jpm-1", date: "2025-05-20", type: "Buy", shares: 10, purchasePrice: 195 },
    { id: "jpm-2", date: "2025-11-15", type: "Buy", shares: 6, purchasePrice: 208 },
  ],
};

