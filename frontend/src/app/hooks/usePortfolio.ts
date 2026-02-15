import { useMemo, useEffect, useState } from "react";
import { useStockQuotes, fetchPeriodChangePercent } from "./useStockQuotes";
import { useAuth } from "@/app/context/AuthContext";
import { fetchPortfolioSummary } from "@/app/services/api";
import { validatePortfolioData } from "@/app/utils/dataAudit";

// Map of symbol to company name and sector
const SYMBOL_METADATA: Record<string, { name: string; sector: string }> = {
  NVDA: { name: "NVIDIA Corp.", sector: "Technology" },
  TSLA: { name: "Tesla Inc.", sector: "Auto" },
  MSFT: { name: "Microsoft Corp.", sector: "Technology" },
  GOOGL: { name: "Alphabet Inc.", sector: "Technology" },
  META: { name: "Meta Platforms", sector: "Technology" },
  AAPL: { name: "Apple Inc.", sector: "Technology" },
  JPM: { name: "JPMorgan Chase", sector: "Finance" },
};

export type PortfolioResult = {
  holdings: Holding[];
  totalValue: number;
  lastUpdatedAt: number | null;
  loading: boolean;
  error: string | null;
};

export type Holding = {
  symbol: string;
  name: string;
  shares: number;
  avgCost: number;
  sector: string;
  currentPrice: number;
  value: number;
  allocation: number;
  changePercent: number;
};

export function usePortfolio() {
  const { token, isAuthenticated } = useAuth();
  const [backendHoldings, setBackendHoldings] = useState<
    Array<{ symbol: string; shares: number; averageCost: number }>
  >([]);
  const [portfolioLoading, setPortfolioLoading] = useState(isAuthenticated);
  const [portfolioError, setPortfolioError] = useState<string | null>(null);

  // Fetch portfolio summary from backend
  useEffect(() => {
    if (!isAuthenticated || !token) {
      setPortfolioLoading(false);
      return;
    }

    setPortfolioLoading(true);
    setPortfolioError(null);

    fetchPortfolioSummary(token)
      .then(
        (
          holdings: Array<{
            symbol: string;
            shares: number;
            averageCost: number;
          }>,
        ) => {
          setBackendHoldings(holdings);
        },
      )
      .catch((error: unknown) => {
        console.error("Error fetching portfolio:", error);
        setPortfolioError(
          error instanceof Error ? error.message : "Failed to fetch portfolio",
        );
      })
      .finally(() => setPortfolioLoading(false));
  }, [isAuthenticated, token]);

  // Get stock quotes for the symbols in the portfolio
  const symbolsToFetch = backendHoldings.map((h) => h.symbol);
  const { quotes, lastUpdatedAt } = useStockQuotes(symbolsToFetch);
  const [periodChanges, setPeriodChanges] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    if (symbolsToFetch.length === 0) return;
    (async () => {
      try {
        const results = await Promise.all(
          symbolsToFetch.map((s) => fetchPeriodChangePercent(s)),
        );
        if (cancelled) return;
        const map: Record<string, number> = {};
        symbolsToFetch.forEach((s, i) => {
          const v = results[i];
          if (typeof v === "number") map[s] = v;
        });
        setPeriodChanges(map);
      } catch (err) {
        if (!cancelled) setPeriodChanges({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [symbolsToFetch.join(",")]);

  const result = useMemo(() => {
    const holdings: Holding[] = backendHoldings.map((h) => {
      const metadata = SYMBOL_METADATA[h.symbol] || {
        name: h.symbol,
        sector: "Other",
      };
      const currentPrice = quotes[h.symbol]?.price ?? h.averageCost;
      const value = h.shares * currentPrice;
      const changePercent =
        periodChanges[h.symbol] ?? quotes[h.symbol]?.changePercent ?? 0;
      return {
        symbol: h.symbol,
        name: metadata.name,
        shares: h.shares,
        avgCost: h.averageCost,
        sector: metadata.sector,
        currentPrice,
        value,
        allocation: 0,
        changePercent,
      };
    });

    const totalValue = holdings.reduce((sum, h) => sum + h.value, 0);
    holdings.forEach((h) => {
      h.allocation = totalValue > 0 ? (h.value / totalValue) * 100 : 0;
    });

    return {
      holdings,
      totalValue,
      lastUpdatedAt,
      loading: portfolioLoading,
      error: portfolioError,
    };
  }, [
    backendHoldings,
    quotes,
    lastUpdatedAt,
    portfolioLoading,
    portfolioError,
  ]);

  useEffect(() => {
    if (result.holdings.length > 0) {
      validatePortfolioData(result.holdings, result.totalValue);
    }
  }, [result.holdings, result.totalValue]);

  return result;
}
