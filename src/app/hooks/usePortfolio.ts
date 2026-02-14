import { useMemo, useEffect } from "react";
import { useStockQuotes } from "./useStockQuotes";
import { BASE_HOLDINGS, PORTFOLIO_SYMBOLS } from "@/app/data/portfolio";
import { validatePortfolioData } from "@/app/utils/dataAudit";

export type PortfolioResult = {
  holdings: Holding[];
  totalValue: number;
  lastUpdatedAt: number | null;
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
  const { quotes, lastUpdatedAt } = useStockQuotes([...PORTFOLIO_SYMBOLS]);

  const result = useMemo(() => {
    const holdings: Holding[] = BASE_HOLDINGS.map((h) => {
      const currentPrice = quotes[h.symbol]?.price ?? h.avgCost;
      const value = h.shares * currentPrice;
      const changePercent = quotes[h.symbol]?.changePercent ?? 0;
      return {
        ...h,
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

    return { holdings, totalValue, lastUpdatedAt };
  }, [quotes, lastUpdatedAt]);

  useEffect(() => {
    validatePortfolioData(result.holdings, result.totalValue);
  }, [result.holdings, result.totalValue]);

  return result;
}
