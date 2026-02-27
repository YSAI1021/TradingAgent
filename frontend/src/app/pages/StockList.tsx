import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "react-router";
import {
  fetchPosts,
  fetchNews,
  searchStockSymbols,
  fetchWatchlist,
  addWatchlistItem,
  deleteWatchlistItem,
  Post,
  NewsArticle,
} from "@/app/services/api";
import { toast } from "sonner";
import { useAuth } from "@/app/context/AuthContext";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useStockQuotes, fetchPeriodChangePercent } from "@/app/hooks/useStockQuotes";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Star,
  Pencil,
  Search,
} from "lucide-react";
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/app/components/ui/tabs";
import { AddTransactionModal } from "@/app/components/AddTransactionModal";

const SYMBOL_SECTOR_FALLBACK: Record<string, string> = {
  AAPL: "Technology",
  MSFT: "Technology",
  GOOGL: "Technology",
  AMZN: "Consumer Discretionary",
  META: "Technology",
  NVDA: "Technology",
  TSLA: "Auto",
  UNH: "Healthcare",
  XOM: "Energy",
  CVX: "Energy",
  JNJ: "Healthcare",
  JPM: "Finance",
};

export function StockList() {
  const [addTransactionOpen, setAddTransactionOpen] = useState(false);
  const { token } = useAuth();
  const { holdings: currentHoldingsData, totalValue: portfolioTotal } =
    usePortfolio();
  const currentHoldings = currentHoldingsData.map((h) => ({
    ...h,
    price: h.currentPrice,
    change: h.changePercent,
    value: h.value,
  }));

  // Load custom watchlist and mode from localStorage
  const [customWatchlist, setCustomWatchlist] = useState<string[]>([]);
  const [watchlistMode, setWatchlistMode] = useState<"auto" | "custom">("auto");
  const [isEditMode, setIsEditMode] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<
    Array<{ symbol: string; name?: string; exchange?: string }>
  >([]);
  const [searching, setSearching] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [newsCache, setNewsCache] = useState<Record<string, NewsArticle[]>>({});
  const [hoverNews, setHoverNews] = useState<{
    ticker: string | null;
    items: NewsArticle[];
  }>({ ticker: null, items: [] });

  const hoverTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem("customWatchlist");
      const savedMode = localStorage.getItem("watchlistMode");
      if (saved) setCustomWatchlist(JSON.parse(saved));
      if (savedMode === "auto" || savedMode === "custom")
        setWatchlistMode(savedMode as "auto" | "custom");
    } catch (e) {
      console.warn("Failed to load custom watchlist", e);
    }
  }, []);

  // If user is authenticated, prefer server-side watchlist and keep localStorage in sync
  useEffect(() => {
    let cancelled = false;
    const loadServerWatchlist = async () => {
      if (!token) return;
      try {
        const serverList = await fetchWatchlist(token);
        if (cancelled) return;
        if (Array.isArray(serverList)) {
          setCustomWatchlist(serverList);
          localStorage.setItem("customWatchlist", JSON.stringify(serverList));
        }
      } catch (err) {
        console.warn("Failed to load server watchlist", err);
      }
    };
    loadServerWatchlist();
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchPosts(100, 0);
        setPosts(data || []);
      } catch (err) {
        console.error("Failed to load posts for auto watchlist", err);
      }
    };
    load();
  }, []);

  // Debounced symbol search (Yahoo-backed) for Add-to-Watchlist search input
  useEffect(() => {
    let cancelled = false;
    if (!searchQuery || searchQuery.length < 1) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        const results = await searchStockSymbols(searchQuery);
        if (cancelled) return;
        setSearchResults(results || []);
      } catch (err) {
        console.warn("Symbol search failed", err);
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [searchQuery]);

  const autoStockList = useMemo(() => {
    const holdingSymbols = currentHoldings.map((h) => h.symbol);
    const postFrequency = new Map<string, number>();

    posts.forEach((p) => {
      const ticker = p.stock_ticker?.trim().toUpperCase();
      if (!ticker) return;
      postFrequency.set(ticker, (postFrequency.get(ticker) || 0) + 1);
    });

    const topFromPosts = Array.from(postFrequency.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([ticker]) => ticker)
      .slice(0, 8);

    return Array.from(new Set([...holdingSymbols, ...topFromPosts])).slice(
      0,
      12,
    );
  }, [currentHoldings, posts]);

  const stockListSymbols = useMemo(() => {
    if (watchlistMode === "custom") return customWatchlist;
    return autoStockList;
  }, [watchlistMode, customWatchlist, autoStockList]);

  // Fetch live quotes for the currently displayed watchlist symbols
  const { quotes } = useStockQuotes(stockListSymbols.length ? stockListSymbols : []);
  const [periodChanges, setPeriodChanges] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;
    if (!stockListSymbols || stockListSymbols.length === 0) return;
    (async () => {
      try {
        const results = await Promise.all(
          stockListSymbols.map((s) => fetchPeriodChangePercent(s)),
        );
        if (cancelled) return;
        const map: Record<string, number> = {};
        stockListSymbols.forEach((s, i) => {
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
  }, [stockListSymbols.join(",")]);

  const holdingMeta = useMemo(
    () =>
      Object.fromEntries(
        currentHoldings.map((h) => [
          h.symbol,
          { name: h.name, sector: h.sector },
        ]),
      ),
    [currentHoldings],
  );

  const handleAddStock = (ticker: string) => {
    const symbol = ticker.toUpperCase().trim();
    if (!symbol) return;
    // allow common ticker formats (letters, numbers, dots, hyphens), 1-6 chars
    // allow '=', '/', numbers, letters, dots, hyphens (common Yahoo formats), up to 10 chars
    if (!/^[A-Z0-9.\-=/]{1,10}$/.test(symbol)) {
      toast.error("Invalid ticker");
      return;
    }
    if (customWatchlist.includes(symbol)) {
      toast("Already added to watchlist");
      return;
    }
    const doLocalAdd = () => {
      const updated = [...customWatchlist, symbol];
      setCustomWatchlist(updated);
      localStorage.setItem("customWatchlist", JSON.stringify(updated));
      setIsEditMode(true);
    };

    if (token) {
      addWatchlistItem(token, symbol)
        .then(() => {
          doLocalAdd();
          toast.success(`${symbol} added to watchlist`);
        })
        .catch((err) => {
          console.warn("Failed to persist watchlist item to server", err);
          // Fall back to local add so UX remains responsive
          doLocalAdd();
          toast.success(`${symbol} added to watchlist (local)`);
        });
    } else {
      doLocalAdd();
      toast.success(`${symbol} added to watchlist`);
    }
  };

  const loadHoverNews = async (ticker?: string) => {
    if (!ticker) return;
    if (newsCache[ticker]) {
      setHoverNews({ ticker, items: newsCache[ticker] });
      return;
    }
    try {
      const items = await fetchNews(ticker);
      const top = Array.isArray(items) ? items.slice(0, 3) : [];
      setNewsCache((prev) => ({ ...prev, [ticker]: top }));
      setHoverNews({ ticker, items: top });
    } catch (err) {
      console.error("Failed to load hover news for", ticker, err);
    }
  };

  const handleMouseEnterTicker = (ticker: string) => {
    if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = window.setTimeout(() => {
      loadHoverNews(ticker);
    }, 250);
  };

  const handleMouseLeaveTicker = () => {
    if (hoverTimeoutRef.current) {
      window.clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    // small delay before clearing so panel can be hovered
    setTimeout(() => setHoverNews({ ticker: null, items: [] }), 150);
  };

  const handleRemoveStock = (ticker: string) => {
    const doLocalRemove = () => {
      const updated = customWatchlist.filter((t) => t !== ticker);
      setCustomWatchlist(updated);
      localStorage.setItem("customWatchlist", JSON.stringify(updated));
    };

    if (token) {
      deleteWatchlistItem(token, ticker)
        .then(() => doLocalRemove())
        .catch((err) => {
          console.warn("Failed to remove watchlist item on server", err);
          // still remove locally
          doLocalRemove();
        });
    } else {
      doLocalRemove();
    }
  };

  const handleToggleMode = (mode: "auto" | "custom") => {
    setWatchlistMode(mode);
    localStorage.setItem("watchlistMode", mode);
    setIsEditMode(false);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Stocks</h1>
            <p className="text-gray-500 mt-1">Your holdings and watchlist</p>
          </div>
          <div />
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            placeholder="Search stocks by symbol or name..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          {/* Suggestions dropdown (shows markdown copy and add-to-watchlist) */}
          {((searchResults && searchResults.length > 0) || searching) && (
            <div className="absolute left-0 right-0 mt-11 z-40 bg-white border rounded shadow-md p-2 max-h-64 overflow-auto">
              <div className="flex items-center justify-between px-2 mb-2">
                <div className="text-sm text-gray-600">
                  Search results from Yahoo
                </div>
                <button
                  className="text-xs px-2 py-1 rounded bg-gray-100"
                  onClick={async () => {
                    try {
                      const md = (searchResults || [])
                        .map(
                          (r) =>
                            `- ${r.symbol} — ${r.name || ""} ${r.exchange ? "(" + r.exchange + ")" : ""}`,
                        )
                        .join("\n");
                      await navigator.clipboard.writeText(md);
                      // quick feedback
                      // eslint-disable-next-line no-alert
                      alert("Copied markdown for results");
                    } catch (err) {
                      console.warn("Failed to copy markdown", err);
                    }
                  }}
                >
                  Copy Markdown
                </button>
              </div>

              {searching ? (
                <div className="px-2 py-3 text-sm text-gray-500">
                  Searching...
                </div>
              ) : (
                (searchResults || []).map((r) => (
                  <div
                    key={r.symbol}
                    className="flex items-center justify-between px-2 py-2 hover:bg-gray-50 rounded"
                  >
                    <div className="text-sm">
                      <div className="font-medium">
                        {r.symbol}{" "}
                        {r.name ? (
                          <span className="text-gray-500">— {r.name}</span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-400">
                        {r.exchange || ""}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        className="text-xs px-2 py-1 rounded bg-blue-600 text-white"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          handleAddStock(r.symbol);
                        }}
                      >
                        Add
                      </button>
                      <a
                        href={`https://finance.yahoo.com/quote/${encodeURIComponent(r.symbol)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs px-2 py-1 rounded bg-gray-100"
                      >
                        View
                      </a>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="holdings" className="space-y-6">
        <TabsList>
          <TabsTrigger value="holdings">Current Holdings</TabsTrigger>
          <TabsTrigger value="watchlist">Watchlist</TabsTrigger>
        </TabsList>

        <TabsContent value="holdings">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Current Holdings</CardTitle>
                <div />
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {currentHoldings.map((stock) => (
                  <Link
                    key={stock.symbol}
                    to={`/stock/${stock.symbol}`}
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-gray-900">
                            {stock.symbol}
                          </p>
                          <Badge variant="outline" className="text-xs">
                            {stock.sector}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500">{stock.name}</p>
                        <p className="text-xs text-gray-400 mt-1">
                          {stock.shares} shares
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-gray-500 mb-1">
                          Position Value
                        </p>
                        <p className="font-semibold text-gray-900">
                          $
                          {(stock.value ?? 0).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-gray-900">
                          ${(stock.price ?? 0).toFixed(2)}
                        </p>
                        <div
                          className={`flex items-center gap-1 text-sm ${(stock.change ?? 0) > 0 ? "text-green-600" : (stock.change ?? 0) < 0 ? "text-red-600" : "text-gray-500"}`}
                        >
                          {(stock.change ?? 0) > 0 ? (
                            <TrendingUp className="w-3 h-3" />
                          ) : (stock.change ?? 0) < 0 ? (
                            <TrendingDown className="w-3 h-3" />
                          ) : (
                            <Minus className="w-3 h-3" />
                          )}
                          {(stock.change ?? 0) > 0 ? "+" : ""}
                          {(stock.change ?? 0).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
              <div className="mt-4 pt-4 border-t">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-500">
                    Total Holdings Value
                  </span>
                  <span className="text-lg font-semibold text-gray-900">
                    $
                    {portfolioTotal.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="watchlist">
          <Card>
            <CardHeader>
              <CardTitle>Watchlist</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    className={`px-3 py-1 rounded ${watchlistMode === "auto" ? "bg-gray-100" : "bg-white"}`}
                    onClick={() => handleToggleMode("auto")}
                  >
                    Auto
                  </button>
                  <button
                    className={`px-3 py-1 rounded ${watchlistMode === "custom" ? "bg-gray-100" : "bg-white"}`}
                    onClick={() => handleToggleMode("custom")}
                  >
                    Custom
                  </button>
                </div>
                <div />
                {watchlistMode === "custom" && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditMode((s) => !s)}
                      className={isEditMode ? "bg-green-50 border-green-300" : ""}
                    >
                      <Pencil className="w-4 h-4 mr-2" />
                      {isEditMode ? "Done" : "Edit"}
                    </Button>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {stockListSymbols.length === 0 ? (
                  <p className="text-sm text-gray-500">No stocks to display</p>
                ) : (
                  stockListSymbols.map((symbol) => {
                    const meta = holdingMeta[symbol];
                    const name = meta?.name || symbol;
                    const sector = meta?.sector || SYMBOL_SECTOR_FALLBACK[symbol] || "Other";
                    const price = quotes[symbol]?.price ?? 0;
                    const change =
                      periodChanges[symbol] ?? quotes[symbol]?.changePercent ?? 0;

                    return (
                      <Link
                        key={symbol}
                        to={`/stock/${symbol}`}
                        className="relative flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
                        onMouseEnter={() => handleMouseEnterTicker(symbol)}
                        onMouseLeave={handleMouseLeaveTicker}
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-semibold text-gray-900">
                                {symbol}
                              </p>
                              <Badge variant="outline" className="text-xs">
                                {sector}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500">{name}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">
                              ${price.toFixed(2)}
                            </p>
                            <div
                              className={`flex items-center gap-1 text-sm ${change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-gray-500"}`}
                            >
                              {change > 0 ? (
                                <TrendingUp className="w-3 h-3" />
                              ) : change < 0 ? (
                                <TrendingDown className="w-3 h-3" />
                              ) : (
                                <Minus className="w-3 h-3" />
                              )}
                              {change > 0 ? "+" : ""}
                              {change.toFixed(2)}%
                            </div>
                          </div>
                          {watchlistMode === "custom" && isEditMode ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                handleRemoveStock(symbol);
                              }}
                              className="px-2 py-1 rounded bg-red-50 text-red-600"
                              title="Remove from watchlist"
                            >
                              ×
                            </button>
                          ) : null}
                          {watchlistMode !== "custom" && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                // toggle favorite: add to custom watchlist and switch to custom mode
                                const exists = customWatchlist.includes(symbol);
                                if (exists) {
                                  handleRemoveStock(symbol);
                                } else {
                                  // reuse the existing handler so it persists when possible
                                  handleAddStock(symbol);
                                  setWatchlistMode("custom");
                                }
                              }}
                            >
                              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                            </Button>
                          )}
                        </div>
                      </Link>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Add Transaction Modal */}
      {token && (
        <AddTransactionModal
          open={addTransactionOpen}
          onOpenChange={setAddTransactionOpen}
          onSuccess={() => {
            setAddTransactionOpen(false);
            window.dispatchEvent(new CustomEvent("portfolio:updated"));
          }}
          token={token}
        />
      )}

      {hoverNews.ticker && hoverNews.items.length > 0 && (
        <div className="fixed right-80 top-24 z-50 w-96 rounded-lg bg-white p-3 shadow-lg">
          <div className="mb-2 font-semibold">News for ${hoverNews.ticker}</div>
          <div className="space-y-2">
            {hoverNews.items.map((item) => (
              <a
                key={item.id || item.news_url}
                href={item.news_url}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <div className="text-sm font-medium">{item.title}</div>
                <div className="text-xs text-gray-500">
                  {item.news_source} •{" "}
                  {item.news_published_at
                    ? new Date(item.news_published_at).toLocaleDateString()
                    : ""}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
