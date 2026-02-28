import { useState, useEffect, useRef } from "react";
import { fetchStockPrice } from "@/app/services/api";
import { useAuth } from "@/app/context/AuthContext";
import { resolveMarketDataSymbol } from "@/app/utils/assetProxy";

export type StockQuote = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
};

// In-memory cache for stable quotes across navigations (avoids color flicker)
const CACHE_TTL_MS = 60 * 1000; // 1 minute - refresh for more current data
let quoteCache: {
  data: Record<string, StockQuote>;
  symbolsKey: string;
  ts: number;
} | null = null;

async function fetchQuote(
  symbol: string,
  token?: string,
): Promise<StockQuote | null> {
  try {
    const marketDataSymbol = resolveMarketDataSymbol(symbol);

    // Try backend API first if token is available
    if (token) {
      try {
        const stockPrice = await fetchStockPrice(symbol, token);
        // Only use backend result if previousClose is valid — otherwise fall through to Yahoo
        if (stockPrice.price && stockPrice.previousClose) {
          const change = stockPrice.price - stockPrice.previousClose;
          const changePercent = (change / stockPrice.previousClose) * 100;
          return { symbol, price: stockPrice.price, change, changePercent };
        }
      } catch (error) {
        console.debug(
          `Backend API failed for ${symbol}, falling back to Yahoo Finance`,
        );
      }
    }

    // Fallback to Yahoo Finance
    const corsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
      `https://query1.finance.yahoo.com/v8/finance/chart/${marketDataSymbol}?range=5d&interval=1d`,
    )}`;
    const res = await fetch(corsUrl);
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;
    const closes = result.indicators?.quote?.[0]?.close ?? [];
    const previousClose = result.meta?.previousClose ?? closes[0];
    const lastClose = closes.filter((c: number | null) => c != null).pop();
    if (lastClose == null) return null;
    const change = lastClose - previousClose;
    const changePercent = previousClose ? (change / previousClose) * 100 : 0;
    return { symbol, price: lastClose, change, changePercent };
  } catch {
    return null;
  }
}

export function useStockQuotes(symbols: string[]) {
  const { token } = useAuth();
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const doFetch = (symList: string[]) => {
    if (symList.length === 0) {
      setLoading(false);
      return;
    }

    const symbolsKey = [...symList].sort().join(",");
    Promise.all(
      symList.map((s) => fetchQuote(s, tokenRef.current ?? undefined)),
    )
      .then((results: (StockQuote | null)[]) => {
        const map: Record<string, StockQuote> = {};
        results.forEach((q) => {
          if (q) {
            map[q.symbol] = q;
          }
        });
        const ts = Date.now();
        quoteCache = { data: map, symbolsKey, ts };
        setQuotes(map);
        setLastUpdatedAt(ts);
      })
      .catch((error) => {
        console.error("Error fetching stock quotes:", error);
        setQuotes({});
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    const symbolsKey = [...symbols].sort().join(",");

    // Use cached data if valid
    const now = Date.now();
    if (
      quoteCache &&
      quoteCache.symbolsKey === symbolsKey &&
      now - quoteCache.ts < CACHE_TTL_MS
    ) {
      setQuotes(quoteCache.data);
      setLastUpdatedAt(quoteCache.ts);
      setLoading(false);
      const refreshIn = CACHE_TTL_MS - (now - quoteCache.ts);
      const t = setTimeout(() => {
        if (!cancelled) {
          quoteCache = null;
          doFetch(symbolsRef.current);
        }
      }, refreshIn);
      return () => {
        cancelled = true;
        clearTimeout(t);
      };
    }

    setLoading(true);
    doFetch(symbols);
    return () => {
      cancelled = true;
    };
  }, [symbols.join(","), token]);

  // Periodic refresh every 1 minute
  useEffect(() => {
    const interval = setInterval(() => {
      quoteCache = null;
      doFetch(symbolsRef.current);
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  return { quotes, loading, lastUpdatedAt };
}
