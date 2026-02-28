import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router";
import { fetchNews, fetchPosts, ingestNews, NewsArticle, Post } from "@/app/services/api";
import { useAuth } from "@/app/context/AuthContext";
import { usePortfolio } from "@/app/hooks/usePortfolio";
import { useStockQuotes } from "@/app/hooks/useStockQuotes";
import { Minus, Plus, Search, Star, TrendingDown, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/app/components/ui/card";
import { Badge } from "@/app/components/ui/badge";
import { Input } from "@/app/components/ui/input";
import { Button } from "@/app/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/app/components/ui/tabs";
import AddWatchlistModal from "@/app/components/AddWatchlistModal";

const WATCHLIST_META: Record<string, { name: string; sector: string }> = {
  AMD: { name: "Advanced Micro Devices", sector: "Technology" },
  COIN: { name: "Coinbase Global", sector: "Financial Services" },
  PLTR: { name: "Palantir Technologies", sector: "Technology" },
  SHOP: { name: "Shopify", sector: "Technology" },
  SQ: { name: "Block", sector: "Financial Services" },
  UNH: { name: "UnitedHealth Group", sector: "Healthcare" },
  XOM: { name: "Exxon Mobil", sector: "Energy" },
  AAPL: { name: "Apple Inc.", sector: "Technology" },
  GOOGL: { name: "Alphabet Inc.", sector: "Technology" },
};

export function StockList() {
  const navigate = useNavigate();
  const { token } = useAuth();
  const { holdings: currentHoldingsData, totalValue: portfolioTotal } = usePortfolio();
  const [query, setQuery] = useState("");
  const [customWatchlist, setCustomWatchlist] = useState<string[]>([]);
  const [watchlistMode, setWatchlistMode] = useState<"auto" | "custom">("auto");
  const [isEditMode, setIsEditMode] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [posts, setPosts] = useState<Post[]>([]);
  const [isFetchingNews, setIsFetchingNews] = useState(false);
  const [newsStatus, setNewsStatus] = useState("");
  const [newsCache, setNewsCache] = useState<Record<string, NewsArticle[]>>({});
  const [hoverNews, setHoverNews] = useState<{ ticker: string | null; items: NewsArticle[] }>({
    ticker: null,
    items: [],
  });
  const [showWatchlistPeek, setShowWatchlistPeek] = useState(false);
  const hoverTimeoutRef = useRef<number | null>(null);

  const currentHoldings = currentHoldingsData.map((h) => ({
    ...h,
    price: h.currentPrice,
    change: h.changePercent,
    value: h.value,
  }));

  useEffect(() => {
    try {
      const saved = localStorage.getItem("customWatchlist");
      const savedMode = localStorage.getItem("watchlistMode");
      if (saved) setCustomWatchlist(JSON.parse(saved));
      if (savedMode === "auto" || savedMode === "custom") {
        setWatchlistMode(savedMode as "auto" | "custom");
      }
    } catch (error) {
      console.warn("Failed to load custom watchlist", error);
    }
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await fetchPosts(100, 0);
        setPosts(data || []);
      } catch (error) {
        console.error("Failed to load posts for auto watchlist", error);
      }
    };
    load();
  }, []);

  const autoStockList = useMemo(() => {
    const defaults = ["AAPL", "MSFT", "GOOGL", "AMZN", "NVDA", "META", "TSLA", "UNH", "XOM"];
    if (posts.length === 0) return defaults;
    const counts: Record<string, number> = {};
    posts.forEach((post) => {
      if (!post.stock_ticker) return;
      counts[post.stock_ticker] = (counts[post.stock_ticker] || 0) + 1;
    });
    const fromCommunity = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
    const merged = [...fromCommunity];
    defaults.forEach((ticker) => {
      if (!merged.includes(ticker)) merged.push(ticker);
    });
    return merged.slice(0, 12);
  }, [posts]);

  const stockListSymbols = useMemo(() => {
    return watchlistMode === "custom" ? customWatchlist : autoStockList;
  }, [watchlistMode, customWatchlist, autoStockList]);

  const { quotes } = useStockQuotes(Array.from(new Set([...stockListSymbols, "AMD", "COIN", "PLTR", "SHOP", "SQ"])));

  const filteredHoldings = useMemo(() => {
    if (!query.trim()) return currentHoldings;
    const q = query.toLowerCase();
    return currentHoldings.filter(
      (stock) =>
        stock.symbol.toLowerCase().includes(q) ||
        stock.name.toLowerCase().includes(q) ||
        stock.sector.toLowerCase().includes(q),
    );
  }, [currentHoldings, query]);

  const filteredWatchlistSymbols = useMemo(() => {
    if (!query.trim()) return stockListSymbols;
    const q = query.toLowerCase();
    return stockListSymbols.filter((symbol) => {
      const meta = WATCHLIST_META[symbol];
      return (
        symbol.toLowerCase().includes(q) ||
        meta?.name?.toLowerCase().includes(q) ||
        meta?.sector?.toLowerCase().includes(q)
      );
    });
  }, [stockListSymbols, query]);

  const handleAddStock = (ticker: string) => {
    const symbol = ticker.toUpperCase().trim();
    if (!symbol || !/^[A-Z]{1,5}$/.test(symbol)) return;
    if (customWatchlist.includes(symbol)) return;
    const updated = [...customWatchlist, symbol];
    setCustomWatchlist(updated);
    localStorage.setItem("customWatchlist", JSON.stringify(updated));
    setWatchlistMode("custom");
    localStorage.setItem("watchlistMode", "custom");
    setIsEditMode(true);
    setShowAddModal(false);
  };

  const handleRemoveStock = (ticker: string) => {
    const updated = customWatchlist.filter((value) => value !== ticker);
    setCustomWatchlist(updated);
    localStorage.setItem("customWatchlist", JSON.stringify(updated));
  };

  const handleToggleMode = (mode: "auto" | "custom") => {
    setWatchlistMode(mode);
    localStorage.setItem("watchlistMode", mode);
    if (mode === "auto") setIsEditMode(false);
  };

  const loadHoverNews = async (ticker: string) => {
    if (newsCache[ticker]) {
      setHoverNews({ ticker, items: newsCache[ticker] });
      return;
    }
    try {
      const items = await fetchNews(ticker);
      const top = Array.isArray(items) ? items.slice(0, 3) : [];
      setNewsCache((prev) => ({ ...prev, [ticker]: top }));
      setHoverNews({ ticker, items: top });
    } catch (error) {
      console.error("Failed to load hover news for", ticker, error);
    }
  };

  const handleMouseEnterTicker = (ticker: string) => {
    if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = window.setTimeout(() => {
      void loadHoverNews(ticker);
    }, 250);
  };

  const handleMouseLeaveTicker = () => {
    if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
    hoverTimeoutRef.current = null;
    setTimeout(() => setHoverNews({ ticker: null, items: [] }), 150);
  };

  const handleSyncNews = async () => {
    if (!token || isFetchingNews) return;
    const tickersToSync = stockListSymbols.slice(0, 8);
    if (tickersToSync.length === 0) {
      setNewsStatus("No tickers in your watchlist yet.");
      return;
    }

    setIsFetchingNews(true);
    setNewsStatus(`Pulling headlines for ${tickersToSync.join(", ")}...`);
    try {
      await ingestNews(token, tickersToSync);
      setNewsStatus("News synced");
      setNewsCache((prev) => {
        const next = { ...prev };
        tickersToSync.forEach((ticker) => delete next[ticker]);
        return next;
      });
    } catch (error) {
      console.error("Failed to sync news", error);
      setNewsStatus("Failed to fetch news. Please try again.");
    } finally {
      setIsFetchingNews(false);
      setTimeout(() => setNewsStatus(""), 3000);
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900">Stocks</h1>
            <p className="text-gray-500 mt-1">Your holdings and watchlist</p>
          </div>
          <Button
            onClick={() => {
              setWatchlistMode("custom");
              localStorage.setItem("watchlistMode", "custom");
              setIsEditMode(true);
              setShowAddModal(true);
            }}
          >
            <Plus className="w-4 h-4 mr-2" />
            Add to Watchlist
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <Input
            value={query}
            onChange={(e: React.ChangeEvent<HTMLInputElement>) => setQuery(e.target.value)}
            placeholder="Search stocks by symbol or name..."
            className="pl-10"
          />
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
              <CardTitle>Current Holdings</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {filteredHoldings.map((stock) => (
                  <Link
                    key={stock.symbol}
                    to={`/stock/${stock.symbol}`}
                    className="flex items-center justify-between p-4 rounded-lg border border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-all group"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-semibold text-gray-900">{stock.symbol}</p>
                          <Badge variant="outline" className="text-xs">
                            {stock.sector}
                          </Badge>
                        </div>
                        <p className="text-sm text-gray-500">{stock.name}</p>
                        <p className="text-xs text-gray-400 mt-1">{stock.shares} shares</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <p className="text-sm text-gray-500 mb-1">Position Value</p>
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
                          className={`flex items-center gap-1 text-sm ${
                            (stock.change ?? 0) > 0
                              ? "text-green-600"
                              : (stock.change ?? 0) < 0
                                ? "text-red-600"
                                : "text-gray-500"
                          }`}
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
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Button
                    variant={watchlistMode === "auto" ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => handleToggleMode("auto")}
                  >
                    Auto
                  </Button>
                  <Button
                    variant={watchlistMode === "custom" ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => handleToggleMode("custom")}
                  >
                    Custom
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleSyncNews()}
                    disabled={isFetchingNews || !token}
                  >
                    {isFetchingNews ? "Syncing..." : "Sync watchlist news"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowWatchlistPeek((prev) => !prev)}
                  >
                    {showWatchlistPeek ? "Hide Watchlist" : "Quick Watchlist"}
                  </Button>
                  {watchlistMode === "custom" && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const next = !isEditMode;
                        setIsEditMode(next);
                      }}
                    >
                      {isEditMode ? "Done" : "Edit"}
                    </Button>
                  )}
                </div>
              </div>

              {newsStatus && <p className="mb-3 text-xs text-gray-500">{newsStatus}</p>}

              <div className="space-y-3">
                {filteredWatchlistSymbols.length === 0 ? (
                  <p className="text-sm text-gray-500">No stocks to display</p>
                ) : (
                  filteredWatchlistSymbols.map((symbol) => {
                    const meta = WATCHLIST_META[symbol] || {
                      name: symbol,
                      sector: "Other",
                    };
                    const price = quotes[symbol]?.price ?? 0;
                    const change = quotes[symbol]?.changePercent ?? 0;

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
                              <p className="font-semibold text-gray-900">{symbol}</p>
                              <Badge variant="outline" className="text-xs">
                                {meta.sector}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500">{meta.name}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4">
                          <div className="text-right">
                            <p className="font-semibold text-gray-900">${price.toFixed(2)}</p>
                            <div
                              className={`flex items-center gap-1 text-sm ${
                                change > 0 ? "text-green-600" : change < 0 ? "text-red-600" : "text-gray-500"
                              }`}
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
                          ) : watchlistMode !== "custom" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="opacity-0 group-hover:opacity-100"
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const updated = customWatchlist.includes(symbol)
                                  ? customWatchlist.filter((value) => value !== symbol)
                                  : [...customWatchlist, symbol];
                                setCustomWatchlist(updated);
                                localStorage.setItem("customWatchlist", JSON.stringify(updated));
                              }}
                            >
                              <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                            </Button>
                          ) : null}
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

      {showWatchlistPeek && stockListSymbols.length > 0 && (
        <div className="fixed right-6 top-24 z-40 w-56 rounded-lg bg-white p-3 shadow-lg">
          <div className="mb-2 font-semibold">Quick Watchlist</div>
          <div className="flex flex-wrap gap-2">
            {stockListSymbols.map((ticker) => (
              <button
                key={ticker}
                className={`px-2 py-1 rounded border text-sm ${
                  hoverNews.ticker === ticker ? "bg-gray-100" : ""
                }`}
                onClick={() => navigate(`/stock/${ticker}`)}
                onMouseEnter={() => handleMouseEnterTicker(ticker)}
                onMouseLeave={handleMouseLeaveTicker}
              >
                {ticker}
              </button>
            ))}
          </div>
        </div>
      )}

      {hoverNews.ticker && hoverNews.items.length > 0 && (
        <div className="fixed right-80 top-24 z-50 w-96 rounded-lg bg-white p-3 shadow-lg">
          <div className="mb-2 font-semibold">News for {hoverNews.ticker}</div>
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
                  {item.news_published_at ? new Date(item.news_published_at).toLocaleDateString() : ""}
                </div>
              </a>
            ))}
          </div>
        </div>
      )}

      <AddWatchlistModal open={showAddModal} onClose={() => setShowAddModal(false)} onAdd={handleAddStock} />
    </div>
  );
}
