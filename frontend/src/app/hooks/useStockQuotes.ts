import { useState, useEffect, useRef } from "react";
import { fetchStockPrice, fetchStockChart } from "@/app/services/api";
import { useAuth } from "@/app/context/AuthContext";

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
    // Try backend API first (works for both authenticated and guest users)
    try {
      const stockPrice = await fetchStockPrice(symbol, token);
      console.debug("useStockQuotes: backend response", symbol, stockPrice);
      const change = stockPrice.price - stockPrice.previousClose;
      const changePercent = stockPrice.previousClose
        ? (change / stockPrice.previousClose) * 100
        : 0;
      if (!changePercent)
        console.debug(
          "useStockQuotes: computed backend changePercent is 0",
          symbol,
          {
            price: stockPrice.price,
            previousClose: stockPrice.previousClose,
          },
        );
      return { symbol, price: stockPrice.price, change, changePercent };
    } catch (error) {
      console.debug(
        `Backend API failed for ${symbol}, falling back to Yahoo Finance`,
      );
    }

    // Fallback to Yahoo Finance v7 quote endpoint (returns regularMarketPrice and change percent)
    const corsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(
      `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbol}`,
    )}`;
    const res = await fetch(corsUrl);
    if (!res.ok) return null;
    const json = await res.json();
    const quote = json?.quoteResponse?.result?.[0];
    console.debug("useStockQuotes: yahoo v7 response", symbol, quote);
    if (!quote) return null;
    const price =
      typeof quote.regularMarketPrice === "number"
        ? quote.regularMarketPrice
        : typeof quote.regularMarketPreviousClose === "number"
          ? quote.regularMarketPreviousClose
          : null;
    const previousClose =
      typeof quote.regularMarketPreviousClose === "number"
        ? quote.regularMarketPreviousClose
        : null;
    if (price == null) return null;
    const change = previousClose != null ? price - previousClose : 0;
    const changePercent =
      typeof quote.regularMarketChangePercent === "number"
        ? quote.regularMarketChangePercent
        : previousClose
          ? (change / previousClose) * 100
          : 0;
    if (!changePercent)
      console.debug(
        "useStockQuotes: yahoo changePercent is 0 or missing",
        symbol,
        { price, previousClose, quoteChange: quote.regularMarketChangePercent },
      );
    return { symbol, price, change, changePercent } as StockQuote;
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

export async function fetchPeriodChangePercent(
  symbol: string,
  range = "5d",
  interval = "1d",
): Promise<number | null> {
  try {
    const chart = await fetchStockChart(symbol, range, interval);
    const closes: Array<number | null> = (chart.points || []).map((p) => p.close);
    // find first and last non-null close
    const first = closes.find((c: number | null) => c != null) ?? null;
    const last = (() => {
      for (let i = closes.length - 1; i >= 0; i--) {
        if (closes[i] != null) return closes[i] as number;
      }
      return null;
    })();
    if (first == null || last == null) return null;
    const change = last - first;
    const changePercent = first ? (change / first) * 100 : 0;
    return changePercent;
  } catch (e) {
    return null;
  }
}
