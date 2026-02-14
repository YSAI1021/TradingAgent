import { useState, useEffect, useRef } from "react";

export type StockQuote = {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
};

// Balanced mix of gainers and losers for realistic portfolio visualization
const FALLBACK_QUOTES: Record<string, StockQuote> = {
  NVDA: { symbol: "NVDA", price: 875.20, change: 68.70, changePercent: 8.52 },
  TSLA: { symbol: "TSLA", price: 245.80, change: 13.68, changePercent: 5.89 },
  MSFT: { symbol: "MSFT", price: 401.32, change: 15.87, changePercent: 4.12 },
  GOOGL: { symbol: "GOOGL", price: 142.15, change: 1.74, changePercent: 1.24 },
  META: { symbol: "META", price: 585.30, change: 4.80, changePercent: 0.82 },
  AAPL: { symbol: "AAPL", price: 255.78, change: -5.62, changePercent: -2.15 },
  JPM: { symbol: "JPM", price: 198.65, change: -2.15, changePercent: -1.07 },
  XOM: { symbol: "XOM", price: 118.45, change: -2.21, changePercent: -1.83 },
  DIS: { symbol: "DIS", price: 118.90, change: 0.7, changePercent: 0.59 },
  AMD: { symbol: "AMD", price: 142.30, change: 5.20, changePercent: 3.79 },
  COIN: { symbol: "COIN", price: 245.60, change: -8.40, changePercent: -3.31 },
  PLTR: { symbol: "PLTR", price: 28.45, change: 1.12, changePercent: 4.10 },
  SHOP: { symbol: "SHOP", price: 62.80, change: 2.15, changePercent: 3.54 },
  SQ: { symbol: "SQ", price: 78.20, change: -1.85, changePercent: -2.31 },
};

// In-memory cache for stable quotes across navigations (avoids color flicker)
const CACHE_TTL_MS = 60 * 1000; // 1 minute - refresh for more current data
let quoteCache: { data: Record<string, StockQuote>; symbolsKey: string; ts: number } | null = null;

async function fetchQuote(symbol: string): Promise<StockQuote | null> {
  try {
    const proxyUrl = `/api/chart/v8/finance/chart/${symbol}?range=5d&interval=1d`;
    const corsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
      `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=5d&interval=1d`
    )}`;
    let res = await fetch(proxyUrl);
    if (!res.ok) res = await fetch(corsUrl);
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
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>(() => {
    const initial: Record<string, StockQuote> = {};
    symbols.forEach((s) => {
      initial[s] = FALLBACK_QUOTES[s] ?? { symbol: s, price: 0, change: 0, changePercent: 0 };
    });
    return initial;
  });
  const [loading, setLoading] = useState(true);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<number | null>(null);

  const symbolsRef = useRef(symbols);
  symbolsRef.current = symbols;

  const doFetch = (symList: string[]) => {
    const symbolsKey = [...symList].sort().join(",");
    Promise.all(symList.map((s) => fetchQuote(s)))
      .then((results: (StockQuote | null)[]) => {
        const map: Record<string, StockQuote> = {};
        results.forEach((q, i) => {
          const symbol = symList[i];
          map[symbol] = q ?? FALLBACK_QUOTES[symbol] ?? { symbol, price: 0, change: 0, changePercent: 0 };
        });
        const ts = Date.now();
        quoteCache = { data: map, symbolsKey, ts };
        setQuotes(map);
        setLastUpdatedAt(ts);
      })
      .catch(() => {
        const map: Record<string, StockQuote> = {};
        symList.forEach((s) => {
          map[s] = FALLBACK_QUOTES[s] ?? { symbol: s, price: 0, change: 0, changePercent: 0 };
        });
        const ts = Date.now();
        quoteCache = { data: map, symbolsKey: [...symList].sort().join(","), ts };
        setQuotes(map);
        setLastUpdatedAt(ts);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    let cancelled = false;
    const symbolsKey = [...symbols].sort().join(",");

    // Use cached data if valid
    const now = Date.now();
    if (quoteCache && quoteCache.symbolsKey === symbolsKey && now - quoteCache.ts < CACHE_TTL_MS) {
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
      return () => { cancelled = true; clearTimeout(t); };
    }

    setLoading(true);
    doFetch(symbols);
    return () => { cancelled = true; };
  }, [symbols.join(",")]);

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
